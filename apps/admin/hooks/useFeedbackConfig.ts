import { useState, useEffect } from 'react';

export type AdapterId = 'console' | 'local' | 'supabase';

export interface FeedbackConfigState {
    adapterId: AdapterId;
    darkMode: boolean;
    supabaseUrl: string;
    supabaseKey: string;
}

const DEFAULT_CONFIG: FeedbackConfigState = {
    adapterId: 'console',
    darkMode: false,
    supabaseUrl: '',
    supabaseKey: '',
};

const STORAGE_KEY = 'bernstein_demo_config';

export function useFeedbackConfig() {
    const [config, setConfig] = useState<FeedbackConfigState>(() => {
        // Load from localStorage on mount
        if (typeof window !== 'undefined') {
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
                }
            } catch (e) {
                console.warn('Failed to load config', e);
            }
        }
        return DEFAULT_CONFIG;
    });

    // Persist to localStorage whenever config changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        }
    }, [config]);

    // Apply Dark Mode Side Effect
    useEffect(() => {
        if (typeof document !== 'undefined') {
            const html = document.documentElement;
            if (config.darkMode) {
                html.setAttribute('data-theme', 'dark');
                html.classList.add('dark');
            } else {
                html.removeAttribute('data-theme');
                html.classList.remove('dark');
            }
        }
    }, [config.darkMode]);

    const updateSetting = <K extends keyof FeedbackConfigState>(key: K, value: FeedbackConfigState[K]) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    return { config, updateSetting };
}
