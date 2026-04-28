/**
 * Agent Worker — automatic fix proposal for auto-resolvable clusters.
 *
 * Polls every AGENT_POLL_INTERVAL_MS for paid-plan clusters where:
 *   • is_auto_resolvable = true
 *   • proposed_fix IS NULL
 *   • resolved_at IS NULL
 *   • project.repo_url is set
 *
 * For each cluster it:
 *   1. Clones the repo (shallow, depth=1) to a temp dir
 *   2. Finds files likely to contain the bug (grep on title/description keywords)
 *   3. Calls GPT-4o with the bug description + file contents
 *   4. Parses the unified diff from the response
 *   5. Writes proposed_fix directly to clusters — no HTTP round-trip
 *   6. Cleans up the temp dir
 *
 * Enabled only when AGENT_WORKER_ENABLED=true. Uses the same BYOK
 * key resolution as clusterWorker (project key → global OPENAI_API_KEY).
 *
 * Env vars:
 *   AGENT_WORKER_ENABLED=true        — opt-in (off by default)
 *   AGENT_POLL_INTERVAL_MS=300000    — 5 minutes
 *   AGENT_BATCH_SIZE=3               — clusters per poll
 *   AGENT_GIT_TOKEN=ghp_...          — optional PAT for private GitHub repos
 *   OPENAI_API_KEY=sk-...            — global fallback (same as clusterWorker)
 */

import { execSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, extname } from 'node:path';
import OpenAI from 'openai';
import { query } from '../db';
import { getProjectAiKey } from '../helpers/aiKeys';
import { getProjectGitToken } from '../helpers/gitTokens';

const POLL_INTERVAL_MS = parseInt(process.env.AGENT_POLL_INTERVAL_MS || '300000', 10);
const BATCH_SIZE = parseInt(process.env.AGENT_BATCH_SIZE || '3', 10);
const FAILURE_BACKOFF_MS = 10 * 60 * 1000; // 10 min per cluster
const MAX_FILE_CHARS = 8000;
const MAX_FILES = 15;
const CODE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.go', '.java', '.cs', '.rb', '.php',
    '.vue', '.svelte', '.html', '.css', '.scss',
    '.json', '.yaml', '.yml', '.toml', '.env.example',
]);
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'out', '.next',
    '.nuxt', 'coverage', '.cache', 'vendor', '__pycache__',
]);

interface PendingCluster {
    cluster_id: string;
    project_id: string;
    repo_url: string;
    title: string;
    description: string | null;
    feedback_type: string;
}

const recentFailures = new Map<string, number>();
const loggedNoKeyProjects = new Set<string>();

let globalOpenAi: OpenAI | null = null;
const clientCache = new Map<string, OpenAI>();

function getOpenAiClient(apiKey: string): OpenAI {
    let client = clientCache.get(apiKey);
    if (!client) {
        client = new OpenAI({ apiKey });
        clientCache.set(apiKey, client);
    }
    return client;
}

async function resolveClientForProject(projectId: string): Promise<OpenAI | null> {
    try {
        const byok = await getProjectAiKey(projectId);
        if (byok?.key) return getOpenAiClient(byok.key);
    } catch {
        // fall through to global
    }
    return globalOpenAi;
}

async function fetchPendingClusters(): Promise<PendingCluster[]> {
    const result = await query<PendingCluster>(
        `SELECT c.id AS cluster_id, c.project_id, p.repo_url,
                c.title, c.feedback_type,
                f.description
           FROM clusters c
           JOIN projects p ON p.id = c.project_id
           LEFT JOIN plans pl ON pl.id = COALESCE(p.plan_id, p.plan)
           LEFT JOIN feedback f ON f.id = c.canonical_feedback_id
          WHERE c.is_auto_resolvable = TRUE
            AND c.proposed_fix IS NULL
            AND c.resolved_at IS NULL
            AND p.repo_url IS NOT NULL
            AND COALESCE((pl.features ->> 'api_access')::boolean, FALSE) = TRUE
          ORDER BY c.priority_score DESC, c.last_seen_at ASC
          LIMIT $1`,
        [BATCH_SIZE],
    );
    return result.rows;
}

