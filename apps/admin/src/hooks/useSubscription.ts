import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useSubscription(projectId: string) {
    const [isPro, setIsPro] = useState(false);
    const [loading, setLoading] = useState(true);

    const checkSubscription = useCallback(async () => {
        if (!projectId) {
            setLoading(false);
            return;
        }

        // MOCK/DEMO MODE: Check local storage for override first
        const demoOverride = localStorage.getItem('bernstein_demo_pro');
        if (demoOverride === 'true') {
            setIsPro(true);
            setLoading(false);
            return;
        }

        try {
            if (!supabase) { setIsPro(false); setLoading(false); return; }

            // Only query if user is authenticated
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setIsPro(false);
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('projects')
                .select('plan')
                .eq('id', projectId)
                .maybeSingle<{ plan: 'free' | 'pro' }>();

            if (error || !data) {
                // No project found or error — default to free (no 406 error)
                setIsPro(false);
            } else {
                setIsPro(data.plan === 'pro');
            }
        } catch (err) {
            console.warn('Subscription check failed:', err);
            setIsPro(false);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        checkSubscription();
    }, [checkSubscription]);

    return { isPro, loading, checkSubscription };
}
