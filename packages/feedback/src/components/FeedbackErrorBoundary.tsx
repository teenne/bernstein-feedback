import React, { Component, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * "The Safety Net" - Isolates the feedback widget from the host application.
 * If the widget crashes, it renders nothing (or a fallback) to avoid breaking the host.
 */
export class FeedbackErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        // Log silently to avoid console noise for the user, 
        // but in a real app, this should go to your monitoring service (Sentry, etc.)
        console.error('Bernstein Feedback Widget Crashed:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // Render nothing so the broken widget disappears seamlessly
            // Alternatively, render a small "Feedback unavailable" accessible notice
            return null;
        }

        return this.props.children;
    }
}
