// Main exports
export { FeedbackProvider, useFeedback } from './context';
export { FeedbackDialog } from './components/FeedbackDialog';
export { FeedbackButton, FeedbackIconButton } from './components/FeedbackButton';
export { FeedbackToast } from './components/FeedbackToast';
export { RouteObserver } from './components/RouteObserver';
export { FeedbackErrorBoundary } from './components/FeedbackErrorBoundary';
export { useFeedbackConfig } from './hooks/useFeedbackConfig';

// Schema exports
export {
  FeedbackEventSchema,
  CapturedContextSchema,
  ConsoleErrorSchema,
  NetworkErrorSchema,
  BreadcrumbSchema,
  ViewportSchema,
  FeedbackTypeSchema,
  FeedbackCategorySchema,
  SeveritySchema,
  ImpactSchema,
  NotificationSchema,
} from './schemas';

// Type exports
export type {
  FeedbackEvent,
  CapturedContext,
  ConsoleError,
  NetworkError,
  Breadcrumb,
  Viewport,
  FeedbackType,
  FeedbackCategory,
  Severity,
  Impact,
  FeedbackFormState,
  FeedbackAdapter,
  FeedbackConfig,
  PlanStatus,
  Notification,
  SessionProvider,
} from './schemas';

// Session providers (Tier 1) — plug analytics tools into feedback
// submissions. PostHog is the reference implementation; the interface
// is open enough to add LogRocket / FullStory / Mixpanel without
// touching the core.
export { posthogSessionProvider } from './sessionProviders/posthog';
export type { PostHogLike } from './sessionProviders/posthog';

// Styles are extracted as a separate file by Vite (cssCodeSplit: false + assetFileNames: 'styles.css')
// Consumers import explicitly: import '@bernstein/feedback/styles.css'
import './styles.css';
