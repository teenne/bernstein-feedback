import { Client } from 'pg';
import { publish, type NotificationPayload } from './notificationBus';

// Dedicated pg Client (NOT from the shared pool) because LISTEN requires
// a long-lived connection that is never returned to the pool.
//
// If the connection drops (network blip, Supabase pooler recycling, etc.)
// we reconnect with exponential backoff so the server keeps working.

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

let listenClient: Client | null = null;
let shuttingDown = false;
let reconnectMs = RECONNECT_MIN_MS;

function resolveConnection(): string | undefined {
    // Mirror db.ts logic
    const DB_MODE = process.env.DB_MODE?.toLowerCase() || 
        (process.env.DATABASE_URL || process.env.DATABASE_SUP_URL ? "cloud" : "local");
    
    if (DB_MODE === "memory") return undefined;

    const url = process.env.DATABASE_URL || process.env.DATABASE_SUP_URL;
    const isPlaceholder = (s: string) => /<[^>]*>/.test(s);

    if (DB_MODE === "cloud" && url && url.trim() && !isPlaceholder(url)) {
        return url;
    }

    if (DB_MODE === "local") {
        const host = process.env.DB_HOST;
        const user = process.env.DB_USER;
        if (!host || !user) return undefined;
        const port = process.env.DB_PORT || '5432';
        const pass = process.env.DB_PASSWORD || '';
        const db = process.env.DB_NAME || 'postgres';
        return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
    }

    return undefined;
}

async function connect(): Promise<void> {
    if (shuttingDown) return;

    const connectionString = resolveConnection();
    if (!connectionString) {
        console.warn('[pg-listener] no database configured — WebSocket notifications will be quiet');
        return;
    }

    const client = new Client({
        connectionString,
        ssl:
            connectionString.includes('supabase.co') || process.env.DB_SSL === 'true'
                ? { rejectUnauthorized: false }
                : false,
    });

    client.on('error', (err) => {
        console.warn('[pg-listener] connection error:', err.message);
        scheduleReconnect();
    });

    client.on('notification', (msg) => {
        if (msg.channel !== 'new_notification' || !msg.payload) return;
        try {
            const payload = JSON.parse(msg.payload) as NotificationPayload;
            const delivered = publish(payload);
            if (delivered > 0) {
                console.log(
                    `[pg-listener] forwarded notification id=${payload.id} to ${delivered} subscriber(s)`,
                );
            }
        } catch (err) {
            console.warn('[pg-listener] malformed payload:', err);
        }
    });

    try {
        await client.connect();
        await client.query('LISTEN new_notification');
        listenClient = client;
        reconnectMs = RECONNECT_MIN_MS;
        console.log('[pg-listener] LISTENing on channel new_notification');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[pg-listener] failed to LISTEN:', msg);
        scheduleReconnect();
    }
}

function scheduleReconnect(): void {
    if (shuttingDown) return;
    if (listenClient) {
        try { listenClient.end().catch(() => {}); } catch { /* ignore */ }
        listenClient = null;
    }
    const delay = reconnectMs;
    reconnectMs = Math.min(reconnectMs * 2, RECONNECT_MAX_MS);
    console.log(`[pg-listener] reconnecting in ${delay}ms`);
    setTimeout(() => {
        connect().catch(() => scheduleReconnect());
    }, delay);
}

export function startPgListener(): void {
    connect().catch(() => scheduleReconnect());
}

export async function stopPgListener(): Promise<void> {
    shuttingDown = true;
    if (listenClient) {
        try { await listenClient.end(); } catch { /* ignore */ }
        listenClient = null;
    }
}
