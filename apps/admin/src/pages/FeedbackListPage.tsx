import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchFeedbackList, fetchUserProjectIds, fetchProjects } from '../lib/feedbackApi';
import { useAuth } from '../hooks/useAuth';
import { LayoutWrapper } from '../components/LayoutWrapper';
import { GlassCard } from '../components/GlassCard';
// GlassCard used for empty state and table wrapper

interface FeedbackItem {
    id: string;
    project_id: string;
    type: string;
    title: string;
    description: string;
    severity: string | null;
    impact: string | null;
    screen_id: string | null;
    user_id: string | null;
    screenshots: string | string[] | null;
    created_at: string;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; darkColor: string; icon: string }> = {
    feedback: {
        label: 'Feedback',
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        darkColor: 'dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
        icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    },
    bug_report: {
        label: 'Bug',
        color: 'bg-red-50 text-red-700 border-red-200',
        darkColor: 'dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
        icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    },
    feature_request: {
        label: 'Feature',
        color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        darkColor: 'dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
        icon: 'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18',
    },
};

const SEVERITY_CONFIG: Record<string, { color: string; darkColor: string }> = {
    critical: { color: 'bg-red-100 text-red-800', darkColor: 'dark:bg-red-500/10 dark:text-red-400' },
    high: { color: 'bg-orange-100 text-orange-800', darkColor: 'dark:bg-orange-500/10 dark:text-orange-400' },
    medium: { color: 'bg-yellow-100 text-yellow-800', darkColor: 'dark:bg-yellow-500/10 dark:text-yellow-400' },
    low: { color: 'bg-gray-100 text-gray-600', darkColor: 'dark:bg-gray-500/10 dark:text-gray-400' },
};

export function FeedbackListPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [userProjects, setUserProjects] = useState<string[]>([]);

    const typeFilter = searchParams.get('type') || '';
    const projectFilter = searchParams.get('project_id') || '';

    const { isAdmin } = useAuth();

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            // Fetch projects and feedback together to avoid race conditions
            const [projectIds, data] = await Promise.all([
                isAdmin
                    ? fetchProjects().then((p: any[]) => p.map((x: any) => x.id))
                    : fetchUserProjectIds(),
                fetchFeedbackList({
                    type: typeFilter || undefined,
                    project_id: projectFilter || undefined,
                    limit: 100,
                }),
            ]);

            setItems(data);

            // Merge project IDs from both sources
            const all = new Set<string>(projectIds);
            for (const d of data as FeedbackItem[]) {
                if (d.project_id) all.add(d.project_id);
            }
            setUserProjects([...all]);
        } catch (err: any) {
            setError(err.message || 'Failed to load feedback');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, [typeFilter, projectFilter]);

    const setFilter = (key: string, value: string) => {
        const next = new URLSearchParams(searchParams);
        if (value) next.set(key, value);
        else next.delete(key);
        setSearchParams(next);
    };

    const timeAgo = (date: string) => {
        const diff = Date.now() - new Date(date).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    };

    return (
        <LayoutWrapper>
            <div className="max-w-6xl mx-auto w-full space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Feedback</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {items.length} item{items.length !== 1 ? 's' : ''} collected
                        </p>
                    </div>
                    <button
                        onClick={fetchData}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white/80 dark:bg-white/5 backdrop-blur-md border border-gray-200 dark:border-white/10 rounded-xl hover:bg-white dark:hover:bg-white/10 transition-all shadow-sm"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                        </svg>
                        Refresh
                    </button>
                </div>


                {/* Filters */}
                <div className="flex gap-2">
                    <select
                        value={typeFilter}
                        onChange={e => setFilter('type', e.target.value)}
                        className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-xl bg-white/80 dark:bg-white/5 backdrop-blur-md text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    >
                        <option value="">All Types</option>
                        <option value="feedback">Feedback</option>
                        <option value="bug_report">Bug Report</option>
                        <option value="feature_request">Feature Request</option>
                    </select>
                    <select
                        value={projectFilter}
                        onChange={e => setFilter('project_id', e.target.value)}
                        className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-xl bg-white/80 dark:bg-white/5 backdrop-blur-md text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    >
                        <option value="">All Projects</option>
                        {userProjects.map(pid => (
                            <option key={pid} value={pid}>{pid}</option>
                        ))}
                    </select>
                </div>

                {/* Error */}
                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-sm flex items-center gap-2">
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                        {error}
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="h-10 w-10 border-2 border-amber-500 rounded-full border-t-transparent animate-spin mb-4" />
                        <p className="text-sm text-gray-400">Loading feedback...</p>
                    </div>
                )}

                {/* Empty State */}
                {!loading && items.length === 0 && !error && (
                    <GlassCard className="!py-16">
                        <div className="flex flex-col items-center justify-center text-center">
                            <div className="h-16 w-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">No feedback yet</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                                Feedback will appear here once users start submitting through the widget.
                            </p>
                        </div>
                    </GlassCard>
                )}

                {/* Feedback Table */}
                {!loading && items.length > 0 && (
                    <GlassCard className="!p-0 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02]">
                                    <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Type</th>
                                    <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Title</th>
                                    <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Project</th>
                                    <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Severity</th>
                                    <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Files</th>
                                    <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(item => {
                                    const typeConfig = TYPE_CONFIG[item.type] || { label: item.type, color: 'bg-gray-100 text-gray-600', darkColor: '', icon: '' };
                                    const sevConfig = item.severity ? SEVERITY_CONFIG[item.severity] : null;
                                    const screenshots = parseScreenshots(item.screenshots);

                                    return (
                                        <tr
                                            key={item.id}
                                            onClick={() => navigate(`/feedback/${item.id}`)}
                                            className="border-b border-gray-100 dark:border-white/5 last:border-0 hover:bg-amber-50/50 dark:hover:bg-amber-500/5 cursor-pointer transition-colors"
                                        >
                                            <td className="px-5 py-3.5">
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${typeConfig.color} ${typeConfig.darkColor}`}>
                                                    {typeConfig.label}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <p className="font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                                                {item.description && (
                                                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5 truncate max-w-md">{item.description}</p>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded">{item.project_id}</span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {sevConfig ? (
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${sevConfig.color} ${sevConfig.darkColor}`}>
                                                        {item.severity}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300 dark:text-gray-600">&mdash;</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {screenshots.length > 0 ? (
                                                    <span className="inline-flex items-center gap-1 text-xs text-blue-500 dark:text-blue-400">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 6.75v11.25c0 1.242 1.008 2.25 2.25 2.25z" />
                                                        </svg>
                                                        {screenshots.length}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300 dark:text-gray-600">&mdash;</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5 text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap">
                                                {timeAgo(item.created_at)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </GlassCard>
                )}
            </div>
        </LayoutWrapper>
    );
}

function parseScreenshots(screenshots: string | string[] | null): string[] {
    if (!screenshots) return [];
    if (Array.isArray(screenshots)) return screenshots;
    try {
        const parsed = JSON.parse(screenshots);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}