/**
 * Inject an access token into a git HTTPS clone URL.
 *
 * Supported platforms and token formats:
 *   GitHub        github.com           Fine-grained PAT  → x-token:{token}
 *   GitLab        gitlab.com / self    Personal token    → x-token:{token}
 *   Bitbucket     bitbucket.org        App password      → {username}:{app_password}
 *                                      (pass token as "user:apppass")
 *   Azure DevOps  dev.azure.com        PAT               → x-token:{token}
 *                 *.visualstudio.com   PAT               → x-token:{token}
 *
 * Token resolution order:
 *   1. project_git_tokens DB row (set per-project in Settings → Agent Config)
 *   2. AGENT_GIT_TOKEN env var (global fallback / public repos)
 *   3. No token → URL unchanged (public repos need no auth)
 */
async function buildCloneUrl(repoUrl: string, projectId: string): Promise<string> {
    let token: string | null = null;
    try {
        token = await getProjectGitToken(projectId);
    } catch {
        // DB read failed — fall through to env
    }
    if (!token) token = process.env.AGENT_GIT_TOKEN ?? null;
    if (!token) return repoUrl;

    try {
        const u = new URL(repoUrl);
        const host = u.hostname.toLowerCase();

        const isGitHub  = host === 'github.com';
        const isGitLab  = host === 'gitlab.com' || host.includes('gitlab');
        const isBitbucket = host === 'bitbucket.org';
        const isAzure   = host === 'dev.azure.com' || host.endsWith('.visualstudio.com');

        if (isGitHub || isGitLab || isAzure) {
            u.username = 'x-token';
            u.password = token;
            return u.toString();
        }

        if (isBitbucket) {
            // Bitbucket requires a real username. Accept token as "user:apppassword"
            // (colon-separated). If no colon, still try x-token as a fallback.
            if (token.includes(':')) {
                const [user, ...rest] = token.split(':');
                u.username = user;
                u.password = rest.join(':');
            } else {
                u.username = 'x-token';
                u.password = token;
            }
            return u.toString();
        }

        // Unknown self-hosted platform — try x-token as a best-effort injection.
        u.username = 'x-token';
        u.password = token;
        return u.toString();
    } catch {
        return repoUrl;
    }
}

/** Walk a directory tree and collect candidate source files. */
function walkFiles(dir: string): string[] {
    const results: string[] = [];
    function walk(current: string): void {
        let entries: string[];
        try { entries = readdirSync(current); } catch { return; }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry)) continue;
            const full = join(current, entry);
            let stat;
            try { stat = statSync(full); } catch { continue; }
            if (stat.isDirectory()) {
                walk(full);
            } else if (stat.isFile() && CODE_EXTENSIONS.has(extname(entry).toLowerCase())) {
                results.push(full);
            }
        }
    }
    walk(dir);
    return results;
}

/** Extract simple keywords from title + description for grepping. */
function extractKeywords(title: string, description: string | null): string[] {
    const text = `${title} ${description ?? ''}`;
    // Split on whitespace/punctuation, keep words 4+ chars, lowercase, dedupe
    const words = Array.from(
        new Set(
            text.toLowerCase()
                .split(/[\s\W]+/)
                .filter(w => w.length >= 4 && !/^\d+$/.test(w))
        )
    );
    return words.slice(0, 10);
}

/**
 * Find the files most likely to contain the bug.
 * Strategy: grep repo for keywords → score by hit count → top MAX_FILES.
 * Falls back to all small files if grep finds nothing.
 */
