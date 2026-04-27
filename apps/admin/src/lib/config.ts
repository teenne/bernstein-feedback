import { supabase } from './supabaseClient';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export const useSupabaseDirectly = !!(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY &&
    supabase
);

// Session storage keys
export const SESSION_KEYS = {
    AUTH: 'feedback_admin_auth',
    LOCAL_USER: 'feedback_local_user',
    TOKEN: 'feedback_token',
    SELECTED_PLAN: 'bernstein_selected_plan',
    DEMO_PRO: 'bernstein_demo_pro',
} as const;

/**
 * Synchronously read the Supabase session's access_token from the
 * client-side storage key Supabase persists it under (`sb-<ref>-auth-token`).
 * Returns null if the user isn't signed in via Supabase — callers then
 * fall through to the local Node JWT.
 *
 * Kept sync on purpose: `getAuthHeaders` is called by non-async code
 * paths (Dashboard fetches, etc.). Using `supabase.auth.getSession()`
 * would force async-ify the whole call chain.
 */
function readSupabaseAccessToken(): string | null {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            // Supabase-js v2 stores either a flat object or the auth
            // response shape — both have `access_token` at the top level.
            if (typeof parsed?.access_token === 'string') return parsed.access_token;
            if (typeof parsed?.currentSession?.access_token === 'string') return parsed.currentSession.access_token;
        }
    } catch {
        /* localStorage disabled / JSON malformed */
    }
    return null;
}

// Helper: get auth headers for Node server requests. Prefers the local
// Node JWT (sessionStorage). Falls back to the Supabase session's
// access_token so admins logged in via Supabase can still call the
// Node server — requires SUPABASE_JWT_SECRET on the server to verify.
export function getAuthHeaders(): Record<string, string> {
    const nodeToken = sessionStorage.getItem(SESSION_KEYS.TOKEN);
    if (nodeToken) {
        return { 'Authorization': `Bearer ${nodeToken}`, 'Content-Type': 'application/json' };
    }
    const supabaseToken = readSupabaseAccessToken();
    if (supabaseToken) {
        return { 'Authorization': `Bearer ${supabaseToken}`, 'Content-Type': 'application/json' };
    }
    return { 'Content-Type': 'application/json' };
}

// Helper: authenticated fetch for Node server
export async function apiFetch(url: string, options?: RequestInit): Promise<any> {
    const res = await fetch(url, {
        ...options,
        headers: { ...getAuthHeaders(), ...options?.headers },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json;
}
