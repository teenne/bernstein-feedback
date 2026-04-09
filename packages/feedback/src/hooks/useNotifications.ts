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

      // Path 1: HTTP endpoint
      const baseUrl = getBaseUrl();
      if (baseUrl) {
        try {
          const url = `${baseUrl}?project_id=${encodeURIComponent(config.projectId)}&user_id=${encodeURIComponent(config.userId!)}`;
          const response = await fetch(url);
          if (response.ok) {
            const json = await response.json();
            if (json.success && json.data) {
              setNotifications(json.data);
              return;
            }
          }
        } catch {
          // HTTP failed, try adapter path
        }
      }

      // Path 2: Adapter direct (Supabase)
      if (typeof adapterAny?.getNotifications === 'function') {
        const result = await adapterAny.getNotifications(config.projectId, config.userId);
        if (result?.data) {
          setNotifications(result.data);
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
      const baseUrl = getBaseUrl();
      const adapterAny = config.adapter as any;

      if (baseUrl) {
        const url = baseUrl.replace(/\/notifications.*$/, `/notifications/${id}/read`);
        await fetch(url, { method: 'PATCH' });
      } else if (typeof adapterAny?.markNotificationRead === 'function') {
        await adapterAny.markNotificationRead(id);
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
      const baseUrl = getBaseUrl();
      const adapterAny = config.adapter as any;

      if (baseUrl) {
        const url = baseUrl.replace(/\/notifications.*$/, '/notifications/mark-all-read');
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: config.projectId, user_id: config.userId }),
        });
      } else if (typeof adapterAny?.markAllNotificationsRead === 'function') {
        await adapterAny.markAllNotificationsRead(config.projectId, config.userId);
      }
    } catch {
      fetchNotifications();
    }
  }, [getBaseUrl, config.adapter, config.projectId, config.userId, fetchNotifications]);

  // Poll on mount + interval
  useEffect(() => {
    if (!enabled) return;

    fetchNotifications();

    intervalRef.current = setInterval(() => {
      // Pause when tab is hidden
      if (document.hidden) return;
      fetchNotifications();
    }, pollInterval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, pollInterval, fetchNotifications]);

  // Pause/resume on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && enabled) {
        fetchNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [enabled, fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, unreadCount, markAsRead, markAllRead, isLoading };
}
