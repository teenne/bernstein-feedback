import { describe, it, expect } from 'vitest';
import { redactSecrets, redactUrl, getElementDescriptor } from '../utils/redact';

describe('redactSecrets', () => {
    it('returns empty/falsy input unchanged', () => {
        expect(redactSecrets('')).toBe('');
        expect(redactSecrets(null as any)).toBe(null);
        expect(redactSecrets(undefined as any)).toBe(undefined);
    });

    it('redacts email addresses', () => {
        expect(redactSecrets('contact me at john@example.com')).toBe('contact me at [EMAIL]');
        expect(redactSecrets('user+tag@sub.domain.co.uk')).toBe('[EMAIL]');
    });

    it('redacts Stripe API keys', () => {
        const fakeSk = `key is ${'sk' + '_live_' + 'abcdefghijklmnopqrstuvwxyz'}`;
        expect(redactSecrets(fakeSk)).toContain('[API_KEY]');
        const fakePk = 'pk' + '_test_' + '1234567890abcdefghij';
        expect(redactSecrets(fakePk)).toContain('[API_KEY]');
    });

    it('redacts AWS keys', () => {
        expect(redactSecrets('AKIAIOSFODNN7EXAMPLE')).toBe('[AWS_KEY]');
    });

    it('redacts bearer tokens', () => {
        expect(redactSecrets('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.long.token')).toContain('[TOKEN]');
    });

    it('redacts long hex strings (tokens)', () => {
        expect(redactSecrets('token: abcdef1234567890abcdef1234567890')).toContain('[TOKEN]');
    });

    it('redacts credit card numbers', () => {
        expect(redactSecrets('card: 4111-1111-1111-1111')).toContain('[CARD]');
        expect(redactSecrets('card: 4111 1111 1111 1111')).toContain('[CARD]');
    });

    it('redacts SSNs', () => {
        expect(redactSecrets('ssn: 123-45-6789')).toContain('[SSN]');
        expect(redactSecrets('ssn: 123 45 6789')).toContain('[SSN]');
    });

    it('redacts passwords in key=value format', () => {
        expect(redactSecrets('password=mysecretpass')).toBe('password=[REDACTED]');
        expect(redactSecrets('password: hunter2')).toBe('password=[REDACTED]');
    });

    it('redacts phone numbers', () => {
        expect(redactSecrets('call 555-123-4567')).toContain('[PHONE]');
        expect(redactSecrets('call (555) 123-4567')).toContain('[PHONE]');
        expect(redactSecrets('call +1-555-123-4567')).toContain('[PHONE]');
    });

    it('leaves normal text unchanged', () => {
        const text = 'The button on the checkout page is broken';
        expect(redactSecrets(text)).toBe(text);
    });

    it('handles multiple secrets in one string', () => {
        const input = 'user john@test.com password=abc123 called 555-123-4567';
        const result = redactSecrets(input);
        expect(result).toContain('[EMAIL]');
        expect(result).toContain('[REDACTED]');
        expect(result).toContain('[PHONE]');
        expect(result).not.toContain('john@test.com');
        expect(result).not.toContain('abc123');
    });
});

describe('redactUrl', () => {
    it('returns URL unchanged when no patterns provided', () => {
        const url = 'https://api.example.com/users?token=abc';
        expect(redactUrl(url)).toBe(url);
        expect(redactUrl(url, [])).toBe(url);
    });

    it('applies custom regex patterns', () => {
        const url = 'https://api.example.com/users?token=secret123&name=john';
        const patterns = [/token=[^&]+/];
        expect(redactUrl(url, patterns)).toBe('https://api.example.com/users?[REDACTED]&name=john');
    });

    it('applies multiple patterns', () => {
        const url = 'https://api.example.com?key=abc&secret=xyz';
        const patterns = [/key=[^&]+/, /secret=[^&]+/];
        const result = redactUrl(url, patterns);
        expect(result).not.toContain('abc');
        expect(result).not.toContain('xyz');
    });
});

describe('getElementDescriptor', () => {
    it('generates descriptor with tag, id, classes, and text', () => {
        const el = document.createElement('button');
        el.id = 'submit-btn';
        el.className = 'primary large';
        el.textContent = 'Submit Form';

        const result = getElementDescriptor(el);
        expect(result).toBe('button#submit-btn.primary.large "Submit Form"');
    });

    it('handles elements with no id or classes', () => {
        const el = document.createElement('div');
        el.textContent = 'Hello';

        const result = getElementDescriptor(el);
        expect(result).toBe('div "Hello"');
    });

    it('truncates long text to 30 chars with ellipsis', () => {
        const el = document.createElement('p');
        // Needs 30+ chars after slice(0,30).trim() to trigger "..."
        el.textContent = 'Abcdefghij-Abcdefghij-Abcdefghij-this-is-long-enough';

        const result = getElementDescriptor(el);
        expect(result).toContain('...');
        expect(result).toContain('p');
    });

    it('handles empty elements', () => {
        const el = document.createElement('span');
        const result = getElementDescriptor(el);
        expect(result).toBe('span');
    });
});
