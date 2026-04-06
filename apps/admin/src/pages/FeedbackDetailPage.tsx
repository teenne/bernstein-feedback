import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchFeedbackById } from '../lib/feedbackApi';
import { LayoutWrapper } from '../components/LayoutWrapper';
import { GlassCard } from '../components/GlassCard';

interface FeedbackDetail {
    id: string;
    project_id: string;
    type: string;
    title: string;
    description: string;
    category: string | null;
    severity: string | null;
    impact: string | null;
    email: string | null;
    context: any;
    screenshots: string[];
    highlighted_element: any;
    user_id: string | null;
    tenant_id: string | null;
    screen_id: string | null;
    page_name: string | null;
    metadata: any;
    created_at: string;
}

export function FeedbackDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [item, setItem] = useState<FeedbackDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const data = await fetchFeedbackById(id!);
                setItem(data);
            } catch (err: any) {
                setError(err.message || 'Failed to load feedback');
            }
            setLoading(false);
        })();
    }, [id]);

    if (loading) return (
        <LayoutWrapper>
            <div className="flex flex-col items-center justify-center py-20">
                <div className="h-10 w-10 border-2 border-amber-500 rounded-full border-t-transparent animate-spin mb-4" />
                <p className="text-sm text-gray-400">Loading feedback...</p>
            </div>
        </LayoutWrapper>
    );
    if (error) return (
        <LayoutWrapper>
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-sm">{error}</div>
        </LayoutWrapper>
    );
    if (!item) return null;

    const context = item.context || {};
    const consoleErrors = context.consoleErrors || [];
    const networkErrors = context.networkErrors || [];
    const breadcrumbs = context.breadcrumbs || [];
    const screenshots = Array.isArray(item.screenshots) ? item.screenshots : [];

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
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.type === 'bug_report' ? 'bg-red-100 text-red-700' : item.type === 'feature_request' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {item.type}
                        </span>
                        <h1 className="text-xl font-bold mt-2">{item.title}</h1>
                        {item.description && <p className="text-gray-500 mt-2">{item.description}</p>}
                    </div>
                    <div className="text-right text-xs text-gray-400">
                        <p>{new Date(item.created_at).toLocaleString()}</p>
                        <p className="font-mono mt-1">{item.id}</p>
                    </div>
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

            {screenshots.length > 0 && (
                <GlassCard title={`Screenshots (${screenshots.length})`}>
                    <div className="flex gap-3 flex-wrap">
                        {screenshots.map((src: string, i: number) => (
                            <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                                <img
                                    src={src}
                                    alt={`Screenshot ${i + 1}`}
                                    className="h-32 rounded-lg border border-gray-200 dark:border-gray-700 object-cover hover:opacity-80 transition-opacity"
                                />
                            </a>
                        ))}
                    </div>
                </GlassCard>
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

            {breadcrumbs.length > 0 && (
                <GlassCard title={`User Actions (${breadcrumbs.length})`}>
                    <div className="space-y-1">
                        {breadcrumbs.map((b: any, i: number) => (
                            <div key={i} className="flex items-baseline gap-2 text-sm">
                                <span className="text-xs text-gray-400 font-mono w-16 shrink-0">
                                    {new Date(b.timestamp).toLocaleTimeString()}
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${b.type === 'click' ? 'bg-blue-100 text-blue-600' : b.type === 'navigation' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'}`}>
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
