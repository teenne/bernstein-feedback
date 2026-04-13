import { BRAND, escapeHtml } from './shared';

export interface ShellOptions {
    /** Short line shown in the amber pill + as the HTML <title> + preheader. */
    headline: string;
    /** Small emoji/glyph next to the headline (e.g. '✓', '⚠', '⛔'). */
    accentGlyph: string;
    /** Inner HTML — the template-specific body, already HTML-escaped. */
    innerHtml: string;
    /** Optional CTA button rendered after the body. */
    cta?: { text: string; href: string };
}

/**
 * Wraps inner template content in the shared BERNSTEIN email chrome:
 * amber header with wordmark, amber accent pill, card body, footer.
 *
 * Fully inline CSS + table layout — renders correctly in Gmail,
 * Outlook, Apple Mail, and most web clients.
 */
export function renderShell(opts: ShellOptions): string {
    // Header brand mark.
    //
    // We intentionally DON'T use an <img> by default:
    //   • cid: attachments fail in webmail preview frames (ERR_UNKNOWN_URL_SCHEME)
    //   • data: URIs get stripped by some clients
    //   • Local filesystem URLs obviously can't be fetched by Gmail/Outlook/etc.
    //
    // Instead we render a CSS "brand badge" — an orange rounded square with
    // the 🐞 emoji on it — next to the BERNSTEIN wordmark. This renders
    // identically in every email client, every forward, every "show original"
    // view, and every webmail preview. No attachments, no external requests,
    // no broken image fallback.
    //
    // If you later want the real hexagonal logo (e.g. in production), set
    // BERNSTEIN_LOGO_URL to a publicly reachable HTTPS URL and we'll use an
    // <img> pointing at that URL. Filesystem paths and cid:/data: do NOT work.
    const externalLogoUrl = process.env.BERNSTEIN_LOGO_URL;
    const logoMarkup = externalLogoUrl && /^https?:\/\//i.test(externalLogoUrl)
        ? `<img src="${escapeHtml(externalLogoUrl)}" alt="" width="36" height="36" style="display:inline-block;vertical-align:middle;border:0;outline:none;text-decoration:none;border-radius:8px;background:transparent;" />`
        : `<span style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;font-size:20px;background-color:rgba(255,255,255,0.22);border-radius:8px;vertical-align:middle;">🐞</span>`;

    const ctaBlock = opts.cta
        ? `
          <tr>
            <td style="padding:8px 32px 32px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="${BRAND.primary}" style="border-radius:8px;">
                    <a href="${escapeHtml(opts.cta.href)}"
                       style="display:inline-block;padding:12px 24px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      ${escapeHtml(opts.cta.text)}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(opts.headline)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.pageBg};font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!-- Preheader (hidden from render, shown in inbox preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">
    ${escapeHtml(opts.headline)}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.pageBg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
               style="max-width:600px;width:100%;background-color:${BRAND.cardBg};border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(15,23,42,0.06);">

          <!-- Header band -->
          <tr>
            <td style="background-color:${BRAND.primary};padding:20px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    ${logoMarkup}
                    <span style="display:inline-block;margin-left:10px;vertical-align:middle;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:1px;color:#ffffff;">
                      ${BRAND.name}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Accent pill -->
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <div style="display:inline-block;padding:6px 12px;background-color:${BRAND.bgSoft};color:${BRAND.primaryDark};border-radius:999px;font-size:12px;font-weight:600;letter-spacing:0.3px;">
                ${opts.accentGlyph} ${escapeHtml(opts.headline)}
              </div>
            </td>
          </tr>

          <!-- Inner content -->
          <tr>
            <td style="padding:8px 32px 24px 32px;color:${BRAND.textPrimary};font-size:15px;line-height:1.6;">
              ${opts.innerHtml}
            </td>
          </tr>

          ${ctaBlock}

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px 32px;border-top:1px solid ${BRAND.border};">
              <p style="margin:0;font-size:13px;line-height:1.5;color:${BRAND.textSecondary};">
                — ${BRAND.tagline}
              </p>
              <p style="margin:4px 0 0 0;font-size:12px;line-height:1.5;color:${BRAND.textSecondary};">
                You're receiving this because your feedback was acted on.
                No further action is needed.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