function findRelevantFiles(repoDir: string, allFiles: string[], keywords: string[]): string[] {
    const scores = new Map<string, number>();

    for (const kw of keywords) {
        let output = '';
        try {
            // -r -l: recursive, list filenames only. -i: case-insensitive.
            output = execFileSync('git', ['-C', repoDir, 'grep', '-r', '-l', '-i', '--', kw], {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
            });
        } catch {
            // git grep exits non-zero when no matches — not an error
        }
        for (const line of output.split('\n')) {
            const filePath = line.trim();
            if (!filePath) continue;
            const full = join(repoDir, filePath);
            scores.set(full, (scores.get(full) ?? 0) + 1);
        }
    }

    if (scores.size > 0) {
        return [...scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_FILES)
            .map(([f]) => f)
            .filter(f => existsSync(f));
    }

    // Fallback: pick the smallest files (most likely to be readable within token budget)
    return allFiles
        .map(f => ({ f, size: (() => { try { return statSync(f).size; } catch { return Infinity; } })() }))
        .sort((a, b) => a.size - b.size)
        .slice(0, MAX_FILES)
        .map(({ f }) => f);
}

/** Read files and build a context block, capped at MAX_FILE_CHARS each. */
function buildFileContext(repoDir: string, files: string[]): string {
    const parts: string[] = [];
    for (const f of files) {
        let content: string;
        try { content = readFileSync(f, 'utf8').slice(0, MAX_FILE_CHARS); } catch { continue; }
        const rel = relative(repoDir, f);
        parts.push(`### ${rel}\n\`\`\`\n${content}\n\`\`\``);
    }
    return parts.join('\n\n');
}

/** Ask GPT-4o to produce a unified diff that fixes the reported bug. */
async function generateFix(
    client: OpenAI,
    cluster: PendingCluster,
    fileContext: string,
): Promise<{ summary: string; diff: string; files: string[] } | null> {
    const systemPrompt = `You are a senior software engineer. You receive a bug report and relevant source files.
Your task: produce a minimal, correct unified diff that fixes the reported bug.

Rules:
- Output ONLY a unified diff between <diff> and </diff> tags — nothing else outside those tags.
- Also output a one-sentence summary between <summary> and </summary> tags.
- The diff must be in standard unified diff format (--- a/path, +++ b/path, @@ ... @@).
- Use the exact relative file paths shown in the source files.
- Make the smallest change that fixes the reported bug.
- If you cannot determine the fix with confidence, output <diff>CANNOT_DETERMINE</diff>.`;

    const userPrompt = `Bug report:
Title: ${cluster.title}
Type: ${cluster.feedback_type}
Description: ${cluster.description ?? '(no description provided)'}

Source files:
${fileContext || '(no relevant source files found)'}`;

    const response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 4096,
    });

    const text = response.choices[0]?.message?.content ?? '';

    const diffMatch = text.match(/<diff>([\s\S]*?)<\/diff>/);
    const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/);

    const diff = diffMatch?.[1]?.trim() ?? '';
    const summary = summaryMatch?.[1]?.trim() ?? cluster.title;

    if (!diff || diff === 'CANNOT_DETERMINE') return null;

    // Extract changed file paths from diff header lines (--- a/... / +++ b/...)
    const files = Array.from(
        new Set(
            [...diff.matchAll(/^(?:---|\+\+\+) [ab]\/(.+)$/gm)].map(m => m[1]),
        ),
    );

    return { summary, diff, files };
}

