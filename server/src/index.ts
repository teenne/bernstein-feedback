import http from 'node:http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectWithRetry } from './db';
import { startEmailWorker } from './workers/emailWorker';
import { startClusterWorker } from './workers/clusterWorker';
import { startAgentWorker } from './workers/agentWorker';
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

// Debug: print which auth paths are enabled at boot. Helps diagnose
// the "Invalid or expired token" 401 when Supabase-logged-in admins
// can't reach protected routes.
console.log(
    '[auth] local JWT:', process.env.JWT_SECRET ? 'set' : 'default (dev)',
    '| Supabase JWT fallback:', process.env.SUPABASE_JWT_SECRET ? 'enabled' : 'DISABLED',
);

// ─── Production safety boot guards ────────────────────────────────
// Fail-fast on missing critical env in production. These are silent
// foot-guns in development (sensible defaults), but in production they
// either grant world access or use a hardcoded secret — both unsafe.
if (process.env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!process.env.JWT_SECRET) missing.push('JWT_SECRET (auth tokens use a hardcoded fallback otherwise)');
    if (!process.env.ALLOWED_ORIGINS) missing.push('ALLOWED_ORIGINS (CORS would default to *)');
    if (missing.length > 0) {
        console.error('Refusing to boot in production with insecure defaults. Missing:');
        missing.forEach(m => console.error(`  • ${m}`));
        process.exit(1);
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Bind to 0.0.0.0 in production (Render), 127.0.0.1 in development
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : '*',
}));

// Security headers — applied to every response
app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0'); // tells modern browsers to rely on CSP, not the broken legacy filter
    next();
});

// Capture the raw body alongside the parsed JSON so HMAC signature
// checks (e.g. PostHog webhook) can run against the exact bytes the
// sender signed. Adds < 1ms overhead on a normal request.
app.use(express.json({
    limit: '10mb', // Allow large payloads for screenshots
    verify: (req: any, _res, buf: Buffer) => { req.rawBody = buf; },
}));

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

    // Tier 2: AI workers — disabled when SELF_HOSTED=true (raw API mode per
    // the product spec: self-hosted deployments exchange AI features for full
    // data residency control). Both workers are also individually no-ops when
    // their required keys / env flags are absent.
    const selfHosted = process.env.SELF_HOSTED === 'true';
    if (selfHosted) {
        console.info('[server] SELF_HOSTED=true — AI clustering and agent worker disabled.');
    } else {
        // Cluster worker: polls feedback rows that don't have a cluster yet,
        // embeds them via OpenAI or Cohere, and assigns them to an existing
        // cluster or starts a new one.
        startClusterWorker();

        // Agent worker: polls auto-resolvable clusters, clones their project's
        // repo, calls GPT-4o to generate a fix diff, writes proposed_fix to
        // the clusters table. Only active when AGENT_WORKER_ENABLED=true.
        startAgentWorker();
    }

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
