import { BRAND, RenderedEmail, escapeHtml, formatDate } from './shared';
import { renderShell } from './shell';

export interface ResolveContext {
    project_id: string;
    project_name?: string;
    feedback_id: string;
    feedback_title?: string;
    feedback_type?: 'feedback' | 'bug_report' | 'feature_request';
    resolution_note?: string | null;
    resolved_at?: string | null;
}

function typeLabel(type: ResolveContext['feedback_type']): string {
    switch (type) {
        case 'bug_report': return 'Bug report';
        case 'feature_request': return 'Feature request';
        default: return 'Feedback';
    }
}

/**
 * "Your feedback has been resolved" — sent to the feedback submitter
 * when an admin transitions a ticket into resolved/closed.
 */
export function renderResolveEmail(ctx: ResolveContext): RenderedEmail {
    const projectLabel = ctx.project_name || ctx.project_id;
    const title = ctx.feedback_title || '(no title)';
    const note = (ctx.resolution_note ?? '').trim();
    const resolvedAt = formatDate(ctx.resolved_at);
    const label = typeLabel(ctx.feedback_type);

    const subject = `Your ${label.toLowerCase()} in ${projectLabel} has been resolved`;

    const text = [
        'Hi,',
        '',
        `Your ${label.toLowerCase()} in ${projectLabel} has been resolved.`,
        '',
        `  "${title}"`,
        '',
        ...(note ? ['The developer left a note:', `  ${note}`, ''] : []),
        ...(resolvedAt ? [`Resolved: ${resolvedAt}`, ''] : []),
        `Thanks for helping improve ${projectLabel}.`,
        '',
        `— ${BRAND.tagline}`,
    ].join('\n');

    const typeBadge = `<span style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:600;color:${BRAND.textSecondary};background-color:${BRAND.pageBg};border:1px solid ${BRAND.border};border-radius:4px;text-transform:uppercase;letter-spacing:0.3px;">${escapeHtml(label)}</span>`;

    const noteBlock = note
        ? `<div style="margin:16px 0;padding:12px 16px;border-left:3px solid ${BRAND.primary};background-color:${BRAND.bgSoft};color:${BRAND.textPrimary};font-size:14px;line-height:1.6;border-radius:0 6px 6px 0;">
             <div style="font-size:12px;font-weight:600;color:${BRAND.primaryDark};text-transform:uppercase;letter-spacing:0.3px;margin-bottom:4px;">
               Resolution note
             </div>
             ${escapeHtml(note).replace(/\n/g, '<br/>')}
           </div>`
        : '';

    const inner = `
      <p style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:${BRAND.textPrimary};">
        Your ${escapeHtml(label.toLowerCase())} has been resolved.
      </p>
      <p style="margin:0 0 16px 0;color:${BRAND.textSecondary};">
        ${typeBadge} &nbsp;in <strong style="color:${BRAND.textPrimary};">${escapeHtml(projectLabel)}</strong>
      </p>

      <div style="margin:16px 0;padding:16px 18px;background-color:${BRAND.pageBg};border:1px solid ${BRAND.border};border-radius:8px;">
        <div style="font-size:12px;font-weight:600;color:${BRAND.textSecondary};text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px;">
          Original submission
        </div>
        <div style="font-size:15px;color:${BRAND.textPrimary};line-height:1.5;">
          ${escapeHtml(title)}
        </div>
      </div>

      ${noteBlock}

      ${resolvedAt ? `<p style="margin:16px 0 0 0;font-size:12px;color:${BRAND.textSecondary};">Resolved on ${escapeHtml(resolvedAt)}.</p>` : ''}

      <p style="margin:24px 0 0 0;color:${BRAND.textPrimary};">
        Thanks for helping improve <strong>${escapeHtml(projectLabel)}</strong>.
      </p>
    `;

    const html = renderShell({
        headline: 'Your feedback has been resolved',
        accentGlyph: '✓',
        innerHtml: inner,
    });

    return { subject, text, html };
}
