import { useState, useEffect, useCallback, useRef } from 'react';
import type { Notification, FeedbackConfig } from '../schemas';

interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  isLoading: boolean;
}

/**
 * Polls for notifications from the Bernstein server.
 * Returns unread notifications for the current user + project.
 * Pauses when document is hidden. Fail-safe: never throws.
 */
export function useNotifications(config: FeedbackConfig): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const enabled = config.enableNotifications !== false && !!config.userId && !!config.projectId;
  const pollInterval = config.notificationPollInterval ?? 30000;

  // Derive the notifications API base URL
  const getBaseUrl = useCallback((): string | null => {
    if (config.notificationsEndpoint) return config.notificationsEndpoint;

    const adapterAny = config.adapter as any;

    // Try adapter.baseUrl (autoAdapter exposes this)
    if (adapterAny?.baseUrl) {
      return `${adapterAny.baseUrl}/api/notifications`;
    }

    // Try to derive from planCheckEndpoint
    if (config.planCheckEndpoint) {
      return config.planCheckEndpoint.replace(/\/api\/projects\/.*$/, '/api/notifications');
    }

    // Try to derive from adapter endpoint (httpAdapter)
    if (adapterAny?.endpoint) {
      return adapterAny.endpoint.replace(/\/api\/feedback\/?$/, '/api/notifications');
    }

    return null;
  }, [config.notificationsEndpoint, config.planCheckEndpoint, config.adapter]);

  const fetchNotifications = useCallback(async () => {
    if (!enabled) return;

    try {
      setIsLoading(true);
      const adapterAny = config.adapter as any;

      // Path 1 (preferred): adapter direct — used by Supabase / realtime adapters.
      // We check this BEFORE the HTTP path because autoAdapter always exposes a
      // baseUrl (the local-server fallback), even in Supabase mode. Without this
      // ordering we'd hit the local Express server while talking to Supabase.
      if (typeof adapterAny?.getNotifications === 'function') {
        const result = await adapterAny.getNotifications(config.projectId, config.userId);
        if (result?.data) {
          setNotifications(result.data);
        }
        return;
      }

      // Path 2: HTTP endpoint (local-server / custom REST adapters)
      const baseUrl = getBaseUrl();
      if (baseUrl) {
        try {
          const url = `${baseUrl}?project_id=${encodeURIComponent(config.projectId)}&user_id=${encodeURIComponent(config.userId!)}`;
          const response = await fetch(url);
          if (response.ok) {
            const json = await response.json();
            if (json.success && json.data) {
              setNotifications(json.data);
            }
          }
        } catch {
          // HTTP failed, nothing else to try
        }
      }
    } catch {
      // Fail-safe: never break the host app
    } finally {
      setIsLoading(false);
    }
  }, [enabled, getBaseUrl, config.projectId, config.userId, config.adapter]);

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));

    try {
      const adapterAny = config.adapter as any;

      // Prefer adapter direct (Supabase) over HTTP — autoAdapter exposes baseUrl
      // even in Supabase mode, so the order matters.
      if (typeof adapterAny?.markNotificationRead === 'function') {
        await adapterAny.markNotificationRead(id);
        return;
      }

      const baseUrl = getBaseUrl();
      if (baseUrl) {
        const url = baseUrl.replace(/\/notifications.*$/, `/notifications/${id}/read`);
        await fetch(url, { method: 'PATCH' });
      }
    } catch {
      fetchNotifications();
    }
  }, [getBaseUrl, config.adapter, fetchNotifications]);

  const markAllRead = useCallback(async () => {
    if (!config.userId) return;

    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));

    try {
      const adapterAny = config.adapter as any;

      // Prefer adapter direct (Supabase) over HTTP — see markAsRead for rationale.
      if (typeof adapterAny?.markAllNotificationsRead === 'function') {
        await adapterAny.markAllNotificationsRead(config.projectId, config.userId);
        return;
      }

      const baseUrl = getBaseUrl();
      if (baseUrl) {
        const url = baseUrl.replace(/\/notifications.*$/, '/notifications/mark-all-read');
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: config.projectId, user_id: config.userId }),
        });
      }
    } catch {
      fetchNotifications();
    }
  }, [getBaseUrl, config.adapter, config.projectId, config.userId, fetchNotifications]);

  // Realtime (Supabase) — when the adapter exposes subscribeToNotifications,
  // skip interval polling and refetch on every push from Postgres.
  useEffect(() => {
    if (!enabled) return;

    const adapterAny = config.adapter as any;
    const subscribe = adapterAny?.subscribeToNotifications;
    if (typeof subscribe !== 'function') return;

    // Initial load, then live updates.
    console.log('[useNotifications] Initializing Realtime socket');
    fetchNotifications();

    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = subscribe(config.projectId, config.userId, () => {
        console.log('[useNotifications] Socket onChange triggered -> fetching');
        fetchNotifications();
      });
    } catch (e) {
      console.warn('[useNotifications] Realtime setup failed:', e);
      // Fail-safe: realtime setup failed, the polling effect below will take over.
    }

    return () => {
      if (unsubscribe) {
        try { unsubscribe(); } catch { /* ignore */ }
      }
    };
  }, [enabled, config.adapter, config.projectId, config.userId, fetchNotifications]);

  // Polling fallback — only runs when the adapter has no realtime subscription.
  useEffect(() => {
    if (!enabled) return;

    const adapterAny = config.adapter as any;
    if (typeof adapterAny?.subscribeToNotifications === 'function') {
      console.log('[useNotifications] Polling aborted, realtime function is available.');
      return;
    }

    console.log('[useNotifications] Initiating fallback polling every', pollInterval, 'ms');
    fetchNotifications();

    intervalRef.current = setInterval(() => {
      // Pause when tab is hidden
      if (document.hidden) return;
      fetchNotifications();
    }, pollInterval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, pollInterval, fetchNotifications, config.adapter]);

  // Pause/resume on visibility change.
  // Only registered for polling adapters — when the adapter exposes
  // subscribeToNotifications (Supabase realtime), the websocket is the
  // source of truth and we skip the focus refetch entirely. Polling
  // adapters still need it to catch up on intervals missed while hidden.
  // The host can also explicitly opt out via `disableVisibilityRefetch`.
  useEffect(() => {
    if (!enabled) return;
    if ((config as any).disableVisibilityRefetch) return;

    const adapterAny = config.adapter as any;
    if (typeof adapterAny?.subscribeToNotifications === 'function') return;

    const handleVisibility = () => {
      if (!document.hidden) {
        console.log('[useNotifications] Visibility changed to visible -> fetching');
        fetchNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [enabled, fetchNotifications, config]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, unreadCount, markAsRead, markAllRead, isLoading };
}
