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

app.post('/api/feedback', async (req, res) => {
    try {
        const event = FeedbackSchema.parse(req.body);

        const text = `
      INSERT INTO feedback (
        project_id, type, timestamp, event_id, title, description, category, severity, impact, email,
        context, metadata, screenshots, highlighted_element,
        user_id, tenant_id, role, screen_id, page_name, bernstein_run_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      ) RETURNING id
    `;

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
            event.context ? JSON.stringify(event.context) : null,
            event.metadata ? JSON.stringify(event.metadata) : null,
            JSON.stringify(event.screenshots || []),
            event.highlighted_element ? JSON.stringify(event.highlighted_element) : null,
            event.user_id ?? null,
            event.tenant_id ?? null,
            event.role ?? null,
            (event.context as any)?.screenId ?? null,
            (event.context as any)?.pageName ?? null,
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
