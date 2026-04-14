import { BRAND, RenderedEmail, escapeHtml } from './shared';
import { renderShell } from './shell';
import { renderUsageBar } from './usageBar';

export interface PlanLimitContext {
    project_id: string;
    project_name?: string;
    ticket_count: number;
    max_tickets: number;
    month: string;
}

/**
 * "Monthly limit reached" — sent to the project owner when
 * `project_usage.ticket_count` reaches `max_tickets_per_month`.
 * The widget is already in read-only mode when this fires.
 */
export function renderPlanLimitEmail(ctx: PlanLimitContext): RenderedEmail {
    const projectLabel = ctx.project_name || ctx.project_id;
    const subject = `Your project "${projectLabel}" has reached its monthly feedback limit`;

    const text = [
        'Hi,',
        '',
        `Your project "${projectLabel}" has received ${ctx.ticket_count} tickets this month, which is the limit on your current plan.`,
        '',
        'What happens now:',
        '  • Existing tickets and notifications continue as normal',
        '  • New feedback submissions are held in read-only mode',
        '  • Service resumes automatically next month, or immediately when you upgrade',
        '',
        `— ${BRAND.tagline}`,
    ].join('\n');

    const inner = `
      <p style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:${BRAND.textPrimary};">
        Monthly limit reached — widget now in read-only mode.
      </p>
      <p style="margin:0 0 16px 0;color:${BRAND.textSecondary};">
        Project: <strong style="color:${BRAND.textPrimary};">${escapeHtml(projectLabel)}</strong>
      </p>

      ${renderUsageBar(ctx.ticket_count, ctx.max_tickets)}

      <div style="margin:20px 0 0 0;padding:16px 18px;background-color:${BRAND.bgSoft};border:1px solid ${BRAND.primary};border-radius:8px;">
        <div style="font-size:13px;font-weight:600;color:${BRAND.primaryDark};margin-bottom:8px;">
          What happens now
        </div>
        <ul style="margin:0;padding-left:20px;color:${BRAND.textPrimary};font-size:14px;line-height:1.8;">
          <li>Existing tickets and notifications continue as normal.</li>
          <li>New feedback submissions are held in read-only mode.</li>
          <li>Service resumes next month, or immediately when you upgrade.</li>
        </ul>
      </div>
    `;

    const html = renderShell({
        headline: 'Monthly limit reached',
        accentGlyph: '⛔',
        innerHtml: inner,
    });

    return { subject, text, html };
}
