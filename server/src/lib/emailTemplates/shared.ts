// Shared constants + small utilities used by every email template.
// Keep this file dependency-free so it stays easy to reason about and
// safe to import from anywhere.

export const BRAND = {
    name: 'BERNSTEIN',
    tagline: 'Bernstein Feedback',

    // Colors — match the admin app's amber/slate palette.
    primary: '#f59e0b',       // amber-500
    primaryDark: '#d97706',   // amber-600
    bgSoft: '#fffbeb',        // amber-50
    textPrimary: '#0f172a',   // slate-900
    textSecondary: '#64748b', // slate-500
    border: '#e2e8f0',        // slate-200
    cardBg: '#ffffff',
    pageBg: '#f8fafc',        // slate-50
} as const;

export function escapeHtml(s: string | null | undefined): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '';
    }
}

export interface RenderedEmail {
    subject: string;
    text: string;
    html: string;
}
