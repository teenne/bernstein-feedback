import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { FeedbackProvider } from './context';
import { FeedbackButton } from './components/FeedbackButton';
import { FeedbackToast } from './components/FeedbackToast';
import styles from './styles.css?inline';

const FeedbackDialog = lazy(() => import('./components/FeedbackDialog').then(m => ({ default: m.FeedbackDialog })));

import { localStorageAdapter, consoleAdapter, supabaseAdapter } from './adapters';

// The auto-init script
const initBernsteinWidget = () => {
    // Prevent double initialization
    if (document.getElementById('bernstein-widget-root')) return;

    // Inject styles automatically
    if (!document.getElementById('bernstein-widget-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'bernstein-widget-styles';
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
    }

    // Find the script tag that loaded this script to get data attributes
    const currentScript = document.currentScript as HTMLScriptElement;
    
    // Default config fallback
    let projectId = 'demo-app';
    let darkMode = false;
    let _adapterId: string | null = null;
    let supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    let supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

    if (currentScript) {
        projectId = currentScript.getAttribute('data-project-id') || projectId;
        _adapterId = currentScript.getAttribute('data-adapter-id');
        darkMode = currentScript.hasAttribute('data-dark-mode');
        supabaseUrl = currentScript.getAttribute('data-supabase-url') || supabaseUrl;
        supabaseKey = currentScript.getAttribute('data-supabase-key') || supabaseKey;
    }

    // Apply dark mode immediately
    if (darkMode) {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Initialize the chosen adapter
    let adapter;
    if (_adapterId === 'local') {
        adapter = localStorageAdapter();
    } else if (_adapterId === 'console') {
        adapter = consoleAdapter();
    } else {
        adapter = supabaseAdapter({ supabaseUrl, supabaseKey });
    }

    const container = document.createElement('div');
    container.id = 'bernstein-widget-root';
    
    // Use Shadow DOM to prevent style leakage
    const shadow = container.attachShadow({ mode: 'open' });
    
    // Inject styles into shadow root
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    shadow.appendChild(styleEl);

    // Host element for React
    const host = document.createElement('div');
    host.id = 'bernstein-widget-host';
    shadow.appendChild(host);
    
    document.body.appendChild(container);

    const root = createRoot(host);
    
    root.render(
        <React.StrictMode>
            <FeedbackProvider config={{ projectId, adapter }}>
                <FeedbackButton />
                <Suspense fallback={null}>
                    <FeedbackDialog portalContainer={host} />
                </Suspense>
                <FeedbackToast />
            </FeedbackProvider>
        </React.StrictMode>
    );
};

// Auto-initialize if document is ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // Small timeout to ensure everything else is loaded
    setTimeout(initBernsteinWidget, 0);
} else {
    document.addEventListener('DOMContentLoaded', initBernsteinWidget);
}

// Export for manual initialization if needed (e.g. window.BernsteinFeedback.init())
(window as any).BernsteinFeedback = {
    init: initBernsteinWidget
};
