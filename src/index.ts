// Main exports
export { FeedbackProvider, useFeedback } from './context';
export { FeedbackDialog } from './components/FeedbackDialog';
export { FeedbackButton, FeedbackIconButton } from './components/FeedbackButton';
export { FeedbackToast } from './components/FeedbackToast';

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
} from './schemas';

// Import styles for side effects (consumers can import separately)
import './styles.css';
