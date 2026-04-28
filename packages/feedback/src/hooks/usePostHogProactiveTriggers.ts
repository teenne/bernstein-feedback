import { useEffect } from 'react';
import { useFeedback } from '../context';
import type { PostHogLike } from '../sessionProviders/posthog';

interface PostHogWithEvents extends PostHogLike {
    /** PostHog v1.x event subscription. Returns an unsubscribe function. */
    on?: (event: 'eventCaptured', callback: (capturedEvent: PostHogCapturedEvent) => void) => () => void;
}

interface PostHogCapturedEvent {
    event?: string;
    properties?: Record<string, unknown>;
}

interface UsePostHogProactiveTriggersOptions {
    /** PostHog instance — the same one passed to posthogSessionProvider. */
    posthog: PostHogWithEvents;
    /**
     * Minimum ms between two proactive prompts from PostHog events.
     * Prevents duplicate prompts when errors fire in a short burst.
     * Default: 60 000 (1 minute).
     */
    cooldownMs?: number;
    /**
     * Number of consecutive $exception events within 10 s that trigger
     * the error-burst prompt. Default: 3.
     */
    errorThreshold?: number;
}

/**
 * Subscribes to PostHog's own `$rageclick` and `$exception` capture events
 * and opens the Bernstein bug-report panel when the thresholds are crossed.
 *
 * Use this alongside (or instead of) the built-in useRageClickDetector /
 * useErrorBurstDetector hooks when your project already runs PostHog — you
 * get deduplication from PostHog's own event pipeline rather than
 * maintaining two parallel detectors.
 *
 * @example
 *   import posthog from 'posthog-js';
 *   import { usePostHogProactiveTriggers } from '@bernstein/feedback';
 *
 *   function App() {
 *     usePostHogProactiveTriggers({ posthog });
 *     return <YourApp />;
 *   }
 *
 * Must be rendered inside a <FeedbackProvider>.
 */
export function usePostHogProactiveTriggers({
    posthog,
    cooldownMs = 60_000,
    errorThreshold = 3,
}: UsePostHogProactiveTriggersOptions): void {
    const { openBugReport } = useFeedback();

    useEffect(() => {
        if (typeof posthog.on !== 'function') return;

        let lastFiredAt = 0;
        let errorCount = 0;
        let errorResetTimer: ReturnType<typeof setTimeout> | null = null;

        const maybeOpen = (title: string, description: string) => {
            const now = Date.now();
            if (now - lastFiredAt < cooldownMs) return;
            lastFiredAt = now;
            openBugReport({ title, description });
        };

        const off = posthog.on('eventCaptured', (ev) => {
            if (!ev?.event) return;

            if (ev.event === '$rageclick') {
                maybeOpen(
                    'Something seems frustrating',
                    'Multiple rapid clicks were detected. Was something not responding as expected?',
                );
                return;
            }

            if (ev.event === '$exception') {
                errorCount += 1;
                if (errorResetTimer) clearTimeout(errorResetTimer);
                errorResetTimer = setTimeout(() => { errorCount = 0; }, 10_000);
                if (errorCount >= errorThreshold) {
                    errorCount = 0;
                    maybeOpen(
                        'We noticed some errors',
                        'Several JavaScript errors occurred in your session. Would you like to tell us what happened?',
                    );
                }
            }
        });

        return () => {
            if (typeof off === 'function') off();
            if (errorResetTimer) clearTimeout(errorResetTimer);
        };
    }, [posthog, openBugReport, cooldownMs, errorThreshold]);
}
