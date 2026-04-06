import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { z } from 'zod';
import { connectWithRetry, query } from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Bind to 0.0.0.0 in production (Render), 127.0.0.1 in development
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : '*',
}));
app.use(express.json({ limit: '10mb' })); // Allow large payloads for screenshots

// Validation Schema — matches frontend FeedbackEvent
const FeedbackSchema = z.object({
    project_id: z.string(),
    type: z.enum(['feedback', 'bug_report', 'feature_request']),
    timestamp: z.string().datetime().optional(),
    event_id: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    severity: z.string().optional(),
    impact: z.string().optional(),
    email: z.string().optional(),
    context: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
    screenshots: z.array(z.string()).default([]),
    highlighted_element: z.record(z.unknown()).optional(),
    user_id: z.string().optional(),
    tenant_id: z.string().optional(),
    role: z.string().optional(),
    screen_id: z.string().optional(),
    page_name: z.string().optional(),
    bernstein_run_id: z.string().optional().or(z.literal(null)),
}).passthrough();

// ──────────────────────────────
// User Roles
// ──────────────────────────────

// Register / login user — auto-assigns role (first user = admin)
app.post('/api/auth/role', async (req, res) => {
    try {
        const { user_id, email } = req.body;
        if (!user_id || !email) {
            res.status(400).json({ success: false, error: 'user_id and email are required' });
            return;
        }

        // Check if user already has a role
        const existing = await query('SELECT role FROM user_roles WHERE user_id = $1', [user_id]);
        if (existing.rows.length > 0) {
            res.json({ success: true, data: { role: existing.rows[0].role } });
            return;
        }

        // First user becomes admin, everyone else gets 'user'
        const countResult = await query('SELECT COUNT(*) as count FROM user_roles');
        const assignedRole = parseInt(countResult.rows[0].count) === 0 ? 'admin' : 'user';

        const result = await query(
            `INSERT INTO user_roles (user_id, email, role) VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO NOTHING RETURNING *`,
            [user_id, email, assignedRole]
        );

        // If ON CONFLICT hit, fetch existing
        if (result.rows.length === 0) {
            const fallback = await query('SELECT role FROM user_roles WHERE user_id = $1', [user_id]);
            res.json({ success: true, data: { role: fallback.rows[0]?.role || 'user' } });
            return;
        }

        res.status(201).json({ success: true, data: { role: result.rows[0].role } });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// List all users with roles (admin only — caller should check role client-side)
app.get('/api/auth/users', async (_req, res) => {
    try {
        const result = await query('SELECT * FROM user_roles ORDER BY created_at ASC');
        res.json({ success: true, data: result.rows });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Update user role (promote/demote)
app.patch('/api/auth/users/:user_id', async (req, res) => {
    try {
        const { role } = req.body;
        if (!role || !['admin', 'user'].includes(role)) {
            res.status(400).json({ success: false, error: 'role must be "admin" or "user"' });
            return;
        }

        const result = await query(
            'UPDATE user_roles SET role = $1, updated_at = NOW() WHERE user_id = $2 RETURNING *',
            [role, req.params.user_id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// ──────────────────────────────
// Project Members
// ──────────────────────────────

// List members of a project
app.get('/api/projects/:id/members', async (req, res) => {
    try {
        const result = await query(
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
app.post('/api/projects/:id/members', async (req, res) => {
    try {
        const { user_id, email, role } = req.body;
        if (!email) {
            res.status(400).json({ success: false, error: 'email is required' });
            return;
        }

        // Look up user_id from user_roles if not provided
        let memberId = user_id;
        if (!memberId) {
            const userResult = await query('SELECT user_id FROM user_roles WHERE email = $1', [email]);
            if (userResult.rows.length === 0) {
                res.status(404).json({ success: false, error: `No user found with email: ${email}` });
                return;
            }
            memberId = userResult.rows[0].user_id;
        }

        const result = await query(
            `INSERT INTO project_members (project_id, user_id, email, role)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (project_id, user_id) DO UPDATE SET role = $4
             RETURNING *`,
            [req.params.id, memberId, email, role || 'member']
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Remove member from project
app.delete('/api/projects/:id/members/:user_id', async (req, res) => {
    try {
        const result = await query(
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

// Create project
app.post('/api/projects', async (req, res) => {
    try {
        const { id, name, owner_id, owner_email } = req.body;
        if (!id) {
            res.status(400).json({ success: false, error: 'Project ID is required' });
            return;
        }

        const result = await query(
            `INSERT INTO projects (id, name, owner_id, owner_email) VALUES ($1, $2, $3, $4) RETURNING *`,
            [id, name || id, owner_id || null, owner_email || null]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        if (error?.code === '23505') {
            res.status(409).json({ success: false, error: 'Project ID already exists' });
            return;
        }
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// List projects (supports owner_id, owner_email, or user_id for member access)
app.get('/api/projects', async (req, res) => {
    try {
        const { owner_email, owner_id, user_id } = req.query;
        let sql = 'SELECT id, name, owner_id, owner_email, plan, created_at FROM projects';
        const params: any[] = [];

        if (owner_id) {
            sql += ' WHERE owner_id = $1';
            params.push(owner_id);
        } else if (owner_email) {
            sql += ' WHERE owner_email = $1';
            params.push(owner_email);
        } else if (user_id) {
            // Return projects where user is owner OR member
            sql += ` WHERE owner_id = $1 OR id IN (SELECT project_id FROM project_members WHERE user_id = $1)`;
            params.push(user_id);
        }
        sql += ' ORDER BY created_at DESC';

        const result = await query(sql, params);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Get single project
app.get('/api/projects/:id', async (req, res) => {
    try {
        const result = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
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

// Update project
app.patch('/api/projects/:id', async (req, res) => {
    try {
        const { name, plan, config } = req.body;
        const sets: string[] = [];
        const values: any[] = [];
        let i = 1;

        if (name !== undefined) { sets.push(`name = $${i++}`); values.push(name); }
        if (plan !== undefined) { sets.push(`plan = $${i++}`); values.push(plan); }
        if (config !== undefined) { sets.push(`config = $${i++}`); values.push(JSON.stringify(config)); }

        if (sets.length === 0) {
            res.status(400).json({ success: false, error: 'No fields to update' });
            return;
        }

        values.push(req.params.id);
        const result = await query(
            `UPDATE projects SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
            values
        );

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

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
    try {
        const result = await query('DELETE FROM projects WHERE id = $1 RETURNING id', [req.params.id]);
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

// ──────────────────────────────
// Feedback
// ──────────────────────────────

app.post('/api/feedback', async (req, res) => {
    try {
        const event = FeedbackSchema.parse(req.body);

        // TODO: Re-enable project validation after testing
        // const projectCheck = await query('SELECT id FROM projects WHERE id = $1', [event.project_id]);
        // if (projectCheck.rows.length === 0) {
        //     res.status(403).json({ success: false, error: `Unknown project: "${event.project_id}". Register it in the admin portal first.` });
        //     return;
        // }

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

        const result = await query(text, values);

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

// List feedback (with filters)
app.get('/api/feedback', async (req, res) => {
    try {
        const { project_id, type, status, severity, limit = '50', offset = '0' } = req.query;

        let sql = 'SELECT id, project_id, type, title, description, category, severity, impact, email, screen_id, page_name, user_id, tenant_id, screenshots, created_at FROM feedback';
        const conditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

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

// Get stats/analytics (MUST be before :id route)
app.get('/api/feedback/stats/summary', async (req, res) => {
    try {
        const { project_id } = req.query;
        const where = project_id ? 'WHERE project_id = $1' : '';
        const params = project_id ? [project_id] : [];

        const total = await query(`SELECT COUNT(*) as count FROM feedback ${where}`, params);
        const byType = await query(`SELECT type, COUNT(*) as count FROM feedback ${where} GROUP BY type`, params);
        const bySeverity = await query(`SELECT severity, COUNT(*) as count FROM feedback ${where} WHERE severity IS NOT NULL GROUP BY severity`, project_id ? [project_id] : []);

        res.json({
            success: true,
            data: {
                total: parseInt(total.rows[0]?.count || '0'),
                by_type: Object.fromEntries(byType.rows.map((r: any) => [r.type, parseInt(r.count)])),
                by_severity: Object.fromEntries(bySeverity.rows.map((r: any) => [r.severity, parseInt(r.count)])),
            }
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Get single feedback with full context
app.get('/api/feedback/:id', async (req, res) => {
    try {
        const result = await query('SELECT * FROM feedback WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Health Check
app.get('/health', async (req, res) => {
    try {
        await query('SELECT 1');
        res.json({ status: 'ok', db: 'connected' });
    } catch (error) {
        res.status(503).json({ status: 'error', db: 'disconnected' });
    }
});

// Start server
const startServer = async () => {
    await connectWithRetry();
    app.listen(PORT as number, HOST, () => {
        console.log(`Server is running on http://${HOST}:${PORT}`);
    });
};

startServer();
