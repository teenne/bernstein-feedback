import { BRAND, RenderedEmail, escapeHtml, formatDate } from './shared';
import { renderShell } from './shell';

export interface NewFeedbackContext {
    project_id: string;
    project_name?: string;
    feedback_id: string;
    feedback_title?: string;
    feedback_type?: 'feedback' | 'bug_report' | 'feature_request';
    description_preview?: string | null;
    submitted_at?: string | null;
}

function typeLabel(type: NewFeedbackContext['feedback_type']): string {
    switch (type) {
        case 'bug_report':      return 'Bug report';
        case 'feature_request': return 'Feature request';
        default:                return 'Feedback';
    }
}

function typeGlyph(type: NewFeedbackContext['feedback_type']): string {
    switch (type) {
        case 'bug_report':      return '🐛';
        case 'feature_request': return '✨';
        default:                return '💬';
    }
}

/**
 * "New feedback submitted" — sent to project subscribers (owner/admin/member
 * who clicked the bell icon) when a new ticket arrives in their project.
 */
export function renderNewFeedbackEmail(ctx: NewFeedbackContext): RenderedEmail {
    const projectLabel = ctx.project_name || ctx.project_id;
    const title        = ctx.feedback_title || '(no title)';
    const label        = typeLabel(ctx.feedback_type);
    const glyph        = typeGlyph(ctx.feedback_type);
    const preview      = (ctx.description_preview ?? '').trim();
    const submittedAt  = formatDate(ctx.submitted_at);

    const subject = `New ${label.toLowerCase()} in ${projectLabel}: "${title}"`;

    const text = [
        'Hi,',
        '',
        `A new ${label.toLowerCase()} was just submitted in ${projectLabel}.`,
        '',
        `  "${title}"`,
        '',
        ...(preview ? [`Description:`, `  ${preview.slice(0, 200)}`, ''] : []),
        ...(submittedAt ? [`Submitted: ${submittedAt}`, ''] : []),
        `— ${BRAND.tagline}`,
    ].join('\n');

    const typeBadge = `<span style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:600;color:${BRAND.textSecondary};background-color:${BRAND.pageBg};border:1px solid ${BRAND.border};border-radius:4px;text-transform:uppercase;letter-spacing:0.3px;">${escapeHtml(label)}</span>`;

    const previewBlock = preview
        ? `<div style="margin:16px 0;padding:12px 16px;border-left:3px solid ${BRAND.primary};background-color:${BRAND.bgSoft};color:${BRAND.textPrimary};font-size:14px;line-height:1.6;border-radius:0 6px 6px 0;">
             ${escapeHtml(preview.slice(0, 200)).replace(/\n/g, '<br/>')}
           </div>`
        : '';

    const inner = `
      <p style="margin:0 0 12px 0;font-size:18px;font-weight:600;color:${BRAND.textPrimary};">
        New ${escapeHtml(label.toLowerCase())} submitted.
      </p>
      <p style="margin:0 0 16px 0;color:${BRAND.textSecondary};">
        ${typeBadge} &nbsp;in <strong style="color:${BRAND.textPrimary};">${escapeHtml(projectLabel)}</strong>
      </p>

      <div style="margin:16px 0;padding:16px 18px;background-color:${BRAND.pageBg};border:1px solid ${BRAND.border};border-radius:8px;">
        <div style="font-size:12px;font-weight:600;color:${BRAND.textSecondary};text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px;">
          Title
        </div>
        <div style="font-size:15px;color:${BRAND.textPrimary};line-height:1.5;">
          ${escapeHtml(title)}
        </div>
      </div>

      ${previewBlock}

      ${submittedAt ? `<p style="margin:16px 0 0 0;font-size:12px;color:${BRAND.textSecondary};">Submitted on ${escapeHtml(submittedAt)}.</p>` : ''}
    `;

    const html = renderShell({
        headline:    `New ${label.toLowerCase()} in ${projectLabel}`,
        accentGlyph: glyph,
        innerHtml:   inner,
    });

    return { subject, text, html };
}
