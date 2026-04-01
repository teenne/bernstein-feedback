import { useState, useMemo } from 'react';
import { FeedbackProvider, FeedbackButton, FeedbackDialog, FeedbackToast, FeedbackErrorBoundary, useFeedbackConfig } from '../src';
import type { FeedbackAdapter } from '../src';
import { supabaseAdapter, localStorageAdapter } from '../src/adapters';
import { DemoApp } from './pages/DemoApp';
import { SettingsPage } from './pages/SettingsPage';
import AuthGateway from './admin/AuthGateway';



export default function App() {
    const { config, rawConfig, isPro, loading, updateSetting, saveSettings, hasUnsavedChanges, checkSubscription } = useFeedbackConfig();

    const [view, setView] = useState<'demo' | 'settings' | 'admin'>('demo');

    // Derive the adapter from the ENFORCED config
    const adapter = useMemo<FeedbackAdapter>(() => {
        if (config.adapterId === 'supabase') {
            return supabaseAdapter({
                supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
                supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY
            });
        }
        if (config.adapterId === 'console') {
            return {
                async submit(event) {
                    console.log('[Console Adapter]', JSON.stringify(event, null, 2));
                    return { success: true, id: `console-${Date.now()}` };
                },
            };
        }
        return localStorageAdapter();
    }, [config.adapterId]);

    return (
        // The Safety Net: Catch widget crashes before they break the app
        <FeedbackErrorBoundary>
            {/* FeedbackProvider gets the ENFORCED config */}
            <FeedbackProvider config={{ ...config, projectId: 'demo-app', adapter }}>
                <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200 font-sans">
                    {view !== 'admin' && (
                        <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-white/70 dark:bg-gray-950/70 border-b border-gray-200/50 dark:border-gray-800/50">
                            <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <img src="/assets/Logo.png" alt="Bernstein" className="h-8" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    <span className="text-lg font-bold tracking-tight">
                                        BERNSTE<span className="lowercase">i</span>N
                                    </span>
                                </div>
                                <nav className="flex items-center gap-1">
                                    <button
                                        onClick={() => {
                                            setView('demo');
                                            checkSubscription();
                                        }}
                                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${view === 'demo' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'}`}
                                    >
                                        Demo
                                    </button>
                                    <button
                                        onClick={() => {
                                            setView('settings');
                                            checkSubscription();
                                        }}
                                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${view === 'settings' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'}`}
                                    >
                                        Settings
                                    </button>
                                </nav>
                                <button
                                    onClick={() => setView('admin')}
                                    className="ml-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
                                >
                                    Admin Portal
                                </button>
                            </div>
                        </header>
                    )}

                    {view === 'admin' ? (
                        <div className="w-full">
                            <AuthGateway />
                        </div>
                    ) : (
                        <main className="max-w-5xl mx-auto px-4 py-8">
                            {view === 'demo' ? (
                                <DemoApp />
                            ) : (
                                <SettingsPage
                                    config={rawConfig}
                                    isPro={isPro}
                                    loading={loading}
                                    updateSetting={updateSetting}
                                    saveSettings={saveSettings}
                                    hasUnsavedChanges={hasUnsavedChanges}
                                />
                            )}
                        </main>
                    )}

                    {/* Floating feedback button */}
                    <div className={view === 'admin' ? 'hidden' : ''}>
                        <FeedbackButton />
                        <FeedbackDialog />
                        <FeedbackToast />
                    </div>
                </div>
            </FeedbackProvider>
        </FeedbackErrorBoundary>
    );
}
