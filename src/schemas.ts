import { z } from 'zod';

/**
 * Console error captured from the browser
 */
export const ConsoleErrorSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
  timestamp: z.string().datetime(),
});

/**
 * Network error captured from failed requests
 */
export const NetworkErrorSchema = z.object({
  url: z.string(),
  status: z.number(),
  method: z.string(),
  timestamp: z.string().datetime(),
});

/**
 * User action breadcrumb
 */
export const BreadcrumbSchema = z.object({
  type: z.enum(['click', 'navigation', 'input', 'custom']),
  target: z.string(),
  timestamp: z.string().datetime(),
  data: z.record(z.unknown()).optional(),
});

/**
 * Viewport information
 */
export const ViewportSchema = z.object({
  width: z.number(),
  height: z.number(),
  devicePixelRatio: z.number().optional(),
});

/**
 * Automatically captured browser context
 */
export const CapturedContextSchema = z.object({
  url: z.string(),
  route: z.string().optional(),
  viewport: ViewportSchema,
  userAgent: z.string(),
  language: z.string().optional(),
  appVersion: z.string().optional(),
  timestamp: z.string().datetime(),
  consoleErrors: z.array(ConsoleErrorSchema).max(10),
  networkErrors: z.array(NetworkErrorSchema).max(5),
  breadcrumbs: z.array(BreadcrumbSchema).max(20),
});

/**
 * Feedback event type
 */
export const FeedbackTypeSchema = z.enum(['feedback', 'bug_report']);

/**
 * Feedback category
 */
export const FeedbackCategorySchema = z.enum([
  'bug',
  'improvement',
  'feature',
  'question',
  'other',
]);

/**
 * Bug severity level
 */
export const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

/**
 * Complete feedback event payload
 */
export const FeedbackEventSchema = z.object({
  // Event metadata
  type: FeedbackTypeSchema,
  project_id: z.string(),
  timestamp: z.string().datetime(),
  event_id: z.string().uuid().optional(),

  // User input
  title: z.string().min(1).max(200),
  description: z.string().max(5000),
  category: FeedbackCategorySchema.optional(),
  severity: SeveritySchema.optional(),
  email: z.string().email().optional(),

  // Automatic context
  context: CapturedContextSchema,

  // Optional extras
  screenshot: z.string().optional(), // Base64 data URL
  bernstein_run_id: z.string().uuid().optional(),
  user_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Type exports
export type ConsoleError = z.infer<typeof ConsoleErrorSchema>;
export type NetworkError = z.infer<typeof NetworkErrorSchema>;
export type Breadcrumb = z.infer<typeof BreadcrumbSchema>;
export type Viewport = z.infer<typeof ViewportSchema>;
export type CapturedContext = z.infer<typeof CapturedContextSchema>;
export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;
export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type FeedbackEvent = z.infer<typeof FeedbackEventSchema>;

/**
 * Form state for the feedback dialog
 */
export interface FeedbackFormState {
  type: FeedbackType;
  title: string;
  description: string;
  category?: FeedbackCategory;
  severity?: Severity;
  email?: string;
  includeScreenshot: boolean;
}

/**
 * Adapter interface for submitting feedback
 */
export interface FeedbackAdapter {
  submit(event: FeedbackEvent): Promise<{ success: boolean; id?: string; error?: string }>;
}

/**
 * Configuration for the feedback provider
 */
export interface FeedbackConfig {
  /** The adapter to use for submitting feedback */
  adapter: FeedbackAdapter;
  /** Project identifier */
  projectId: string;
  /** Regex patterns to redact from context (passwords, tokens, etc.) */
  redact?: RegExp[];
  /** App version to include in context */
  appVersion?: string;
  /** User ID to include (if available) */
  userId?: string;
  /** Bernstein run ID for correlation */
  bernsteinRunId?: string;
  /** Custom metadata to include */
  metadata?: Record<string, unknown>;
  /** Whether to enable screenshot capture (default: true) */
  enableScreenshot?: boolean;
  /** Maximum console errors to capture (default: 10) */
  maxConsoleErrors?: number;
  /** Maximum network errors to capture (default: 5) */
  maxNetworkErrors?: number;
  /** Maximum breadcrumbs to capture (default: 20) */
  maxBreadcrumbs?: number;
}
