import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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

const TYPE_COLORS: Record<string, string> = {
    feedback: 'bg-blue-100 text-blue-700',
    bug_report: 'bg-red-100 text-red-700',
    feature_request: 'bg-green-100 text-green-700',
};

const TYPE_LABELS: Record<string, string> = {
    feedback: 'Feedback',
    bug_report: 'Bug',
    feature_request: 'Feature',
};

export function FeedbackListPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const typeFilter = searchParams.get('type') || '';
    const projectFilter = searchParams.get('project_id') || '';

    const fetchFeedback = async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            if (typeFilter) params.set('type', typeFilter);
            if (projectFilter) params.set('project_id', projectFilter);
            params.set('limit', '100');

            const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/feedback?${params}`);
            const json = await res.json();
            if (json.success) {
                setItems(json.data);
            } else {
                setError(json.error);
            }
        } catch (err) {
            setError('Failed to connect to server. Is it running on localhost:3000?');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchFeedback();
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
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Feedback</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {items.length} item{items.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={fetchFeedback}
                    className="px-3 py-1.5 text-sm font-medium bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                    Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-4">
                <select
                    value={typeFilter}
                    onChange={e => setFilter('type', e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                >
                    <option value="">All Types</option>
                    <option value="feedback">Feedback</option>
                    <option value="bug_report">Bug Report</option>
                    <option value="feature_request">Feature Request</option>
                </select>
                <input
                    type="text"
                    placeholder="Filter by project_id..."
                    value={projectFilter}
                    onChange={e => setFilter('project_id', e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 w-48"
                />
            </div>

            {/* Error */}
            {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="text-center py-12 text-gray-400">Loading...</div>
            )}

            {/* Empty */}
            {!loading && items.length === 0 && !error && (
                <div className="text-center py-12">
                    <p className="text-gray-400 text-lg">No feedback yet</p>
                    <p className="text-gray-400 text-sm mt-1">Submit feedback from BAS or Meraki to see it here</p>
                </div>
            )}

            {/* Table */}
            {!loading && items.length > 0 && (
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                                <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-500">Title</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-500">Project</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-500">Severity</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-500">Files</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-500">Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => (
                                <tr
                                    key={item.id}
                                    onClick={() => navigate(`/feedback/${item.id}`)}
                                    className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                                >
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[item.type] || 'bg-gray-100 text-gray-600'}`}>
                                            {TYPE_LABELS[item.type] || item.type}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                                        {item.description && (
                                            <p className="text-gray-400 text-xs mt-0.5 truncate max-w-md">{item.description}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500">{item.project_id}</td>
                                    <td className="px-4 py-3">
                                        {item.severity && (
                                            <span className="text-xs text-gray-500">{item.severity}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <ScreenshotIndicator screenshots={item.screenshots} itemId={item.id} />
                                    </td>
                                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                                        {timeAgo(item.created_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
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

function ScreenshotIndicator({ screenshots, itemId }: { screenshots: string | string[] | null; itemId: string }) {
    const files = parseScreenshots(screenshots);
    if (files.length === 0) return <span className="text-gray-300">—</span>;

    return (
        <div className="flex items-center gap-1.5">
            {files.map((src, i) => {
                const isDataUrl = src.startsWith('data:');
                const fileName = isDataUrl ? `screenshot-${itemId.slice(0, 6)}-${i + 1}.png` : src.split('/').pop() || `file-${i + 1}`;

                return (
                    <a
                        key={i}
                        href={src}
                        download={fileName}
                        onClick={(e) => e.stopPropagation()}
                        title={`Download ${fileName}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-xs"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="9" cy="9" r="2" />
                            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        </svg>
                        {files.length > 1 && <span>{i + 1}</span>}
                    </a>
                );
            })}
            {files.length > 0 && (
                <span className="text-[10px] text-gray-400">{files.length}</span>
            )}
        </div>
    );
}
