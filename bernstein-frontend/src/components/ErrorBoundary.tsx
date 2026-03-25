import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
    children: ReactNode;
    /** Optional fallback UI to render on error. Defaults to rendering nothing. */
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

/**
 * Error boundary that wraps the feedback widget's UI.
 *
 * If the widget crashes (render error, effect error caught by React),
 * this boundary catches it and renders nothing — ensuring the host
 * application is never broken by the feedback widget.
 *
 * Errors are logged to console.warn so developers can still debug.
 */
export class FeedbackErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // Use console.warn to avoid triggering the widget's own console.error interceptor
        console.warn(
            '[bernstein/feedback] Widget encountered a rendering error and was disabled to protect the host app.',
            { error: error.message, stack: error.stack, componentStack: errorInfo.componentStack }
        );
    }

    render(): ReactNode {
        if (this.state.hasError) {
            return this.props.fallback ?? null;
        }
        return this.props.children;
    }
}
