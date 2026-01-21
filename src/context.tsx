import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import type {
  FeedbackConfig,
  FeedbackEvent,
  FeedbackFormState,
  CapturedContext,
  ConsoleError,
  NetworkError,
  Breadcrumb,
} from './schemas';

interface HighlightedElement {
  selector: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  tagName: string;
  text?: string;
}

interface FeedbackContextValue {
  config: FeedbackConfig;
  isOpen: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  lastReportId: string | null;
  openFeedback: (initialState?: Partial<FeedbackFormState>) => void;
  openBugReport: (initialState?: Partial<FeedbackFormState>) => void;
  /** Quick API to report a bug with prefilled text */
  reportBug: (options?: { title?: string; description?: string }) => void;
  close: () => void;
  submit: (formState: FeedbackFormState, screenshot?: string, highlightedElement?: HighlightedElement) => Promise<{ success: boolean; reportId?: string }>;
  captureContext: () => CapturedContext;
  /** Track a custom breadcrumb */
  addBreadcrumb: (breadcrumb: Omit<Breadcrumb, 'timestamp'>) => void;
  initialFormState: Partial<FeedbackFormState>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
}

interface FeedbackProviderProps {
  children: ReactNode;
  config: Omit<FeedbackConfig, 'adapter'> & { adapter: FeedbackConfig['adapter'] };
}

