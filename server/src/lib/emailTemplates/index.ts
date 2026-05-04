// Barrel + dispatcher for the branded email templates.
//
// The emailWorker imports `renderEmail` from this module and passes in
// the event_type + context it read from email_queue. Each templated
// event lives in its own file; new events should follow the same
// pattern (one file per template + one case added to renderEmail).

import { RenderedEmail } from './shared';
import { renderResolveEmail, type ResolveContext } from './resolve';
import { renderPlanWarningEmail, type PlanWarningContext } from './planWarning';
import { renderPlanLimitEmail, type PlanLimitContext } from './planLimit';
import { renderInviteEmail, type InviteContext } from './invite';

export type EmailEventType = 'resolved' | 'plan_warning' | 'plan_limit' | 'invite';

export type {
    ResolveContext,
    PlanWarningContext,
    PlanLimitContext,
    InviteContext,
    RenderedEmail,
};

export { renderResolveEmail } from './resolve';
export { renderPlanWarningEmail } from './planWarning';
export { renderPlanLimitEmail } from './planLimit';
export { renderInviteEmail } from './invite';

/**
 * Pick and render the email template for a queued row.
 * Returns null if:
 *   - context is missing (legacy row predating the JSONB column),
 *   - the event_type doesn't map to a known template, or
 *   - the template function throws while rendering.
 * In any of those cases the worker falls back to the plain-text body
 * written by the SQL trigger, so we never lose a notification.
 */
export function renderEmail(
    eventType: EmailEventType,
    context: Record<string, unknown> | null | undefined,
): RenderedEmail | null {
    if (!context) return null;
    try {
        switch (eventType) {
            case 'resolved':
                return renderResolveEmail(context as unknown as ResolveContext);
            case 'plan_warning':
                return renderPlanWarningEmail(context as unknown as PlanWarningContext);
            case 'plan_limit':
                return renderPlanLimitEmail(context as unknown as PlanLimitContext);
            case 'invite':
                return renderInviteEmail(context as unknown as InviteContext);
            default:
                return null;
        }
    } catch (err) {
        console.warn('[email] template render failed:', err);
        return null;
    }
}
