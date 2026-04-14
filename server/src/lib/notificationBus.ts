// Tiny in-process pub/sub for notification pushes.
//
// The WebSocket handler adds a subscriber per connected client, keyed
// by `${project_id}:${user_id}`. When Postgres fires a NOTIFY event,
// the pg listener calls publish() with the payload; the bus looks up
// all matching sockets and writes the message to each.
//
// In-process only — if you ever run multiple Node server instances
// behind a load balancer, swap this for Redis pub/sub or the like.
// For a single-process server (which is the default deployment) this
// is the cleanest design.

import type { WebSocket } from 'ws';

export interface NotificationPayload {
    id: string;
    project_id: string;
    user_id: string | null;
    type: string;
    created_at: string;
}

type SubscriberKey = string;           // `${projectId}:${userId}`
const subscribers = new Map<SubscriberKey, Set<WebSocket>>();

function keyOf(projectId: string, userId: string): SubscriberKey {
    return `${projectId}:${userId}`;
}

export function subscribe(projectId: string, userId: string, ws: WebSocket): () => void {
    const key = keyOf(projectId, userId);
    let set = subscribers.get(key);
    if (!set) {
        set = new Set();
        subscribers.set(key, set);
    }
    set.add(ws);

    return () => {
        const s = subscribers.get(key);
        if (!s) return;
        s.delete(ws);
        if (s.size === 0) subscribers.delete(key);
    };
}

export function publish(payload: NotificationPayload): number {
    // Skip broadcasts for rows with no user_id — no one to target.
    if (!payload.user_id) return 0;

    const key = keyOf(payload.project_id, payload.user_id);
    const set = subscribers.get(key);
    if (!set || set.size === 0) return 0;

    const frame = JSON.stringify({ type: 'new_notification', data: payload });
    let delivered = 0;
    for (const ws of set) {
        try {
            // readyState 1 = OPEN in the ws library
            if (ws.readyState === 1) {
                ws.send(frame);
                delivered++;
            }
        } catch {
            // Dead socket — remove from the set so we don't keep trying
            set.delete(ws);
        }
    }
    return delivered;
}

export function subscriberCount(): number {
    let n = 0;
    for (const set of subscribers.values()) n += set.size;
    return n;
}
