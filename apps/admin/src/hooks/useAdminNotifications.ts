import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { API_URL, apiFetch, useSupabaseDirectly } from '../lib/config';

export interface AdminNotification {
    id: string;
    project_id: string;
    feedback_id: string;
    type: 'status_change' | 'resolved' | 'new_feedback';
    title: string;
    message: string | null;
    read: boolean;
    created_at: string;
}

interface Options {
    userId: string | null | undefined;
    /**
     * Poll interval (ms) for the HTTP path. The Supabase path uses Realtime
     * and only polls as a fallback when subscribing fails.
     */
    pollInterval?: number;
}

/**
 * Cross-project notifications for the admin bell.
 *
 * Unlike the widget's `useNotifications` (scoped to one projectId from the
 * dropdown), this hook fetches every notification the current user can see,
 * regardless of which project the admin is viewing. That matches the spec
 * where "owner gets notified of activity across every project they can
 * access, independent of the feedback-list dropdown".
 *
 * Two transport paths, chosen at call-site:
 *  1. Supabase-direct — reads the notifications table + subscribes via
 *     Realtime. RLS on the table (SELECT policy at `supabase-setup.sql`)
 *     already scopes to user_id / project membership / global admin, so no
 *     extra filter is needed.
 *  2. Node server — calls `GET /api/notifications` without a `project_id`
 *     param, which returns every notification for `user_id=auth.uid()`.
 *
 * Fail-safe: every error collapses to "no notifications" so a temporary
 * outage never blocks the rest of the admin UI.
 */
export function useAdminNotifications({ userId, pollInterval = 30000 }: Options) {
    const [notifications, setNotifications] = useState<AdminNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const enabled = !!userId;

    const fetchAll = useCallback(async () => {
        if (!enabled) return;
        try {
            setLoading(true);
            if (useSupabaseDirectly && supabase) {
                const { data, error } = await supabase
                    .from('notifications')
                    .select('id, project_id, feedback_id, type, title, message, read, created_at')
                    .eq('user_id', userId!)
                    .order('created_at', { ascending: false })
                    .limit(50);
                if (!error && data) setNotifications(data as AdminNotification[]);
                return;
            }
            const json = await apiFetch(`${API_URL}/api/notifications`);
            if (json?.data) setNotifications(json.data);
        } catch {
            // fail-safe
        } finally {
            setLoading(false);
        }
    }, [enabled, userId]);

    // Realtime subscription on the Supabase path — refetch on every
    // inserted/updated notification row for this user (RLS + the eq filter
    // keep bandwidth low).
    useEffect(() => {
        if (!enabled) return;
        if (!useSupabaseDirectly || !supabase) return;

        fetchAll();

        const client = supabase!;
        const channel = client
            .channel(`admin-notifications:${userId}`)
            .on(
                'postgres_changes' as any,
                {
                    event: '*',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`,
                },
                () => fetchAll(),
            )
            .subscribe();

        return () => {
            try { client.removeChannel(channel); } catch { /* ignore */ }
        };
    }, [enabled, userId, fetchAll]);

    // HTTP polling fallback — only active when Supabase-direct isn't.
    useEffect(() => {
        if (!enabled) return;
        if (useSupabaseDirectly) return;

        fetchAll();
        intervalRef.current = setInterval(() => {
            if (document.hidden) return;
            fetchAll();
        }, pollInterval);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [enabled, pollInterval, fetchAll]);

    const markAsRead = useCallback(async (id: string) => {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        try {
            if (useSupabaseDirectly && supabase) {
                await supabase.from('notifications').update({ read: true }).eq('id', id);
                return;
            }
            await apiFetch(`${API_URL}/api/notifications/${id}/read`, { method: 'PATCH' });
        } catch {
            fetchAll();
        }
    }, [fetchAll]);

    const markAllRead = useCallback(async () => {
        if (!userId) return;
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        try {
            if (useSupabaseDirectly && supabase) {
                await supabase
                    .from('notifications')
                    .update({ read: true })
                    .eq('user_id', userId)
                    .eq('read', false);
                return;
            }
            await apiFetch(`${API_URL}/api/notifications/mark-all-read`, {
                method: 'POST',
                body: JSON.stringify({}),
            });
        } catch {
            fetchAll();
        }
    }, [userId, fetchAll]);

    const unreadCount = notifications.filter((n) => !n.read).length;

    return { notifications, unreadCount, loading, markAsRead, markAllRead, refresh: fetchAll };
}
