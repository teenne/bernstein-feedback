import { BRAND } from './shared';

/**
 * Table-based progress bar that works in every email client, including
 * Outlook. Shared by planWarning and planLimit templates.
 */
export function renderUsageBar(used: number, limit: number): string {
    const pct = Math.min(100, Math.round((used / limit) * 100));
    return `
      <div style="margin:8px 0 4px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
               style="background-color:${BRAND.pageBg};border-radius:999px;height:10px;">
          <tr>
            <td width="${pct}%" bgcolor="${BRAND.primary}"
                style="height:10px;line-height:10px;font-size:0;border-radius:999px;">&nbsp;</td>
            <td bgcolor="${BRAND.pageBg}"
                style="height:10px;line-height:10px;font-size:0;">&nbsp;</td>
          </tr>
        </table>
      </div>
      <p style="margin:6px 0 0 0;font-size:12px;color:${BRAND.textSecondary};">
        <strong style="color:${BRAND.textPrimary};">${used}</strong> / ${limit} tickets used this month (${pct}%)
      </p>`;
}
