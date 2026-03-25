/**
 * Tests for Zod schema validation.
 *
 * Ensures that the runtime validation schemas correctly accept
 * valid feedback events and reject invalid ones.
 */
import { describe, it, expect } from 'vitest';
import {
    FeedbackEventSchema,
    ConsoleErrorSchema,
    NetworkErrorSchema,
    BreadcrumbSchema,
    FeedbackTypeSchema,
    ImpactSchema,
} from '../schemas';

describe('FeedbackEventSchema', () => {
    const validEvent = {
        type: 'bug_report' as const,
        project_id: 'test-project',
        timestamp: new Date().toISOString(),
        title: 'Button does not work',
        description: 'The submit button on the checkout page is unresponsive.',
        impact: 'blocks_me' as const,
        context: {
            url: 'https://example.com/checkout',
            route: '/checkout',
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0',
            timestamp: new Date().toISOString(),
            consoleErrors: [],
            networkErrors: [],
            breadcrumbs: [],
        },
    };

    it('should accept a valid feedback event', () => {
        const result = FeedbackEventSchema.safeParse(validEvent);
        expect(result.success).toBe(true);
    });

    it('should reject an event with missing required title', () => {
        const invalid = { ...validEvent, title: undefined };
        const result = FeedbackEventSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject an event with empty title', () => {
        const invalid = { ...validEvent, title: '' };
        const result = FeedbackEventSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject a title exceeding 200 characters', () => {
        const invalid = { ...validEvent, title: 'x'.repeat(201) };
        const result = FeedbackEventSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should accept a title at exactly 200 characters', () => {
        const valid = { ...validEvent, title: 'x'.repeat(200) };
        const result = FeedbackEventSchema.safeParse(valid);
        expect(result.success).toBe(true);
    });

    it('should reject an invalid type enum value', () => {
        const invalid = { ...validEvent, type: 'complaint' };
        const result = FeedbackEventSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should accept all valid feedback types', () => {
        for (const type of ['feedback', 'bug_report', 'feature_request']) {
            const result = FeedbackTypeSchema.safeParse(type);
            expect(result.success).toBe(true);
        }
    });

    it('should accept all valid impact levels', () => {
        for (const impact of ['blocks_me', 'annoying', 'minor']) {
            const result = ImpactSchema.safeParse(impact);
            expect(result.success).toBe(true);
        }
    });

    it('should reject an invalid impact level', () => {
        const result = ImpactSchema.safeParse('critical');
        expect(result.success).toBe(false);
    });

    it('should accept an event with optional fields omitted', () => {
        const minimal = {
            type: 'feedback' as const,
            project_id: 'test',
            timestamp: new Date().toISOString(),
            title: 'Great app!',
            description: '',
            context: {
                url: 'https://example.com',
                viewport: { width: 375, height: 812 },
                userAgent: 'Safari',
                timestamp: new Date().toISOString(),
                consoleErrors: [],
                networkErrors: [],
                breadcrumbs: [],
            },
        };
        const result = FeedbackEventSchema.safeParse(minimal);
        expect(result.success).toBe(true);
    });
});

describe('ConsoleErrorSchema', () => {
    it('should accept a valid console error', () => {
        const result = ConsoleErrorSchema.safeParse({
            message: 'TypeError: Cannot read property of undefined',
            stack: 'at App.tsx:42',
            timestamp: new Date().toISOString(),
        });
        expect(result.success).toBe(true);
    });

    it('should accept a console error without stack', () => {
        const result = ConsoleErrorSchema.safeParse({
            message: 'Warning: something happened',
            timestamp: new Date().toISOString(),
        });
        expect(result.success).toBe(true);
    });
});

describe('NetworkErrorSchema', () => {
    it('should accept a valid network error', () => {
        const result = NetworkErrorSchema.safeParse({
            endpoint: '/api/users',
            status: 500,
            method: 'GET',
            duration: 342,
            timestamp: new Date().toISOString(),
        });
        expect(result.success).toBe(true);
    });

    it('should accept a network error with requestId', () => {
        const result = NetworkErrorSchema.safeParse({
            endpoint: '/api/checkout',
            status: 422,
            method: 'POST',
            requestId: 'req-abc-123',
            timestamp: new Date().toISOString(),
        });
        expect(result.success).toBe(true);
    });
});

describe('BreadcrumbSchema', () => {
    it('should accept a click breadcrumb', () => {
        const result = BreadcrumbSchema.safeParse({
            type: 'click',
            target: 'button#submit',
            timestamp: new Date().toISOString(),
        });
        expect(result.success).toBe(true);
    });

    it('should accept a navigation breadcrumb', () => {
        const result = BreadcrumbSchema.safeParse({
            type: 'navigation',
            target: '/settings',
            timestamp: new Date().toISOString(),
        });
        expect(result.success).toBe(true);
    });

    it('should reject an invalid breadcrumb type', () => {
        const result = BreadcrumbSchema.safeParse({
            type: 'scroll',
            target: 'body',
            timestamp: new Date().toISOString(),
        });
        expect(result.success).toBe(false);
    });
});
