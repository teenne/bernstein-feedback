import http from 'node:http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectWithRetry } from './db';
import { startEmailWorker } from './workers/emailWorker';
import { startClusterWorker } from './workers/clusterWorker';
import { startPgListener } from './lib/pgListener';
import { attachNotificationWs } from './lib/notificationsWs';

// Route modules
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import feedbackRoutes from './routes/feedback';
import notificationRoutes from './routes/notifications';
import planRoutes from './routes/plans';
import healthRoutes from './routes/health';
import agentRoutes from './routes/agent';
import integrationsRoutes from './routes/integrations';

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

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/plans', planRoutes);
app.use('/api', planRoutes);          // mounts /api/projects/:id/plan-status & /api/projects/:id/usage
app.use('/health', healthRoutes);
// Tier 2: AI agent API — project-API-key auth, deliberately outside
// /api/auth so CI/agent runners can call it without user JWTs.
app.use('/api/v1/agent', agentRoutes);
// Tier 2: inbound webhooks (PostHog error → ticket, etc). X-API-Key auth.
app.use('/api/v1/integrations', integrationsRoutes);

// Wrap the Express app in a plain http.Server so we can attach the
// WebSocket upgrade handler on the same port. REST still works
// identically; WebSockets piggy-back on the same HTTP listener via
// the `Upgrade: websocket` handshake.
const server = http.createServer(app);

// Start server
const startServer = async () => {
    await connectWithRetry();

    // Kick off the email worker. It polls email_queue every ~30s and
    // sends any pending rows via SMTP. No-op (with a log line) when
    // SMTP_USER / SMTP_PASS aren't configured.
    startEmailWorker();

    // Tier 2: kick off the cluster worker. It polls feedback rows that
    // don't have a cluster yet, embeds them via OpenAI, and assigns
    // them to an existing cluster or starts a new one. No-op (with a
    // log line) when OPENAI_API_KEY isn't set.
    startClusterWorker();

    // Attach WebSocket endpoint at /api/notifications/ws.
    // Admin apps pointed at this Node server use it instead of polling
    // for instant bell updates. Apps pointed at Supabase continue to
    // use Supabase Realtime exactly as before — this channel is purely
    // additive.
    attachNotificationWs(server);

    // Start LISTENing on the `new_notification` Postgres channel so
    // every INSERT into notifications gets pushed to any connected
    // WebSocket clients subscribed to the matching (project, user).
    startPgListener();

    server.listen(PORT as number, HOST, () => {
        console.log(`Server is running on http://${HOST}:${PORT}`);
        console.log(`WebSocket endpoint: ws://${HOST}:${PORT}/api/notifications/ws`);
    });
};

startServer();