export function FeedbackProvider({ children, config }: FeedbackProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [lastReportId, setLastReportId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [initialFormState, setInitialFormState] = useState<Partial<FeedbackFormState>>({});

  // Captured context storage
  const consoleErrors = useRef<ConsoleError[]>([]);
  const networkErrors = useRef<NetworkError[]>([]);
  const breadcrumbs = useRef<Breadcrumb[]>([]);

  const maxConsoleErrors = config.maxConsoleErrors ?? 10;
  const maxNetworkErrors = config.maxNetworkErrors ?? 5;
  const maxBreadcrumbs = config.maxBreadcrumbs ?? 20;

  // Console error capture
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      const error: ConsoleError = {
        message: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
        timestamp: new Date().toISOString(),
      };
      if (args[0] instanceof Error) {
        error.stack = args[0].stack;
      }
      consoleErrors.current = [...consoleErrors.current.slice(-(maxConsoleErrors - 1)), error];
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, [maxConsoleErrors]);

  // Network error capture - metadata only, no bodies
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method || 'GET';

      // Extract endpoint path only (no query params, no host)
      const getEndpoint = (fullUrl: string): string => {
        try {
          const parsed = new URL(fullUrl, window.location.origin);
          return parsed.pathname; // Path only, no query string
        } catch {
          return fullUrl.split('?')[0]; // Fallback: strip query params
        }
      };

      const startTime = performance.now();

      try {
        const response = await originalFetch(input, init);
        const duration = Math.round(performance.now() - startTime);

        if (!response.ok) {
          const error: NetworkError = {
            endpoint: getEndpoint(url),
            status: response.status,
            method,
            duration,
            requestId: response.headers.get('x-request-id') || undefined,
            timestamp: new Date().toISOString(),
          };
          networkErrors.current = [
            ...networkErrors.current.slice(-(maxNetworkErrors - 1)),
            error,
          ];
        }
        return response;
      } catch (err) {
        const duration = Math.round(performance.now() - startTime);
        const error: NetworkError = {
          endpoint: getEndpoint(url),
          status: 0,
          method,
          duration,
          timestamp: new Date().toISOString(),
        };
        networkErrors.current = [...networkErrors.current.slice(-(maxNetworkErrors - 1)), error];
        throw err;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [maxNetworkErrors]);

  // Click tracking for breadcrumbs
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const breadcrumb: Breadcrumb = {
        type: 'click',
        target: getElementDescriptor(target),
        timestamp: new Date().toISOString(),
      };
      breadcrumbs.current = [...breadcrumbs.current.slice(-(maxBreadcrumbs - 1)), breadcrumb];
    };

    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, [maxBreadcrumbs]);

  // Navigation tracking
  useEffect(() => {
    const handleNavigation = () => {
      const breadcrumb: Breadcrumb = {
        type: 'navigation',
        target: window.location.pathname,
        timestamp: new Date().toISOString(),
      };
      breadcrumbs.current = [...breadcrumbs.current.slice(-(maxBreadcrumbs - 1)), breadcrumb];
    };

    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, [maxBreadcrumbs]);

  const addBreadcrumb = useCallback(
    (breadcrumb: Omit<Breadcrumb, 'timestamp'>) => {
      const fullBreadcrumb: Breadcrumb = {
        ...breadcrumb,
        timestamp: new Date().toISOString(),
      };
      breadcrumbs.current = [...breadcrumbs.current.slice(-(maxBreadcrumbs - 1)), fullBreadcrumb];
    },
    [maxBreadcrumbs]
  );

  const captureContext = useCallback((): CapturedContext => {
    return {
      // URL and routing
      url: redactUrl(window.location.href, config.redact),
      route: window.location.pathname,

      // Screen identity
      screenId: config.screenId,
      pageName: config.pageName,

      // Build identity
      appVersion: config.appVersion,
      buildSha: config.buildSha,
      componentVersion: config.componentVersion,
      env: config.env,

      // Browser context
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      userAgent: navigator.userAgent,
      language: navigator.language,
      timestamp: new Date().toISOString(),

      // Captured errors and actions
      consoleErrors: consoleErrors.current.slice(-maxConsoleErrors),
      networkErrors: networkErrors.current.slice(-maxNetworkErrors),
      breadcrumbs: breadcrumbs.current.slice(-maxBreadcrumbs),
    };
  }, [config.appVersion, config.buildSha, config.componentVersion, config.env, config.pageName, config.screenId, config.redact, maxConsoleErrors, maxNetworkErrors, maxBreadcrumbs]);

  const openFeedback = useCallback((initialState?: Partial<FeedbackFormState>) => {
    setInitialFormState({ type: 'feedback', ...initialState });
    setSubmitError(null);
    setIsOpen(true);
  }, []);

  const openBugReport = useCallback((initialState?: Partial<FeedbackFormState>) => {
    setInitialFormState({ type: 'bug_report', ...initialState });
    setSubmitError(null);
    setIsOpen(true);
  }, []);

  // Quick API for programmatic bug reporting
  const reportBug = useCallback((options?: { title?: string; description?: string }) => {
    setInitialFormState({
      type: 'bug_report',
      title: options?.title || '',
      description: options?.description || '',
    });
    setSubmitError(null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setInitialFormState({});
    setSubmitError(null);
  }, []);

  const submit = useCallback(
    async (formState: FeedbackFormState, screenshot?: string, highlightedElement?: {
      selector: string;
      boundingBox: { x: number; y: number; width: number; height: number };
      tagName: string;
      text?: string;
    }): Promise<{ success: boolean; reportId?: string }> => {
      setIsSubmitting(true);
      setSubmitError(null);

      try {
        // Build context based on consent toggles
        const fullContext = captureContext();
        const context = {
          ...fullContext,
          // Respect consent toggles
          consoleErrors: formState.includeTechnicalDetails ? fullContext.consoleErrors : [],
          networkErrors: formState.includeTechnicalDetails ? fullContext.networkErrors : [],
          breadcrumbs: formState.includeRecentSteps ? fullContext.breadcrumbs : [],
          userAgent: formState.includeTechnicalDetails ? fullContext.userAgent : undefined,
          viewport: formState.includeTechnicalDetails ? fullContext.viewport : { width: 0, height: 0 },
        };

        const event: FeedbackEvent = {
          type: formState.type,
          project_id: config.projectId,
          timestamp: new Date().toISOString(),
          title: redactSecrets(formState.title),
          description: redactSecrets(formState.description),
          category: formState.category,
          severity: formState.severity,
          impact: formState.impact,
          email: formState.includeEmail ? formState.email : undefined,
          context,
          screenshot: formState.includeScreenshot ? screenshot : undefined,
          highlighted_element: highlightedElement ? {
            selector: highlightedElement.selector,
            bounding_box: highlightedElement.boundingBox,
            tag_name: highlightedElement.tagName,
            text: highlightedElement.text,
          } : undefined,
          // User identity (minimal)
          user_id: config.userId,
          tenant_id: config.tenantId,
          role: config.role,
          bernstein_run_id: config.bernsteinRunId,
          metadata: config.metadata,
        };

        const result = await config.adapter.submit(event);

        if (result.success) {
          setLastReportId(result.id || null);
          close();
          return { success: true, reportId: result.id };
        } else {
          setSubmitError(result.error || 'Failed to submit feedback');
          return { success: false };
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred');
        return { success: false };
      } finally {
        setIsSubmitting(false);
      }
    },
    [config, captureContext, close]
  );

  const value: FeedbackContextValue = {
    config: config as FeedbackConfig,
    isOpen,
    isSubmitting,
    submitError,
    lastReportId,
    openFeedback,
    openBugReport,
    reportBug,
    close,
    submit,
    captureContext,
    addBreadcrumb,
    initialFormState,
  };

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

// Utility functions

function redactUrl(url: string, patterns?: RegExp[]): string {
  if (!patterns || patterns.length === 0) return url;

  let redacted = url;
  for (const pattern of patterns) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

function getElementDescriptor(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const classes = el.className && typeof el.className === 'string'
    ? `.${el.className.split(' ').filter(Boolean).join('.')}`
    : '';
  const text = el.textContent?.slice(0, 30).trim() || '';
  const textPart = text ? ` "${text}${text.length >= 30 ? '...' : ''}"` : '';

  return `${tag}${id}${classes}${textPart}`;
}

/**
 * Redact common secrets from user-provided text
 * Catches emails, phone numbers, API keys, tokens, credit cards, SSNs
 */
function redactSecrets(text: string): string {
  if (!text) return text;

  return text
    // Email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    // Phone numbers (various formats)
    .replace(/(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g, '[PHONE]')
    // Credit card numbers (13-19 digits, possibly with spaces/dashes)
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{1,7}\b/g, '[CARD]')
    // SSN
    .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, '[SSN]')
    // API keys / tokens (long alphanumeric strings)
    .replace(/\b(sk_live_|pk_live_|sk_test_|pk_test_|api[_-]?key[=:]\s*)[a-zA-Z0-9]{20,}/gi, '[API_KEY]')
    // Bearer tokens
    .replace(/bearer\s+[a-zA-Z0-9._-]{20,}/gi, '[TOKEN]')
    // Generic long hex/base64 strings (likely tokens)
    .replace(/\b[a-f0-9]{32,}\b/gi, '[TOKEN]')
    // AWS keys
    .replace(/AKIA[0-9A-Z]{16}/g, '[AWS_KEY]')
    // Passwords in common formats
    .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]');
}
