import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

type PlanFeatures = {
    ai_clustering?: boolean;
    posthog?: boolean;
    api_access?: boolean;
    self_hosted?: boolean;
    [key: string]: unknown;
};

interface SubscriptionState {
    /** True for any non-free plan. Kept for backward compatibility. */
    isPro: boolean;
    /** Raw plan id from the DB: 'free' | 'paid' | legacy 'pro'. */
    plan: string | null;
    /** Feature flags from `plans.features`. Empty object if unknown. */
    features: PlanFeatures;
    loading: boolean;
}

const PAID_PLAN_IDS = new Set(['paid', 'pro', 'enterprise']);

export function useSubscription(projectId: string) {
    const [state, setState] = useState<SubscriptionState>({
        isPro: false,
        plan: null,
        features: {},
        loading: true,
    });

    const checkSubscription = useCallback(async () => {
        if (!projectId) {
            setState({ isPro: false, plan: null, features: {}, loading: false });
            return;
        }

        // MOCK/DEMO MODE: local override for testing paid UI without a paid account.
        if (localStorage.getItem('bernstein_demo_pro') === 'true') {
            setState({
                isPro: true,
                plan: 'paid',
                features: { ai_clustering: true, posthog: true, api_access: true },
                loading: false,
            });
            return;
        }

        try {
            if (!supabase) {
                setState({ isPro: false, plan: null, features: {}, loading: false });
                return;
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setState({ isPro: false, plan: null, features: {}, loading: false });
                return;
            }

            // Join projects → plans so we get both the plan id and the
            // full feature flag set in one round-trip. `plans:plan_id(...)`
            // relies on the FK between projects.plan_id and plans.id.
            const { data, error } = await supabase
                .from('projects')
                .select('plan, plan_id, plans:plan_id(features)')
                .eq('id', projectId)
                .maybeSingle<{
                    plan: string | null;
                    plan_id: string | null;
                    plans: { features: PlanFeatures | null } | null;
                }>();

            if (error || !data) {
                setState({ isPro: false, plan: null, features: {}, loading: false });
                return;
            }

            const planId = data.plan_id || data.plan || 'free';
            const features = data.plans?.features ?? {};
            setState({
                isPro: PAID_PLAN_IDS.has(planId),
                plan: planId,
                features,
                loading: false,
            });
        } catch (err) {
            console.warn('Subscription check failed:', err);
            setState({ isPro: false, plan: null, features: {}, loading: false });
        }
    }, [projectId]);

    useEffect(() => {
        checkSubscription();
    }, [checkSubscription]);

    return {
        isPro: state.isPro,
        plan: state.plan,
        features: state.features,
        loading: state.loading,
        checkSubscription,
    };
}
