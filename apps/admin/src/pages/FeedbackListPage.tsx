import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchFeedbackList, fetchUserProjectIds, fetchProjects } from '../lib/feedbackApi';
import { useAuth } from '../hooks/useAuth';
import { LayoutWrapper } from '../components/LayoutWrapper';
import { GlassCard } from '../components/GlassCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { STATUS_CONFIG, TYPE_CONFIG, SEVERITY_CONFIG } from '../lib/constants';
import type { FeedbackItem } from '../lib/types';

export function FeedbackListPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [userProjects, setUserProjects] = useState<string[]>([]);

    const typeFilter = searchParams.get('type') || '';
    const projectFilter = searchParams.get('project_id') || '';
    const statusFilter = searchParams.get('status') || '';

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
                    status: statusFilter || undefined,
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
    }, [typeFilter, projectFilter, statusFilter]);

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
                    <select
                        value={statusFilter}
                        onChange={e => setFilter('status', e.target.value)}
                        className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-xl bg-white/80 dark:bg-white/5 backdrop-blur-md text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                    >
                        <option value="">All Status</option>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>

                {error && <ErrorMessage message={error} />}
                {loading && <LoadingSpinner message="Loading feedback..." />}

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
                                    <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Submitted By</th>
                                    <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Status</th>
                                    <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Project</th>
                                    <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(item => {
                                    const typeConfig = TYPE_CONFIG[item.type] || { label: item.type, color: 'bg-gray-100 text-gray-600', darkColor: '', icon: '' };
                                    const sevConfig = item.severity ? SEVERITY_CONFIG[item.severity] : null;

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
                                                {item.email ? (
                                                    <span className="text-xs text-gray-600 dark:text-gray-300">{item.email}</span>
                                                ) : item.user_id ? (
                                                    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{item.user_id.slice(0, 12)}...</span>
                                                ) : (
                                                    <span className="text-gray-300 dark:text-gray-600">Anonymous</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {(() => {
                                                    const sc = STATUS_CONFIG[item.status || 'open'] || STATUS_CONFIG.open;
                                                    return (
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${sc.color} ${sc.darkColor}`}>
                                                            {sc.label}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded">{item.project_id}</span>
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
