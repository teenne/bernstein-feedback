import { Router } from 'express';
import { z } from 'zod';
import pool, { query } from '../db';
import { requirePlanFeature } from '../helpers/plan';
import { requireProjectApiKey, AgentAuthContext } from '../middleware/agentAuth';

const router = Router();

/**
 * Tier 2 — AI Agent API surface.
 *
 * External coding assistants (Codex, Claude Code, CI runners) hit these
 * endpoints with a per-project `X-API-Key` header (matched against
 * `projects.api_key`) to read the prioritised cluster backlog and close
 * whole clusters in a single call. All routes are gated by
 * `features.api_access` on the project's plan — free projects get 403.
 *
 * Design notes:
 *   • `requireProjectApiKey` runs first so plan-gate 403s are only shown
 *     to authenticated callers.
 *   • Closing a cluster bulk-updates every member feedback row to
 *     `status='resolved'`. The resolve trigger has an in-txn guard (see
 *     migration 005_agent_api.sql) so the fan-out to notifications +
 *     email queue only happens once per cluster, not once per member.
 *   • Agent-authored notes live in a dedicated `feedback.agent_notes`
 *     JSONB array so they don't collide with the human-entered
 *     `resolution_note`.
 */

const CloseClusterSchema = z.object({
    resolution_note: z.string().max(4000).optional(),
    actor: z.string().min(1).max(100).optional(),
});

const AgentNoteSchema = z.object({
    note: z.string().min(1).max(8000),
    author: z.string().min(1).max(100).optional(),
});

const ProposedFixSchema = z.object({
    summary: z.string().min(1).max(500),
    diff: z.string().min(1).max(50000),
    files: z.array(z.string()).max(50).optional(),
    confidence: z.number().min(0).max(1).optional(),
    proposed_by: z.string().min(1).max(100).optional(),
});

// Every agent route goes through both middlewares. `requireProjectApiKey`
// reads req.params.projectId; `requirePlanFeature` accepts the same.
router.use('/:projectId', requireProjectApiKey, requirePlanFeature('api_access'));

/**
 * GET /api/v1/agent/:projectId/backlog
 *
 * Prioritised list of work for the agent. Returns unresolved clusters
 * sorted by `priority_score` DESC, plus any feedback rows that don't
 * yet have a cluster (embedding worker hasn't run). Standalone rows
 * are returned with `cluster_id: null` and `submission_count: 1` so
 * the agent can treat them uniformly.
 *
 * Query params:
 *   type=bug_report|feature_request|feedback   (optional filter)
 *   limit=20  (max 100)
 *   offset=0
 *   include_resolved=false  (set true to see closed clusters too)
 */
