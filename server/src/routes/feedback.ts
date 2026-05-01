import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { query } from '../db';
import { requireAuth, getFreshRole, getUserProjectIds, JwtPayload } from '../middleware/auth';
import { FeedbackSchema, UpdateFeedbackStatusSchema, UpdateFeedbackTriageSchema } from '../schemas/feedback';
import { getProjectPlanStatus, notifyLimitReached, incrementUsageCount } from '../helpers/plan';
import { Feedback, Project } from '../schemas/tables';

const router = Router();

// In-memory TTL caches keyed by project_id (or '__global__').
// Invalidated on resolve so dashboard cards reflect changes promptly.
const loopHealthCache = new Map<string, { data: unknown; cachedAt: number }>();
const LOOP_HEALTH_TTL_MS = 60 * 60 * 1000; // 1 hour — expensive 30-day window scan

const statsCache = new Map<string, { data: unknown; cachedAt: number }>();
const STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — simple COUNTs, refresh often enough

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Queue a "your feedback was resolved" email for every submitter in the
 * cluster (or the single feedback row when there's no cluster). Runs
 * server-side so it works on both Supabase and local Postgres regardless of
 * whether the SQL trigger is installed.  The dedupe_key matches the trigger's
 * pattern, so if the trigger IS installed the second INSERT hits
 * ON CONFLICT DO NOTHING.
 */
async function queueResolveEmail(feedback: {
    id: string;
    project_id: string;
    title: string | null;
    email: string | null;
    user_id: string | null;
    cluster_id: string | null;
    resolution_note: string | null;
    resolved_at: string | null;
}): Promise<void> {
    const scopeClause = feedback.cluster_id
        ? `f.cluster_id = $1::uuid`
        : `f.id = $1::uuid`;
    const scopeParam = feedback.cluster_id ?? feedback.id;

    // One CTE query: project metadata + all distinct recipient emails.
    // LEFT JOIN so we always get project_name/owner_email even if no recipients.
    const gathered = await query<{
        project_name: string | null;
        owner_email: string | null;
        recipient_email: string | null;
    }>(
        `WITH proj AS (
             SELECT name AS project_name, owner_email FROM projects WHERE id = $2
         ),
         recip AS (
             SELECT DISTINCT COALESCE(
                 NULLIF(f.email, ''),
                 (SELECT ur.email FROM user_roles ur WHERE ur.user_id::text = f.user_id LIMIT 1)
             ) AS recipient_email
             FROM feedback f
             WHERE ${scopeClause}
         )
         SELECT proj.project_name, proj.owner_email, recip.recipient_email
           FROM proj LEFT JOIN recip ON TRUE`,
        [scopeParam, feedback.project_id],
    );

    if (gathered.rows.length === 0) return;

    const { project_name, owner_email } = gathered.rows[0];
    const projectName = project_name ?? feedback.project_id;

    let recipients = [...new Set(
        gathered.rows.map(r => r.recipient_email).filter((e): e is string => !!e),
    )];

    // Owner fallback: anonymous cluster with no email on any member row.
    if (recipients.length === 0) {
        if (!owner_email) return;
        recipients = [owner_email];
    }

    const subject = `Your feedback in ${projectName} has been resolved`;
    const body =
        `Hi,\n\nYour recent feedback has been marked as resolved:\n\n` +
        `  "${feedback.title ?? '(no title)'}"\n\n` +
        (feedback.resolution_note
            ? `The developer left a note:\n  ${feedback.resolution_note}\n\n`
            : '') +
        `Thanks for helping improve ${projectName}.\n\n— Bernstein Feedback`;
    const contextJson = JSON.stringify({
        project_id:      feedback.project_id,
        project_name:    projectName,
        feedback_id:     feedback.id,
        feedback_title:  feedback.title ?? '(no title)',
        resolution_note: feedback.resolution_note,
        resolved_at:     feedback.resolved_at,
    });
    const dedupPrefix = `resolved:${feedback.cluster_id ?? feedback.id}`;

    // One batch INSERT for all recipients — N round-trips → 1.
    await query(
        `INSERT INTO email_queue
           (to_email, subject, body_text, event_type, context, project_id, feedback_id, dedupe_key)
         SELECT email, $2, $3, 'resolved', $4::jsonb, $5::uuid, $6::uuid, $7 || ':' || email
           FROM UNNEST($1::text[]) AS email
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [recipients, subject, body, contextJson, feedback.project_id, feedback.id, dedupPrefix],
    );
}

/**
 * Rate limit on the public POST /api/feedback endpoint. Anonymous —
 * anyone can hit it, so without this a single attacker could burn
 * through plan limits, fill the DB, and trigger a flood of resolve
 * emails downstream. Keyed by (IP + project_id) so legitimate
 * multi-tenant traffic isn't penalised by noisy neighbours.
 *
 * Tunable via env: FEEDBACK_RATE_LIMIT_WINDOW_MS, FEEDBACK_RATE_LIMIT_MAX.
 */
const submitFeedbackLimiter = rateLimit({
    windowMs: parseInt(process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.FEEDBACK_RATE_LIMIT_MAX || '20', 10),
    standardHeaders: true,
    legacyHeaders: false,
    // Delegate IP extraction to the lib's helper so IPv6 addresses are
    // bucketed by /64 prefix (preventing same-attacker /64 subnet bypass).
    keyGenerator: (req, res) => {
        const ipKey = ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown', res as any);
        const pid = (req.body && typeof req.body.project_id === 'string')
            ? req.body.project_id : 'no-project';
        return `${ipKey}|${pid}`;
    },
    message: { success: false, error: 'rate_limited', message: 'Too many submissions. Try again in a minute.' },
});

// Submit feedback (public — widget calls this)
router.post('/', submitFeedbackLimiter, async (req, res) => {
    try {
        const event = FeedbackSchema.parse(req.body);

        // Check project exists — don't auto-create
        const projectCheck = await query<Pick<Project, 'id'>>('SELECT id FROM projects WHERE id = $1', [event.project_id]);
        if (projectCheck.rows.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Project not found. Please create the project in the admin dashboard first.',
            });
            return;
        }

        // Check plan usage limit before inserting
        const planStatus = await getProjectPlanStatus(event.project_id);
        if (!planStatus.can_submit) {
            notifyLimitReached(event.project_id, planStatus.tickets_used, planStatus.tickets_limit);

            res.status(429).json({
                success: false,
                error: 'limit_reached',
                message: planStatus.message,
                tickets_used: planStatus.tickets_used,
                tickets_limit: planStatus.tickets_limit,
            });
            return;
        }

        const text = `
      INSERT INTO feedback (
        project_id, type, timestamp, event_id, title, description, category, severity, impact, email,
        url, route, screen_id, page_name,
        context, metadata, screenshots, highlighted_element,
        user_id, tenant_id, role, bernstein_run_id,
        session_id, session_provider, session_replay_url, user_properties
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, $26
      ) RETURNING id
    `;

        const ctx = event.context as any;
        const values = [
            event.project_id,
            event.type,
            event.timestamp || new Date().toISOString(),
            event.event_id ?? null,
            event.title,
            event.description ?? null,
            event.category ?? null,
            event.severity ?? null,
            event.impact ?? null,
            event.email ?? null,
            ctx?.url ?? null,
            ctx?.route ?? null,
            ctx?.screenId ?? null,
            ctx?.pageName ?? null,
            event.context ? JSON.stringify(event.context) : null,
            event.metadata ? JSON.stringify(event.metadata) : null,
            JSON.stringify(event.screenshots || []),
            event.highlighted_element ? JSON.stringify(event.highlighted_element) : null,
            event.user_id ?? null,
            event.tenant_id ?? null,
            event.role ?? null,
            event.bernstein_run_id ?? null,
            // Session provider fields (Tier 1) — may all be null if the
            // host app didn't configure a sessionProvider.
            event.session_id ?? null,
            event.session_provider ?? null,
            event.session_replay_url ?? null,
            event.user_properties ? JSON.stringify(event.user_properties) : null,
        ];

        const result = await query<Pick<Feedback, 'id'>>(text, values);

        await incrementUsageCount(event.project_id);

        // NOTE: Notifications for this feedback are generated by the
        // Postgres trigger `on_new_feedback` which fans out to project
        // members + global admins. Do NOT insert notifications here or
        // every event will produce duplicate rows (once from this handler,
        // once from the trigger). The trigger is the single source of truth.

        res.status(201).json({
            success: true,
            id: result.rows[0].id
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('Validation Error:', error.errors);
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Server Error:', msg, error);
            res.status(500).json({ success: false, error: msg });
        }
    }
});

// List feedback (with filters + search + sort + pagination) — scoped by role.
// Query params:
//   project_id, type, status, severity, priority — equality filters
//   q        — free-text search across title + description (ILIKE)
//   sort_by  — 'newest_first' (default) | 'oldest_first' | 'priority'
//   limit    — default 50, max 500
//   offset   — default 0
// Response always includes `total` so the UI can render pagination.
router.get('/', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const { project_id, type, status, severity, priority, q, sort_by } = req.query;
        const limitRaw = parseInt(String(req.query.limit ?? '50'), 10) || 50;
        const limit = Math.min(500, Math.max(1, limitRaw));
        const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10) || 0);

        const conditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        const feedbackRole = await getFreshRole(user.user_id, user.role);
        if (feedbackRole !== 'admin') {
            const projectIds = await getUserProjectIds(user.user_id);
            if (projectIds.length === 0) {
                res.json({ success: true, data: [], total: 0 });
                return;
            }
            conditions.push(`f.project_id = ANY($${paramIndex++})`);
            values.push(projectIds);
        }

        if (project_id) { conditions.push(`f.project_id = $${paramIndex++}`); values.push(project_id); }
        if (type) { conditions.push(`f.type = $${paramIndex++}`); values.push(type); }
        if (status) { conditions.push(`f.status = $${paramIndex++}`); values.push(status); }
        if (severity) { conditions.push(`f.severity = $${paramIndex++}`); values.push(severity); }
        if (priority) { conditions.push(`f.priority = $${paramIndex++}`); values.push(priority); }
        if (typeof q === 'string' && q.trim().length > 0) {
            // Escape LIKE wildcards so a user search for "50%" doesn't widen the match.
            const needle = `%${q.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`;
            conditions.push(`(f.title ILIKE $${paramIndex} OR f.description ILIKE $${paramIndex})`);
            values.push(needle);
            paramIndex++;
        }

        const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

        // Sort expressions used both inside the CTE (for PARTITION tiebreak) and
        // outside (for final page order). No `f.` prefix — outer query reads from
        // the CTE alias which exposes bare column names.
        let outerOrder = 'created_at DESC';
        if (sort_by === 'oldest_first') {
            outerOrder = 'created_at ASC';
        } else if (sort_by === 'priority') {
            outerOrder = `CASE priority
                           WHEN 'urgent' THEN 1
                           WHEN 'high'   THEN 2
                           WHEN 'medium' THEN 3
                           WHEN 'low'    THEN 4
                           ELSE 5 END, created_at DESC`;
        } else if (sort_by === 'submitted_by') {
            outerOrder = `LOWER(COALESCE(NULLIF(email, ''), user_id, '')) ASC, created_at DESC`;
        }

        // Count distinct cluster-or-id groups so the pagination total reflects
        // deduplicated rows, not raw feedback count.
        const countResult = await query<{ count: string }>(
            `SELECT COUNT(DISTINCT COALESCE(f.cluster_id::text, f.id::text))::text AS count
               FROM feedback f ${where}`,
            values,
        );
        const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

        // CTE picks the latest row per cluster (ROW_NUMBER PARTITION BY cluster).
        // Unclustered rows are their own partition (COALESCE falls back to f.id)
        // so they pass through unchanged. The outer SELECT strips the internal _rn
        // column and applies the user-requested sort + pagination.
        const pageValues = [...values, limit, offset];
        const sql = `
            WITH _ranked AS (
                SELECT f.id, f.project_id, f.type, f.title, f.description, f.category,
                       f.severity, f.impact, f.email, f.screen_id, f.page_name, f.user_id,
                       f.tenant_id, f.screenshots, f.status, f.resolved_at, f.labels,
                       f.priority, f.session_id, f.session_provider, f.session_replay_url,
                       f.user_properties, f.created_at, f.cluster_id,
                       c.submission_count AS cluster_submission_count,
                       ROW_NUMBER() OVER (
                           PARTITION BY COALESCE(f.cluster_id::text, f.id::text)
                           ORDER BY f.created_at DESC
                       ) AS _rn
                  FROM feedback f
                  LEFT JOIN clusters c ON c.id = f.cluster_id
                  ${where}
            )
            SELECT id, project_id, type, title, description, category, severity, impact,
                   email, screen_id, page_name, user_id, tenant_id, screenshots, status,
                   resolved_at, labels, priority, session_id, session_provider,
                   session_replay_url, user_properties, created_at,
                   cluster_id, cluster_submission_count
              FROM _ranked
             WHERE _rn = 1
             ORDER BY ${outerOrder}
             LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `;
        const result = await query(sql, pageValues);

        res.json({
            success: true,
            data: result.rows,
            total,
            limit,
            offset,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('List Error:', msg);
        res.status(500).json({ success: false, error: msg });
    }
});

// Get stats/analytics (MUST be before :id route) — scoped by role
router.get('/stats/summary', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const { project_id } = req.query;

        const conditions: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        const statsRole = await getFreshRole(user.user_id, user.role);
        if (statsRole !== 'admin') {
            const projectIds = await getUserProjectIds(user.user_id);
            if (projectIds.length === 0) {
                res.json({ success: true, data: { total: 0, by_type: {}, by_severity: {} } });
                return;
            }
            conditions.push(`project_id = ANY($${paramIndex++})`);
            params.push(projectIds);
        }

        if (project_id) {
            conditions.push(`project_id = $${paramIndex++}`);
            params.push(project_id);
        }

        const cacheKey = typeof project_id === 'string' ? project_id : (statsRole === 'admin' ? '__all__' : `u:${user.user_id}`);
        const cachedStats = statsCache.get(cacheKey);
        if (cachedStats && Date.now() - cachedStats.cachedAt < STATS_CACHE_TTL_MS) {
            res.json({ success: true, data: cachedStats.data });
            return;
        }

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        const sevWhere = conditions.length > 0
            ? where + ' AND severity IS NOT NULL'
            : 'WHERE severity IS NOT NULL';

        // Run all three counts in parallel — previously sequential (3 round-trips → 1 parallel set).
        const [total, byType, bySeverity] = await Promise.all([
            query<{ count: string }>(`SELECT COUNT(*) as count FROM feedback ${where}`, params),
            query<{ type: string; count: string }>(`SELECT type, COUNT(*) as count FROM feedback ${where} GROUP BY type`, params),
            query<{ severity: string; count: string }>(`SELECT severity, COUNT(*) as count FROM feedback ${sevWhere} GROUP BY severity`, params),
        ]);

        const statsData = {
            total: parseInt(total.rows[0]?.count || '0'),
            by_type: Object.fromEntries(byType.rows.map((r) => [r.type, parseInt(r.count)])),
            by_severity: Object.fromEntries(bySeverity.rows.map((r) => [r.severity, parseInt(r.count)])),
        };
        statsCache.set(cacheKey, { data: statsData, cachedAt: Date.now() });
        res.json({ success: true, data: statsData });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// P4: Feedback loop health metrics for the admin dashboard card.
// Delegates to the feedback_loop_health SQL function so the arithmetic
// lives in one place (and can be reused by BI tools). Computes per
// ?project_id=X, or globally if omitted.
router.get('/stats/loop-health', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : null;

        // Non-admins can only query their own projects.
        const role = await getFreshRole(user.user_id, user.role);
        if (role !== 'admin') {
            if (!projectId) {
                res.status(400).json({ success: false, error: 'project_id is required for non-admin users' });
                return;
            }
            const projectIds = await getUserProjectIds(user.user_id);
            if (!projectIds.includes(projectId)) {
                res.status(403).json({ success: false, error: 'Forbidden' });
                return;
            }
        }

        const cacheKey = projectId ?? '__global__';
        const cached = loopHealthCache.get(cacheKey);
        if (cached && Date.now() - cached.cachedAt < LOOP_HEALTH_TTL_MS) {
            res.json({ success: true, data: cached.data });
            return;
        }

        const result = await query<{
            avg_resolution_hours: string | null;
            pct_closed_14d: string | null;
            return_rate: string | null;
            total_30d: string;
            resolved_30d: string;
            unique_submitters_90d: string;
            returning_submitters_90d: string;
        }>(`SELECT * FROM feedback_loop_health($1)`, [projectId]);

        const row = result.rows[0] || {} as any;
        const avgHours = row.avg_resolution_hours != null ? parseFloat(row.avg_resolution_hours) : null;
        const pctClosed = row.pct_closed_14d != null ? parseFloat(row.pct_closed_14d) : null;
        const returnRate = row.return_rate != null ? parseFloat(row.return_rate) : null;

        // Traffic-light thresholds (the spec calls for green/amber/red).
        const statusFor = (
            value: number | null,
            good: number,
            warn: number,
            higherIsBetter: boolean,
        ): 'green' | 'amber' | 'red' | 'unknown' => {
            if (value == null) return 'unknown';
            if (higherIsBetter) {
                if (value >= good) return 'green';
                if (value >= warn) return 'amber';
                return 'red';
            } else {
                if (value <= good) return 'green';
                if (value <= warn) return 'amber';
                return 'red';
            }
        };

        const avgHoursStatus = statusFor(avgHours, 48, 168, false); // green ≤ 48h, amber ≤ 7d, red > 7d
        const pctClosedStatus = statusFor(pctClosed, 80, 50, true); // green ≥ 80%, amber ≥ 50%
        const returnRateStatus = statusFor(returnRate, 40, 15, true); // green ≥ 40%, amber ≥ 15%

        // Overall is the worst of the three (red > amber > green).
        const rank = (s: string) => ({ unknown: -1, green: 0, amber: 1, red: 2 }[s] ?? -1);
        const overall = [avgHoursStatus, pctClosedStatus, returnRateStatus].reduce((worst, s) =>
            rank(s) > rank(worst) ? s : worst, 'green' as const);

        const healthData = {
            project_id: projectId,
            metrics: {
                avg_resolution_hours: avgHours,
                pct_closed_14d: pctClosed,
                return_rate: returnRate,
            },
            status: {
                avg_resolution: avgHoursStatus,
                pct_closed_14d: pctClosedStatus,
                return_rate: returnRateStatus,
                overall,
            },
            counts: {
                total_30d: parseInt(row.total_30d || '0'),
                resolved_30d: parseInt(row.resolved_30d || '0'),
                unique_submitters_90d: parseInt(row.unique_submitters_90d || '0'),
                returning_submitters_90d: parseInt(row.returning_submitters_90d || '0'),
            },
        };
        loopHealthCache.set(cacheKey, { data: healthData, cachedAt: Date.now() });
        res.json({ success: true, data: healthData });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Get single feedback with full context — scoped by role
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const result = await query<Feedback>('SELECT * FROM feedback WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Not found' });
            return;
        }

        const detailRole = await getFreshRole(user.user_id, user.role);
        if (detailRole !== 'admin') {
            const projectIds = await getUserProjectIds(user.user_id);
            if (!projectIds.includes(result.rows[0].project_id)) {
                res.status(403).json({ success: false, error: 'Access denied' });
                return;
            }
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Delete feedback — admin only, title must contain "test" (case-insensitive)
// to prevent accidental deletion of real submissions.
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const role = await getFreshRole(user.user_id, user.role);
        if (role !== 'admin') {
            res.status(403).json({ success: false, error: 'Admin only' });
            return;
        }

        const existing = await query<{ id: string; title: string }>(
            'SELECT id, title FROM feedback WHERE id = $1',
            [req.params.id],
        );
        if (existing.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Not found' });
            return;
        }

        const title = existing.rows[0].title ?? '';
        if (!title.toLowerCase().includes('test')) {
            res.status(403).json({
                success: false,
                error: 'Only messages with "test" in the title can be deleted to preserve submission history.',
            });
            return;
        }

        await query('DELETE FROM feedback WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Update feedback status (resolve, close, etc.)
router.patch('/:id/status', requireAuth, async (req, res) => {
    try {
        const { status, resolution_note } = UpdateFeedbackStatusSchema.parse(req.body);

        const user = (req as any).user as JwtPayload;

        const sets: string[] = [`status = $1`];
        const values: any[] = [status];
        let i = 2;

        if (status === 'resolved' || status === 'closed') {
            sets.push(`resolved_at = $${i++}`);
            values.push(new Date().toISOString());
            sets.push(`resolved_by = $${i++}`);
            values.push(user.email);
        } else {
            sets.push(`resolved_at = $${i++}`);
            values.push(null);
            sets.push(`resolved_by = $${i++}`);
            values.push(null);
        }

        if (resolution_note !== undefined) {
            sets.push(`resolution_note = $${i++}`);
            values.push(resolution_note);
        }

        values.push(req.params.id);
        const result = await query<Pick<Feedback, 'id' | 'project_id' | 'title' | 'status' | 'user_id' | 'resolved_at' | 'resolved_by'> & { email: string | null; cluster_id: string | null; resolution_note: string | null }>(
            `UPDATE feedback SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, project_id, title, status, user_id, resolved_at, resolved_by, email, cluster_id, resolution_note`,
            values
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Feedback not found' });
            return;
        }

        const feedback = result.rows[0];

        // NOTE: The resolve notification badge is generated by the Postgres
        // trigger `on_feedback_resolved`. We do NOT insert notifications here
        // to avoid duplicates — the trigger is the single source for badges.
        //
        // Email is queued here directly (not via trigger) so it works on both
        // Supabase and local Postgres without requiring the trigger to be
        // installed. The dedupe_key matches the trigger's pattern so if the
        // trigger IS installed, the second INSERT hits ON CONFLICT DO NOTHING.
        if (status === 'resolved' || status === 'closed') {
            queueResolveEmail(feedback).catch((err) =>
                console.warn('[email] failed to queue resolve email:', err instanceof Error ? err.message : err),
            );
            // Invalidate health + stats caches so dashboard cards reflect the change.
            loopHealthCache.delete(feedback.project_id);
            loopHealthCache.delete('__global__');
            statsCache.delete(feedback.project_id);
            statsCache.delete('__all__');
        }

        res.json({ success: true, data: feedback });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    }
});

// Tier 2: list other feedback rows in the same cluster. Used by the
// admin detail page to show "Also reported by: X, Y, Z" — proving
// deduplication to the developer without them having to search manually.
router.get('/:id/cluster-siblings', requireAuth, async (req, res) => {
    try {
        const result = await query<{
            id: string;
            title: string;
            email: string | null;
            user_id: string | null;
            created_at: string;
            status: string | null;
        }>(
            `SELECT f2.id, f2.title, f2.email, f2.user_id, f2.created_at, f2.status
               FROM feedback f1
               JOIN feedback f2 ON f2.cluster_id = f1.cluster_id
              WHERE f1.id = $1
                AND f1.cluster_id IS NOT NULL
                AND f2.id <> f1.id
              ORDER BY f2.created_at DESC
              LIMIT 50`,
            [req.params.id],
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Update feedback triage fields (P3) — labels and/or priority.
// Send any subset; fields not included in the body are untouched.
// Examples:
//   PATCH /api/feedback/<id>/triage  { "priority": "high" }
//   PATCH /api/feedback/<id>/triage  { "labels": ["backend", "duplicate"] }
//   PATCH /api/feedback/<id>/triage  { "priority": null }   // clear
router.patch('/:id/triage', requireAuth, async (req, res) => {
    try {
        const data = UpdateFeedbackTriageSchema.parse(req.body);

        const sets: string[] = [];
        const values: any[] = [];
        let i = 1;

        if (data.labels !== undefined) {
            sets.push(`labels = $${i++}`);
            values.push(data.labels);
        }
        if (data.priority !== undefined) {
            sets.push(`priority = $${i++}`);
            values.push(data.priority);
        }

        if (sets.length === 0) {
            res.status(400).json({ success: false, error: 'No triage fields provided' });
            return;
        }

        values.push(req.params.id);
        const result = await query<{ id: string; labels: string[]; priority: string | null }>(
            `UPDATE feedback SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, labels, priority`,
            values,
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Feedback not found' });
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

// ──────────────────────────────────────────────────────────────
// Bulk triage actions — mark many tickets resolved / set priority /
// add-remove labels in one call. Designed for the admin list page's
// toolbar. Access-checked per row against the user's accessible
// projects; rows outside that set are silently skipped (not leaked).
// ──────────────────────────────────────────────────────────────
const BulkPatchSchema = z.object({
    ids: z.array(z.string().uuid()).min(1).max(200),
    patch: z.object({
        status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable().optional(),
        labels_add: z.array(z.string().max(40)).max(10).optional(),
        labels_remove: z.array(z.string().max(40)).max(10).optional(),
        resolution_note: z.string().max(2000).optional(),
    }),
});

router.patch('/bulk', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const { ids, patch } = BulkPatchSchema.parse(req.body ?? {});

        // Scope by accessible projects unless admin.
        const role = await getFreshRole(user.user_id, user.role);
        let projectFilter: string | null = null;
        if (role !== 'admin') {
            const projectIds = await getUserProjectIds(user.user_id);
            if (projectIds.length === 0) {
                res.json({ success: true, updated: 0 });
                return;
            }
            projectFilter = projectIds.join(',');
        }

        // Build the SET clause. NULL priority is a meaningful "clear" value,
        // so the nullable-priority path stays explicit.
        const sets: string[] = [];
        const values: any[] = [];
        let i = 1;

        if (patch.status !== undefined) {
            sets.push(`status = $${i++}`); values.push(patch.status);
            if (patch.status === 'resolved' || patch.status === 'closed') {
                sets.push(`resolved_at = NOW()`);
                sets.push(`resolved_by = $${i++}`); values.push(user.email);
            } else {
                sets.push(`resolved_at = NULL`);
                sets.push(`resolved_by = NULL`);
            }
        }
        if (patch.priority !== undefined) {
            sets.push(`priority = $${i++}`); values.push(patch.priority);
        }
        if (patch.resolution_note !== undefined && patch.status === 'resolved') {
            sets.push(`resolution_note = $${i++}`); values.push(patch.resolution_note);
        }
        if (patch.labels_add && patch.labels_add.length > 0) {
            // Append-distinct using array_cat + DISTINCT array aggregation.
            sets.push(`labels = (SELECT ARRAY(SELECT DISTINCT unnest(labels || $${i++}::text[])))`);
            values.push(patch.labels_add);
        }
        if (patch.labels_remove && patch.labels_remove.length > 0) {
            sets.push(`labels = (SELECT ARRAY(SELECT unnest(labels) EXCEPT SELECT unnest($${i++}::text[])))`);
            values.push(patch.labels_remove);
        }

        if (sets.length === 0) {
            res.status(400).json({ success: false, error: 'No patch fields supplied' });
            return;
        }

        values.push(ids);
        const idsParam = i++;

        let sql = `UPDATE feedback SET ${sets.join(', ')} WHERE id = ANY($${idsParam}::uuid[])`;
        if (projectFilter) {
            values.push(projectFilter.split(','));
            sql += ` AND project_id = ANY($${i++})`;
        }
        sql += ` RETURNING id`;

        const result = await query<{ id: string }>(sql, values);
        res.json({ success: true, updated: result.rows.length, ids: result.rows.map(r => r.id) });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
            return;
        }
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// ──────────────────────────────────────────────────────────────
// Cluster detail + auto-resolvable fix approval (admin surface)
// ──────────────────────────────────────────────────────────────
// Mounted under /api/feedback/clusters/:id to keep the admin paths
// together. Access control: the user must be able to see at least one
// feedback row in the cluster (admin or member of the cluster's project).

async function assertClusterAccess(
    user: JwtPayload,
    clusterId: string,
): Promise<{ projectId: string } | { error: number; message: string }> {
    const result = await query<{ project_id: string }>(
        `SELECT project_id FROM clusters WHERE id = $1`,
        [clusterId],
    );
    if (result.rows.length === 0) return { error: 404, message: 'Cluster not found' };
    const projectId = result.rows[0].project_id;
    const role = await getFreshRole(user.user_id, user.role);
    if (role !== 'admin') {
        const projectIds = await getUserProjectIds(user.user_id);
        if (!projectIds.includes(projectId)) return { error: 403, message: 'Access denied' };
    }
    return { projectId };
}

// Cluster detail — metadata + proposed_fix + summary counts. Used by the
// admin Feedback Detail page to render the "Proposed Fix" panel when the
// agent attached a diff via POST /api/v1/agent/.../propose-fix.
router.get('/clusters/:id', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const access = await assertClusterAccess(user, req.params.id);
        if ('error' in access) {
            res.status(access.error).json({ success: false, error: access.message });
            return;
        }

        const result = await query<{
            id: string; project_id: string; feedback_type: string;
            title: string; submission_count: number; first_seen_at: string;
            last_seen_at: string; resolved_at: string | null; priority_score: string;
            is_auto_resolvable: boolean; proposed_fix: Record<string, unknown> | null;
            canonical_feedback_id: string | null;
        }>(
            `SELECT id, project_id, feedback_type, title, submission_count,
                    first_seen_at, last_seen_at, resolved_at, priority_score,
                    is_auto_resolvable, proposed_fix, canonical_feedback_id
               FROM clusters WHERE id = $1`,
            [req.params.id],
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Manual cluster merge — move every feedback row from cluster :id into
// the target cluster, recompute counts, then drop the empty source.
// Useful when the embedding model split a single issue across two
// clusters (or grouped two unrelated issues that should be split via
// the sibling endpoint below).
router.post('/clusters/:id/merge-into/:targetId', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const access = await assertClusterAccess(user, req.params.id);
        if ('error' in access) {
            res.status(access.error).json({ success: false, error: access.message });
            return;
        }
        const targetAccess = await assertClusterAccess(user, req.params.targetId);
        if ('error' in targetAccess) {
            res.status(targetAccess.error).json({ success: false, error: targetAccess.message });
            return;
        }
        if (access.projectId !== targetAccess.projectId) {
            res.status(400).json({ success: false, error: 'Cannot merge clusters across projects' });
            return;
        }
        if (req.params.id === req.params.targetId) {
            res.status(400).json({ success: false, error: 'Source and target cluster are the same' });
            return;
        }

        await query(`UPDATE feedback SET cluster_id = $1 WHERE cluster_id = $2`, [req.params.targetId, req.params.id]);
        await query(
            `UPDATE clusters SET submission_count = (SELECT COUNT(*) FROM feedback WHERE cluster_id = $1),
                                 last_seen_at = NOW(),
                                 priority_score = feedback_cluster_priority($1)
              WHERE id = $1`,
            [req.params.targetId],
        );
        await query(`DELETE FROM clusters WHERE id = $1`, [req.params.id]);

        res.json({ success: true, merged_into: req.params.targetId });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Manually detach a feedback row from its cluster — the row becomes a
// standalone ticket again. Used when the embedding wrongly grouped an
// unrelated issue into an existing cluster. Recomputes the source
// cluster's submission_count + priority after detach.
router.post('/:id/split-from-cluster', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const result = await query<{ project_id: string; cluster_id: string | null }>(
            `SELECT project_id, cluster_id FROM feedback WHERE id = $1`,
            [req.params.id],
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Feedback not found' });
            return;
        }
        const { project_id, cluster_id } = result.rows[0];
        if (!cluster_id) {
            res.status(400).json({ success: false, error: 'Feedback is not part of a cluster' });
            return;
        }
        const role = await getFreshRole(user.user_id, user.role);
        if (role !== 'admin') {
            const projectIds = await getUserProjectIds(user.user_id);
            if (!projectIds.includes(project_id)) {
                res.status(403).json({ success: false, error: 'Access denied' });
                return;
            }
        }

        await query(`UPDATE feedback SET cluster_id = NULL WHERE id = $1`, [req.params.id]);
        // Recompute the source cluster — if it's now empty, delete it.
        const remaining = await query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM feedback WHERE cluster_id = $1`,
            [cluster_id],
        );
        if (parseInt(remaining.rows[0].count, 10) === 0) {
            await query(`DELETE FROM clusters WHERE id = $1`, [cluster_id]);
        } else {
            await query(
                `UPDATE clusters SET submission_count = $2,
                                     priority_score = feedback_cluster_priority($1)
                  WHERE id = $1`,
                [cluster_id, parseInt(remaining.rows[0].count, 10)],
            );
        }

        res.json({ success: true, detached_from: cluster_id });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Approve the agent's proposed fix — resolves every member of the cluster
// and records the approver. Same fan-out guarantees as the agent
// cluster-close endpoint because it uses the same resolve trigger path.
router.post('/clusters/:id/approve-fix', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const access = await assertClusterAccess(user, req.params.id);
        if ('error' in access) {
            res.status(access.error).json({ success: false, error: access.message });
            return;
        }

        const clusterCheck = await query<{ proposed_fix: Record<string, unknown> | null }>(
            `SELECT proposed_fix FROM clusters WHERE id = $1`,
            [req.params.id],
        );
        const fix = clusterCheck.rows[0]?.proposed_fix;
        if (!fix) {
            res.status(400).json({
                success: false,
                error: 'No proposed_fix on this cluster. Ask the agent to submit one first.',
            });
            return;
        }

        const note = typeof (fix as any).summary === 'string'
            ? `Auto-fix: ${(fix as any).summary} (approved by ${user.email})`
            : `Auto-fix approved by ${user.email}`;

        const result = await query<{ id: string; status: string }>(
            `UPDATE feedback
                SET status = 'resolved',
                    resolved_at = NOW(),
                    resolved_by = $2,
                    resolution_note = $3
              WHERE cluster_id = $1
                AND status NOT IN ('resolved', 'closed')
              RETURNING id, status`,
            [req.params.id, `admin:${user.email}`, note],
        );

        res.json({ success: true, closed_count: result.rows.length });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

export default router;
