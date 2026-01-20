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

interface FeedbackContextValue {
  config: FeedbackConfig;
  isOpen: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  openFeedback: (initialState?: Partial<FeedbackFormState>) => void;
  openBugReport: (initialState?: Partial<FeedbackFormState>) => void;
  close: () => void;
  submit: (formState: FeedbackFormState, screenshot?: string) => Promise<boolean>;
  captureContext: () => CapturedContext;
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

  // Network error capture
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method || 'GET';

      try {
        const response = await originalFetch(input, init);
        if (!response.ok) {
          const error: NetworkError = {
            url: redactUrl(url, config.redact),
            status: response.status,
            method,
            timestamp: new Date().toISOString(),
          };
          networkErrors.current = [
            ...networkErrors.current.slice(-(maxNetworkErrors - 1)),
            error,
          ];
        }
        return response;
      } catch (err) {
        const error: NetworkError = {
          url: redactUrl(url, config.redact),
          status: 0,
          method,
          timestamp: new Date().toISOString(),
        };
        networkErrors.current = [...networkErrors.current.slice(-(maxNetworkErrors - 1)), error];
        throw err;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [maxNetworkErrors, config.redact]);

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
      url: redactUrl(window.location.href, config.redact),
      route: window.location.pathname,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      userAgent: navigator.userAgent,
      language: navigator.language,
      appVersion: config.appVersion,
      timestamp: new Date().toISOString(),
      consoleErrors: consoleErrors.current.slice(-maxConsoleErrors),
      networkErrors: networkErrors.current.slice(-maxNetworkErrors),
      breadcrumbs: breadcrumbs.current.slice(-maxBreadcrumbs),
    };
  }, [config.appVersion, config.redact, maxConsoleErrors, maxNetworkErrors, maxBreadcrumbs]);

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

  const close = useCallback(() => {
    setIsOpen(false);
    setInitialFormState({});
    setSubmitError(null);
  }, []);

  const submit = useCallback(
    async (formState: FeedbackFormState, screenshot?: string): Promise<boolean> => {
      setIsSubmitting(true);
      setSubmitError(null);

      try {
        const event: FeedbackEvent = {
          type: formState.type,
          project_id: config.projectId,
          timestamp: new Date().toISOString(),
          title: formState.title,
          description: formState.description,
          category: formState.category,
          severity: formState.severity,
          email: formState.email,
          context: captureContext(),
          screenshot: formState.includeScreenshot ? screenshot : undefined,
          bernstein_run_id: config.bernsteinRunId,
          user_id: config.userId,
          metadata: config.metadata,
        };

        const result = await config.adapter.submit(event);

        if (result.success) {
          close();
          return true;
        } else {
          setSubmitError(result.error || 'Failed to submit feedback');
          return false;
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred');
        return false;
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
    openFeedback,
    openBugReport,
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
