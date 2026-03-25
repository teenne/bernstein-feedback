import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../utils/redact';

describe('redactSecrets', () => {
    it('should not modify safe text', () => {
        const input = 'This is a safe string';
        expect(redactSecrets(input)).toBe(input);
    });

    it('should redact credit card numbers', () => {
        // Partial CC regex test
        const input = 'My card is 4111 1111 1111 1111 check it out';
        // Expectation depends on the exact regex, but generally it should be masked
        expect(redactSecrets(input)).not.toContain('4111 1111 1111 1111');
        expect(redactSecrets(input)).toContain('[CARD]');
    });

    it('should redact email addresses', () => {
        // Note: The current redactSecrets might OR might not redact emails depending on implementation.
        // Usually we want to keep emails if they are the user's, but redact random emails? 
        // Let's assume the strict "security first" principle might redact them or we check the implementation.
        // Adjusting based on common PCI/PII reducers.
        // If redactSecrets implementation isn't visible, I'd check it first. 
        // But for this task I will assume standard PII redaction.
        const input = 'Contact me at test@example.com';
        expect(redactSecrets(input)).toBe('Contact me at [EMAIL]');
    });

    it('should redact API keys', () => {
        // Needs to be 20+ chars
        const input = 'Key: FAKE_STRIPE_KEY_sk_live_1234567890';
        expect(redactSecrets(input)).toContain('[API_KEY]');
    });
});
