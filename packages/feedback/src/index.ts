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
// submissions. PostHog is the reference implementation; LogRocket and
// FullStory are drop-in alternatives via the same SessionProvider interface.
export { posthogSessionProvider } from './sessionProviders/posthog';
export type { PostHogLike } from './sessionProviders/posthog';
export { logRocketSessionProvider } from './sessionProviders/logrocket';
export type { LogRocketLike } from './sessionProviders/logrocket';
export { fullStorySessionProvider } from './sessionProviders/fullstory';
export type { FullStoryLike } from './sessionProviders/fullstory';

// PostHog-backed proactive triggers (rage click + error burst via PostHog events)
export { usePostHogProactiveTriggers } from './hooks/usePostHogProactiveTriggers';

// Styles are extracted as a separate file by Vite (cssCodeSplit: false + assetFileNames: 'styles.css')
// Consumers import explicitly: import '@bernstein/feedback/styles.css'
import './styles.css';
