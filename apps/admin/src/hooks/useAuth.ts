import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface AuthState {
    isLoggedIn: boolean;
    isAdmin: boolean;
    email: string | null;
    userId: string | null;
    loading: boolean;
}

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

/**
 * Auth hook that checks Supabase session and determines admin vs regular user.
 *
 * Admin is determined by VITE_ADMIN_EMAILS env var (comma-separated list).
 * - Admin: can see Developer Override, Admin Portal, force Pro mode
 * - Regular User: clean interface, plan controlled by Supabase projects.plan
 */
export function useAuth(): AuthState {
    const [state, setState] = useState<AuthState>({
        isLoggedIn: false,
        isAdmin: false,
        email: null,
        userId: null,
        loading: true,
    });

    useEffect(() => {
        if (!supabase) {
            setState(prev => ({ ...prev, loading: false }));
            return;
        }

        // Check current session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                const email = session.user.email?.toLowerCase() || '';
                setState({
                    isLoggedIn: true,
                    isAdmin: ADMIN_EMAILS.includes(email),
                    email,
                    userId: session.user.id,
                    loading: false,
                });
            } else {
                setState(prev => ({ ...prev, loading: false }));
            }
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                const email = session.user.email?.toLowerCase() || '';
                setState({
                    isLoggedIn: true,
                    isAdmin: ADMIN_EMAILS.includes(email),
                    email,
                    userId: session.user.id,
                    loading: false,
                });
            } else {
                setState({
                    isLoggedIn: false,
                    isAdmin: false,
                    email: null,
                    userId: null,
                    loading: false,
                });
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    return state;
}
