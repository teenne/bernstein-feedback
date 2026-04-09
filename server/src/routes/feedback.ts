import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { requireAuth, getFreshRole, getUserProjectIds, JwtPayload } from '../middleware/auth';
import { FeedbackSchema, UpdateFeedbackStatusSchema } from '../schemas/feedback';
import { getProjectPlanStatus, notifyLimitReached, incrementUsageCount } from '../helpers/plan';
import { Feedback, Project } from '../schemas/tables';

const router = Router();

// Submit feedback (public — widget calls this)
router.post('/', async (req, res) => {
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
        user_id, tenant_id, role, bernstein_run_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
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
            event.bernstein_run_id ?? null
        ];

        const result = await query<Pick<Feedback, 'id'>>(text, values);

        await incrementUsageCount(event.project_id);

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

// List feedback (with filters) — scoped by role
router.get('/', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const { project_id, type, status, severity, limit = '50', offset = '0' } = req.query;

        let sql = 'SELECT id, project_id, type, title, description, category, severity, impact, email, screen_id, page_name, user_id, tenant_id, screenshots, status, resolved_at, created_at FROM feedback';
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
            conditions.push(`project_id = ANY($${paramIndex++})`);
            values.push(projectIds);
        }

        if (project_id) { conditions.push(`project_id = $${paramIndex++}`); values.push(project_id); }
        if (type) { conditions.push(`type = $${paramIndex++}`); values.push(type); }
        if (status) { conditions.push(`status = $${paramIndex++}`); values.push(status); }
        if (severity) { conditions.push(`severity = $${paramIndex++}`); values.push(severity); }

        if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
        sql += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        values.push(parseInt(limit as string), parseInt(offset as string));

        const result = await query(sql, values);
        res.json({ success: true, data: result.rows, total: result.rowCount });
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

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        const sevWhere = conditions.length > 0
            ? where + ' AND severity IS NOT NULL'
            : 'WHERE severity IS NOT NULL';

        const total = await query<{ count: string }>(`SELECT COUNT(*) as count FROM feedback ${where}`, params);
        const byType = await query<{ type: string; count: string }>(`SELECT type, COUNT(*) as count FROM feedback ${where} GROUP BY type`, params);
        const bySeverity = await query<{ severity: string; count: string }>(`SELECT severity, COUNT(*) as count FROM feedback ${sevWhere} GROUP BY severity`, params);

        res.json({
            success: true,
            data: {
                total: parseInt(total.rows[0]?.count || '0'),
                by_type: Object.fromEntries(byType.rows.map((r) => [r.type, parseInt(r.count)])),
                by_severity: Object.fromEntries(bySeverity.rows.map((r) => [r.severity, parseInt(r.count)])),
            }
        });
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
        const result = await query<Pick<Feedback, 'id' | 'project_id' | 'title' | 'status' | 'user_id' | 'resolved_at' | 'resolved_by'>>(
            `UPDATE feedback SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, project_id, title, status, user_id, resolved_at, resolved_by`,
            values
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Feedback not found' });
            return;
        }

        const feedback = result.rows[0];

        // Create notification for the end user who submitted the feedback
        if ((status === 'resolved' || status === 'closed') && feedback.user_id) {
            await query(
                `INSERT INTO notifications (project_id, feedback_id, user_id, type, title, message)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    feedback.project_id,
                    feedback.id,
                    feedback.user_id,
                    'resolved',
                    `Your feedback "${feedback.title}" has been resolved`,
                    resolution_note || null,
                ]
            );
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

export default router;
