import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSubscription } from './useSubscription';
import { API_URL, useSupabaseDirectly, apiFetch } from '../lib/config';

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

const hasSupabaseEnv = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

const DEFAULT_CONFIG: FeedbackConfigState = {
    adapterId: hasSupabaseEnv ? 'supabase' : 'local',
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

function loadFromStorage(pid: string): FeedbackConfigState {
    try {
        const saved = localStorage.getItem(`${STORAGE_KEY}_${pid}`);
        // Always start from DEFAULT_CONFIG — never blend a previous project's values
        if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    } catch {
        // corrupted entry — fall through
    }
    return { ...DEFAULT_CONFIG };
}

export function useFeedbackConfig(initialProjectId: string = 'demo-app') {
    const [projectId, setProjectId] = useState(initialProjectId);
    const [config, setConfig] = useState<FeedbackConfigState>(() => loadFromStorage(initialProjectId));
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const { isPro, loading, checkSubscription } = useSubscription(projectId);

    // When the active project changes, do a full config reset then fetch from server
    useEffect(() => {
        if (initialProjectId === projectId) return;
        setProjectId(initialProjectId);
        setHasUnsavedChanges(false);
        // Reset to a clean slate for the new project — no bleed from previous project
        setConfig(loadFromStorage(initialProjectId));
    }, [initialProjectId]);

    // fetchManagedConfig: load project config from server (Supabase direct or Node API)
    // and merge it over the localStorage baseline so the server is always authoritative.
    const fetchManagedConfig = useCallback(async (pid: string) => {
        try {
            if (useSupabaseDirectly && supabase) {
                // Supabase-direct mode
                const { data, error } = await supabase
                    .from('projects')
                    .select('config')
                    .eq('id', pid)
                    .maybeSingle();
                if (error) throw error;
                if (data?.config) {
                    setConfig({ ...DEFAULT_CONFIG, ...data.config });
                    // Persist server values to localStorage so they survive a reload
                    localStorage.setItem(`${STORAGE_KEY}_${pid}`, JSON.stringify(data.config));
                }
            } else {
                // Node server mode
                const json = await apiFetch(`${API_URL}/api/projects/${pid}`);
                if (json.data?.config) {
                    setConfig({ ...DEFAULT_CONFIG, ...json.data.config });
                    localStorage.setItem(`${STORAGE_KEY}_${pid}`, JSON.stringify(json.data.config));
                }
            }
        } catch (err) {
            console.warn(`[useFeedbackConfig] failed to load config for ${pid}:`, err);
        }
    }, []);

    const enforcedConfig = useMemo(() => config, [config]);

    const updateSetting = useCallback(<K extends keyof FeedbackConfigState>(key: K, value: FeedbackConfigState[K]) => {
        setConfig(prev => {
            setHasUnsavedChanges(true);
            return { ...prev, [key]: value };
        });
    }, []);

    // saveSettings: persists to localStorage + server (Supabase or Node)
    const saveSettings = useCallback(async (targetProjectId?: string) => {
        const pid = targetProjectId || projectId;
        if (typeof window === 'undefined' || !pid) return;
        try {
            // Always write localStorage first — instant, works offline
            localStorage.setItem(`${STORAGE_KEY}_${pid}`, JSON.stringify(config));

            if (useSupabaseDirectly && supabase) {
                // Supabase-direct mode
                const { error } = await supabase
                    .from('projects')
                    .update({ config } as any)
                    .eq('id', pid);
                if (error) throw error;
            } else {
                // Node server mode — PATCH projects.config
                await apiFetch(`${API_URL}/api/projects/${pid}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ config }),
                });
            }

            setHasUnsavedChanges(false);
        } catch (error) {
            console.warn('[useFeedbackConfig] failed to save config:', error);
            setHasUnsavedChanges(false);
        }
    }, [config, projectId]);

    // Apply Dark Mode to <html>
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

    // Apply Theme Color CSS variable
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
