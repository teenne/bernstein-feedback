import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { API_URL, useSupabaseDirectly, SESSION_KEYS } from '../lib/config';

interface AuthState {
    isLoggedIn: boolean;
    isAdmin: boolean;
    role: 'admin' | 'user' | null;
    email: string | null;
    userId: string | null;
    accessToken: string | null;
    loading: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Module-level singleton store.
//
// Why: useAuth is called from App.tsx, Dashboard, UserManagementPage,
// FeedbackListPage, StatsPage, and SettingsPage. Each useState + useEffect
// fires its own onAuthStateChange subscription AND its own user_roles SELECT,
// resulting in 6+ duplicate requests per page load (doubled in StrictMode).
//
// The singleton below:
//   * subscribes to supabase.auth.onAuthStateChange exactly once per tab,
//   * fetches user_roles exactly once per sessionUser change,
//   * fans state out to every useAuth() caller via a subscriber set.
// ──────────────────────────────────────────────────────────────────────────

const INITIAL_STATE: AuthState = {
    isLoggedIn: false,
    isAdmin: false,
    role: null,
    email: null,
    userId: null,
    accessToken: null,
    loading: true,
};

let sharedState: AuthState = INITIAL_STATE;
const subscribers = new Set<(s: AuthState) => void>();
let initialized = false;

// Tracks which userId we've already resolved, so we don't re-SELECT
// user_roles every time onAuthStateChange fires a TOKEN_REFRESHED event
// (which keeps the same user but re-emits the session).
let resolvedForUserId: string | null = null;

// Tracks a user_id whose role fetch is currently in-flight. Set synchronously
// at the top of resolveRoleFromDb so that concurrent calls (getSession +
// onAuthStateChange INITIAL_SESSION + SIGNED_IN all firing back-to-back)
// collapse to a single network request. Without this, three events racing
// the first await would all issue their own SELECT.
let inFlightForUserId: string | null = null;

function setShared(next: AuthState) {
    sharedState = next;
    subscribers.forEach(cb => cb(next));
}

async function resolveRoleFromDb(userId: string, email: string, accessToken: string | null) {
    if (resolvedForUserId === userId || inFlightForUserId === userId) return;
    inFlightForUserId = userId;
    let role: 'admin' | 'user' = 'user';
    try {
        if (useSupabaseDirectly) {
            const { data, error } = await supabase!
                .from('user_roles')
                .select('role')
                .eq('user_id', userId)
                .maybeSingle();
            if (error) console.warn('[Auth] Error fetching role:', error.message);
            role = (data?.role as 'admin' | 'user') || 'user';
        } else {
            const token = sessionStorage.getItem(SESSION_KEYS.TOKEN);
            if (token) {
                const res = await fetch(`${API_URL}/api/auth/me`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const json = await res.json();
                if (json.success) role = json.data.role || 'user';
            }
        }
        resolvedForUserId = userId;
        setShared({
            isLoggedIn: true,
            isAdmin: role === 'admin',
            role,
            email,
            userId,
            accessToken,
            loading: false,
        });
    } catch (err) {
        console.warn('[Auth] Error resolving role:', err);
    } finally {
        inFlightForUserId = null;
    }
}

async function readLocalSession() {
    const stored = sessionStorage.getItem(SESSION_KEYS.LOCAL_USER);
    const token = sessionStorage.getItem(SESSION_KEYS.TOKEN);
    if (!stored || !token) {
        setShared({ ...INITIAL_STATE, loading: false });
        return;
    }
    try {
        const parsed = JSON.parse(stored);
        const { user_id, email } = parsed;
        if (!user_id || !email) {
            setShared({ ...INITIAL_STATE, loading: false });
            return;
        }

        // Verify current role from server (don't trust cached role).
        try {
            const res = await fetch(`${API_URL}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const json = await res.json();
            const freshRole: 'admin' | 'user' = json.success
                ? (json.data.role || 'user')
                : 'user';

            sessionStorage.setItem(
                SESSION_KEYS.LOCAL_USER,
                JSON.stringify({ user_id, email, role: freshRole }),
            );
            resolvedForUserId = user_id;
            setShared({
                isLoggedIn: true,
                isAdmin: freshRole === 'admin',
                role: freshRole,
                email,
                userId: user_id,
                accessToken: token,
                loading: false,
            });
        } catch {
            // Server unavailable — fall back to cached role.
            const cachedRole: 'admin' | 'user' = parsed.role || 'user';
            resolvedForUserId = user_id;
            setShared({
                isLoggedIn: true,
                isAdmin: cachedRole === 'admin',
                role: cachedRole,
                email,
                userId: user_id,
                accessToken: token,
                loading: false,
            });
        }
    } catch {
        setShared({ ...INITIAL_STATE, loading: false });
    }
}

function initOnce() {
    if (initialized) return;
    initialized = true;

    // Path A: Node-server / local JWT auth
    if (!supabase) {
        readLocalSession();
        window.addEventListener('local-auth-change', () => {
            resolvedForUserId = null;
            readLocalSession();
        });
        return;
    }

    // Path B: Supabase auth
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
            const userId = session.user.id;
            const email = session.user.email?.toLowerCase() || '';
            const accessToken = session.access_token ?? null;
            if (resolvedForUserId !== userId) {
                resolveRoleFromDb(userId, email, accessToken);
            } else if (sharedState.accessToken !== accessToken) {
                setShared({ ...sharedState, accessToken });
            }
        } else {
            setShared({ ...INITIAL_STATE, loading: false });
        }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
            const userId = session.user.id;
            const email = session.user.email?.toLowerCase() || '';
            const accessToken = session.access_token ?? null;
            // Skip re-fetching role when the same user's session is just
            // being refreshed (TOKEN_REFRESHED event). Otherwise every
            // token refresh — which happens every hour — would re-query
            // user_roles for no reason. We still propagate the new token
            // into shared state so downstream consumers (e.g. the feedback
            // adapter) rebuild with fresh auth.
            if (resolvedForUserId !== userId) {
                resolveRoleFromDb(userId, email, accessToken);
            } else if (sharedState.accessToken !== accessToken) {
                setShared({ ...sharedState, accessToken });
            }
        } else {
            resolvedForUserId = null;
            setShared({ ...INITIAL_STATE, loading: false });
        }
    });
}

/**
 * Auth hook that checks session and determines admin vs regular user.
 *
 * Backed by a module-level singleton — any number of components can call
 * useAuth() without causing duplicate SELECTs against user_roles.
 */
export function useAuth(): AuthState {
    const [state, setState] = useState<AuthState>(sharedState);

    useEffect(() => {
        initOnce();
        // Snapshot the current shared state in case it was updated between
        // initial render and effect run.
        setState(sharedState);
        subscribers.add(setState);
        return () => {
            subscribers.delete(setState);
        };
    }, []);

    return state;
}
