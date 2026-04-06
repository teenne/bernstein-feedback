import { useState, useEffect } from 'react';
import { fetchFeedbackStats, fetchUserProjectIds } from '../lib/feedbackApi';
import { LayoutWrapper } from '../components/LayoutWrapper';
import { GlassCard } from '../components/GlassCard';

interface Stats {
    total: number;
    by_type: Record<string, number>;
    by_severity: Record<string, number>;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bgColor: string; darkBg: string }> = {
    feedback: { label: 'Feedback', color: 'text-blue-500', bgColor: 'bg-blue-500', darkBg: 'bg-blue-500/10' },
    bug_report: { label: 'Bug Reports', color: 'text-red-500', bgColor: 'bg-red-500', darkBg: 'bg-red-500/10' },
    feature_request: { label: 'Feature Requests', color: 'text-emerald-500', bgColor: 'bg-emerald-500', darkBg: 'bg-emerald-500/10' },
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bgColor: string; darkBg: string }> = {
    critical: { label: 'Critical', color: 'text-red-600', bgColor: 'bg-red-600', darkBg: 'bg-red-500/10' },
    high: { label: 'High', color: 'text-orange-500', bgColor: 'bg-orange-500', darkBg: 'bg-orange-500/10' },
    medium: { label: 'Medium', color: 'text-yellow-500', bgColor: 'bg-yellow-500', darkBg: 'bg-yellow-500/10' },
    low: { label: 'Low', color: 'text-gray-400', bgColor: 'bg-gray-400', darkBg: 'bg-gray-500/10' },
};

export function StatsPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [userProjects, setUserProjects] = useState<string[]>([]);
    const [selectedProject, setSelectedProject] = useState('');

    useEffect(() => {
        (async () => {
            const ids = await fetchUserProjectIds();
            setUserProjects(ids);
        })();
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError('');
            try {
                const data = await fetchFeedbackStats(selectedProject || undefined);
                setStats(data);
            } catch (err: any) {
                setError(err.message || 'Failed to load stats');
            }
            setLoading(false);
        })();
    }, [selectedProject]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="h-10 w-10 border-2 border-amber-500 rounded-full border-t-transparent animate-spin mb-4" />
                <p className="text-sm text-gray-400">Loading stats...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-sm flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {error}
            </div>
        );
    }

    if (!stats) return null;

    const maxTypeCount = Math.max(...Object.values(stats.by_type), 1);
    const maxSevCount = Math.max(...Object.values(stats.by_severity), 1);

    return (
        <LayoutWrapper>
            <div className="max-w-6xl mx-auto w-full space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Analytics</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Overview of feedback activity</p>
                    </div>
                    <select
                        value={selectedProject}
                        onChange={e => setSelectedProject(e.target.value)}
                        className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-xl bg-white/80 dark:bg-white/5 backdrop-blur-md text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    >
                        <option value="">All Projects</option>
                        {userProjects.map(pid => (
                            <option key={pid} value={pid}>{pid}</option>
                        ))}
                    </select>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <GlassCard className="!p-5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.total}</p>
                    </GlassCard>
                    {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
                        const count = stats.by_type[key] || 0;
                        return (
                            <GlassCard key={key} className="!p-5 relative overflow-hidden">
                                <div className={`absolute top-0 right-0 w-20 h-20 ${cfg.darkBg} rounded-full -translate-y-1/2 translate-x-1/2`} />
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{cfg.label}</p>
                                <p className={`text-3xl font-bold mt-1 ${cfg.color}`}>{count}</p>
                            </GlassCard>
                        );
                    })}
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {/* By Type */}
                    <GlassCard title="By Type">
                        {Object.keys(stats.by_type).length === 0 ? (
                            <div className="flex flex-col items-center py-8">
                                <div className="h-12 w-12 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-3">
                                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                                    </svg>
                                </div>
                                <p className="text-sm text-gray-400">No data yet</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {Object.entries(stats.by_type).map(([type, count]) => {
                                    const cfg = TYPE_CONFIG[type] || { label: type, bgColor: 'bg-gray-500', color: 'text-gray-500' };
                                    const pct = Math.round((count / maxTypeCount) * 100);
                                    return (
                                        <div key={type}>
                                            <div className="flex justify-between text-sm mb-1.5">
                                                <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                                                <span className="font-bold text-gray-900 dark:text-white">{count}</span>
                                            </div>
                                            <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${cfg.bgColor} transition-all duration-500`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </GlassCard>

                    {/* By Severity */}
                    <GlassCard title="By Severity">
                        {Object.keys(stats.by_severity).length === 0 ? (
                            <div className="flex flex-col items-center py-8">
                                <div className="h-12 w-12 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-3">
                                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                    </svg>
                                </div>
                                <p className="text-sm text-gray-400">No severity data yet</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {Object.entries(stats.by_severity).map(([sev, count]) => {
                                    const cfg = SEVERITY_CONFIG[sev] || { label: sev, bgColor: 'bg-gray-500', color: 'text-gray-500' };
                                    const pct = Math.round((count / maxSevCount) * 100);
                                    return (
                                        <div key={sev}>
                                            <div className="flex justify-between text-sm mb-1.5">
                                                <span className={`font-medium capitalize ${cfg.color}`}>{cfg.label}</span>
                                                <span className="font-bold text-gray-900 dark:text-white">{count}</span>
                                            </div>
                                            <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${cfg.bgColor} transition-all duration-500`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </GlassCard>
                </div>
            </div>
        </LayoutWrapper>
    );
}
