import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { z } from 'zod';
import { connectWithRetry, query } from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security: Bind strictly to localhost for development
const HOST = '127.0.0.1';

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allow large payloads for screenshots

// Validation Schema (matching the frontend schema significantly)
const FeedbackSchema = z.object({
    project_id: z.string(),
    type: z.enum(['feedback', 'bug_report', 'feature_request']),
    timestamp: z.string().datetime().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    severity: z.string().optional(),
    impact: z.enum(['blocks_me', 'annoying', 'minor']).optional(),
    email: z.string().email().optional(),
    context: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(), // Custom metadata
    screenshot: z.string().optional(),
    highlighted_element: z.record(z.unknown()).optional(),

    // Identity
    user_id: z.string().optional(),
    tenant_id: z.string().optional(),
    role: z.string().optional(),
    screen_id: z.string().optional(),
    page_name: z.string().optional(),

    bernstein_run_id: z.string().optional().or(z.literal(null))
});

app.post('/api/feedback', async (req, res) => {
    try {
        const event = FeedbackSchema.parse(req.body);

        // Convert to proper types for SQL where necessary (e.g. JSON stringification is handled by pg for objects, but we're transparent here)
        const text = `
      INSERT INTO feedback (
        project_id, type, timestamp, title, description, category, severity, impact, email,
        context, metadata, screenshot, highlighted_element,
        user_id, tenant_id, role, screen_id, page_name, bernstein_run_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      ) RETURNING id
    `;

        const values = [
            event.project_id,
            event.type,
            event.timestamp || new Date().toISOString(),
            event.title,
            event.description || null,
            event.category || null,
            event.severity || null,
            event.impact || null,
            event.email || null,
            event.context || null,
            event.metadata || null,
            event.screenshot || null,
            event.highlighted_element || null,
            event.user_id || null,
            event.tenant_id || null,
            event.role || null,
            event.screen_id || null,
            event.page_name || null,
            event.bernstein_run_id || null
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
            console.error('Database Error:', error);
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
});

// Health Check Endpoint
app.get('/health', async (req, res) => {
    try {
        await query('SELECT 1');
        res.json({ status: 'ok', db: 'connected' });
    } catch (error) {
        res.status(503).json({ status: 'error', db: 'disconnected' });
    }
});

// Only start the server after a successful DB connection
const startServer = async () => {
    await connectWithRetry();

    app.listen(PORT as number, HOST, () => {
        console.log(`Server is running on http://${HOST}:${PORT}`);
    });
};

startServer();
