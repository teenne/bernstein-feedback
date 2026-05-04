import { RenderedEmail, escapeHtml } from './shared';
import { renderShell } from './shell';

export interface InviteContext {
    invitedByEmail: string;
    inviteUrl: string;
    expiresAt: string;
}

export function renderInviteEmail(ctx: InviteContext): RenderedEmail {
    const innerHtml = `
      <p style="margin:0 0 16px 0;font-size:16px;font-weight:600;color:#0f172a;">
        You've been invited to Bernstein Feedback
      </p>
      <p style="margin:0 0 12px 0;">
        <strong>${escapeHtml(ctx.invitedByEmail)}</strong> has invited you to join the team.
        Click the button below to create your account.
      </p>
      <p style="margin:0;font-size:13px;color:#64748b;">
        This invitation expires on <strong>${escapeHtml(ctx.expiresAt)}</strong>.
      </p>
    `;
    const html = renderShell({
        headline: "Team Invitation",
        accentGlyph: '✉',
        innerHtml,
        cta: { text: 'Accept Invitation & Sign Up', href: ctx.inviteUrl },
    });
    return {
        subject: `You've been invited to Bernstein Feedback`,
        text: `${ctx.invitedByEmail} has invited you to join Bernstein Feedback.\n\nAccept your invitation here: ${ctx.inviteUrl}\n\nThis link expires on ${ctx.expiresAt}.`,
        html,
    };
}