router.get('/:projectId/backlog', async (req, res) => {
    try {
        const { project_id } = (req as any).agent as AgentAuthContext;
        const type = typeof req.query.type === 'string' ? req.query.type : null;
        const includeResolved = req.query.include_resolved === 'true';
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
        const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10) || 0);

        const conditions: string[] = ['c.project_id = $1'];
        const values: any[] = [project_id];
        let i = 2;
        if (!includeResolved) conditions.push(`c.resolved_at IS NULL`);
        if (type) { conditions.push(`c.feedback_type = $${i++}`); values.push(type); }

        const clustersSql = `
            SELECT
              c.id AS cluster_id,
              c.feedback_type,
              c.title,
              c.submission_count,
              c.first_seen_at,
              c.last_seen_at,
              c.resolved_at,
              c.priority_score,
              f.id AS canonical_id,
              f.description AS canonical_description,
              f.url AS canonical_url,
              f.route AS canonical_route,
              f.page_name AS canonical_page_name,
              f.severity,
              f.priority,
              f.status AS canonical_status,
              f.labels,
              f.session_id,
              f.session_provider,
              f.session_replay_url,
              f.user_properties
            FROM clusters c
            LEFT JOIN feedback f ON f.id = c.canonical_feedback_id
            WHERE ${conditions.join(' AND ')}
            ORDER BY c.priority_score DESC, c.last_seen_at DESC
        `;

        // Standalone (unclustered) feedback — not yet grouped by the worker.
        // Treat each row as a single-member "cluster" for the agent.
        const standaloneConditions: string[] = [
            'f.project_id = $1',
            'f.cluster_id IS NULL',
        ];
        const standaloneValues: any[] = [project_id];
        let si = 2;
        if (!includeResolved) standaloneConditions.push(`f.status NOT IN ('resolved', 'closed')`);
        if (type) { standaloneConditions.push(`f.type = $${si++}`); standaloneValues.push(type); }

        const standaloneSql = `
            SELECT
              NULL::UUID AS cluster_id,
              f.type AS feedback_type,
              f.title,
              1 AS submission_count,
              f.created_at AS first_seen_at,
              f.created_at AS last_seen_at,
              NULL::TIMESTAMPTZ AS resolved_at,
              0 AS priority_score,
              f.id AS canonical_id,
              f.description AS canonical_description,
              f.url AS canonical_url,
              f.route AS canonical_route,
              f.page_name AS canonical_page_name,
              f.severity,
              f.priority,
              f.status AS canonical_status,
              f.labels,
              f.session_id,
              f.session_provider,
              f.session_replay_url,
              f.user_properties
            FROM feedback f
            WHERE ${standaloneConditions.join(' AND ')}
        `;

        const [clustersResult, standaloneResult] = await Promise.all([
            query<any>(clustersSql, values),
            query<any>(standaloneSql, standaloneValues),
        ]);

        // Merge, sort by priority (clusters first by score, then standalone by recency)
        const merged = [...clustersResult.rows, ...standaloneResult.rows].sort((a, b) => {
            const ap = Number(a.priority_score) || 0;
            const bp = Number(b.priority_score) || 0;
            if (ap !== bp) return bp - ap;
            return String(b.last_seen_at).localeCompare(String(a.last_seen_at));
        });

        const paginated = merged.slice(offset, offset + limit);

        res.json({
            success: true,
            total: merged.length,
            limit,
            offset,
            data: paginated,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

/**
 * GET /api/v1/agent/:projectId/clusters/:clusterId
 *
 * Full cluster detail: metadata + every member feedback row with the
 * context needed for investigation (console errors, network failures,
 * breadcrumbs, screenshots, highlighted element, session replay URL).
 *
 * The `clusterId` path segment also accepts a feedback UUID — useful
 * when the agent picked up a standalone (unclustered) row from
 * /backlog. In that case the response contains a single member.
 */
router.get('/:projectId/clusters/:clusterId', async (req, res) => {
    try {
        const { project_id } = (req as any).agent as AgentAuthContext;
        const { clusterId } = req.params;

        const clusterResult = await query<any>(
            `SELECT c.*, f.title AS canonical_title, f.description AS canonical_description
               FROM clusters c
               LEFT JOIN feedback f ON f.id = c.canonical_feedback_id
              WHERE c.id = $1 AND c.project_id = $2`,
            [clusterId, project_id],
        );

        let memberSql: string;
        let memberValues: any[];

        if (clusterResult.rows.length > 0) {
            memberSql = `SELECT f.*, fc.viewport, fc.user_agent, fc.language,
                                fc.app_version, fc.build_sha,
                                fc.console_errors, fc.network_errors, fc.breadcrumbs
                           FROM feedback f
                           LEFT JOIN feedback_context fc ON fc.feedback_id = f.id
                          WHERE f.cluster_id = $1 AND f.project_id = $2
                          ORDER BY f.created_at DESC`;
            memberValues = [clusterId, project_id];
        } else {
            // Fall back to treating clusterId as a feedback id (standalone row)
            memberSql = `SELECT f.*, fc.viewport, fc.user_agent, fc.language,
                                fc.app_version, fc.build_sha,
                                fc.console_errors, fc.network_errors, fc.breadcrumbs
                           FROM feedback f
                           LEFT JOIN feedback_context fc ON fc.feedback_id = f.id
                          WHERE f.id = $1 AND f.project_id = $2`;
            memberValues = [clusterId, project_id];
        }

        const membersResult = await query<any>(memberSql, memberValues);
        if (membersResult.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Cluster or feedback not found' });
            return;
        }

        res.json({
            success: true,
            cluster: clusterResult.rows[0] ?? null,
            members: membersResult.rows,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

/**
 * POST /api/v1/agent/:projectId/clusters/:clusterId/close
 *
 * Bulk-resolves every feedback row in the cluster. The first row's
 * resolve trigger fans out loop-close notifications + emails to every
 * unique reporter; subsequent rows hit the trigger's cluster-already-
 * resolved guard and exit silently. Runs inside a single transaction
 * so the read-and-update is atomic.
 *
 * Body:
 *   { resolution_note?: string, actor?: string }
 *
 * Also accepts a feedback UUID as :clusterId (matches GET detail).
 */
router.post('/:projectId/clusters/:clusterId/close', async (req, res) => {
    const client = await pool.connect();
    try {
        const { project_id } = (req as any).agent as AgentAuthContext;
        const { clusterId } = req.params;
        const { resolution_note, actor } = CloseClusterSchema.parse(req.body ?? {});
        const resolvedBy = `agent:${actor ?? 'unknown'}`;

        await client.query('BEGIN');

        // Confirm ownership of the cluster OR the feedback id (standalone).
        const clusterCheck = await client.query(
            `SELECT id FROM clusters WHERE id = $1 AND project_id = $2`,
            [clusterId, project_id],
        );

        let updated: any[];
        if (clusterCheck.rows.length > 0) {
            const result = await client.query(
                `UPDATE feedback
                    SET status = 'resolved',
                        resolved_at = NOW(),
                        resolved_by = $3,
                        resolution_note = COALESCE($4, resolution_note)
                  WHERE cluster_id = $1
                    AND project_id = $2
                    AND status NOT IN ('resolved', 'closed')
                  RETURNING id, title, status`,
                [clusterId, project_id, resolvedBy, resolution_note ?? null],
            );
            updated = result.rows;
        } else {
            // Fall back to closing a standalone feedback row.
            const result = await client.query(
                `UPDATE feedback
                    SET status = 'resolved',
                        resolved_at = NOW(),
                        resolved_by = $3,
                        resolution_note = COALESCE($4, resolution_note)
                  WHERE id = $1
                    AND project_id = $2
                    AND status NOT IN ('resolved', 'closed')
                  RETURNING id, title, status`,
                [clusterId, project_id, resolvedBy, resolution_note ?? null],
            );
            if (result.rowCount === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({ success: false, error: 'Cluster or feedback not found' });
                return;
            }
            updated = result.rows;
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            closed_count: updated.length,
            closed: updated,
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
            return;
        }
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/agent/:projectId/feedback/:feedbackId/note
 *
 * Append an investigation note to a feedback row. Notes accumulate in
 * `feedback.agent_notes` (JSONB array) — the agent can leave multiple
 * notes on the same ticket as its understanding evolves. Does NOT
 * change status or fire notifications.
 *
 * Body: { note: string, author?: string }
 */
router.post('/:projectId/feedback/:feedbackId/note', async (req, res) => {
    try {
        const { project_id } = (req as any).agent as AgentAuthContext;
        const { feedbackId } = req.params;
        const { note, author } = AgentNoteSchema.parse(req.body ?? {});

        const entry = {
            at: new Date().toISOString(),
            author: author ?? 'agent',
            note,
        };

        const result = await query<{ id: string; agent_notes: unknown }>(
            `UPDATE feedback
                SET agent_notes = agent_notes || $3::jsonb
              WHERE id = $1 AND project_id = $2
              RETURNING id, agent_notes`,
            [feedbackId, project_id, JSON.stringify([entry])],
        );

        if (result.rowCount === 0) {
            res.status(404).json({ success: false, error: 'Feedback not found' });
            return;
        }

        res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
            return;
        }
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

/**
 * POST /api/v1/agent/:projectId/clusters/:clusterId/propose-fix
 *
 * Agents attach a diff proposal to an auto-resolvable cluster. The admin
 * UI renders the diff in a "Proposed Fix" panel with an Approve button
 * (POST /api/projects/:projectId/clusters/:clusterId/approve-fix) that
 * closes the cluster and records the approval.
 *
 * Body: { summary, diff, files?, confidence?, proposed_by? }
 *
 * Does NOT require `is_auto_resolvable=true` on the cluster — agents can
 * propose fixes on any bug cluster; the flag is just a hint the
 * classifier surfaces to the admin UI.
 */
router.post('/:projectId/clusters/:clusterId/propose-fix', async (req, res) => {
    try {
        const { project_id } = (req as any).agent as AgentAuthContext;
        const { clusterId } = req.params;
        const body = ProposedFixSchema.parse(req.body ?? {});

        const proposal = {
            summary: body.summary,
            diff: body.diff,
            files: body.files ?? [],
            confidence: body.confidence ?? null,
            proposed_by: body.proposed_by ?? 'agent',
            proposed_at: new Date().toISOString(),
        };

        const result = await query<{ id: string; proposed_fix: unknown }>(
            `UPDATE clusters
                SET proposed_fix = $3::jsonb
              WHERE id = $1 AND project_id = $2
              RETURNING id, proposed_fix`,
            [clusterId, project_id, JSON.stringify(proposal)],
        );

        if (result.rowCount === 0) {
            res.status(404).json({ success: false, error: 'Cluster not found' });
            return;
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
            return;
        }
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

export default router;
