import type { SessionProvider } from '../schemas';

/**
 * Minimal structural type for the LogRocket SDK.
 * Keeps consumers from having to install `@logrocket/types` just to use this helper.
 */
export interface LogRocketLike {
    /** Async — fires the callback with the current session URL once it is available. */
    getSessionURL?: (callback: (sessionURL: string) => void) => void;
    /** Some LogRocket builds expose the URL synchronously after init. */
    sessionURL?: string;
    /** Identify the current user (LogRocket.identify). */
    identify?: (uid: string, userVars?: Record<string, unknown>) => void;
    /** SDK version string — presence-only sentinel. */
    version?: string;
}

/**
 * Build a {@link SessionProvider} wired to a LogRocket instance.
 *
 * @example
 *   import LogRocket from 'logrocket';
 *   import { FeedbackProvider, logRocketSessionProvider } from '@bernstein/feedback';
 *
 *   LogRocket.init('org/app');
 *
 *   <FeedbackProvider
 *     config={{
 *       projectId: 'myproject',
 *       adapter: myAdapter,
 *       sessionProvider: logRocketSessionProvider(LogRocket),
 *     }}
 *   >
 *
 * Behavior:
 * - getSessionId(): extracts the session UUID from the replay URL.
 * - getUserProperties(): returns null — LogRocket does not expose read-back
 *   of identify() properties via the public SDK.
 * - getReplayUrl(): returns the cached session URL, or null if the SDK has
 *   not fired the callback yet.
 *
 * All methods are defensive and return null instead of throwing.
 */
export function logRocketSessionProvider(logRocket: LogRocketLike): SessionProvider {
    let cachedURL: string | null = null;

    // Prime the cache as early as possible.
    if (typeof logRocket.getSessionURL === 'function') {
        try {
            logRocket.getSessionURL((url) => { if (url) cachedURL = url; });
        } catch { /* ignore */ }
    }

    return {
        name: 'logrocket',

        getSessionId() {
            try {
                const url = cachedURL || logRocket.sessionURL || null;
                if (!url) return null;
                // LogRocket replay URLs: https://app.logrocket.com/<app>/sessions/<id>?...
                const match = url.match(/\/sessions\/([^/?#]+)/);
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
                return cachedURL || logRocket.sessionURL || null;
            } catch {
                return null;
            }
        },
    };
}
