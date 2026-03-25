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

        try {
            const { data, error } = await supabase
                .from('projects')
                .select('plan')
                .eq('id', projectId)
                .single<{ plan: 'free' | 'pro' }>();

            // MOCK/DEMO MODE: Check local storage for override
            const demoOverride = localStorage.getItem('bernstein_demo_pro');
            if (demoOverride === 'true') {
                setIsPro(true);
                return;
            }

            if (error || !data) {
                console.warn('Subscription check failed (Supabase error):', error);
                setIsPro(false); // Fail Safe: Default to free
            } else {
                setIsPro(data.plan === 'pro');
            }
        } catch (err) {
            console.warn('Subscription check failed (Network/Other):', err);
            setIsPro(false); // Fail Safe: Default to free
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        checkSubscription();
    }, [checkSubscription]);

    return { isPro, loading, checkSubscription };
}
