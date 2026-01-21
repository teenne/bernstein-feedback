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
 * Only metadata - never request/response bodies
 */
export const NetworkErrorSchema = z.object({
  endpoint: z.string(), // Path only, no query params
  status: z.number(),
  method: z.string(),
  duration: z.number().optional(), // ms
  requestId: z.string().optional(), // X-Request-Id header if present
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
  // URL and routing
  url: z.string(),
  route: z.string().optional(),

  // Screen identity (for grouping and filtering)
  screenId: z.string().optional(),
  pageName: z.string().optional(),

  // Build identity
  appVersion: z.string().optional(),
  buildSha: z.string().optional(),
  componentVersion: z.string().optional(),
  env: z.enum(['production', 'staging', 'development', 'test']).optional(),

  // Browser context
  viewport: ViewportSchema,
  userAgent: z.string(),
  language: z.string().optional(),
  timestamp: z.string().datetime(),

  // Captured errors and actions
  consoleErrors: z.array(ConsoleErrorSchema).max(10),
  networkErrors: z.array(NetworkErrorSchema).max(5),
  breadcrumbs: z.array(BreadcrumbSchema).max(20),
});

/**
 * Feedback event type
 */
export const FeedbackTypeSchema = z.enum(['feedback', 'bug_report', 'feature_request']);

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
 * Bug severity level (technical)
 */
export const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

/**
 * Bug impact level (user-facing)
 */
export const ImpactSchema = z.enum(['blocks_me', 'annoying', 'minor']);

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
  impact: ImpactSchema.optional(),
  email: z.string().email().optional(),

  // Automatic context
  context: CapturedContextSchema,

  // Optional extras
  screenshot: z.string().optional(), // Base64 data URL
  highlighted_element: z.object({
    selector: z.string(),
    bounding_box: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
    tag_name: z.string(),
    text: z.string().optional(),
  }).optional(),

  // User identity (minimal)
  user_id: z.string().optional(),
  tenant_id: z.string().optional(),
  role: z.string().optional(),

  // Integration
  bernstein_run_id: z.string().uuid().optional(),
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
export type Impact = z.infer<typeof ImpactSchema>;
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
  impact?: Impact;
  email?: string;
  includeScreenshot: boolean;
  includeTechnicalDetails: boolean;
  includeRecentSteps: boolean;
  includeEmail: boolean;
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

  // Screen identity (update these as user navigates)
  /** Stable screen identifier (e.g., 'checkout', 'user-settings') */
  screenId?: string;
  /** Human-readable page/view name */
  pageName?: string;

  // Build identity (set once at init)
  /** App version (e.g., '2.1.0') */
  appVersion?: string;
  /** Git commit SHA or build identifier */
  buildSha?: string;
  /** Component version if deployed independently */
  componentVersion?: string;
  /** Environment: production, staging, development, test */
  env?: 'production' | 'staging' | 'development' | 'test';

  // User identity (minimal - no PII unless consented)
  /** Internal user ID */
  userId?: string;
  /** Tenant or organization ID */
  tenantId?: string;
  /** User role (e.g., 'admin', 'member') */
  role?: string;
  /** Bernstein run ID for correlation */
  bernsteinRunId?: string;
  /** Custom metadata to include */
  metadata?: Record<string, unknown>;

  // Feature flags
  /** Whether to enable screenshot capture (default: true) */
  enableScreenshot?: boolean;

  // Capture limits
  /** Maximum console errors to capture (default: 10) */
  maxConsoleErrors?: number;
  /** Maximum network errors to capture (default: 5) */
  maxNetworkErrors?: number;
  /** Maximum breadcrumbs to capture (default: 20) */
  maxBreadcrumbs?: number;
}
