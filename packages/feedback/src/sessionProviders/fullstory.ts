import type { SessionProvider } from '../schemas';

/**
 * Minimal structural type for the FullStory SDK (both v1 `window.FS` and v2 `@fullstory/browser`).
 */
export interface FullStoryLike {
    /** Returns the URL for the current session. Pass `true` for a timestamped link. */
    getCurrentSessionURL?: (now?: boolean) => string | undefined;
    /** Returns true after FullStory has been fully initialized. */
    isInitialized?: () => boolean;
    /** Identify the current user. */
    identify?: (uid: string, userVars?: Record<string, unknown>) => void;
    /** Set custom user properties without re-identifying. */
    setUserVars?: (userVars: Record<string, unknown>) => void;
    /** Log a custom FullStory event (presence-only sentinel). */
    event?: (eventName: string, eventProperties: Record<string, unknown>) => void;
}

/**
 * Build a {@link SessionProvider} wired to a FullStory instance.
 *
 * @example
 *   import * as FullStory from '@fullstory/browser';
 *   import { FeedbackProvider, fullStorySessionProvider } from '@bernstein/feedback';
 *
 *   FullStory.init({ orgId: 'YOUR_ORG_ID' });
 *
 *   <FeedbackProvider
 *     config={{
 *       projectId: 'myproject',
 *       adapter: myAdapter,
 *       sessionProvider: fullStorySessionProvider(FullStory),
 *     }}
 *   >
 *
 * Behavior:
 * - getSessionId(): extracts the session ID from the replay URL path.
 * - getUserProperties(): returns null — FullStory does not expose read-back
 *   of identity properties via the public SDK.
 * - getReplayUrl(): calls getCurrentSessionURL(true) for a timestamped link.
 *
 * All methods are defensive and return null instead of throwing.
 */
export function fullStorySessionProvider(fullStory: FullStoryLike): SessionProvider {
    return {
        name: 'fullstory',

        getSessionId() {
            try {
                const url = fullStory.getCurrentSessionURL?.();
                if (!url) return null;
                // FullStory replay URLs: https://app.fullstory.com/ui/<org>/session/<id>
                const match = url.match(/\/session\/([^/?#]+)/);
                return match ? match[1] : url;
            } catch {
                return null;
            }
        },

        getUserProperties() {
            return null;
        },

        getReplayUrl(_sessionId) {
            try {
                // Pass `true` to get a timestamped URL that jumps to the current moment.
                return fullStory.getCurrentSessionURL?.(true) || null;
            } catch {
                return null;
            }
        },
    };
}
