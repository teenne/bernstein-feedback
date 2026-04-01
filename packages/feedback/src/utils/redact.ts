/**
 * Redact common secrets from user-provided text.
 * Catches emails, phone numbers, API keys, tokens, credit cards, SSNs.
 *
 * Extracted from context.tsx for testability.
 */
export function redactSecrets(text: string): string {
    if (!text) return text;

    return text
        // API keys / tokens (long alphanumeric strings)
        .replace(/\b(sk_live_|pk_live_|sk_test_|pk_test_|api[_-]?key[=:]\s*)[a-zA-Z0-9]{20,}/gi, '[API_KEY]')
        // AWS keys
        .replace(/AKIA[0-9A-Z]{16}/g, '[AWS_KEY]')
        // Bearer tokens
        .replace(/bearer\s+[a-zA-Z0-9._-]{20,}/gi, '[TOKEN]')
        // Generic long hex/base64 strings (likely tokens)
        .replace(/\b[a-f0-9]{32,}\b/gi, '[TOKEN]')
        // Credit card numbers (13-19 digits, possibly with spaces/dashes)
        .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{1,7}\b/g, '[CARD]')
        // SSN
        .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, '[SSN]')
        // Email addresses
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
        // Passwords in common formats
        .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]')
        // Phone numbers (various formats) - LAST because it's the most aggressive
        .replace(/(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g, '[PHONE]');
}

/**
 * Redact sensitive patterns from captured URLs.
 */
export function redactUrl(url: string, patterns?: RegExp[]): string {
    if (!patterns || patterns.length === 0) return url;

    let redacted = url;
    for (const pattern of patterns) {
        redacted = redacted.replace(pattern, '[REDACTED]');
    }
    return redacted;
}

/**
 * Get a human-readable descriptor for a DOM element (for breadcrumbs).
 */
export function getElementDescriptor(el: HTMLElement): string {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const classes = el.className && typeof el.className === 'string'
        ? `.${el.className.split(' ').filter(Boolean).join('.')}`
        : '';
    const text = el.textContent?.slice(0, 30).trim() || '';
    const textPart = text ? ` "${text}${text.length >= 30 ? '...' : ''}"` : '';

    return `${tag}${id}${classes}${textPart}`;
}
