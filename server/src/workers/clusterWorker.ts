import OpenAI from 'openai';
import { query } from '../db';
import { getProjectAiKey } from '../helpers/aiKeys';

const POLL_INTERVAL_MS = parseInt(process.env.CLUSTER_POLL_INTERVAL_MS || '30000', 10);
const BATCH_SIZE = parseInt(process.env.CLUSTER_BATCH_SIZE || '10', 10);
const SIMILARITY_THRESHOLD = parseFloat(process.env.CLUSTER_SIMILARITY_THRESHOLD || '0.85');
const EMBEDDING_MODEL = process.env.CLUSTER_EMBEDDING_MODEL || 'text-embedding-3-small';
const COHERE_EMBEDDING_MODEL = process.env.COHERE_EMBEDDING_MODEL || 'embed-english-v3.0';
const EMBEDDING_INPUT_MAX_CHARS = 8000;
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;

// Global Cohere key — used when no BYOK key is set and COHERE_API_KEY is present.
const GLOBAL_COHERE_KEY = process.env.COHERE_API_KEY || null;

interface UnclusteredRow {
    id: string;
    project_id: string;
    type: 'feedback' | 'bug_report' | 'feature_request';
    title: string;
    description: string | null;
}

interface NearestClusterRow {
    cluster_id: string;
    similarity: number;
}

const recentFailures = new Map<string, number>();

// The global fallback key — used when a project has no BYOK key.
// Left null when OPENAI_API_KEY is unset, in which case only BYOK
// projects get clustered (and projects without BYOK are skipped).
let globalOpenAi: OpenAI | null = null;
const GLOBAL_API_KEY = process.env.OPENAI_API_KEY || null;

// Per-client cache so we don't rebuild OpenAI() every embed call.
// Keyed by raw key so cache hits span the whole worker lifetime.
const clientCache = new Map<string, OpenAI>();

function getOpenAiClient(apiKey: string): OpenAI {
    let client = clientCache.get(apiKey);
    if (!client) {
        client = new OpenAI({ apiKey });
        clientCache.set(apiKey, client);
    }
    return client;
}

let workerDisabled = false;
// Prevents a second setInterval tick from starting a new batch while the
// previous one is still running (Node.js fires setInterval regardless of
// whether the prior async callback has resolved).
let batchInProgress = false;

function buildEmbeddingInput(row: UnclusteredRow): string {
    const parts = [row.title.trim()];
    if (row.description) parts.push(row.description.trim());
    return parts.join('\n\n').slice(0, EMBEDDING_INPUT_MAX_CHARS);
}

function toVectorLiteral(vec: number[]): string {
    return `[${vec.join(',')}]`;
}

async function fetchUnclustered(): Promise<UnclusteredRow[]> {
    // Gate on `plans.features.ai_clustering = true` — free-plan projects
    // are skipped entirely, keeping them off the OpenAI bill and matching
    // the product spec ("AI clustering: Yes (BYOK) on paid only").
    const result = await query<UnclusteredRow>(
        `SELECT f.id, f.project_id, f.type, f.title, f.description
           FROM feedback f
           JOIN projects p ON p.id = f.project_id
           LEFT JOIN plans pl ON pl.id = COALESCE(p.plan_id, p.plan)
          WHERE f.cluster_id IS NULL
            AND COALESCE((pl.features ->> 'ai_clustering')::boolean, FALSE) = TRUE
            AND NOT EXISTS (
                SELECT 1 FROM feedback_embeddings fe WHERE fe.feedback_id = f.id
            )
          ORDER BY f.created_at ASC
          LIMIT $1`,
        [BATCH_SIZE],
    );
    return result.rows;
}

async function embed(client: OpenAI, text: string): Promise<number[]> {
    const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
    });
    return response.data[0].embedding;
}

