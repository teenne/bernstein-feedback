import { useState, useEffect, useCallback } from 'react';
import { fetchFeedbackStats, fetchUserProjectIds, fetchProjects, fetchProjectUsage, fetchLoopHealth, updateProjectPlan, type LoopHealthData } from '../lib/feedbackApi';
import { useAuth } from '../hooks/useAuth';
import { useFeedback } from 'akk-feedback';
import { LayoutWrapper } from '../components/LayoutWrapper';
import { GlassCard } from '../components/GlassCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { TYPE_CONFIG, SEVERITY_CONFIG } from '../lib/constants';
import type { Stats, UsageData } from '../lib/types';

export function StatsPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [userProjects, setUserProjects] = useState<string[]>([]);
    const [selectedProject, setSelectedProject] = useState('');
    const [usage, setUsage] = useState<UsageData | null>(null);
    const [health, setHealth] = useState<LoopHealthData | null>(null);
    const [upgrading, setUpgrading] = useState(false);
    const [upgradeError, setUpgradeError] = useState<string | null>(null);

    const { isAdmin } = useAuth();
    const { lastReportId } = useFeedback();

    // Refresh usage after feedback submission
    const refreshUsage = useCallback(async (projectId: string) => {
        try {
            const usageData = await fetchProjectUsage(projectId);
            setUsage(usageData);
        } catch {
            // Non-critical
        }
    }, []);

    useEffect(() => {
        if (!lastReportId) return;
        const targetProject = selectedProject || userProjects[0];
        if (targetProject) refreshUsage(targetProject);
    }, [lastReportId, selectedProject, userProjects, refreshUsage]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError('');
            try {
                // Fetch projects and stats together
                const [projectIds, data] = await Promise.all([
                    isAdmin
                        ? fetchProjects().then((p: any[]) => p.map((x: any) => x.id))
                        : fetchUserProjectIds(),
                    fetchFeedbackStats(selectedProject || undefined),
                ]);
                setUserProjects(projectIds);
                setStats(data);

                // Fetch usage for selected project (or first project)
                const targetProject = selectedProject || projectIds[0];
                if (targetProject) {
                    try {
                        const usageData = await fetchProjectUsage(targetProject);
                        setUsage(usageData);
                    } catch {
                        // Usage fetch is non-critical
                    }
                }

                // Fetch loop-health in parallel — non-critical, never blocks the page.
                // Use the selected project scope, or null for "all projects" view.
                try {
                    const healthData = await fetchLoopHealth(selectedProject || null);
                    setHealth(healthData);
                } catch {
                    // Non-critical — card is hidden if data fails
                    setHealth(null);
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load stats');
            }
            setLoading(false);
        })();
    }, [selectedProject, isAdmin]);

    if (loading) return <LoadingSpinner message="Loading stats..." />;
    if (error) return <ErrorMessage message={error} />;

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
                                <p className={`text-3xl font-bold mt-1 ${cfg.textColor}`}>{count}</p>
                            </GlassCard>
                        );
                    })}
                </div>

                {/* Upgrade banner — shown when the selected project has hit
                    its monthly limit. Spec calls for both an email AND an
                    in-dashboard prompt; the email is queued by the trigger,
                    this card is the dashboard side. */}
                {usage && usage.percentage_used >= 100 && usage.plan !== 'paid' && usage.plan !== 'pro' && (() => {
                    const targetProject = selectedProject || userProjects[0];
                    const onUpgrade = async () => {
                        if (!targetProject) return;
                        setUpgradeError(null);
                        setUpgrading(true);
                        try {
                            await updateProjectPlan(targetProject, 'paid');
                            const refreshed = await fetchProjectUsage(targetProject);
                            setUsage(refreshed);
                        } catch (err) {
                            setUpgradeError(err instanceof Error ? err.message : 'Upgrade failed');
                        } finally {
                            setUpgrading(false);
                        }
                    };
                    return (
                        <GlassCard className="!p-5 border-2 border-red-300 dark:border-red-500/40 bg-red-50/50 dark:bg-red-500/5">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div>
                                    <p className="text-sm font-bold text-red-700 dark:text-red-400">
                                        Monthly feedback limit reached
                                    </p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                        New submissions are paused for {targetProject}. Users see a limit
                                        notice in the widget. Upgrade to resume collection.
                                    </p>
                                    {upgradeError && (
                                        <p className="text-xs text-red-600 dark:text-red-400 mt-2">{upgradeError}</p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={onUpgrade}
                                    disabled={upgrading || !targetProject}
                                    className="shrink-0 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-sm font-bold rounded-lg shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                                >
                                    {upgrading ? 'Upgrading…' : 'Upgrade to Paid'}
                                </button>
                            </div>
                        </GlassCard>
                    );
                })()}

                {/* Usage Meter */}
                {usage && (
                    <GlassCard className="!p-5">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Monthly Usage</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{usage.month}</p>
                            </div>
                            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                                usage.plan === 'paid' || usage.plan === 'pro'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                                    : 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400'
                            }`}>
                                {usage.plan === 'paid' || usage.plan === 'pro' ? 'Paid' : 'Free'} Plan
                            </span>
                        </div>
                        <div className="flex items-end gap-3 mb-2">
                            <span className="text-2xl font-bold text-gray-900 dark:text-white">{usage.tickets_used}</span>
                            <span className="text-sm text-gray-400 dark:text-gray-500 mb-0.5">/ {usage.tickets_limit} tickets</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    usage.percentage_used >= 90
                                        ? 'bg-red-500'
                                        : usage.percentage_used >= 70
                                            ? 'bg-amber-500'
                                            : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(usage.percentage_used, 100)}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-1.5">
                            <span className="text-xs text-gray-400">{usage.percentage_used}% used</span>
                            {usage.percentage_used >= 80 && (
                                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                    {usage.percentage_used >= 100 ? 'Limit reached' : 'Approaching limit'}
                                </span>
                            )}
                        </div>
                    </GlassCard>
                )}

                {/* P4: Feedback Loop Health — three traffic-light metrics that surface
                    the spec's "developer accountability to the feedback loop" signal.
                    Amber / red overall status triggers a nudge to close tickets. */}
                {health && (
                    <GlassCard title="Feedback Loop Health">
                        <LoopHealthCard data={health} />
                    </GlassCard>
                )}

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
                                                <span className={`font-medium ${cfg.textColor}`}>{cfg.label}</span>
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

// ====================================================================
// Loop Health card (P4)
// ====================================================================

type HealthStatus = 'green' | 'amber' | 'red' | 'unknown';

const STATUS_STYLE: Record<HealthStatus, { dot: string; text: string; bg: string; label: string }> = {
    green:   { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', label: 'Healthy' },
    amber:   { dot: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-500/10',   label: 'Needs attention' },
    red:     { dot: 'bg-red-500',     text: 'text-red-600 dark:text-red-400',       bg: 'bg-red-50 dark:bg-red-500/10',       label: 'Loop is broken' },
    unknown: { dot: 'bg-gray-300',    text: 'text-gray-400',                         bg: 'bg-gray-50 dark:bg-white/5',         label: 'No data yet' },
};

function formatHours(h: number | null): string {
    if (h == null) return '—';
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h < 48) return `${Math.round(h)}h`;
    return `${Math.round(h / 24)}d`;
}

function formatPercent(p: number | null): string {
    if (p == null) return '—';
    return `${Math.round(p)}%`;
}

function LoopHealthCard({ data }: { data: LoopHealthData }) {
    const { metrics, status, counts } = data;
    const overall = STATUS_STYLE[status.overall];

    // Nudge copy comes from the spec: when return_rate or pct_closed_14d
    // dips, close a few tickets to rebuild engagement.
    const showNudge = status.overall === 'amber' || status.overall === 'red';

    return (
        <div className="space-y-4">
            {/* Overall status strip */}
            <div className={`flex items-center justify-between px-4 py-3 rounded-lg ${overall.bg}`}>
                <div className="flex items-center gap-3">
                    <span className={`inline-block w-3 h-3 rounded-full ${overall.dot}`} />
                    <span className={`text-sm font-semibold ${overall.text}`}>{overall.label}</span>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                    Last 30 days · {counts.total_30d} submission{counts.total_30d === 1 ? '' : 's'}
                </span>
            </div>

            {/* Three metric tiles */}
            <div className="grid md:grid-cols-3 gap-3">
                <MetricTile
                    label="Avg resolution time"
                    value={formatHours(metrics.avg_resolution_hours)}
                    hint={`${counts.resolved_30d} resolved in 30d`}
                    status={status.avg_resolution}
                />
                <MetricTile
                    label="Resolved in 14 days"
                    value={formatPercent(metrics.pct_closed_14d)}
                    hint="of last 30 days"
                    status={status.pct_closed_14d}
                />
                <MetricTile
                    label="Return rate"
                    value={formatPercent(metrics.return_rate)}
                    hint={`${counts.returning_submitters_90d} / ${counts.unique_submitters_90d} returning`}
                    status={status.return_rate}
                />
            </div>

            {/* Amber/red nudge — the spec calls this out as the
                "developer accountability" moment. */}
            {showNudge && (
                <div className={`px-4 py-3 rounded-lg border ${
                    status.overall === 'red'
                        ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30'
                        : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
                }`}>
                    <p className={`text-sm font-semibold ${
                        status.overall === 'red'
                            ? 'text-red-700 dark:text-red-300'
                            : 'text-amber-700 dark:text-amber-300'
                    }`}>
                        Close a few tickets to rebuild engagement.
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Users come back when they see their submissions acted on.
                        Resolving open tickets (and adding resolution notes) brings
                        users back into the loop.
                    </p>
                </div>
            )}
        </div>
    );
}

function MetricTile({
    label, value, hint, status,
}: {
    label: string;
    value: string;
    hint: string;
    status: HealthStatus;
}) {
    const s = STATUS_STYLE[status];
    return (
        <div className="p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-white/50 dark:bg-white/[0.02]">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
                <span className={`inline-block w-2 h-2 rounded-full ${s.dot}`} title={s.label} />
            </div>
            <p className={`text-2xl font-bold mt-1.5 ${status === 'unknown' ? 'text-gray-300 dark:text-gray-600' : 'text-gray-900 dark:text-white'}`}>
                {value}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>
        </div>
    );
}
