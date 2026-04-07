import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const useSupabaseDirectly = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY && supabase);

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

    // Read local session from sessionStorage
    const readLocalSession = () => {
        const stored = sessionStorage.getItem('feedback_local_user');
        const token = sessionStorage.getItem('feedback_token');
        if (stored && token) {
            try {
                const { user_id, email, role } = JSON.parse(stored);
                if (user_id && email && role) {
                    roleResolved.current = true;
                    setState({
                        isLoggedIn: true,
                        isAdmin: role === 'admin',
                        role,
                        email,
                        userId: user_id,
                        loading: false,
                    });
                    setSessionUser({ id: user_id, email });
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
                        const { count } = await supabase!
                            .from('user_roles')
                            .select('*', { count: 'exact', head: true });

                        if (cancelled) return;
                        role = (count === 0) ? 'admin' : 'user';

                        await supabase!.from('user_roles').upsert({
                            user_id: userId,
                            email,
                            role,
                        }, { onConflict: 'user_id' });
                    } else {
                        role = (data.role as 'admin' | 'user') || 'user';
                    }
                } else {
                    // Node server: verify token with /api/auth/me
                    const token = sessionStorage.getItem('feedback_token');
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
