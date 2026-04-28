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
  screenshots: z.array(z.string()).optional(),
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

  // Session provider (Tier 1 — PostHog / LogRocket / FullStory / etc.)
  // Populated automatically by the widget when a `sessionProvider` is
  // configured on FeedbackProvider. All four are optional so older
  // events and session-less hosts keep working unchanged.
  session_id: z.string().optional(),
  session_provider: z.string().optional(),
  session_replay_url: z.string().url().optional(),
  user_properties: z.record(z.unknown()).optional(),
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

  includeTechnicalDetails: boolean;
  includeRecentSteps: boolean;
  includeEmail: boolean;
  includeScreenshot: boolean;
  screenshots: string[];
}

/**
 * Adapter interface for submitting feedback
 */
export interface FeedbackAdapter {
  submit(event: FeedbackEvent): Promise<{ success: boolean; id?: string; error?: string }>;
}

/**
 * Plan status returned from the server
 */
export interface PlanStatus {
  can_submit: boolean;
  tickets_used: number;
  tickets_limit: number;
  plan: string;
  message?: string;
}

/**
 * Notification from the server (ticket resolved, status change)
 */
export const NotificationSchema = z.object({
  id: z.string(),
  feedback_id: z.string(),
  type: z.enum(['status_change', 'resolved']),
  title: z.string(),
  message: z.string().nullable().optional(),
  read: z.boolean(),
  created_at: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

/**
 * (Tier 1) Pluggable session-analytics provider.
 *
 * Any analytics tool (PostHog, LogRocket, FullStory, Mixpanel, Sentry
 * replays, etc.) can be plugged in by implementing this three-method
 * contract. All methods are optional — if any return `null`/`undefined`
 * the widget silently skips that field on the submitted ticket.
 *
 * The widget calls these synchronously during context capture, so
 * implementations must return quickly or return null if the underlying
 * SDK isn't ready yet. DO NOT do network I/O inside these methods.
 *
 * @example (PostHog)
 *   sessionProvider: posthogSessionProvider(posthog)
 */
export interface SessionProvider {
  /** Short provider identifier stored alongside the session id (e.g. 'posthog'). */
  readonly name: string;
  /** Current session id, or null if there isn't one. */
  getSessionId(): string | null;
  /** Identity properties for the current user (plan, role, any custom traits). */
  getUserProperties(): Record<string, unknown> | null;
  /** Deep link to the recorded session at the current moment, if the provider supports it. */
  getReplayUrl(sessionId: string): string | null;
}

/**
 * Configuration for the feedback provider
 */
export interface FeedbackConfig {
  /** The adapter to use for submitting feedback */
  adapter: FeedbackAdapter;
  /**
   * (Tier 1) Optional session-analytics provider.
   * When present, every submitted ticket gains `session_id`,
   * `session_provider`, `session_replay_url`, and `user_properties`,
   * giving the admin dashboard a one-click deep link into the
   * provider's session replay for that user at that moment.
   */
  sessionProvider?: SessionProvider;
  /** Project identifier */
  projectId: string;
  /** Regex patterns to redact from context (passwords, tokens, etc.) */
  redact?: RegExp[];

  // Plan system
  /** Endpoint to check plan status. Auto-derived from HTTP adapter endpoint if not set. */
  planCheckEndpoint?: string;

  // Notifications (loop-close)
  /** Endpoint for notification polling. Auto-derived from HTTP adapter endpoint if not set. */
  notificationsEndpoint?: string;
  /** Notification polling interval in ms (default: 30000) */
  notificationPollInterval?: number;
  /** Enable notification badge on feedback button (default: true when userId is set) */
  enableNotifications?: boolean;
  /**
   * Scope of the notification feed.
   * - `'project'` (default) — only notifications for `config.projectId`.
   * - `'all'`               — every notification the authenticated user can access.
   *
   * Use `'all'` in admin dashboards where the project dropdown scopes the
   * *feedback list* but the notification bell should still light up for
   * activity across every project the user owns / is a member of / admins.
   */
  notificationScope?: 'project' | 'all';

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
  /** User email (auto-attached to every submission for identification) */
  userEmail?: string;
  /** Tenant or organization ID */
  tenantId?: string;
  /** User role (e.g., 'admin', 'member') */
  role?: string;
  /** Bernstein run ID for correlation */
  bernsteinRunId?: string;
  /** Custom metadata to include */
  metadata?: Record<string, unknown>;



  // Capture limits
  /** Maximum console errors to capture (default: 10) */
  maxConsoleErrors?: number;
  /** Maximum network errors to capture (default: 5) */
  maxNetworkErrors?: number;
  /** Maximum breadcrumbs to capture (default: 20) */
  maxBreadcrumbs?: number;

  // Toast settings
  /** Duration to show toast in ms (default: 5000, set to 0 to disable auto-dismiss) */
  toastDuration?: number;

  /**
   * Automatically take a screenshot of the page when the feedback dialog
   * opens (default: true). The dialog is hidden during capture so it
   * doesn't appear in the shot. Users can then retake or remove it.
   * Set to false for privacy-sensitive pages.
   */
  autoScreenshot?: boolean;



  /** Show Branding (Powered by Bernstein) */
  showBranding?: boolean;

  /**
   * Proactive prompts — small non-intrusive card that appears when the
   * user shows signs of frustration or abandonment, offering to capture
   * a bug report without them needing to find the bubble.
   *
   * Supported triggers:
   *   - `rageClick`: 4+ rapid clicks on the same element within 1.5s
   *   - `errorBurst`: 3+ console errors within 10s
   *   - `abandonedFlow`: user fills a form ≥X chars then navigates away
   *     without submitting
   *
   * Frequency-capped at one prompt per session (across all trigger
   * types combined) and persisted in `sessionStorage` so a refresh
   * doesn't re-arm it.
   *
   * Set to `false` or omit to disable.
   */
  proactiveTriggers?: {
    rageClick?: boolean;
    rageClickThreshold?: number;       // clicks per burst (default 4)
    rageClickWindowMs?: number;        // burst window in ms (default 1500)
    errorBurst?: boolean;
    errorBurstThreshold?: number;      // errors per window (default 3)
    errorBurstWindowMs?: number;       // window in ms (default 10000)
    abandonedFlow?: boolean;
    abandonedMinChars?: number;        // min chars typed before abandon counts (default 30)
  } | false;
}
