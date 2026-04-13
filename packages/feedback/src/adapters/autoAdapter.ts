import type { FeedbackAdapter } from '../schemas';
import { supabaseAdapter, type SupabaseAdapterOptions } from './supabase-adapter';
import { httpAdapter } from './http';

export interface AutoAdapterOptions {
    /** Supabase project URL (if provided, uses Supabase) */
    supabaseUrl?: string;
    /** Supabase anon key (if provided, uses Supabase) */
    supabaseKey?: string;
    /** Supabase table name (default: 'feedback') */
    table?: string;
    /**
     * Optional Supabase-compatible JWT minted by the host backend.
     * When provided, the Supabase client uses it as its access token,
     * so RLS policies on the database can identify the user via
     * `auth.jwt() ->> 'sub'` without the user being in Supabase Auth.
     * Strongly recommended for production deployments — without it,
     * RLS for non-Supabase-Auth users must fall back to permissive
     * `USING (true)` policies which leak data via the anon key.
     */
    accessToken?: string;
    /** Local server URL (default: 'http://localhost:3000') */
    localServerUrl?: string;
    /** Custom headers for local server */
    localHeaders?: Record<string, string>;
    /** Called when adapter mode is determined */
    onMode?: (mode: 'supabase' | 'local-server') => void;
}

/**
 * Auto-switching adapter:
 * - Supabase keys provided → sends to Supabase (cloud PostgreSQL)
 * - Supabase keys missing  → sends to local Express server (local PostgreSQL)
 *
 * Both store in PostgreSQL — the difference is where the database lives.
 *
 * @example
 * ```tsx
 * const adapter = autoAdapter({
 *   supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
 *   supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
 *   localServerUrl: 'http://localhost:3000', // fallback
 * });
 * ```
 */
export function autoAdapter(options: AutoAdapterOptions = {}): FeedbackAdapter & {
    mode: () => 'supabase' | 'local-server';
    getPlanStatus?: (projectId: string) => Promise<{
        can_submit: boolean;
        tickets_used: number;
        tickets_limit: number;
        plan: string;
        message?: string;
    }>;
    getNotifications?: (projectId: string, userId: string) => Promise<{ data: any[]; unread_count: number }>;
    markNotificationRead?: (id: string) => Promise<void>;
    markAllNotificationsRead?: (projectId: string, userId: string) => Promise<void>;
    subscribeToNotifications?: (projectId: string, userId: string, onChange: () => void) => () => void;
    /** Base URL of the HTTP server */
    baseUrl: string;
} {
    const {
        supabaseUrl,
        supabaseKey,
        table,
        accessToken,
        localServerUrl = 'http://localhost:3000',
        localHeaders = {},
        onMode,
    } = options;

    const hasSupabase = !!(supabaseUrl && supabaseKey);
    const currentMode = hasSupabase ? 'supabase' : 'local-server';

    onMode?.(currentMode);

    if (hasSupabase) {
        console.info('[Feedback] Using Supabase (cloud).');
    } else {
        console.info(`[Feedback] Supabase not configured — using local server at ${localServerUrl}`);
    }

    // Cloud: Supabase adapter (multi-table, screenshot upload).
    // Notifications via Supabase Realtime WebSocket — unchanged.
    const cloud = hasSupabase
        ? supabaseAdapter({ supabaseUrl, supabaseKey, table, accessToken } as SupabaseAdapterOptions)
        : null;

    // Local: Express + PostgreSQL server.
    // Notifications via the Node server's native WebSocket at
    // /api/notifications/ws. The ws:// URL is auto-derived from the
    // HTTP URL (http → ws, https → wss).
    const baseHttp = localServerUrl.replace(/\/$/, '');
    const wsEndpoint = baseHttp.replace(/^http/, 'ws') + '/api/notifications/ws';
    const local = httpAdapter({
        endpoint: `${baseHttp}/api/feedback`,
        headers: localHeaders,
        wsEndpoint,
    });

    return {
        async submit(event) {
            // If Supabase is configured, use ONLY Supabase (no Node server call)
            // If not configured, use ONLY the Node server
            if (cloud) {
                return cloud.submit(event);
            }

            return local.submit(event);
        },

        // Pass-through: notifications + plan status come from whichever
        // backend is active. Supabase exposes all four; the HTTP/local
        // adapter exposes only subscribeToNotifications (the hook falls
        // back to HTTP REST for getNotifications / markRead / markAllRead).
        getPlanStatus: cloud?.getPlanStatus?.bind(cloud),
        getNotifications: cloud?.getNotifications?.bind(cloud),
        markNotificationRead: cloud?.markNotificationRead?.bind(cloud),
        markAllNotificationsRead: cloud?.markAllNotificationsRead?.bind(cloud),
        subscribeToNotifications:
            cloud?.subscribeToNotifications?.bind(cloud) ??
            local.subscribeToNotifications,

        /** Base URL of the HTTP server (for deriving plan-status / notification endpoints) */
        baseUrl: baseHttp,

        mode: () => currentMode,
    };
}
