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
    /** Base URL of the HTTP server */
    baseUrl: string;
} {
    const {
        supabaseUrl,
        supabaseKey,
        table,
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

    // Cloud: Supabase adapter (multi-table, screenshot upload)
    const cloud = hasSupabase
        ? supabaseAdapter({ supabaseUrl, supabaseKey, table } as SupabaseAdapterOptions)
        : null;

    // Local: Express + PostgreSQL server
    const local = httpAdapter({
        endpoint: `${localServerUrl.replace(/\/$/, '')}/api/feedback`,
        headers: localHeaders,
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

        // Pass through Supabase adapter methods for plan + notification support
        getPlanStatus: cloud?.getPlanStatus?.bind(cloud),
        getNotifications: cloud?.getNotifications?.bind(cloud),
        markNotificationRead: cloud?.markNotificationRead?.bind(cloud),
        markAllNotificationsRead: cloud?.markAllNotificationsRead?.bind(cloud),

        /** Base URL of the HTTP server (for deriving plan-status / notification endpoints) */
        baseUrl: localServerUrl.replace(/\/$/, ''),

        mode: () => currentMode,
    };
}