async function processCluster(cluster: PendingCluster): Promise<void> {
    const lastFailure = recentFailures.get(cluster.cluster_id);
    if (lastFailure && Date.now() - lastFailure < FAILURE_BACKOFF_MS) return;

    const client = await resolveClientForProject(cluster.project_id);
    if (!client) {
        if (!loggedNoKeyProjects.has(cluster.project_id)) {
            console.info(
                `[agent] skipping project=${cluster.project_id} — no BYOK key and no global OPENAI_API_KEY.`,
            );
            loggedNoKeyProjects.add(cluster.project_id);
        }
        return;
    }
    loggedNoKeyProjects.delete(cluster.project_id);

    const cloneUrl = await buildCloneUrl(cluster.repo_url, cluster.project_id);
    let tmpDir: string | null = null;

    try {
        tmpDir = mkdtempSync(join(tmpdir(), 'bf-agent-'));

        console.log(`[agent] cloning ${cluster.repo_url} for cluster=${cluster.cluster_id}`);
        execFileSync('git', ['clone', '--depth=1', '--quiet', cloneUrl, tmpDir], {
            stdio: ['ignore', 'ignore', 'pipe'],
            timeout: 60_000,
        });

        const allFiles = walkFiles(tmpDir);
        const keywords = extractKeywords(cluster.title, cluster.description);
        const relevantFiles = findRelevantFiles(tmpDir, allFiles, keywords);
        const fileContext = buildFileContext(tmpDir, relevantFiles);

        console.log(
            `[agent] cluster=${cluster.cluster_id} — ${relevantFiles.length} file(s) in context, ` +
            `keywords: ${keywords.slice(0, 5).join(', ')}`,
        );

        const fix = await generateFix(client, cluster, fileContext);
        if (!fix) {
            console.log(`[agent] cluster=${cluster.cluster_id} — GPT-4o could not determine a fix`);
            // Back off so we don't keep spending tokens on the same cluster
            recentFailures.set(cluster.cluster_id, Date.now());
            return;
        }

        const proposal = {
            summary: fix.summary,
            diff: fix.diff,
            files: fix.files,
            confidence: null,
            proposed_by: 'agent-worker',
            proposed_at: new Date().toISOString(),
        };

        await query(
            `UPDATE clusters SET proposed_fix = $1::jsonb WHERE id = $2`,
            [JSON.stringify(proposal), cluster.cluster_id],
        );

        recentFailures.delete(cluster.cluster_id);
        console.log(
            `[agent] proposed fix for cluster=${cluster.cluster_id} ` +
            `(${fix.files.join(', ') || 'unknown files'})`,
        );
    } finally {
        if (tmpDir) {
            try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    }
}

async function processBatch(): Promise<void> {
    let clusters: PendingCluster[];
    try {
        clusters = await fetchPendingClusters();
    } catch (err) {
        console.error('[agent] fetch failed:', err instanceof Error ? err.message : String(err));
        return;
    }

    if (clusters.length === 0) return;

    console.log(`[agent] processing ${clusters.length} auto-resolvable cluster(s)`);

    for (const cluster of clusters) {
        try {
            await processCluster(cluster);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            recentFailures.set(cluster.cluster_id, Date.now());
            console.warn(`[agent] failed cluster=${cluster.cluster_id}: ${msg}`);
        }
    }
}

export function startAgentWorker(): void {
    if (process.env.AGENT_WORKER_ENABLED !== 'true') {
        console.log('[agent] worker disabled (set AGENT_WORKER_ENABLED=true to enable)');
        return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const byokConfigured = !!process.env.AI_KEY_ENCRYPTION_SECRET;

    if (!apiKey && !byokConfigured) {
        console.log('[agent] worker disabled — neither OPENAI_API_KEY nor AI_KEY_ENCRYPTION_SECRET is set');
        return;
    }

    if (apiKey) {
        globalOpenAi = new OpenAI({ apiKey });
    }

    console.log(
        `[agent] worker started — poll every ${POLL_INTERVAL_MS / 1000}s, ` +
        `batch=${BATCH_SIZE}, global key: ${apiKey ? 'set' : 'unset (BYOK only)'}`,
    );

    // Run once immediately then on interval
    processBatch().catch(err => console.error('[agent] initial batch error:', err));
    setInterval(() => {
        processBatch().catch(err => console.error('[agent] batch error:', err));
    }, POLL_INTERVAL_MS);
}
