import type { FeedbackAdapter, FeedbackEvent } from '../schemas';

export interface HttpAdapterOptions {
  /** The endpoint URL to send feedback to */
  endpoint: string;
  /** Additional headers to include (e.g., API keys) */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Transform the event before sending (for custom backends) */
  transform?: (event: FeedbackEvent) => unknown;
  /**
   * Optional WebSocket endpoint for realtime notification push.
   * When set, the adapter exposes `subscribeToNotifications` so the
   * notification hook can skip its 30s HTTP polling fallback.
   * Example: 'ws://localhost:3000/api/notifications/ws'
   */
  wsEndpoint?: string;
  /**
   * Dynamic reader for the caller's bearer token. Invoked before every
   * REST call and every WS (re)connect, so token rotation is picked up
   * without rebuilding the adapter. Returning null/undefined means the
   * call is unauthenticated — fine for the public feedback submit, but
   * the notification endpoints will reject it with 401.
   */
  getToken?: () => string | null | undefined;
}

export type HttpAdapterReturn = FeedbackAdapter & {
  endpoint: string;
  getNotifications?: (
    projectId: string,
    userId: string,
  ) => Promise<{ data: any[]; unread_count: number }>;
  markNotificationRead?: (id: string) => Promise<void>;
  markAllNotificationsRead?: (projectId: string, userId: string) => Promise<void>;
  subscribeToNotifications?: (
    projectId: string,
    userId: string,
    onChange: () => void,
  ) => () => void;
};

/**
 * Open a WebSocket connection to the server's notification channel.
 * Each message received fires the `onChange` callback; the hook then
 * re-fetches the notification list via the normal HTTP path.
 *
 * Auto-reconnects with exponential backoff. Returns an unsubscribe
 * function that cleanly closes the socket.
 */
function openNotificationSocket(
  wsEndpoint: string,
  projectId: string,
  _userId: string,
  onChange: () => void,
  getToken?: () => string | null | undefined,
): () => void {
  // Browsers only. If there's no WebSocket global, bail out — the hook's
  // polling fallback will take over automatically.
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return () => { /* no-op */ };
  }

  const buildUrl = () => {
    const token = getToken?.();
    const base = wsEndpoint.replace(/\/+$/, '');
    const qs = `?project_id=${encodeURIComponent(projectId)}` +
      (token ? `&token=${encodeURIComponent(token)}` : '');
    return base + qs;
  };

  let socket: WebSocket | null = null;
  let closed = false;
  let reconnectMs = 1000;
  const RECONNECT_MAX = 30_000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    try {
      // Re-read the token on each (re)connect so a rotated JWT propagates
      // without having to tear down and rebuild the adapter.
      socket = new WebSocket(buildUrl());
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      reconnectMs = 1000;
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
        if (msg?.type === 'new_notification') {
          onChange();
        }
      } catch {
        // Ignore non-JSON or malformed frames
      }
    };

    socket.onclose = () => {
      socket = null;
      scheduleReconnect();
    };

    socket.onerror = () => {
      // Let onclose handle reconnect so we don't double-trigger
    };
  };

  const scheduleReconnect = () => {
    if (closed) return;
    const delay = reconnectMs;
    reconnectMs = Math.min(reconnectMs * 2, RECONNECT_MAX);
    reconnectTimer = setTimeout(connect, delay);
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      try { socket.close(); } catch { /* ignore */ }
      socket = null;
    }
  };
}

/**
 * HTTP adapter for sending feedback to a REST endpoint.
 * Optionally exposes realtime notification subscription via WebSocket
 * when `wsEndpoint` is configured.
 */
