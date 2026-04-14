import type { SessionProvider } from '../schemas';

/**
 * Shape of the PostHog SDK we actually call — kept as a minimal
 * structural type so we don't force consumers to install
 * `posthog-js` types just to use this helper.
 */
export interface PostHogLike {
    /** Current session id, or null/undefined if a session hasn't started yet. */
    get_session_id?: () => string | null | undefined;
    /** Identity properties for the current user (person properties). */
    get_property?: (key: string) => unknown;
    /** Distinct id + session replay url builder. */
    get_session_replay_url?: (opts?: { withTimestamp?: boolean }) => string | null | undefined;
    /** Fallback for older posthog-js versions — full person object. */
    get_person_profile?: () => { properties?: Record<string, unknown> } | null | undefined;
    /** Full PostHog API host (used to build a replay URL if the SDK helper isn't present). */
    config?: { api_host?: string };
    /** Newer posthog-js versions expose person props via this helper. */
    getFeatureFlag?: unknown; // just a presence sentinel
}

/**
 * Build a {@link SessionProvider} wired to a PostHog instance.
 *
 * @example
 *   import posthog from 'posthog-js';
 *   import { FeedbackProvider, posthogSessionProvider } from 'akk-feedback';
 *
 *   posthog.init(...);
 *
 *   <FeedbackProvider
 *     config={{
 *       projectId: 'myproject',
 *       adapter: myAdapter,
 *       sessionProvider: posthogSessionProvider(posthog),
 *     }}
 *   >
 *
 * Behavior:
 * - getSessionId(): returns the current PostHog session id, or null if none.
 * - getUserProperties(): returns the person properties dict PostHog has
 *   collected via identify() + $set. Reads a curated list of common keys
 *   (email, name, plan, role, tenant, etc.) if the raw dict isn't exposed.
 * - getReplayUrl(sessionId): prefers the official get_session_replay_url()
 *   helper; falls back to manually building the URL from `posthog.config.api_host`.
 *
 * All three methods are defensive — they return null instead of throwing
 * on any error so a broken SDK can never block feedback submission.
 */
export function posthogSessionProvider(posthog: PostHogLike): SessionProvider {
    return {
        name: 'posthog',

        getSessionId() {
            try {
                const id = posthog.get_session_id?.();
                return (typeof id === 'string' && id) ? id : null;
            } catch {
                return null;
            }
        },

        getUserProperties() {
            try {
                // Newer posthog-js exposes the person object directly.
                const person = posthog.get_person_profile?.();
                if (person?.properties) {
                    return person.properties;
                }
                // Fallback: read a curated list of common property keys
                // that PostHog sets via $set / identify().
                if (!posthog.get_property) return null;
                const keys = [
                    'email', 'name', 'username', 'plan', 'plan_id', 'role',
                    'tenant', 'tenant_id', 'organization', 'account_age_days',
                    'signup_date', 'last_seen', '$initial_referrer',
                ];
                const out: Record<string, unknown> = {};
                for (const k of keys) {
                    const v = posthog.get_property(k);
                    if (v != null) out[k] = v;
                }
                return Object.keys(out).length > 0 ? out : null;
            } catch {
                return null;
            }
        },

        getReplayUrl(sessionId) {
            try {
                // Prefer the official helper — it handles cloud vs
                // self-hosted hosts automatically.
                const url = posthog.get_session_replay_url?.({ withTimestamp: true });
                if (typeof url === 'string' && url) return url;

                // Fallback: build from api_host + session id.
                const host = posthog.config?.api_host?.replace(/\/$/, '');
                if (host && sessionId) {
                    return `${host}/project/replay/${encodeURIComponent(sessionId)}`;
                }
                return null;
            } catch {
                return null;
            }
        },
    };
}
