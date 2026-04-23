import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchFeedbackById, updateFeedbackStatus, updateFeedbackTriage, fetchClusterSiblings, fetchClusterDetail, approveClusterFix, type ClusterDetail } from '../lib/feedbackApi';
import { LayoutWrapper } from '../components/LayoutWrapper';
import { GlassCard } from '../components/GlassCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { TYPE_CONFIG } from '../lib/constants';
import type { FeedbackDetail, FeedbackPriority } from '../lib/types';

// Priority visual config — dot color + chip style per level.
const PRIORITY_OPTIONS: { value: FeedbackPriority; label: string; dot: string; chip: string }[] = [
    { value: 'low',    label: 'Low',    dot: 'bg-gray-400',    chip: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300' },
    { value: 'medium', label: 'Medium', dot: 'bg-blue-500',    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
    { value: 'high',   label: 'High',   dot: 'bg-amber-500',   chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
    { value: 'urgent', label: 'Urgent', dot: 'bg-red-500',     chip: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
];

export function FeedbackDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [item, setItem] = useState<FeedbackDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [statusUpdating, setStatusUpdating] = useState(false);
    const [resolutionNote, setResolutionNote] = useState('');
    // P3: triage state. labelDraft is the text in the "Add label" input.
    const [triageUpdating, setTriageUpdating] = useState(false);
    const [labelDraft, setLabelDraft] = useState('');
    // Tier 2: sibling tickets in the same cluster. Fetched after the
    // main feedback loads; hidden if empty.
    const [clusterSiblings, setClusterSiblings] = useState<Array<{
        id: string; title: string; email: string | null; user_id: string | null;
        created_at: string; status: string | null;
    }>>([]);
    // Auto-resolvable fix — populated only when this feedback belongs to
    // a cluster that either has `is_auto_resolvable=true` or already has
    // an agent-proposed diff attached.
    const [cluster, setCluster] = useState<ClusterDetail | null>(null);
    const [approvingFix, setApprovingFix] = useState(false);

    const handleApproveFix = async () => {
        if (!cluster || approvingFix) return;
        if (!confirm('Approve this fix and resolve every reporter in the cluster?')) return;
        setApprovingFix(true);
        try {
            await approveClusterFix(cluster.id);
            setItem(prev => prev ? { ...prev, status: 'resolved', resolved_at: new Date().toISOString() } : null);
            setCluster(prev => prev ? { ...prev, resolved_at: new Date().toISOString() } : null);
        } catch (err: any) {
            setError(err.message || 'Failed to approve fix');
        }
        setApprovingFix(false);
    };

    const handlePriorityChange = async (newPriority: FeedbackPriority | null) => {
        if (!item || triageUpdating) return;
        // Toggle: clicking the active priority clears it
        const nextPriority = item.priority === newPriority ? null : newPriority;
        setTriageUpdating(true);
        try {
            await updateFeedbackTriage(item.id, { priority: nextPriority });
            setItem(prev => prev ? { ...prev, priority: nextPriority } : null);
        } catch (err: any) {
            setError(err.message || 'Failed to update priority');
        }
        setTriageUpdating(false);
    };

    const handleAddLabel = async () => {
        if (!item) return;
        const next = labelDraft.trim().toLowerCase().replace(/\s+/g, '-');
        if (!next) return;
        const current = item.labels || [];
        if (current.includes(next)) { setLabelDraft(''); return; }
        const updated = [...current, next];
        setTriageUpdating(true);
        try {
            await updateFeedbackTriage(item.id, { labels: updated });
            setItem(prev => prev ? { ...prev, labels: updated } : null);
            setLabelDraft('');
        } catch (err: any) {
            setError(err.message || 'Failed to add label');
        }
        setTriageUpdating(false);
    };

    const handleRemoveLabel = async (label: string) => {
        if (!item) return;
        const updated = (item.labels || []).filter(l => l !== label);
        setTriageUpdating(true);
        try {
            await updateFeedbackTriage(item.id, { labels: updated });
            setItem(prev => prev ? { ...prev, labels: updated } : null);
        } catch (err: any) {
            setError(err.message || 'Failed to remove label');
        }
        setTriageUpdating(false);
    };

    const handleStatusChange = async (newStatus: string) => {
        if (!item) return;
        setStatusUpdating(true);
        try {
            await updateFeedbackStatus(item.id, newStatus, newStatus === 'resolved' ? resolutionNote : undefined);
            setItem(prev => prev ? {
                ...prev,
                status: newStatus,
                resolved_at: (newStatus === 'resolved' || newStatus === 'closed') ? new Date().toISOString() : null,
            } : null);
        } catch (err: any) {
            setError(err.message || 'Failed to update status');
        }
        setStatusUpdating(false);
    };

    useEffect(() => {
        (async () => {
            try {
                const data = await fetchFeedbackById(id!);
                setItem(data);
                // Fetch cluster siblings in parallel — non-blocking. If the
                // cluster has no siblings (or no cluster at all) the card
                // below stays hidden.
                fetchClusterSiblings(id!)
                    .then(setClusterSiblings)
                    .catch(() => setClusterSiblings([]));
                if (data.cluster_id) {
                    fetchClusterDetail(data.cluster_id)
                        .then(setCluster)
                        .catch(() => setCluster(null));
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load feedback');
            }
            setLoading(false);
        })();
    }, [id]);

    if (loading) return <LayoutWrapper><LoadingSpinner message="Loading feedback..." /></LayoutWrapper>;
    if (error) return <LayoutWrapper><ErrorMessage message={error} /></LayoutWrapper>;
    if (!item) return null;

    const context = item.context || {};
    const consoleErrors = context.consoleErrors || [];
    const networkErrors = context.networkErrors || [];
    const breadcrumbs = context.breadcrumbs || [];
    const screenshots = Array.isArray(item.screenshots) ? item.screenshots : [];

    // Split breadcrumbs into "where the user was" vs "what they did".
    // The spec calls navigation history out as a top-level differentiator,
    // so it gets its own panel; everything else (clicks, custom events)
    // stays in the User Actions panel below.
    const navigationSteps = breadcrumbs.filter((b: any) => b.type === 'navigation');
    const userActions = breadcrumbs.filter((b: any) => b.type !== 'navigation');

    return (
        <LayoutWrapper>
        <div className="max-w-5xl mx-auto w-full space-y-4">
            <button
                onClick={() => navigate('/feedback')}
                className="text-sm text-gray-500 hover:text-amber-500 dark:hover:text-amber-400 mb-2 flex items-center gap-1 transition-colors"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to list
            </button>

            <GlassCard>
                <div className="flex items-start justify-between">
                    <div>
                        {(() => {
                            const tc = TYPE_CONFIG[item.type] || { label: item.type, color: 'bg-gray-100 text-gray-600', darkColor: '' };
                            return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tc.color} ${tc.darkColor}`}>{tc.label}</span>;
                        })()}
                        <h1 className="text-xl font-bold mt-2">{item.title}</h1>
                        {item.description && <p className="text-gray-500 mt-2">{item.description}</p>}
                    </div>
                    <div className="text-right text-xs text-gray-400">
                        <p>{new Date(item.created_at).toLocaleString()}</p>
                        <p className="font-mono mt-1">{item.id}</p>
                    </div>
                </div>

                {/* Status Controls */}
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</span>
                        {['open', 'in_progress', 'resolved', 'closed'].map((s) => {
                            const isActive = item.status === s;
                            const colors: Record<string, string> = {
                                open: isActive ? 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200' : '',
                                in_progress: isActive ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' : '',
                                resolved: isActive ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' : '',
                                closed: isActive ? 'bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-300' : '',
                            };
                            return (
                                <button
                                    key={s}
                                    onClick={() => handleStatusChange(s)}
                                    disabled={statusUpdating || isActive}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                        isActive
                                            ? `${colors[s]} border-transparent`
                                            : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:border-gray-300'
                                    } disabled:opacity-50`}
                                >
                                    {s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                </button>
                            );
                        })}
                        {item.resolved_at && (
                            <span className="text-xs text-gray-400 ml-2">
                                Resolved {new Date(item.resolved_at).toLocaleDateString()}
                                {item.resolved_by && ` by ${item.resolved_by}`}
                            </span>
                        )}
                    </div>
                    {(item.status === 'open' || item.status === 'in_progress') && (
                        <div className="mt-3 flex gap-2">
                            <input
                                type="text"
                                placeholder="Resolution note (optional)"
                                value={resolutionNote}
                                onChange={(e) => setResolutionNote(e.target.value)}
                                className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                            />
                            <button
                                onClick={() => handleStatusChange('resolved')}
                                disabled={statusUpdating}
                                className="px-4 py-2 text-sm font-medium bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                                {statusUpdating ? 'Resolving...' : 'Resolve'}
                            </button>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <MetaItem label="Project" value={item.project_id} />
                    <MetaItem label="Category" value={item.category} />
                    <MetaItem label="Severity" value={item.severity} />
                    <MetaItem label="Impact" value={item.impact} />
                    <MetaItem label="Email" value={item.email} />
                    <MetaItem label="User ID" value={item.user_id} />
                    <MetaItem label="Screen" value={item.screen_id || context.screenId} />
                    <MetaItem label="URL" value={context.url} />
                </div>
            </GlassCard>

            {/* Session & Identity (Tier 1) — shows data captured via the
                sessionProvider contract (PostHog / LogRocket / FullStory).
                Card is invisible when no session metadata was captured,
                so it never clutters the layout for session-less submissions. */}
            {(item.session_replay_url || item.session_id || (item.user_properties && Object.keys(item.user_properties).length > 0)) && (
                <GlassCard title="Session & Identity">
                    <div className="space-y-3">
                        {item.session_replay_url && (
                            <a
                                href={item.session_replay_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-lg shadow-sm transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                View session replay
                                {item.session_provider && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                                        · {item.session_provider}
                                    </span>
                                )}
                            </a>
                        )}
                        {(item.session_id || item.session_provider) && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                                {item.session_id && <span>session: {item.session_id}</span>}
                            </div>
                        )}
                        {item.user_properties && Object.keys(item.user_properties).length > 0 && (
                            <div className="pt-3 mt-3 border-t border-gray-100 dark:border-white/5">
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                                    User properties
                                </p>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {Object.entries(item.user_properties).map(([key, value]) => (
                                        <div key={key}>
                                            <p className="text-[11px] text-gray-400 truncate">{key}</p>
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate" title={String(value ?? '')}>
                                                {value == null
                                                    ? <span className="text-gray-300 dark:text-gray-600">—</span>
                                                    : typeof value === 'object'
                                                        ? <code className="text-[11px]">{JSON.stringify(value)}</code>
                                                        : String(value)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </GlassCard>
            )}

            {/* Proposed Fix (Auto-resolvable) — rendered when an agent has
                attached a diff to this feedback's cluster via the Agent API.
                Developer reviews the diff, clicks Approve, cluster resolves
                and every reporter gets the loop-close notification once. */}
            {cluster && (cluster.is_auto_resolvable || cluster.proposed_fix) && (
                <GlassCard title={cluster.proposed_fix ? 'Proposed Fix' : 'Auto-resolvable'}>
                    {cluster.proposed_fix ? (
                        <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                        {cluster.proposed_fix.summary}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Proposed by {cluster.proposed_fix.proposed_by || 'agent'}
                                        {cluster.proposed_fix.proposed_at && (
                                            <> · {new Date(cluster.proposed_fix.proposed_at).toLocaleString()}</>
                                        )}
                                        {typeof cluster.proposed_fix.confidence === 'number' && (
                                            <> · confidence {Math.round(cluster.proposed_fix.confidence * 100)}%</>
                                        )}
                                    </p>
                                    {cluster.proposed_fix.files && cluster.proposed_fix.files.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {cluster.proposed_fix.files.map(f => (
                                                <span key={f} className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                                                    {f}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {cluster.resolved_at == null && (
                                    <button
                                        onClick={handleApproveFix}
                                        disabled={approvingFix}
                                        className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg shadow-sm transition-all disabled:opacity-50 shrink-0"
                                    >
                                        {approvingFix ? 'Approving…' : 'Approve & Resolve'}
                                    </button>
                                )}
                            </div>
                            <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg overflow-x-auto max-h-96 border border-gray-200 dark:border-gray-700 whitespace-pre">
                                {cluster.proposed_fix.diff}
                            </pre>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">
                            This cluster looks narrow enough for an automated fix (typo, colour,
                            or null check). An agent can propose a diff via the Agent API.
                        </p>
                    )}
                </GlassCard>
            )}

            {/* Cluster Siblings (Tier 2) — other feedback rows the AI grouped
                as the "same issue." Hidden when there are no siblings so the
                card never clutters the layout for single-reporter tickets. */}
            {clusterSiblings.length > 0 && (
                <GlassCard title={`Also reported by ${clusterSiblings.length} other user${clusterSiblings.length === 1 ? '' : 's'}`}>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        The AI grouped these submissions as the same issue. Resolving this ticket
                        notifies everyone below.
                    </p>
                    <div className="divide-y divide-gray-100 dark:divide-white/5">
                        {clusterSiblings.map((sib) => (
                            <button
                                key={sib.id}
                                onClick={() => navigate(`/feedback/${sib.id}`)}
                                className="w-full flex items-center justify-between py-2.5 gap-3 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors text-left"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                        {sib.title}
                                    </p>
                                    <p className="text-xs text-gray-400 truncate">
                                        {sib.email || sib.user_id || 'Anonymous'}
                                        <span className="mx-1.5">·</span>
                                        {new Date(sib.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                {sib.status && sib.status !== 'open' && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 uppercase font-semibold tracking-wider shrink-0">
                                        {sib.status.replace('_', ' ')}
                                    </span>
                                )}
                                <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* Triage (P3) — priority + labels. Separate card so it visually
                anchors the workflow: pick priority, tag with labels, then
                resolve via the status controls above. */}
            <GlassCard title="Triage">
                <div className="space-y-4">
                    {/* Priority */}
                    <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Priority</p>
                        <div className="flex flex-wrap items-center gap-2">
                            {PRIORITY_OPTIONS.map(opt => {
                                const isActive = item.priority === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        onClick={() => handlePriorityChange(opt.value)}
                                        disabled={triageUpdating}
                                        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all disabled:opacity-50 ${
                                            isActive
                                                ? `${opt.chip} border-transparent`
                                                : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:border-gray-300'
                                        }`}
                                        title={isActive ? 'Click to clear priority' : `Set priority to ${opt.label}`}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                                        {opt.label}
                                    </button>
                                );
                            })}
                            {item.priority == null && (
                                <span className="text-xs text-gray-400 ml-1">— not prioritised</span>
                            )}
                        </div>
                    </div>

                    {/* Labels */}
                    <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Labels</p>
                        <div className="flex flex-wrap items-center gap-2">
                            {(item.labels || []).map(label => (
                                <span
                                    key={label}
                                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                                >
                                    <span>{label}</span>
                                    <button
                                        onClick={() => handleRemoveLabel(label)}
                                        disabled={triageUpdating}
                                        className="w-4 h-4 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-50"
                                        title={`Remove "${label}"`}
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </span>
                            ))}
                            <div className="flex items-center gap-1">
                                <input
                                    type="text"
                                    placeholder="Add label…"
                                    value={labelDraft}
                                    onChange={(e) => setLabelDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddLabel();
                                        }
                                    }}
                                    disabled={triageUpdating}
                                    maxLength={40}
                                    className="px-2.5 py-1 text-xs border border-dashed border-gray-300 dark:border-gray-600 rounded-full bg-transparent text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:outline-none focus:border-amber-500 focus:border-solid disabled:opacity-50 w-32"
                                />
                                <button
                                    onClick={handleAddLabel}
                                    disabled={triageUpdating || !labelDraft.trim()}
                                    className="text-xs font-semibold text-amber-500 hover:text-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                        {(item.labels?.length ?? 0) === 0 && !labelDraft && (
                            <p className="text-[11px] text-gray-400 mt-1">
                                Short tags like <code>backend</code>, <code>duplicate</code>, <code>ux-bug</code>. Spaces become hyphens.
                            </p>
                        )}
                    </div>
                </div>
            </GlassCard>

            {screenshots.length > 0 && (
                <GlassCard title={`Screenshots (${screenshots.length})`}>
                    <div className="flex gap-3 flex-wrap">
                        {screenshots.map((src: string, i: number) => (
                            <button key={i} onClick={() => setLightbox(src)} className="group relative">
                                <img
                                    src={src}
                                    alt={`Screenshot ${i + 1}`}
                                    className="h-32 rounded-lg border border-gray-200 dark:border-gray-700 object-cover group-hover:opacity-80 transition-opacity cursor-zoom-in"
                                />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <svg className="w-8 h-8 text-white drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                                    </svg>
                                </div>
                            </button>
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* Lightbox Modal */}
            {lightbox && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setLightbox(null)}
                >
                    <button
                        onClick={() => setLightbox(null)}
                        className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
                    >
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <img
                        src={lightbox}
                        alt="Screenshot preview"
                        className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {consoleErrors.length > 0 && (
                <GlassCard title={`Console Errors (${consoleErrors.length})`}>
                    <div className="space-y-2">
                        {consoleErrors.map((err: any, i: number) => (
                            <div key={i} className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg">
                                <p className="text-sm text-red-700 dark:text-red-400 font-mono">{err.message}</p>
                                {err.stack && <pre className="text-xs text-red-400 mt-1 overflow-x-auto">{err.stack}</pre>}
                                <p className="text-xs text-gray-400 mt-1">{new Date(err.timestamp).toLocaleTimeString()}</p>
                            </div>
                        ))}
                    </div>
                </GlassCard>
            )}

            {networkErrors.length > 0 && (
                <GlassCard title={`Network Errors (${networkErrors.length})`}>
                    <div className="space-y-2">
                        {networkErrors.map((err: any, i: number) => (
                            <div key={i} className="p-3 bg-orange-50 dark:bg-orange-900/10 rounded-lg flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-mono font-bold text-orange-600">{err.method}</span>
                                    <span className="text-sm text-gray-700 dark:text-gray-300 ml-2 font-mono">{err.endpoint}</span>
                                </div>
                                <div className="text-right">
                                    <span className={`text-sm font-bold ${err.status >= 500 ? 'text-red-600' : err.status >= 400 ? 'text-orange-600' : 'text-gray-500'}`}>
                                        {err.status || 'Failed'}
                                    </span>
                                    {err.duration && <span className="text-xs text-gray-400 ml-2">{err.duration}ms</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* Navigation Path — the route the user took before the issue.
                Filtered from breadcrumbs (type='navigation'), rendered as
                an ordered step list with timestamps + relative gaps so a
                developer can see "where were they 30s before they clicked
                Submit." Surfaces the spec's navigation-history differentiator. */}
            {navigationSteps.length > 0 && (
                <GlassCard title={`Navigation Path (${navigationSteps.length})`}>
                    <ol className="relative border-l-2 border-purple-200 dark:border-purple-500/30 ml-3 space-y-3 py-1">
                        {navigationSteps.map((step: any, i: number) => {
                            const isFirst = i === 0;
                            const isLast = i === navigationSteps.length - 1;
                            const prevStep = i > 0 ? navigationSteps[i - 1] : null;
                            const gapMs = prevStep
                                ? new Date(step.timestamp).getTime() - new Date(prevStep.timestamp).getTime()
                                : 0;
                            const gap = formatGap(gapMs);
                            const target: string = step.target || '/';
                            const target_meta = step.metadata || {};
                            const fromTo = target_meta.from && target_meta.to
                                ? `${target_meta.from} → ${target_meta.to}`
                                : null;
                            return (
                                <li key={i} className="ml-5 relative">
                                    {/* step dot */}
                                    <span className={`absolute -left-[1.55rem] top-1 w-3 h-3 rounded-full ring-2 ring-white dark:ring-gray-900 ${
                                        isLast
                                            ? 'bg-amber-500'
                                            : 'bg-purple-400 dark:bg-purple-500'
                                    }`} />
                                    <div className="flex items-baseline justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                                {target}
                                            </p>
                                            {fromTo && (
                                                <p className="text-xs text-gray-400 truncate font-mono mt-0.5">
                                                    {fromTo}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end shrink-0">
                                            <span className="text-xs text-gray-400 font-mono">
                                                {new Date(step.timestamp).toLocaleTimeString()}
                                            </span>
                                            {!isFirst && gap && (
                                                <span className="text-[10px] text-gray-400 mt-0.5">
                                                    +{gap}
                                                </span>
                                            )}
                                            {isLast && (
                                                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5 uppercase tracking-wider">
                                                    where issue happened
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </GlassCard>
            )}

            {userActions.length > 0 && (
                <GlassCard title={`User Actions (${userActions.length})`}>
                    <div className="space-y-1">
                        {userActions.map((b: any, i: number) => (
                            <div key={i} className="flex items-baseline gap-2 text-sm">
                                <span className="text-xs text-gray-400 font-mono w-16 shrink-0">
                                    {new Date(b.timestamp).toLocaleTimeString()}
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${b.type === 'click' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                                    {b.type}
                                </span>
                                <span className="text-gray-600 dark:text-gray-400 truncate text-xs">
                                    {b.target}
                                </span>
                            </div>
                        ))}
                    </div>
                </GlassCard>
            )}

            <GlassCard title="Browser Context">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <MetaItem label="User Agent" value={context.userAgent?.substring(0, 60)} />
                    <MetaItem label="Viewport" value={context.viewport ? `${context.viewport.width}\u00d7${context.viewport.height}` : null} />
                    <MetaItem label="Language" value={context.language} />
                    <MetaItem label="Environment" value={context.env} />
                    <MetaItem label="App Version" value={context.appVersion} />
                    <MetaItem label="Route" value={context.route} />
                </div>
            </GlassCard>

            <GlassCard title="Raw Data">
                <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg overflow-x-auto max-h-96">
                    {JSON.stringify(item, null, 2)}
                </pre>
            </GlassCard>
        </div>
        </LayoutWrapper>
    );
}

function MetaItem({ label, value }: { label: string; value: string | null | undefined }) {
    return (
        <div>
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                {value || '\u2014'}
            </p>
        </div>
    );
}

/** Render a millisecond gap between navigation steps as a short
 *  human-readable label: "2s", "47s", "3m", "1h 12m". */
function formatGap(ms: number): string {
    if (!ms || ms < 1000) return '';
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return remMin ? `${hr}h ${remMin}m` : `${hr}h`;
}
