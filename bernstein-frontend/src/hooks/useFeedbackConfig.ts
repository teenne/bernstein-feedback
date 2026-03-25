import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSubscription } from './useSubscription';

export type AdapterId = 'local' | 'supabase' | 'console';

// Define the shape of the configuration state
export interface FeedbackConfigState {
    adapterId: AdapterId;
    // Supabase settings
    supabaseUrl: string;
    supabaseKey: string;
    // Theme settings
    themeColor: string;
    darkMode: boolean;
    // Feature flags

    // Capture limits
    maxConsoleErrors: number;
    maxNetworkErrors: number;
    maxBreadcrumbs: number;
    // Toast settings
    toastDuration: number;
    showBranding: boolean;
}

const DEFAULT_CONFIG: FeedbackConfigState = {
    adapterId: 'local',
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
    supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    themeColor: '#f59e0b', // Default Bernstein Orange
    darkMode: false,

    maxConsoleErrors: 10,
    maxNetworkErrors: 5,
    maxBreadcrumbs: 20,
    toastDuration: 5000,
    showBranding: true,
};

const STORAGE_KEY = 'bernstein_config_v1';

/**
 * "The Brain" - Manages persistent settings and side effects.
 * Now supports dynamic projectId and Supabase-backed persistence.
 */
export function useFeedbackConfig(initialProjectId: string = 'demo-app') {
    const [projectId, setProjectId] = useState(initialProjectId);
    
    // Load initial state from localStorage if available, otherwise use defaults
    const [config, setConfig] = useState<FeedbackConfigState>(() => {
        if (typeof window === 'undefined') return DEFAULT_CONFIG;

        try {
            const saved = localStorage.getItem(`${STORAGE_KEY}_${projectId}`);
            if (saved) {
                return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn('Failed to load config', e);
        }
        return DEFAULT_CONFIG;
    });

    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Subscription Check
    const { isPro, loading, checkSubscription } = useSubscription(projectId);

    // Fetch config from Supabase if we're in "admin mode" for a project
    const fetchManagedConfig = useCallback(async (pid: string) => {
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

    // Enforce License: Silent Downgrade
    const enforcedConfig = useMemo(() => {
        // Free tier restrictions
        if (isPro) {
            return config;
        }
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
            const next = { ...prev, [key]: value };
            setHasUnsavedChanges(true);
            return next;
        });
    }, []);

    const saveSettings = useCallback(async (targetProjectId?: string) => {
        const pid = targetProjectId || projectId;
        if (typeof window === 'undefined') return;

        try {
            // 1. Local Persistence (Cache)
            localStorage.setItem(`${STORAGE_KEY}_${pid}`, JSON.stringify(config));
            
            // 2. Database Persistence (for Admin Portal)
            const { error } = await supabase
                .from('projects')
                .update({ config } as any)
                .eq('id', pid);

            if (error) throw error;
            
            setHasUnsavedChanges(false);
        } catch (error) {
            console.warn('Failed to save feedback config:', error);
            // Even if DB fails, local storage works for the session
            setHasUnsavedChanges(false);
        }
    }, [config, projectId]);

    // Apply Dark Mode effect
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

    // Apply Theme Color and Hover Side Effect
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const color = enforcedConfig.themeColor;
        document.documentElement.style.setProperty('--feedback-primary', color);

        const adjustColor = (hex: string, percent: number) => {
            const num = parseInt(hex.replace('#', ''), 16);
            const amt = Math.round(2.55 * percent);
            const R = (num >> 16) + amt;
            const G = (num >> 8 & 0x00FF) + amt;
            const B = (num & 0x0000FF) + amt;
            return '#' + (0x1000000 + 
                (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 + 
                (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 + 
                (B < 255 ? (B < 1 ? 0 : B) : 255)
            ).toString(16).slice(1);
        };

        const hoverColor = config.darkMode ? adjustColor(color, 20) : adjustColor(color, -20);
        document.documentElement.style.setProperty('--feedback-primary-hover', hoverColor);

    }, [enforcedConfig.themeColor, config.darkMode]);

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
        activeProjectId: projectId
    };
}
