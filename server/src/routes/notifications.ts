import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { GetNotificationsSchema, MarkAllReadSchema } from '../schemas/notification';
import { Notification } from '../schemas/tables';

const router = Router();

// Get notifications for a user in a project
router.get('/', async (req, res) => {
    try {
        const { project_id, user_id } = GetNotificationsSchema.parse(req.query);

        const result = await query<Pick<Notification, 'id' | 'project_id' | 'feedback_id' | 'type' | 'title' | 'message' | 'read' | 'created_at'>>(
            `SELECT id, project_id, feedback_id, type, title, message, read, created_at
             FROM notifications
             WHERE project_id = $1 AND user_id = $2 AND created_at > NOW() - INTERVAL '30 days'
             ORDER BY created_at DESC
             LIMIT 20`,
            [project_id, user_id]
        );

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

// Mark a single notification as read
router.patch('/:id/read', async (req, res) => {
    try {
        const result = await query<Pick<Notification, 'id'>>(
            'UPDATE notifications SET read = TRUE WHERE id = $1 RETURNING id',
            [req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Notification not found' });
            return;
        }
        res.json({ success: true });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Mark all notifications as read for a user+project
router.post('/mark-all-read', async (req, res) => {
    try {
        const { project_id, user_id } = MarkAllReadSchema.parse(req.body);

        await query(
            'UPDATE notifications SET read = TRUE WHERE project_id = $1 AND user_id = $2 AND read = FALSE',
            [project_id, user_id]
        );
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

export default router;
