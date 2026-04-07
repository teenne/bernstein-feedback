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
import { redactSecrets, redactUrl, getElementDescriptor } from './utils/redact';

interface HighlightedElement {
  selector: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  tagName: string;
  text?: string;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
  feedbackId?: string;
}

interface FeedbackContextValue {
  config: FeedbackConfig;
  isOpen: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  lastReportId: string | null;
  toast: Toast | null;
  dismissToast: () => void;
  openFeedback: (initialState?: Partial<FeedbackFormState>) => void;
  openBugReport: (initialState?: Partial<FeedbackFormState>) => void;
  /** Quick API to report a bug with prefilled text */
  reportBug: (options?: { title?: string; description?: string }) => void;
  close: () => void;
  submit: (formState: FeedbackFormState, screenshots?: string[], highlightedElement?: HighlightedElement) => Promise<{ success: boolean; reportId?: string }>;
  captureContext: () => CapturedContext;
  /** Track a custom breadcrumb */
  addBreadcrumb: (breadcrumb: Omit<Breadcrumb, 'timestamp'>) => void;
  /** Update screen identity for navigation tracking */
  setScreen: (screen: { screenId?: string; pageName?: string }) => void;
  initialFormState: Partial<FeedbackFormState>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

/**
 * Hook to access the feedback context and controls.
 * @throws {Error} if used outside of a FeedbackProvider.
 */
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

/**
 * Provider component for the Bernstein Feedback system.
 * Handles state, error capture, and feedback submission.
 */
export function FeedbackProvider({ children, config }: FeedbackProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [lastReportId, setLastReportId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [initialFormState, setInitialFormState] = useState<Partial<FeedbackFormState>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dynamic screen identity state
  const [screenIdentity, setScreenIdentity] = useState<{ screenId?: string; pageName?: string }>({
    screenId: config.screenId,
    pageName: config.pageName,
  });

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

  const dismissToast = useCallback(() => {
    setToast(null);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
  }, []);

  const showToast = useCallback((newToast: Toast) => {
    // Clear any existing timeout
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    setToast(newToast);

    const duration = config.toastDuration ?? 5000;
    if (duration > 0) {
      toastTimeoutRef.current = setTimeout(() => {
        setToast(null);
        toastTimeoutRef.current = null;
      }, duration);
    }
  }, [config.toastDuration]);

  const captureContext = useCallback((): CapturedContext => {
    return {
      // URL and routing
      url: redactUrl(window.location.href, config.redact),
      route: window.location.pathname,

      // Screen identity (dynamic from setScreen or config fallback)
      screenId: screenIdentity.screenId ?? config.screenId,
      pageName: screenIdentity.pageName ?? config.pageName,

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
  }, [config.appVersion, config.buildSha, config.componentVersion, config.env, config.pageName, config.screenId, config.redact, screenIdentity, maxConsoleErrors, maxNetworkErrors, maxBreadcrumbs]);

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
    async (formState: FeedbackFormState, screenshots?: string[], highlightedElement?: {
      selector: string;
      boundingBox: { x: number; y: number; width: number; height: number };
      tagName: string;
      text?: string;
    }): Promise<{ success: boolean; reportId?: string }> => {
      setIsSubmitting(true);
      setSubmitError(null);

      try {
        // Validate project_id before submitting
        if (!config.projectId) {
          const msg = 'No project selected. Please create or select a project before submitting feedback.';
          setSubmitError(msg);
          showToast({ type: 'error', message: msg });
          return { success: false };
        }

        // Build context based on consent toggles
        const fullContext = captureContext();
        const context = {
          ...fullContext,
          // Respect consent toggles
          consoleErrors: formState.includeTechnicalDetails ? fullContext.consoleErrors : [],
          networkErrors: formState.includeTechnicalDetails ? fullContext.networkErrors : [],
          breadcrumbs: formState.includeRecentSteps ? fullContext.breadcrumbs : [],
          userAgent: formState.includeTechnicalDetails ? fullContext.userAgent : '',
          viewport: formState.includeTechnicalDetails ? fullContext.viewport : { width: 0, height: 0 },
        };

        const event: FeedbackEvent = {
          type: formState.type,
          project_id: config.projectId,
          timestamp: new Date().toISOString(),
          event_id: crypto.randomUUID(),
          title: redactSecrets(formState.title),
          description: redactSecrets(formState.description),
          category: formState.category,
          severity: formState.severity,
          impact: formState.impact,
          email: formState.includeEmail ? formState.email : undefined,
          context,
          screenshots: formState.includeScreenshot ? screenshots : undefined,
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
          showToast({
            type: 'success',
            message: 'Thanks for your feedback\!',
            feedbackId: result.id,
          });
          return { success: true, reportId: result.id };
        } else {
          setSubmitError(result.error || 'Failed to submit feedback');
          showToast({
            type: 'error',
            message: result.error || 'Failed to submit feedback',
          });
          return { success: false };
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
        setSubmitError(errorMessage);
        showToast({
          type: 'error',
          message: errorMessage,
        });
        return { success: false };
      } finally {
        setIsSubmitting(false);
      }
    },
    [config, captureContext, close, showToast]
  );

  const setScreen = useCallback((screen: { screenId?: string; pageName?: string }) => {
    setScreenIdentity(prev => ({ ...prev, ...screen }));
  }, []);

  const value: FeedbackContextValue = {
    config: config as FeedbackConfig,
    isOpen,
    isSubmitting,
    submitError,
    lastReportId,
    toast,
    dismissToast,
    openFeedback,
    openBugReport,
    reportBug,
    close,
    submit,
    captureContext,
    addBreadcrumb,
    setScreen,
    initialFormState,
  };

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

// Utility functions (redactSecrets, redactUrl, getElementDescriptor) are
// imported from './utils/redact' at the top of this file.
