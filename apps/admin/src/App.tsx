import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { FeedbackProvider, FeedbackButton, FeedbackDialog, FeedbackToast, FeedbackErrorBoundary } from '@bernstein/feedback';
import { supabaseAdapter, consoleAdapter, httpAdapter } from '@bernstein/feedback/adapters';
import '@bernstein/feedback/styles.css';

import { useFeedbackConfig } from './hooks/useFeedbackConfig';
import { useAuth } from './hooks/useAuth';
import { supabase } from './lib/supabaseClient';
import { fetchUserProjectIds } from './lib/feedbackApi';

// Lazy loaded pages
const FeedbackListPage = lazy(() => import('./pages/FeedbackListPage').then(m => ({ default: m.FeedbackListPage })));
const FeedbackDetailPage = lazy(() => import('./pages/FeedbackDetailPage').then(m => ({ default: m.FeedbackDetailPage })));
const StatsPage = lazy(() => import('./pages/StatsPage').then(m => ({ default: m.StatsPage })));
const DemoPage = lazy(() => import('./pages/DemoPage').then(m => ({ default: m.DemoApp })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));

// Lazy loaded auth
const AuthGateway = lazy(() => import('./auth/AuthGateway'));
const LocalLoginPage = lazy(() => import('./auth/LocalLoginPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));

const hasSupabase = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// Loading spinner
function PageLoader() {
    return (
        <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-2 border-amber-500 rounded-full border-t-transparent animate-spin" />
        </div>
    );
}

export default function App() {
    const [localAuthed, setLocalAuthed] = useState(() => sessionStorage.getItem('feedback_admin_auth') === 'true');
    const [activeProjectId, setActiveProjectId] = useState<string>('feedback-admin');
    const [userProjectIds, setUserProjectIds] = useState<string[]>([]);
    const auth = useAuth();
    const {
        config, rawConfig, isPro, loading,
        updateSetting, saveSettings, hasUnsavedChanges,
    } = useFeedbackConfig();

    // Load user's accessible projects
    useEffect(() => {
        if (!auth.isLoggedIn) return;
        (async () => {
            try {
                const ids = await fetchUserProjectIds();
                setUserProjectIds(ids);
                if (ids.length > 0) setActiveProjectId(ids[0]);
            } catch {}
        })();
    }, [auth.isLoggedIn]);

    // Build adapter based on raw settings
    // Auto-use Supabase adapter when Supabase env vars are configured
    const feedbackAdapter = useMemo(() => {
        const supabaseUrl = rawConfig.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = rawConfig.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY;
        const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

        switch (rawConfig.adapterId) {
            case 'supabase':
                if (supabaseUrl && supabaseKey) {
                    return supabaseAdapter({ supabaseUrl, supabaseKey });
                }
                return httpAdapter({ endpoint: `${apiUrl}/api/feedback` });
            case 'console':
                return consoleAdapter();
            case 'local':
            default:
                return httpAdapter({ endpoint: `${apiUrl}/api/feedback` });
        }
    }, [rawConfig.adapterId, rawConfig.supabaseUrl, rawConfig.supabaseKey]);

    // Auth gate
    const isAuthenticated = hasSupabase ? auth.isLoggedIn : localAuthed;

    if (!isAuthenticated) {
        return (
            <Suspense fallback={<PageLoader />}>
                {hasSupabase
                    ? <AuthGateway />
                    : <LocalLoginPage onLogin={() => setLocalAuthed(true)} />}
            </Suspense>
        );
    }

    // Nav items
    const navItems = [
        { to: '/feedback', label: 'Feedback' },
        { to: '/stats', label: 'Stats' },
        { to: '/demo', label: 'Demo' },
        { to: '/settings', label: 'Settings' },
        ...(auth.isAdmin ? [
            { to: '/admin', label: 'Admin Portal' },
            { to: '/admin/users', label: 'Users' },
        ] : []),
    ];

    const handleSignOut = () => {
        sessionStorage.removeItem('feedback_admin_auth');
        setLocalAuthed(false);
        if (hasSupabase) {
            supabase?.auth.signOut();
        }
    };

    return (
        <FeedbackErrorBoundary>
            <FeedbackProvider config={{ ...config, projectId: activeProjectId, adapter: feedbackAdapter }}>
                <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans">
                    {/* Header */}
                    <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
                            <span className="text-lg font-bold tracking-tight">Feedback Admin</span>
                            <div className="flex items-center gap-3">
                                <nav className="flex items-center gap-1">
                                    {navItems.map(({ to, label }) => (
                                        <NavLink
                                            key={to}
                                            to={to}
                                            className={({ isActive }) =>
                                                `px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${isActive ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100'}`
                                            }
                                        >
                                            {label}
                                        </NavLink>
                                    ))}
                                </nav>
                                {userProjectIds.length > 1 && (
                                    <select
                                        value={activeProjectId}
                                        onChange={(e) => setActiveProjectId(e.target.value)}
                                        className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
                                    >
                                        {userProjectIds.map(id => (
                                            <option key={id} value={id}>{id}</option>
                                        ))}
                                    </select>
                                )}
                                <div className="flex items-center gap-2 pl-3 border-l border-gray-200 dark:border-gray-700">
                                    <span className={`w-2 h-2 rounded-full ${auth.isAdmin ? 'bg-amber-500' : 'bg-green-500'}`} />
                                    <span className="text-xs text-gray-500 hidden md:inline">
                                        {auth.isAdmin ? 'Admin' : auth.email || 'Local'}
                                    </span>
                                    <button
                                        onClick={handleSignOut}
                                        className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-1"
                                    >
                                        Sign out
                                    </button>
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Routes — lazy loaded with Suspense */}
                    <main className="max-w-6xl mx-auto px-4 py-6">
                        <Suspense fallback={<PageLoader />}>
                            <Routes>
                                <Route path="/feedback" element={<FeedbackListPage />} />
                                <Route path="/feedback/:id" element={<FeedbackDetailPage />} />
                                <Route path="/stats" element={<StatsPage />} />
                                <Route path="/demo" element={<DemoPage />} />
                                <Route path="/settings" element={
                                    <SettingsPage
                                        config={rawConfig}
                                        isPro={isPro}
                                        loading={loading}
                                        updateSetting={updateSetting}
                                        saveSettings={saveSettings}
                                        hasUnsavedChanges={hasUnsavedChanges}
                                        isAdmin={auth.isAdmin}
                                        activeProjectId={activeProjectId}
                                    />
                                } />
                                {auth.isAdmin && <Route path="/admin" element={<AuthGateway />} />}
                                {auth.isAdmin && <Route path="/admin/users" element={<UserManagementPage />} />}
                                <Route path="*" element={<Navigate to="/feedback" replace />} />
                            </Routes>
                        </Suspense>
                    </main>

                    <FeedbackButton position="bottom-right" />
                    <FeedbackDialog />
                    <FeedbackToast />
                </div>
            </FeedbackProvider>
        </FeedbackErrorBoundary>
    );
}
