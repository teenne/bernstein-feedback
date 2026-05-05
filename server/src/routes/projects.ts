import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { requireAuth, getFreshRole, requireProjectOwner, JwtPayload } from '../middleware/auth';
import { requirePlanFeature } from '../helpers/plan';
import {
    saveProjectAiKey,
    getProjectAiKeyMetadata,
    deleteProjectAiKey,
    isByokConfigured,
    type AiKeyProvider,
} from '../helpers/aiKeys';
import {
    saveProjectGitToken,
    getProjectGitTokenMetadata,
    deleteProjectGitToken,
} from '../helpers/gitTokens';
import { CreateProjectSchema, UpdateProjectSchema, AddMemberSchema } from '../schemas/project';
import { ProjectMember, Project, UserRole } from '../schemas/tables';
import { triggerImmediateBatch } from '../workers/clusterWorker';

const router = Router();

// ──────────────────────────────
// Project Members
// ──────────────────────────────

// List members of a project
router.get('/:id/members', requireAuth, requireProjectOwner, async (req, res) => {
    try {
        const result = await query<ProjectMember>(
            'SELECT * FROM project_members WHERE project_id = $1 ORDER BY created_at ASC',
            [req.params.id]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Add member to project
router.post('/:id/members', requireAuth, requireProjectOwner, async (req, res) => {
    try {
        const { user_id, email, role } = AddMemberSchema.parse(req.body);

        let memberId = user_id;
        if (!memberId) {
            const userResult = await query<Pick<UserRole, 'user_id'>>('SELECT user_id FROM user_roles WHERE email = $1', [email]);
            if (userResult.rows.length === 0) {
                res.status(404).json({ success: false, error: `No user found with email: ${email}` });
                return;
            }
            memberId = userResult.rows[0].user_id;
        }

        const result = await query<ProjectMember>(
            `INSERT INTO project_members (project_id, user_id, email, role)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (project_id, user_id) DO UPDATE SET role = $4
             RETURNING *`,
            [req.params.id, memberId, email, role]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    }
});

// Remove member from project
router.delete('/:id/members/:user_id', requireAuth, requireProjectOwner, async (req, res) => {
    try {
        const result = await query<Pick<ProjectMember, 'id'>>(
            'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.params.user_id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Member not found' });
            return;
        }
        res.json({ success: true });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// ──────────────────────────────
// Project CRUD
// ──────────────────────────────

// Create project (with free-tier 1-project limit enforcement)
router.post('/', requireAuth, async (req, res) => {
    try {
        const { id, name, owner_id, owner_email, plan_id } = CreateProjectSchema.parse(req.body);

        const user = (req as any).user as JwtPayload;
        const ownerId = owner_id || user.user_id;

        // Account-level project limit: count ALL projects, check against highest plan
        const allProjects = await query<{ id: string; plan: string; plan_id: string | null; max_projects: number; plan_name: string | null }>(
            `SELECT p.id, p.plan, p.plan_id,
                    COALESCE(pl.max_projects, (p.plan_limits->>'max_projects')::int, 1) AS max_projects,
                    pl.name AS plan_name
             FROM projects p
             LEFT JOIN plans pl ON pl.id = COALESCE(p.plan_id, p.plan)`
        );

        if (allProjects.rows.length > 0) {
            const maxProjects = Math.max(...allProjects.rows.map((p) => p.max_projects ?? 1));
            if (maxProjects > 0 && allProjects.rows.length >= maxProjects) {
                const planName = allProjects.rows[0]?.plan_name || allProjects.rows[0]?.plan || 'free';
                res.status(403).json({
                    success: false,
                    error: `Your ${planName} plan allows ${maxProjects} project${maxProjects > 1 ? 's' : ''}. Upgrade to create more.`,
                });
                return;
            }
        }

        const initialPlan = plan_id ?? 'free';
        const result = await query<Project>(
            `INSERT INTO projects (id, name, owner_id, owner_email, plan, plan_id)
             VALUES ($1, $2, $3, $4, $5, $5) RETURNING *`,
            [id, name || id, ownerId, owner_email || null, initialPlan]
        );

        if (initialPlan === 'paid') {
            triggerImmediateBatch();
        }

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
        } else if (error?.code === '23505') {
            res.status(409).json({ success: false, error: 'Project ID already exists' });
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    }
});

// List projects — scoped by role
router.get('/', requireAuth, async (req, res) => {
    try {
        const authUser = (req as any).user as JwtPayload;
        const freshRole = await getFreshRole(authUser.user_id, authUser.role);

        const { owner_email, owner_id, user_id } = req.query;
        let sql = 'SELECT id, name, owner_id, owner_email, plan, created_at FROM projects';
        const params: any[] = [];

        if (freshRole === 'admin') {
            if (owner_id) {
                sql += ' WHERE owner_id = $1';
                params.push(owner_id);
            } else if (owner_email) {
                sql += ' WHERE owner_email = $1';
                params.push(owner_email);
            } else if (user_id) {
                sql += ` WHERE owner_id = $1 OR id IN (SELECT project_id FROM project_members WHERE user_id = $1)`;
                params.push(user_id);
            }
        } else {
            sql += ` WHERE owner_id = $1 OR id IN (SELECT project_id FROM project_members WHERE user_id = $1)`;
            params.push(authUser.user_id);
        }
        sql += ' ORDER BY created_at DESC LIMIT 500';

        const result = await query<Pick<Project, 'id' | 'name' | 'owner_id' | 'owner_email' | 'plan' | 'created_at'>>(sql, params);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Get single project
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const result = await query<Project>('SELECT * FROM projects WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Update project — owner-only. Plan changes flow through here too, so
// the owner gate prevents a team member from flipping their own tier.
router.patch('/:id', requireAuth, requireProjectOwner, async (req, res) => {
    try {
        const data = UpdateProjectSchema.parse(req.body);
        const sets: string[] = [];
        const values: any[] = [];
        let i = 1;

        if (data.name !== undefined) { sets.push(`name = $${i++}`); values.push(data.name); }
        if (data.plan !== undefined) { sets.push(`plan = $${i++}`); values.push(data.plan); }
        if (data.plan_id !== undefined) { sets.push(`plan_id = $${i++}`); values.push(data.plan_id); }
        if (data.config !== undefined) { sets.push(`config = $${i++}`); values.push(JSON.stringify(data.config)); }
        if (data.plan_limits !== undefined) { sets.push(`plan_limits = $${i++}`); values.push(JSON.stringify(data.plan_limits)); }

        values.push(req.params.id);
        const result = await query<Project>(
            `UPDATE projects SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    }
});

/**
 * Upgrade a project to a paid plan.
 *
 * This is the dedicated billing seam. Two modes:
 *
 *   • BILLING_PROVIDER unset (default)
 *       Flips `plan`/`plan_id` to the target immediately. Fine for
 *       single-tenant / demo / self-hosted deploys where payment is
 *       handled out-of-band. This is the current behavior of the
 *       "Upgrade to Paid" button in the dashboard.
 *
 *   • BILLING_PROVIDER=<name> (e.g. 'stripe')
 *       The server does NOT flip the plan here. It returns 501 so a
 *       real checkout flow can be wired in. When the provider's
 *       webhook fires with a confirmed payment, call
 *       POST /api/projects/:id/billing/confirm (server-to-server) to
 *       flip the plan. Until that route is implemented for the chosen
 *       provider, upgrades are blocked — which is the safe default.
 *
 * Keeping this as a separate route from PATCH /:id means callers can
 * distinguish "change project metadata" from "start billing" without
 * parsing the body.
 */
router.post('/:id/upgrade', requireAuth, requireProjectOwner, async (req, res) => {
    try {
        const targetPlan = typeof req.body?.plan_id === 'string' ? req.body.plan_id : 'paid';
        const provider = process.env.BILLING_PROVIDER?.trim();

        if (provider) {
            res.status(501).json({
                success: false,
                error: `Billing provider "${provider}" is configured but its checkout callback is not yet wired. Contact support.`,
                provider,
                target_plan: targetPlan,
            });
            return;
        }

        const result = await query<Project>(
            `UPDATE projects
                SET plan = $1,
                    plan_id = $1
              WHERE id = $2
            RETURNING *`,
            [targetPlan, req.params.id],
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }

        // Kick off an immediate clustering pass so existing unclustered
        // tickets on this project get processed right away rather than
        // waiting for the next scheduled poll interval.
        triggerImmediateBatch();

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// ──────────────────────────────
// BYOK AI keys (paid-plan, owner-only)
// ──────────────────────────────
// The admin UI uses these to manage a project's OpenAI credential for
// the cluster worker. Raw key material is encrypted on write via
// pgp_sym_encrypt and never returned on read — only the display hint.

// GET metadata: is a key configured + its hint. Returns 200 with data=null
// when nothing is stored yet, rather than 404, so the UI can distinguish
// "never set" from "route broken".
router.get(
    '/:id/ai-key',
    requireAuth,
    requireProjectOwner,
    requirePlanFeature('ai_clustering'),
    async (req, res) => {
        try {
            const meta = await getProjectAiKeyMetadata(req.params.id);
            res.json({
                success: true,
                data: meta,
                byok_configured: isByokConfigured(),
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    },
);

// PUT: upsert the key. Body: { provider: 'openai', api_key: 'sk-...' }
router.put(
    '/:id/ai-key',
    requireAuth,
    requireProjectOwner,
    requirePlanFeature('ai_clustering'),
    async (req, res) => {
        try {
            const provider = (req.body?.provider ?? 'openai') as AiKeyProvider;
            const rawKey = typeof req.body?.api_key === 'string' ? req.body.api_key : '';
            if (provider !== 'openai') {
                res.status(400).json({
                    success: false,
                    error: `Provider "${provider}" is not supported yet. Only "openai" for now.`,
                });
                return;
            }
            if (!rawKey) {
                res.status(400).json({ success: false, error: 'api_key is required.' });
                return;
            }
            const meta = await saveProjectAiKey(req.params.id, provider, rawKey);
            res.json({ success: true, data: meta });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            // 400 for "not configured" / "too short" — caller error, not a server bug.
            const status = /AI_KEY_ENCRYPTION_SECRET|too short/.test(msg) ? 400 : 500;
            res.status(status).json({ success: false, error: msg });
        }
    },
);

router.delete(
    '/:id/ai-key',
    requireAuth,
    requireProjectOwner,
    requirePlanFeature('ai_clustering'),
    async (req, res) => {
        try {
            const removed = await deleteProjectAiKey(req.params.id);
            if (!removed) {
                res.status(404).json({ success: false, error: 'No key to remove.' });
                return;
            }
            res.json({ success: true });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    },
);

// ──────────────────────────────────────────────────────────────
// Agent webhook config (owner-only, paid-plan only).
// Lets a project owner configure an outbound URL that the admin UI's
// "Ask the agent" button posts a cluster payload to. The receiving
// agent (a GitHub Action, a cron job running Claude Code, a custom
// script) then generates a diff and calls the Agent API back via
// POST /api/v1/agent/:projectId/clusters/:id/propose-fix.
// ──────────────────────────────────────────────────────────────

router.get(
    '/:id/agent-webhook',
    requireAuth,
    requireProjectOwner,
    requirePlanFeature('api_access'),
    async (req, res) => {
        try {
            const result = await query<{ agent_webhook_url: string | null; repo_url: string | null }>(
                `SELECT agent_webhook_url, repo_url FROM projects WHERE id = $1`,
                [req.params.id],
            );
            res.json({
                success: true,
                data: {
                    agent_webhook_url: result.rows[0]?.agent_webhook_url ?? null,
                    repo_url: result.rows[0]?.repo_url ?? null,
                },
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    },
);

router.put(
    '/:id/agent-webhook',
    requireAuth,
    requireProjectOwner,
    requirePlanFeature('api_access'),
    async (req, res) => {
        try {
            // agent_webhook_url is optional — omitting it keeps the existing value.
            // repo_url is always updated when present (pass null/empty to clear it).
            const rawWebhook = typeof req.body?.agent_webhook_url === 'string' ? req.body.agent_webhook_url.trim() : null;
            const repoUrl = typeof req.body?.repo_url === 'string' ? req.body.repo_url.trim() || null : undefined;

            if (rawWebhook !== null) {
                try {
                    const u = new URL(rawWebhook);
                    if (!['http:', 'https:'].includes(u.protocol)) {
                        res.status(400).json({ success: false, error: 'Only http(s) URLs are allowed' });
                        return;
                    }
                } catch {
                    res.status(400).json({ success: false, error: 'Invalid webhook URL' });
                    return;
                }
            }

            // Build the SET clause dynamically so omitted fields are left unchanged.
            const sets: string[] = [];
            const vals: any[] = [];
            let i = 1;
            if (rawWebhook !== null)    { sets.push(`agent_webhook_url = $${i++}`); vals.push(rawWebhook || null); }
            if (repoUrl !== undefined)  { sets.push(`repo_url = $${i++}`); vals.push(repoUrl); }

            if (sets.length === 0) {
                res.status(400).json({ success: false, error: 'Nothing to update' });
                return;
            }

            vals.push(req.params.id);
            await query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${i}`, vals);

            const updated = await query<{ agent_webhook_url: string | null; repo_url: string | null }>(
                `SELECT agent_webhook_url, repo_url FROM projects WHERE id = $1`,
                [req.params.id],
            );
            res.json({ success: true, data: updated.rows[0] ?? {} });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    },
);

router.delete(
    '/:id/agent-webhook',
    requireAuth,
    requireProjectOwner,
    requirePlanFeature('api_access'),
    async (req, res) => {
        try {
            await query(`UPDATE projects SET agent_webhook_url = NULL, repo_url = NULL WHERE id = $1`, [req.params.id]);
            res.json({ success: true });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    },
);

/**
 * POST /api/projects/:id/ask-agent
 *
 * Fires the configured outbound webhook for the project with a payload
 * describing the target cluster + canonical feedback. Fire-and-forget
 * semantics — we don't wait for the agent's diff to come back (that
 * arrives asynchronously via POST /api/v1/agent/.../propose-fix).
 *
 * Body: { cluster_id: string }
 * Returns: { success: true, webhook_status: 202 | ... } once the
 *   webhook POST completes.
 */
router.post(
    '/:id/ask-agent',
    requireAuth,
    requirePlanFeature('api_access'),
    async (req, res) => {
        try {
            const user = (req as any).user as { email: string };
            const clusterId = typeof req.body?.cluster_id === 'string' ? req.body.cluster_id : '';
            if (!clusterId) {
                res.status(400).json({ success: false, error: 'cluster_id is required' });
                return;
            }

            // Load project + cluster + canonical feedback in a single query.
            const info = await query<{
                agent_webhook_url: string | null;
                repo_url: string | null;
                api_key: string;
                cluster_id: string;
                cluster_project: string;
                title: string;
                submission_count: number;
                is_auto_resolvable: boolean;
                canonical_id: string | null;
                canonical_description: string | null;
                canonical_url: string | null;
            }>(
                `SELECT p.agent_webhook_url, p.repo_url, p.api_key,
                        c.id           AS cluster_id,
                        c.project_id   AS cluster_project,
                        c.title, c.submission_count, c.is_auto_resolvable,
                        f.id           AS canonical_id,
                        f.description  AS canonical_description,
                        f.url          AS canonical_url
                   FROM projects p
                   JOIN clusters c ON c.project_id = p.id
                   LEFT JOIN feedback f ON f.id = c.canonical_feedback_id
                  WHERE p.id = $1 AND c.id = $2`,
                [req.params.id, clusterId],
            );
            if (info.rows.length === 0) {
                res.status(404).json({ success: false, error: 'Project or cluster not found' });
                return;
            }
            const row = info.rows[0];
            if (!row.agent_webhook_url) {
                res.status(400).json({
                    success: false,
                    error: 'No agent webhook configured. Set one in Settings → Agent webhook URL.',
                });
                return;
            }

            // Build the payload. We deliberately DO NOT include the project
            // api_key — the agent is expected to already have it (in its
            // CI secrets / env). Sending the key over the wire to an
            // arbitrary URL would be a credential leak surface.
            const payload = {
                event: 'ask_agent',
                project_id: req.params.id,
                cluster_id: row.cluster_id,
                feedback_id: row.canonical_id,
                title: row.title,
                description: row.canonical_description,
                url: row.canonical_url,
                submission_count: row.submission_count,
                is_auto_resolvable: row.is_auto_resolvable,
                repo_url: row.repo_url ?? null,
                callback_url: `${process.env.APP_URL || process.env.ALLOWED_ORIGINS?.split(',')[0]?.trim() || ''}/api/v1/agent/${req.params.id}/clusters/${row.cluster_id}/propose-fix`,
                triggered_by: user.email,
                triggered_at: new Date().toISOString(),
            };

            // Fire the webhook with a short timeout so a slow/hanging
            // receiver can't block the admin UI.
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            let status: number | null = null;
            let errorText: string | null = null;
            try {
                const response = await fetch(row.agent_webhook_url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });
                status = response.status;
                if (!response.ok) {
                    errorText = `Webhook returned ${response.status}`;
                }
            } catch (err) {
                errorText = err instanceof Error ? err.message : String(err);
            } finally {
                clearTimeout(timeout);
            }

            if (errorText) {
                res.status(502).json({ success: false, error: `Webhook delivery failed: ${errorText}`, webhook_status: status });
                return;
            }
            res.json({ success: true, webhook_status: status });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    },
);

// ──────────────────────────────────────────────────────────────
// Per-project GitHub access token (owner-only, paid-plan only).
// Stored encrypted at rest via pgcrypto — same secret as BYOK AI keys.
// The agent worker reads this to clone private repos without a global
// AGENT_GIT_TOKEN env var. Works for any number of projects dynamically.
// ──────────────────────────────────────────────────────────────

router.get('/:id/git-token', requireAuth, requireProjectOwner, requirePlanFeature('ai_clustering'), async (req, res) => {
    try {
        const meta = await getProjectGitTokenMetadata(req.params.id);
        res.json({ success: true, data: meta });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.put('/:id/git-token', requireAuth, requireProjectOwner, requirePlanFeature('ai_clustering'), async (req, res) => {
    try {
        const raw = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
        if (!raw) {
            res.status(400).json({ success: false, error: 'token is required' });
            return;
        }
        const meta = await saveProjectGitToken(req.params.id, raw);
        res.json({ success: true, data: meta });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.delete('/:id/git-token', requireAuth, requireProjectOwner, requirePlanFeature('ai_clustering'), async (req, res) => {
    try {
        await deleteProjectGitToken(req.params.id);
        res.json({ success: true });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Delete project — owner-only.
// ──────────────────────────────────────────────────────────────
// Agent API key — read and rotate (owner-only, paid-plan only).
// Developers copy this key into CI secrets / agent env so external
// agents can authenticate against GET /api/v1/agent/:projectId/*
// ──────────────────────────────────────────────────────────────

router.get('/:id/agent-api-key', requireAuth, requireProjectOwner, requirePlanFeature('api_access'), async (req, res) => {
    try {
        const result = await query<{ api_key: string }>(
            'SELECT api_key FROM projects WHERE id = $1',
            [req.params.id],
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        res.json({ success: true, data: { api_key: result.rows[0].api_key } });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.post('/:id/rotate-api-key', requireAuth, requireProjectOwner, requirePlanFeature('api_access'), async (req, res) => {
    try {
        const result = await query<{ api_key: string }>(
            `UPDATE projects
                SET api_key = encode(gen_random_bytes(24), 'hex')
              WHERE id = $1
              RETURNING api_key`,
            [req.params.id],
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        res.json({ success: true, data: { api_key: result.rows[0].api_key } });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.delete('/:id', requireAuth, requireProjectOwner, async (req, res) => {
    try {
        const result = await query<Pick<Project, 'id'>>('DELETE FROM projects WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        res.json({ success: true });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

export default router;
