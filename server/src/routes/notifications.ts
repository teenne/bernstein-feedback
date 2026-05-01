import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { requireAuth, JwtPayload } from '../middleware/auth';
import { GetNotificationsSchema, MarkAllReadSchema } from '../schemas/notification';
import { Notification } from '../schemas/tables';

const router = Router();

// Get notifications for the authenticated user.
// - With `?project_id=<id>`: scoped to one project (widget / project view).
// - Without `project_id`: returns every notification this user can see
//   (admin bell in the dashboard). Scoping is still enforced by the
//   `user_id = $1` filter — the notification fan-out trigger only writes
//   rows for legitimate recipients (project members + global admins), so
//   the user_id check is sufficient access control.
router.get('/', requireAuth, async (req, res) => {
    try {
        const { project_id } = GetNotificationsSchema.parse(req.query);
        const user = (req as any).user as JwtPayload;

        const sql = project_id
            ? `SELECT id, project_id, feedback_id, type, title, message, read, created_at
                 FROM notifications
                WHERE project_id = $2 AND user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
                ORDER BY created_at DESC
                LIMIT 20`
            : `SELECT id, project_id, feedback_id, type, title, message, read, created_at
                 FROM notifications
                WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
                ORDER BY created_at DESC
                LIMIT 50`;
        const params = project_id ? [user.user_id, project_id] : [user.user_id];

        const result = await query<Pick<Notification, 'id' | 'project_id' | 'feedback_id' | 'type' | 'title' | 'message' | 'read' | 'created_at'>>(sql, params);

        const unreadCount = result.rows.filter((r) => !r.read).length;

        res.json({ success: true, data: result.rows, unread_count: unreadCount });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    }
});

// Mark a single notification as read (only if it belongs to the caller)
router.patch('/:id/read', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const result = await query<Pick<Notification, 'id'>>(
            'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, user.user_id]
        );
        if (result.rows.length === 0) {
            // Either the row doesn't exist or it belongs to another user —
            // collapse both to 404 so we don't leak existence.
            res.status(404).json({ success: false, error: 'Notification not found' });
            return;
        }
        res.json({ success: true });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Mark all notifications as read for the authenticated user.
// - With `project_id`: only that project's unread.
// - Without: every unread the user owns (admin bell "mark all").
router.post('/mark-all-read', requireAuth, async (req, res) => {
    try {
        const { project_id } = MarkAllReadSchema.parse(req.body);
        const user = (req as any).user as JwtPayload;

        const sql = project_id
            ? 'UPDATE notifications SET read = TRUE WHERE user_id = $1 AND project_id = $2 AND read = FALSE'
            : 'UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE';
        const params = project_id ? [user.user_id, project_id] : [user.user_id];

        await query(sql, params);
        res.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    }
});

// ── Project subscriptions ────────────────────────────────────────────────────
// A subscription records that a user wants to receive notifications for a
// project regardless of whether they are a formal project member.

// GET /api/notifications/subscriptions — list all subscribed project IDs
router.get('/subscriptions', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const result = await query<{ project_id: string }>(
            'SELECT project_id FROM project_subscriptions WHERE user_id = $1 ORDER BY project_id',
            [user.user_id],
        );
        res.json({ success: true, data: result.rows.map((r) => r.project_id) });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// POST /api/notifications/subscriptions/:projectId — subscribe
router.post('/subscriptions/:projectId', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const { projectId } = req.params;
        await query(
            `INSERT INTO project_subscriptions (user_id, project_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [user.user_id, projectId],
        );
        res.json({ success: true });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// DELETE /api/notifications/subscriptions/:projectId — unsubscribe
router.delete('/subscriptions/:projectId', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user as JwtPayload;
        const { projectId } = req.params;
        await query(
            'DELETE FROM project_subscriptions WHERE user_id = $1 AND project_id = $2',
            [user.user_id, projectId],
        );
        res.json({ success: true });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

export default router;
