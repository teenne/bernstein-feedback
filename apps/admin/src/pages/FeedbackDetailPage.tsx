import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

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
                const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/feedback/${id}`);
                const json = await res.json();
                if (json.success) {
                    const data = json.data;
                    // Parse JSON strings if needed
                    if (typeof data.context === 'string') data.context = JSON.parse(data.context);
                    if (typeof data.screenshots === 'string') data.screenshots = JSON.parse(data.screenshots);
                    if (typeof data.metadata === 'string') data.metadata = JSON.parse(data.metadata);
                    if (typeof data.highlighted_element === 'string') data.highlighted_element = JSON.parse(data.highlighted_element);
                    setItem(data);
                } else {
                    setError(json.error);
                }
            } catch {
                setError('Failed to load feedback');
            }
            setLoading(false);
        })();
    }, [id]);

    if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
    if (error) return <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>;
    if (!item) return null;

    const context = item.context || {};
    const consoleErrors = context.consoleErrors || [];
    const networkErrors = context.networkErrors || [];
    const breadcrumbs = context.breadcrumbs || [];
    const screenshots = Array.isArray(item.screenshots) ? item.screenshots : [];

    return (
        <div>
            {/* Back button */}
            <button
                onClick={() => navigate('/feedback')}
                className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 mb-4 flex items-center gap-1"
            >
                ← Back to list
            </button>

            {/* Header */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-4">
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

                {/* Meta grid */}
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
            </div>

            {/* Screenshots */}
            {screenshots.length > 0 && (
                <Section title={`Screenshots (${screenshots.length})`}>
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
                </Section>
            )}

            {/* Console Errors */}
            {consoleErrors.length > 0 && (
                <Section title={`Console Errors (${consoleErrors.length})`}>
                    <div className="space-y-2">
                        {consoleErrors.map((err: any, i: number) => (
                            <div key={i} className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg">
                                <p className="text-sm text-red-700 dark:text-red-400 font-mono">{err.message}</p>
                                {err.stack && <pre className="text-xs text-red-400 mt-1 overflow-x-auto">{err.stack}</pre>}
                                <p className="text-xs text-gray-400 mt-1">{new Date(err.timestamp).toLocaleTimeString()}</p>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* Network Errors */}
            {networkErrors.length > 0 && (
                <Section title={`Network Errors (${networkErrors.length})`}>
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
                </Section>
            )}

            {/* Breadcrumbs */}
            {breadcrumbs.length > 0 && (
                <Section title={`User Actions (${breadcrumbs.length})`}>
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
                </Section>
            )}

            {/* Browser Context */}
            <Section title="Browser Context">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <MetaItem label="User Agent" value={context.userAgent?.substring(0, 60)} />
                    <MetaItem label="Viewport" value={context.viewport ? `${context.viewport.width}×${context.viewport.height}` : null} />
                    <MetaItem label="Language" value={context.language} />
                    <MetaItem label="Environment" value={context.env} />
                    <MetaItem label="App Version" value={context.appVersion} />
                    <MetaItem label="Route" value={context.route} />
                </div>
            </Section>

            {/* Raw JSON */}
            <Section title="Raw Data">
                <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto max-h-96">
                    {JSON.stringify(item, null, 2)}
                </pre>
            </Section>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-4">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{title}</h2>
            {children}
        </div>
    );
}

function MetaItem({ label, value }: { label: string; value: string | null | undefined }) {
    return (
        <div>
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                {value || '—'}
            </p>
        </div>
    );
}
