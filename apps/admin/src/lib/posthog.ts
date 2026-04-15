import posthog from 'posthog-js';

/**
 * PostHog initializer for the admin app.
 *
 * Reads VITE_POSTHOG_KEY + VITE_POSTHOG_HOST from the Vite env.
 * If the key is missing, we skip init entirely and return null, and
 * the app's FeedbackProvider drops `sessionProvider` — no session
 * replay link will appear on submitted tickets, but nothing breaks.
 *
 * Called once at the top of App.tsx (before FeedbackProvider renders).
 */

let initialized = false;

export function initPostHog(): typeof posthog | null {
    if (initialized) return posthog;

    const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
    const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';

    if (!key) {
        // Not a warning — just informational. PostHog is opt-in.
        console.info('[posthog] VITE_POSTHOG_KEY not set; session replay + identity enrichment disabled.');
        return null;
    }

    posthog.init(key, {
        api_host: host,
        capture_pageview: true,
        capture_pageleave: true,
        persistence: 'localStorage+cookie',
        // Session replay is opt-in on the PostHog side (enable in project
        // settings). When enabled, `get_session_replay_url()` returns a
        // real deep link. Disabled projects still give us a session id,
        // which is fine — the admin UI just won't render the replay button.
        disable_session_recording: false,
    });

    initialized = true;
    return posthog;
}

/**
 * Call once per session (after the user logs in) to tell PostHog
 * who they are. Populates the person properties that the
 * posthogSessionProvider surfaces on each ticket.
 */
export function identifyPostHog(userId: string, traits?: Record<string, unknown>): void {
    if (!initialized) return;
    try {
        posthog.identify(userId, traits);
    } catch (err) {
        console.warn('[posthog] identify failed:', err);
    }
}

export function resetPostHog(): void {
    if (!initialized) return;
    try {
        posthog.reset();
    } catch { /* ignore */ }
}

export { posthog };