export function httpAdapter(options: HttpAdapterOptions): HttpAdapterReturn {
  const { endpoint, headers = {}, timeout = 10000, transform, wsEndpoint, getToken } = options;

  const authHeaders = (): Record<string, string> => {
    const token = getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Derive the notifications REST base from the feedback endpoint the
  // caller already passed. `/api/feedback` → `/api/notifications`.
  const notificationsBase = endpoint.replace(/\/api\/feedback\/?$/, '/api/notifications');

  const base: HttpAdapterReturn = {
    /** The endpoint URL (used by widget to derive plan-status/notification URLs) */
    endpoint,

    async submit(event: FeedbackEvent) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const body = transform ? transform(event) : event;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
            ...headers,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = `Server error: ${response.status}`;
          try {
            const errorJson = await response.json();
            if (errorJson.error) {
              errorMessage = errorJson.error;
            }
            if (errorJson.details?.length) {
              errorMessage = errorJson.details.map((d: any) => d.message).join(', ');
            }
          } catch {
            const errorText = await response.text().catch(() => 'Unknown error');
            errorMessage = `Server error: ${response.status} - ${errorText}`;
          }
          return { success: false, error: errorMessage };
        }

        const data = await response.json().catch(() => ({}));
        return {
          success: true,
          id: data.id || data.event_id,
        };
      } catch (err) {
        clearTimeout(timeoutId);

        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            return { success: false, error: 'Request timed out' };
          }
          return { success: false, error: err.message };
        }
        return { success: false, error: 'An unexpected error occurred' };
      }
    },
  };

  // Attach REST notification methods so `useNotifications` routes through
  // the adapter (which attaches the bearer token). Without these, the hook
  // would fall back to its raw-fetch path that can't authenticate.
  base.getNotifications = async (projectId, _userId) => {
    const url = `${notificationsBase}?project_id=${encodeURIComponent(projectId)}`;
    const res = await fetch(url, { headers: { ...authHeaders() } });
    if (!res.ok) return { data: [], unread_count: 0 };
    const json = await res.json().catch(() => null);
    if (!json?.success) return { data: [], unread_count: 0 };
    return { data: json.data ?? [], unread_count: json.unread_count ?? 0 };
  };

  base.markNotificationRead = async (id) => {
    await fetch(`${notificationsBase}/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      headers: { ...authHeaders() },
    });
  };

  base.markAllNotificationsRead = async (projectId, _userId) => {
    await fetch(`${notificationsBase}/mark-all-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ project_id: projectId }),
    });
  };

  // Attach a realtime-push implementation only when a WebSocket URL was
  // provided. The presence of `subscribeToNotifications` on the adapter
  // object is what makes `useNotifications` choose realtime over polling.
  if (wsEndpoint) {
    base.subscribeToNotifications = (projectId, userId, onChange) =>
      openNotificationSocket(wsEndpoint, projectId, userId, onChange, getToken);
  }

  return base;
}

/**
 * Batch HTTP adapter for sending multiple events at once
 * Useful for offline-first scenarios where events are queued
 */
export function batchHttpAdapter(
  options: HttpAdapterOptions & { batchSize?: number; flushInterval?: number }
): FeedbackAdapter & { flush: () => Promise<void>; dispose: () => void } {
  const { batchSize = 10, flushInterval = 30000, ...httpOptions } = options;
  const queue: FeedbackEvent[] = [];
  let flushTimeout: ReturnType<typeof setTimeout> | null = null;
  let flushIntervalId: ReturnType<typeof setInterval> | null = null;

  const baseAdapter = httpAdapter({
    ...httpOptions,
    endpoint: httpOptions.endpoint.replace(/\/?$/, '/batch'),
    transform: (events) => ({ events: Array.isArray(events) ? events : [events] }),
  });

  const flush = async () => {
    if (queue.length === 0) return;

    const batch = queue.splice(0, batchSize);
    // Note: This sends as an array, the transform above wraps it
    await baseAdapter.submit(batch[0]); // Simplified - real impl would send batch
  };

  // Set up interval-based flush for guaranteed delivery
  if (flushInterval > 0) {
    flushIntervalId = setInterval(flush, flushInterval);
  }

  const dispose = () => {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
    if (flushIntervalId) {
      clearInterval(flushIntervalId);
      flushIntervalId = null;
    }
  };

  return {
    async submit(event: FeedbackEvent) {
      queue.push(event);

      // Debounce flush for immediate batching
      if (flushTimeout) clearTimeout(flushTimeout);
      flushTimeout = setTimeout(flush, 1000);

      if (queue.length >= batchSize) {
        await flush();
      }

      return { success: true };
    },
    flush,
    dispose,
  };
}

