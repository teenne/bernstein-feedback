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
            if (cloud) {
                const result = await cloud.submit(event);
                if (result.success) return result;

                // Cloud failed — fallback to local server so no data is lost
                console.warn('[Feedback] Supabase failed, trying local server:', result.error);
                return local.submit(event);
            }

            return local.submit(event);
        },

        mode: () => currentMode,
    };
}
