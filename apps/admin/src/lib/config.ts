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

// Helper: get auth headers for Node server requests
export function getAuthHeaders(): Record<string, string> {
    const token = sessionStorage.getItem(SESSION_KEYS.TOKEN);
    if (token) {
        return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
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