async function embedWithCohere(apiKey: string, text: string): Promise<number[]> {
    const response = await fetch('https://api.cohere.ai/v1/embed', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            texts: [text],
            model: COHERE_EMBEDDING_MODEL,
            input_type: 'search_document',
        }),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Cohere embed failed ${response.status}: ${body}`);
    }
    const data = await response.json() as { embeddings: number[][] };
    return data.embeddings[0];
}

type ResolvedProvider =
    | { type: 'openai'; client: OpenAI; source: 'byok' | 'global' }
    | { type: 'cohere'; apiKey: string; source: 'byok' | 'global' };

/**
 * Resolve which embedding provider to use for a given project.
 * Precedence:
 *   1. Project BYOK key (project_ai_keys row) — provider can be 'openai' or 'cohere'
 *   2. Global OPENAI_API_KEY env var (OpenAI)
 *   3. Global COHERE_API_KEY env var (Cohere)
 *   4. null → caller must skip the row
 */
async function resolveClientForProject(projectId: string): Promise<ResolvedProvider | null> {
    try {
        const byok = await getProjectAiKey(projectId);
        if (byok?.key) {
            if (byok.provider === 'cohere') {
                return { type: 'cohere', apiKey: byok.key, source: 'byok' };
            }
            return { type: 'openai', client: getOpenAiClient(byok.key), source: 'byok' };
        }
    } catch (err) {
        console.warn(
            `[cluster] failed to read BYOK key for project=${projectId}:`,
            err instanceof Error ? err.message : String(err),
        );
    }
    if (globalOpenAi) {
        return { type: 'openai', client: globalOpenAi, source: 'global' };
    }
    if (GLOBAL_COHERE_KEY) {
        return { type: 'cohere', apiKey: GLOBAL_COHERE_KEY, source: 'global' };
    }
    return null;
}

async function findNearestCluster(
    projectId: string,
    feedbackType: string,
    feedbackId: string,
    vectorLiteral: string,
): Promise<NearestClusterRow | null> {
    const result = await query<NearestClusterRow>(
        `SELECT f.cluster_id,
                1 - (fe.embedding <=> $1::vector) AS similarity
           FROM feedback_embeddings fe
           JOIN feedback f ON f.id = fe.feedback_id
          WHERE f.project_id = $2
            AND f.type = $3
            AND f.cluster_id IS NOT NULL
            AND f.id <> $4
          ORDER BY fe.embedding <=> $1::vector ASC
          LIMIT 1`,
        [vectorLiteral, projectId, feedbackType, feedbackId],
    );
    return result.rows[0] ?? null;
}

async function attachToCluster(feedbackId: string, clusterId: string): Promise<void> {
    await query(
        `UPDATE feedback SET cluster_id = $1 WHERE id = $2`,
        [clusterId, feedbackId],
    );
    // Recompute submission_count from the feedback table instead of
    // incrementing (`+ 1`). Idempotent: replaying a batch, a retry after a
    // dropped packet, or a manual cluster_id UPDATE will all converge to
    // the correct count on the next attach. Costs one extra index scan
    // per attach — cheap, and the partial index on feedback(cluster_id)
    // keeps it fast.
    // priority_score is intentionally omitted here — it's batched once per
    // processBatch after all rows have been processed (avoids N calls to the
    // feedback_cluster_priority() SQL function inside the loop).
    await query(
        `UPDATE clusters
            SET submission_count = (SELECT COUNT(*)::INT FROM feedback WHERE cluster_id = $1),
                last_seen_at     = NOW()
          WHERE id = $1`,
        [clusterId],
    );
}

async function createCluster(row: UnclusteredRow): Promise<string> {
    const insert = await query<{ id: string }>(
        `INSERT INTO clusters (project_id, feedback_type, canonical_feedback_id, title, submission_count)
         VALUES ($1, $2, $3, $4, 1)
         RETURNING id`,
        [row.project_id, row.type, row.id, row.title],
    );
    const clusterId = insert.rows[0].id;
    await query(
        `UPDATE feedback SET cluster_id = $1 WHERE id = $2`,
        [clusterId, row.id],
    );
    // Same self-healing recount as attachToCluster. For a fresh cluster
    // this always writes 1, but stays correct if the seed row ever gets
    // re-assigned or duplicated.
    // priority_score is batched once per processBatch — omitted here.
    await query(
        `UPDATE clusters
            SET submission_count = (SELECT COUNT(*)::INT FROM feedback WHERE cluster_id = $1)
          WHERE id = $1`,
        [clusterId],
    );
    return clusterId;
}

// Returns true when the row was freshly inserted (this worker owns the slot),
// false when another worker already stored an embedding for this feedback_id.
// The caller skips cluster assignment on false to prevent two workers from
// independently creating or attaching to clusters for the same row.
async function storeEmbedding(feedbackId: string, vectorLiteral: string): Promise<boolean> {
    const result = await query(
        `INSERT INTO feedback_embeddings (feedback_id, embedding, embedding_model)
         VALUES ($1, $2::vector, $3)
         ON CONFLICT (feedback_id) DO NOTHING`,
        [feedbackId, vectorLiteral, EMBEDDING_MODEL],
    );
    return (result.rowCount ?? 0) > 0;
}

// Warn-once cache so we don't log "no key for project X" on every poll.
const loggedNoKeyProjects = new Set<string>();

// Returns the cluster ID that was assigned (attach or create), or null when
// the row was skipped. processBatch collects these to batch-recompute priority.
async function processRow(row: UnclusteredRow): Promise<string | null> {
    const lastFailure = recentFailures.get(row.id);
    if (lastFailure && Date.now() - lastFailure < FAILURE_BACKOFF_MS) return null;

    const input = buildEmbeddingInput(row);
    if (!input) return null;

    const resolved = await resolveClientForProject(row.project_id);
    if (!resolved) {
        if (!loggedNoKeyProjects.has(row.project_id)) {
            console.info(
                `[cluster] skipping project=${row.project_id} — no BYOK key and no global OPENAI_API_KEY or COHERE_API_KEY. ` +
                `Set one in Settings → AI Clustering, or add a key to server/.env.`,
            );
            loggedNoKeyProjects.add(row.project_id);
        }
        return null;
    }
    // Reset the warn-once flag the moment a project gets a key configured.
    loggedNoKeyProjects.delete(row.project_id);

    const vector = resolved.type === 'cohere'
        ? await embedWithCohere(resolved.apiKey, input)
        : await embed(resolved.client, input);
    const vectorLiteral = toVectorLiteral(vector);

    const isNewEmbedding = await storeEmbedding(row.id, vectorLiteral);
    if (!isNewEmbedding) {
        // Another worker already stored an embedding for this row (ON CONFLICT
        // DO NOTHING returned rowCount=0). Skip cluster assignment to prevent
        // two workers from independently seeding duplicate clusters for the
        // same feedback row.
        console.log(`[cluster] feedback=${row.id} already claimed by concurrent worker, skipping`);
        return null;
    }

    const nearest = await findNearestCluster(row.project_id, row.type, row.id, vectorLiteral);

    let affectedClusterId: string;
    if (nearest && nearest.similarity >= SIMILARITY_THRESHOLD) {
        await attachToCluster(row.id, nearest.cluster_id);
        affectedClusterId = nearest.cluster_id;
        console.log(
            `[cluster] attached feedback=${row.id} → cluster=${nearest.cluster_id} ` +
            `similarity=${nearest.similarity.toFixed(3)}`,
        );
    } else {
        affectedClusterId = await createCluster(row);
        const sim = nearest ? ` (best match ${nearest.similarity.toFixed(3)} < ${SIMILARITY_THRESHOLD})` : '';
        console.log(`[cluster] new cluster=${affectedClusterId} seeded by feedback=${row.id}${sim}`);
    }

    recentFailures.delete(row.id);
    return affectedClusterId;
}

async function processBatch(): Promise<void> {
    if (workerDisabled || batchInProgress) return;
    batchInProgress = true;

    try {
        let rows: UnclusteredRow[];
        try {
            rows = await fetchUnclustered();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('does not exist') && (msg.includes('feedback_embeddings') || msg.includes('clusters'))) {
                console.warn('[cluster] clustering tables missing — disabling worker. Run the Tier 2 schema.');
                workerDisabled = true;
                return;
            }
            console.error('[cluster] fetch failed:', msg);
            return;
        }

        if (rows.length === 0) return;

        console.log(`[cluster] processing ${rows.length} unclustered row(s)`);

        const affectedClusters = new Set<string>();
        for (const row of rows) {
            try {
                const clusterId = await processRow(row);
                if (clusterId) affectedClusters.add(clusterId);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                recentFailures.set(row.id, Date.now());
                if (msg.includes('operator does not exist') && msg.includes('<=>')) {
                    console.error('[cluster] pgvector not available — disabling worker. Install the `vector` extension.');
                    workerDisabled = true;
                    return;
                }
                console.warn(`[cluster] failed feedback=${row.id}: ${msg}`);
            }
        }

        // Batch-recompute priority_score once per unique affected cluster
        // instead of calling feedback_cluster_priority(id) inside each
        // attachToCluster / createCluster (N individual calls → 1 batch UPDATE).
        if (affectedClusters.size > 0) {
            await query(
                `UPDATE clusters SET priority_score = feedback_cluster_priority(id)
                  WHERE id = ANY($1::uuid[])`,
                [[...affectedClusters]],
            ).catch((err: unknown) =>
                console.warn('[cluster] priority batch update failed:', err instanceof Error ? err.message : String(err)),
            );
        }
    } finally {
        batchInProgress = false;
    }
}

/**
 * Trigger an immediate clustering batch outside the normal poll interval.
 * Called by the upgrade route so newly paid projects get clustered right
 * away instead of waiting up to CLUSTER_POLL_INTERVAL_MS.
 */
export function triggerImmediateBatch(): void {
    processBatch().catch((err) => console.error('[cluster] triggered batch failed:', err));
}

export function startClusterWorker(): void {
    const hasGlobalKey = !!GLOBAL_API_KEY;
    const hasGlobalCohere = !!GLOBAL_COHERE_KEY;
    const hasByok = !!process.env.AI_KEY_ENCRYPTION_SECRET;

    if (!hasGlobalKey && !hasGlobalCohere && !hasByok) {
        console.info(
            '[cluster] No embedding keys configured (OPENAI_API_KEY, COHERE_API_KEY, or ' +
            'AI_KEY_ENCRYPTION_SECRET) — AI clustering disabled. Add a key to server/.env to enable.',
        );
        return;
    }

    if (hasGlobalKey) {
        globalOpenAi = new OpenAI({ apiKey: GLOBAL_API_KEY! });
        clientCache.set(GLOBAL_API_KEY!, globalOpenAi);
    }

    console.info(
        `[cluster] worker started. openai=${EMBEDDING_MODEL} cohere=${COHERE_EMBEDDING_MODEL} ` +
        `interval=${POLL_INTERVAL_MS}ms batch=${BATCH_SIZE} threshold=${SIMILARITY_THRESHOLD} ` +
        `global_openai=${hasGlobalKey ? 'yes' : 'no'} global_cohere=${hasGlobalCohere ? 'yes' : 'no'} byok=${hasByok ? 'yes' : 'no'}`,
    );

    processBatch().catch((err) => console.error('[cluster] initial batch failed:', err));
    setInterval(() => {
        processBatch().catch((err) => console.error('[cluster] batch failed:', err));
    }, POLL_INTERVAL_MS);
}
