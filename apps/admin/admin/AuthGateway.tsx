import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import LoginPage from './LoginPage';
import Dashboard from './Dashboard';

export default function AuthGateway() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });

        // 2. Listen for changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen w-full bg-gray-950 flex flex-col items-center justify-center">
                <div className="relative h-16 w-16">
                    <div className="absolute inset-0 border-4 border-amber-500/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-amber-500 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p className="mt-4 text-amber-500 font-medium animate-pulse">Initializing Portal...</p>
            </div>
        );
    }

    if (!session) {
        return <LoginPage />;
    }

    return <Dashboard session={session} />;
}
