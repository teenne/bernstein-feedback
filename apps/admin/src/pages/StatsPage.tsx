import { useState, useEffect } from 'react';

interface Stats {
    total: number;
    by_type: Record<string, number>;
    by_severity: Record<string, number>;
}

const TYPE_LABELS: Record<string, string> = {
    feedback: 'Feedback',
    bug_report: 'Bug Reports',
    feature_request: 'Feature Requests',
};

const TYPE_COLORS: Record<string, string> = {
    feedback: 'bg-blue-500',
    bug_report: 'bg-red-500',
    feature_request: 'bg-green-500',
};

const SEVERITY_COLORS: Record<string, string> = {
    critical: 'bg-red-600',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-gray-400',
};

export function StatsPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/feedback/stats/summary`);
                const json = await res.json();
                if (json.success) {
                    setStats(json.data);
                } else {
                    setError(json.error);
                }
            } catch {
                setError('Failed to connect to server');
            }
            setLoading(false);
        })();
    }, []);

    if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
    if (error) return <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>;
    if (!stats) return null;

    const maxTypeCount = Math.max(...Object.values(stats.by_type), 1);
    const maxSevCount = Math.max(...Object.values(stats.by_severity), 1);

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">Stats</h1>

            {/* Total */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-4">
                <p className="text-sm text-gray-500">Total Feedback</p>
                <p className="text-4xl font-bold mt-1">{stats.total}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                {/* By Type */}
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">By Type</h2>
                    {Object.keys(stats.by_type).length === 0 ? (
                        <p className="text-gray-400 text-sm">No data yet</p>
                    ) : (
                        <div className="space-y-3">
                            {Object.entries(stats.by_type).map(([type, count]) => (
                                <div key={type}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium">{TYPE_LABELS[type] || type}</span>
                                        <span className="text-gray-500">{count}</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${TYPE_COLORS[type] || 'bg-gray-500'}`}
                                            style={{ width: `${(count / maxTypeCount) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* By Severity */}
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">By Severity</h2>
                    {Object.keys(stats.by_severity).length === 0 ? (
                        <p className="text-gray-400 text-sm">No data yet</p>
                    ) : (
                        <div className="space-y-3">
                            {Object.entries(stats.by_severity).map(([sev, count]) => (
                                <div key={sev}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium capitalize">{sev}</span>
                                        <span className="text-gray-500">{count}</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${SEVERITY_COLORS[sev] || 'bg-gray-500'}`}
                                            style={{ width: `${(count / maxSevCount) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
