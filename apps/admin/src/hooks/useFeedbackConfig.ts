import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSubscription } from './useSubscription';

export type AdapterId = 'local' | 'supabase' | 'console';

export interface FeedbackConfigState {
    adapterId: AdapterId;
    supabaseUrl: string;
    supabaseKey: string;
    themeColor: string;
    darkMode: boolean;
    maxConsoleErrors: number;
    maxNetworkErrors: number;
    maxBreadcrumbs: number;
    toastDuration: number;
    showBranding: boolean;
}

const DEFAULT_CONFIG: FeedbackConfigState = {
    adapterId: 'local',
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
    supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    themeColor: '#f59e0b',
    darkMode: false,
    maxConsoleErrors: 10,
    maxNetworkErrors: 5,
    maxBreadcrumbs: 20,
    toastDuration: 5000,
    showBranding: true,
};

const STORAGE_KEY = 'bernstein_config_v1';

export function useFeedbackConfig(initialProjectId: string = 'demo-app') {
    const [projectId, setProjectId] = useState(initialProjectId);

    const [config, setConfig] = useState<FeedbackConfigState>(() => {
        if (typeof window === 'undefined') return DEFAULT_CONFIG;
        try {
            const saved = localStorage.getItem(`${STORAGE_KEY}_${initialProjectId}`);
            if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
        } catch (e) {
            console.warn('Failed to load config', e);
        }
        return DEFAULT_CONFIG;
    });

    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const { isPro, loading, checkSubscription } = useSubscription(projectId);

    const fetchManagedConfig = useCallback(async (pid: string) => {
        if (!supabase) return;
        const { data, error } = await supabase
            .from('projects')
            .select('config')
            .eq('id', pid)
            .single();
        if (error) {
            console.error('Failed to fetch managed config:', error);
            return;
        }
        if (data?.config) {
            setConfig(prev => ({ ...prev, ...data.config }));
        }
    }, []);

    const enforcedConfig = useMemo(() => {
        if (isPro) return config;
        return {
            ...config,
            adapterId: 'local' as const,
            themeColor: '#f59e0b',
            showBranding: true,
            maxConsoleErrors: 10,
            maxNetworkErrors: 5,
            maxBreadcrumbs: 20,
            toastDuration: 5000,
        };
    }, [config, isPro]);

    const updateSetting = useCallback(<K extends keyof FeedbackConfigState>(key: K, value: FeedbackConfigState[K]) => {
        setConfig(prev => {
            setHasUnsavedChanges(true);
            return { ...prev, [key]: value };
        });
    }, []);

    const saveSettings = useCallback(async (targetProjectId?: string) => {
        const pid = targetProjectId || projectId;
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(`${STORAGE_KEY}_${pid}`, JSON.stringify(config));
            if (supabase) {
                const { error } = await supabase
                    .from('projects')
                    .update({ config } as any)
                    .eq('id', pid);
                if (error) throw error;
            }
            setHasUnsavedChanges(false);
        } catch (error) {
            console.warn('Failed to save feedback config:', error);
            setHasUnsavedChanges(false);
        }
    }, [config, projectId]);

    // Apply Dark Mode
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const html = document.documentElement;
        if (config.darkMode) {
            html.setAttribute('data-theme', 'dark');
            html.classList.add('dark');
        } else {
            html.removeAttribute('data-theme');
            html.classList.remove('dark');
        }
    }, [config.darkMode]);

    // Apply Theme Color
    useEffect(() => {
        if (typeof document === 'undefined') return;
        document.documentElement.style.setProperty('--feedback-primary', enforcedConfig.themeColor);
    }, [enforcedConfig.themeColor]);

    return {
        config: enforcedConfig,
        rawConfig: config,
        isPro,
        loading,
        updateSetting,
        saveSettings,
        hasUnsavedChanges,
        checkSubscription,
        setProjectId,
        fetchManagedConfig,
        activeProjectId: projectId,
    };
}
