// Feedback type configuration — shared across FeedbackListPage, StatsPage, FeedbackDetailPage
// - color/darkColor: badge styles (FeedbackListPage)
// - textColor/bgColor/darkBg: chart/stat styles (StatsPage)
export const TYPE_CONFIG: Record<string, { label: string; color: string; darkColor: string; icon: string; textColor: string; bgColor: string; darkBg: string }> = {
    feedback: {
        label: 'Feedback',
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        darkColor: 'dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
        icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
        textColor: 'text-blue-500',
        bgColor: 'bg-blue-500',
        darkBg: 'bg-blue-500/10',
    },
    bug_report: {
        label: 'Bug',
        color: 'bg-red-50 text-red-700 border-red-200',
        darkColor: 'dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
        icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
        textColor: 'text-red-500',
        bgColor: 'bg-red-500',
        darkBg: 'bg-red-500/10',
    },
    feature_request: {
        label: 'Feature',
        color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        darkColor: 'dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
        icon: 'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18',
        textColor: 'text-emerald-500',
        bgColor: 'bg-emerald-500',
        darkBg: 'bg-emerald-500/10',
    },
};

// Status configuration — shared across FeedbackListPage, FeedbackDetailPage
export const STATUS_CONFIG: Record<string, { label: string; color: string; darkColor: string }> = {
    open: { label: 'Open', color: 'bg-gray-100 text-gray-600', darkColor: 'dark:bg-gray-500/10 dark:text-gray-400' },
    in_progress: { label: 'In Progress', color: 'bg-blue-50 text-blue-700', darkColor: 'dark:bg-blue-500/10 dark:text-blue-400' },
    resolved: { label: 'Resolved', color: 'bg-green-50 text-green-700', darkColor: 'dark:bg-green-500/10 dark:text-green-400' },
    closed: { label: 'Closed', color: 'bg-gray-200 text-gray-500', darkColor: 'dark:bg-gray-600/20 dark:text-gray-500' },
};

// Severity configuration — shared across FeedbackListPage, StatsPage
// - color/darkColor: badge styles (FeedbackListPage)
// - textColor/bgColor/darkBg: chart/stat styles (StatsPage)
export const SEVERITY_CONFIG: Record<string, { label: string; color: string; darkColor: string; textColor: string; bgColor: string; darkBg: string }> = {
    critical: { label: 'Critical', color: 'bg-red-100 text-red-800', darkColor: 'dark:bg-red-500/10 dark:text-red-400', textColor: 'text-red-600', bgColor: 'bg-red-600', darkBg: 'bg-red-500/10' },
    high: { label: 'High', color: 'bg-orange-100 text-orange-800', darkColor: 'dark:bg-orange-500/10 dark:text-orange-400', textColor: 'text-orange-500', bgColor: 'bg-orange-500', darkBg: 'bg-orange-500/10' },
    medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800', darkColor: 'dark:bg-yellow-500/10 dark:text-yellow-400', textColor: 'text-yellow-500', bgColor: 'bg-yellow-500', darkBg: 'bg-yellow-500/10' },
    low: { label: 'Low', color: 'bg-gray-100 text-gray-600', darkColor: 'dark:bg-gray-500/10 dark:text-gray-400', textColor: 'text-gray-400', bgColor: 'bg-gray-400', darkBg: 'bg-gray-500/10' },
};

// Plan feature labels — shared across PlanSelectionPage, SettingsPage, Dashboard
export const FEATURE_LABELS: Record<string, string> = {
    ai_clustering: 'AI ticket clustering (BYOK)',
    posthog: 'PostHog session replay',
    api_access: 'API access for AI agents',
    custom_branding: 'Custom branding',
    assumption_validation: 'Assumption validation',
    self_hosted: 'Self-hosted option',
};
