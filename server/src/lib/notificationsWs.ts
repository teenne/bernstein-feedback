import type { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { subscribe, subscriberCount } from './notificationBus';
import { verifyToken } from '../middleware/auth';

// WebSocket server attached to the existing Express HTTP server.
//
// Endpoint: ws://<host>/api/notifications/ws?project_id=X&token=<jwt>
//
// The caller must pass a valid JWT in the `token` query param; the user
// identity comes from the token (never from client input) so one user
// can't subscribe to another's stream.
//
// Client-facing message shape:
//   {"type":"new_notification","data":{...}}   — a row was inserted
//   {"type":"pong"}                            — keepalive response
//
// Client-sent messages are ignored by the server except `{"type":"ping"}`.
//
// The library's httpAdapter uses the native browser WebSocket to open
// this connection when `wsEndpoint` is configured.

const PING_INTERVAL_MS = 25_000; // keep proxies / mobile sleep from killing the socket

export function attachNotificationWs(server: HttpServer): WebSocketServer {
    // `noServer: true` lets us route the upgrade manually so we don't
    // accept every `Upgrade: websocket` request.
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
        if (!req.url) {
            socket.destroy();
            return;
        }
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/api/notifications/ws') {
            // Not our route — let any other upgrade handler (or default
            // rejection) deal with it.
            return;
        }

        const projectId = url.searchParams.get('project_id') || '';
        if (!projectId) {
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
            socket.destroy();
            return;
        }

        // Browsers can't set headers on `new WebSocket()`, so the token
        // travels in a query param. Validate it before accepting the
        // upgrade — anything else would let anyone subscribe to any
        // user's stream by guessing their UUID.
        const token = url.searchParams.get('token') || '';
        const payload = verifyToken(token);
        if (!payload) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        const userId = payload.user_id;

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req, { projectId, userId });
        });
    });

    wss.on('connection', (ws: WebSocket, _req: IncomingMessage, ctx: { projectId: string; userId: string }) => {
        const unsubscribe = subscribe(ctx.projectId, ctx.userId, ws);

        // Send an immediate hello so the client knows the subscription took.
        try {
            ws.send(JSON.stringify({ type: 'hello', project_id: ctx.projectId, user_id: ctx.userId }));
        } catch { /* ignore */ }

        // Keepalive — browsers + Gmail-style proxies kill idle sockets.
        const pingTimer = setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) return;
            try { ws.ping(); } catch { /* ignore */ }
        }, PING_INTERVAL_MS);

        ws.on('message', (raw) => {
            // Only accept a tiny client-initiated heartbeat; ignore everything else.
            try {
                const msg = JSON.parse(raw.toString());
                if (msg?.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong' }));
                }
            } catch { /* ignore malformed frames */ }
        });

        ws.on('close', () => {
            clearInterval(pingTimer);
            unsubscribe();
        });

        ws.on('error', () => {
            // Never throw from here — let the close handler clean up.
        });

        console.log(
            `[ws] client connected project=${ctx.projectId} user=${ctx.userId} (total=${subscriberCount()})`,
        );
    });

    return wss;
}
