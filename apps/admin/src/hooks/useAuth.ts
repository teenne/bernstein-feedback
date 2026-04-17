import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { API_URL, useSupabaseDirectly, SESSION_KEYS } from '../lib/config';

interface AuthState {
    isLoggedIn: boolean;
    isAdmin: boolean;
    role: 'admin' | 'user' | null;
    email: string | null;
    userId: string | null;
    loading: boolean;
}

/**
 * Auth hook that checks session and determines admin vs regular user.
 *
 * Role is determined by the `user_roles` table (dynamic, DB-driven).
 * Works with both Supabase direct and Node server (JWT) fallback.
 */
export function useAuth(): AuthState {
    const [state, setState] = useState<AuthState>({
        isLoggedIn: false,
        isAdmin: false,
        role: null,
        email: null,
        userId: null,
        loading: true,
    });

    const [sessionUser, setSessionUser] = useState<{ id: string; email: string } | null>(null);
    const roleResolved = useRef(false);

    // Read local session from sessionStorage, then verify role from server
    const readLocalSession = async () => {
        const stored = sessionStorage.getItem(SESSION_KEYS.LOCAL_USER);
        const token = sessionStorage.getItem(SESSION_KEYS.TOKEN);
        if (stored && token) {
            try {
                const { user_id, email } = JSON.parse(stored);
                if (user_id && email) {
                    setSessionUser({ id: user_id, email });

                    // Always verify current role from server (don't trust cached role)
                    try {
                        const res = await fetch(`${API_URL}/api/auth/me`, {
                            headers: { 'Authorization': `Bearer ${token}` },
                        });
                        const json = await res.json();
                        const freshRole = json.success ? (json.data.role || 'user') : 'user';

                        // Update cached session with fresh role
                        sessionStorage.setItem(SESSION_KEYS.LOCAL_USER, JSON.stringify({
                            user_id, email, role: freshRole,
                        }));

                        roleResolved.current = true;
                        setState({
                            isLoggedIn: true,
                            isAdmin: freshRole === 'admin',
                            role: freshRole,
                            email,
                            userId: user_id,
                            loading: false,
                        });
                    } catch {
                        // Server unavailable — fall back to cached role
                        const { role } = JSON.parse(stored);
                        roleResolved.current = true;
                        setState({
                            isLoggedIn: true,
                            isAdmin: role === 'admin',
                            role,
                            email,
                            userId: user_id,
                            loading: false,
                        });
                    }
                    return;
                }
            } catch {}
        }
        setState(prev => ({ ...prev, loading: false }));
    };

    // Step 1: Listen for auth session
    useEffect(() => {
        // Local session (Node server with JWT)
        if (!supabase) {
            readLocalSession();

            // Listen for login/logout events from LocalLoginPage
            const handleAuthChange = () => {
                roleResolved.current = false;
                readLocalSession();
            };
            window.addEventListener('local-auth-change', handleAuthChange);
            return () => window.removeEventListener('local-auth-change', handleAuthChange);
        }

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                setSessionUser({ id: session.user.id, email: session.user.email?.toLowerCase() || '' });
            } else {
                setState(prev => ({ ...prev, loading: false }));
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                roleResolved.current = false;
                setSessionUser({ id: session.user.id, email: session.user.email?.toLowerCase() || '' });
            } else {
                setSessionUser(null);
                roleResolved.current = false;
                setState({
                    isLoggedIn: false,
                    isAdmin: false,
                    role: null,
                    email: null,
                    userId: null,
                    loading: false,
                });
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // Step 2: Resolve role from DB (Supabase path only — Node server resolves at login)
    useEffect(() => {
        if (!sessionUser || roleResolved.current) return;

        let cancelled = false;

        const resolveRole = async () => {
            const { id: userId, email } = sessionUser;
            let role: 'admin' | 'user' = 'user';

            try {
                if (useSupabaseDirectly) {
                    // Supabase direct
                    const { data, error } = await supabase!
                        .from('user_roles')
                        .select('role')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (cancelled) return;

                    if (error) {
                        console.warn('[Auth] Error fetching role:', error.message);
                    }

                    if (!data) {
                        // Row should have been created by the on_auth_user_created
                        // trigger (handle_new_user). If we don't see it, the user
                        // simply has no role row yet — default to 'user' and let
                        // an admin promote them via the server endpoint.
                        role = 'user';
                    } else {
                        role = (data.role as 'admin' | 'user') || 'user';
                    }
                } else {
                    // Node server: verify token with /api/auth/me
                    const token = sessionStorage.getItem(SESSION_KEYS.TOKEN);
                    if (token) {
                        const res = await fetch(`${API_URL}/api/auth/me`, {
                            headers: { 'Authorization': `Bearer ${token}` },
                        });
                        if (cancelled) return;
                        const json = await res.json();
                        if (json.success) {
                            role = json.data.role || 'user';
                        }
                    }
                }
            } catch (err) {
                console.warn('[Auth] Error resolving role:', err);
            }

            if (cancelled) return;

            roleResolved.current = true;
            setState({
                isLoggedIn: true,
                isAdmin: role === 'admin',
                role,
                email: sessionUser.email,
                userId: sessionUser.id,
                loading: false,
            });
        };

        resolveRole();

        return () => { cancelled = true; };
    }, [sessionUser]);

    return state;
}
