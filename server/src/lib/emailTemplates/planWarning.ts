import { BRAND, RenderedEmail, escapeHtml } from './shared';
import { renderShell } from './shell';
import { renderUsageBar } from './usageBar';

export interface PlanWarningContext {
    project_id: string;
    project_name?: string;
    ticket_count: number;
    max_tickets: number;
    remaining: number;
    month: string;
}

/**
 * "You're at 80% of your monthly limit" — sent to the project owner
 * the first time `project_usage.ticket_count` crosses 80% of the
 * plan's `max_tickets_per_month` in a given month.
 */
export function renderPlanWarningEmail(ctx: PlanWarningContext): RenderedEmail {
    const projectLabel = ctx.project_name || ctx.project_id;
    const pct = Math.round((ctx.ticket_count / ctx.max_tickets) * 100);
    const subject = `Your project "${projectLabel}" is at 80% of its monthly feedback limit`;

    const text = [
        'Hi,',
        '',
        `Your project "${projectLabel}" has received ${ctx.ticket_count} tickets this month — ${pct}% of your plan limit (${ctx.max_tickets}).`,
        '',
        `You have ${ctx.remaining} tickets remaining before new submissions enter read-only mode.`,
        '',
        'To avoid interruption, consider upgrading your plan.',
        '',
        `— ${BRAND.tagline}`,
    ].join('\n');

    const inner = `
      <p style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:${BRAND.textPrimary};">
        You're at ${pct}% of your monthly limit.
      </p>
      <p style="margin:0 0 16px 0;color:${BRAND.textSecondary};">
        Project: <strong style="color:${BRAND.textPrimary};">${escapeHtml(projectLabel)}</strong>
      </p>

      ${renderUsageBar(ctx.ticket_count, ctx.max_tickets)}

      <p style="margin:20px 0 0 0;color:${BRAND.textPrimary};">
        You have <strong>${ctx.remaining}</strong> ticket${ctx.remaining === 1 ? '' : 's'} remaining this month
        before new submissions enter read-only mode.
      </p>

      <p style="margin:16px 0 0 0;color:${BRAND.textSecondary};font-size:14px;">
        To avoid interruption, consider upgrading your plan — you'll get more monthly tickets,
        multiple projects, and advanced features like AI ticket clustering.
      </p>
    `;

    const html = renderShell({
        headline: '80% of monthly limit reached',
        accentGlyph: '⚠',
        innerHtml: inner,
    });

    return { subject, text, html };
}
