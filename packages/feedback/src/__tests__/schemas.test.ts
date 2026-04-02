import { describe, it, expect } from 'vitest';
import {
    ConsoleErrorSchema,
    NetworkErrorSchema,
    BreadcrumbSchema,
    ViewportSchema,
    CapturedContextSchema,
    FeedbackTypeSchema,
    FeedbackCategorySchema,
    SeveritySchema,
    ImpactSchema,
    FeedbackEventSchema,
} from '../schemas';

const NOW = new Date().toISOString();

describe('ConsoleErrorSchema', () => {
    it('validates a valid console error', () => {
        const result = ConsoleErrorSchema.safeParse({
            message: 'TypeError: undefined is not a function',
            stack: 'at App.tsx:42',
            timestamp: NOW,
        });
        expect(result.success).toBe(true);
    });

    it('allows optional stack', () => {
        const result = ConsoleErrorSchema.safeParse({ message: 'Error', timestamp: NOW });
        expect(result.success).toBe(true);
    });

    it('rejects missing message', () => {
        const result = ConsoleErrorSchema.safeParse({ timestamp: NOW });
        expect(result.success).toBe(false);
    });

    it('rejects invalid timestamp', () => {
        const result = ConsoleErrorSchema.safeParse({ message: 'Error', timestamp: 'not-a-date' });
        expect(result.success).toBe(false);
    });
});

describe('NetworkErrorSchema', () => {
    it('validates a valid network error', () => {
        const result = NetworkErrorSchema.safeParse({
            endpoint: '/api/users',
            status: 500,
            method: 'GET',
            duration: 1234,
            timestamp: NOW,
        });
        expect(result.success).toBe(true);
    });

    it('allows optional fields', () => {
        const result = NetworkErrorSchema.safeParse({
            endpoint: '/api/data',
            status: 404,
            method: 'POST',
            timestamp: NOW,
        });
        expect(result.success).toBe(true);
    });
});

describe('BreadcrumbSchema', () => {
    it('validates click breadcrumb', () => {
        const result = BreadcrumbSchema.safeParse({
            type: 'click',
            target: 'button#submit',
            timestamp: NOW,
        });
        expect(result.success).toBe(true);
    });

    it('validates navigation breadcrumb', () => {
        const result = BreadcrumbSchema.safeParse({
            type: 'navigation',
            target: '/dashboard',
            timestamp: NOW,
        });
        expect(result.success).toBe(true);
    });

    it('validates custom breadcrumb with data', () => {
        const result = BreadcrumbSchema.safeParse({
            type: 'custom',
            target: 'cart-updated',
            timestamp: NOW,
            data: { items: 3 },
        });
        expect(result.success).toBe(true);
    });

    it('rejects invalid type', () => {
        const result = BreadcrumbSchema.safeParse({
            type: 'hover',
            target: 'div',
            timestamp: NOW,
        });
        expect(result.success).toBe(false);
    });
});

describe('ViewportSchema', () => {
    it('validates viewport with all fields', () => {
        const result = ViewportSchema.safeParse({ width: 1920, height: 1080, devicePixelRatio: 2 });
        expect(result.success).toBe(true);
    });

    it('allows optional devicePixelRatio', () => {
        const result = ViewportSchema.safeParse({ width: 375, height: 812 });
        expect(result.success).toBe(true);
    });
});

describe('FeedbackTypeSchema', () => {
    it('accepts valid types', () => {
        expect(FeedbackTypeSchema.safeParse('feedback').success).toBe(true);
        expect(FeedbackTypeSchema.safeParse('bug_report').success).toBe(true);
        expect(FeedbackTypeSchema.safeParse('feature_request').success).toBe(true);
    });

    it('rejects invalid types', () => {
        expect(FeedbackTypeSchema.safeParse('complaint').success).toBe(false);
        expect(FeedbackTypeSchema.safeParse('').success).toBe(false);
    });
});

describe('FeedbackCategorySchema', () => {
    it('accepts valid categories', () => {
        for (const cat of ['bug', 'improvement', 'feature', 'question', 'other']) {
            expect(FeedbackCategorySchema.safeParse(cat).success).toBe(true);
        }
    });
});

describe('SeveritySchema', () => {
    it('accepts valid severities', () => {
        for (const sev of ['low', 'medium', 'high', 'critical']) {
            expect(SeveritySchema.safeParse(sev).success).toBe(true);
        }
    });
});

describe('ImpactSchema', () => {
    it('accepts valid impacts', () => {
        for (const imp of ['blocks_me', 'annoying', 'minor']) {
            expect(ImpactSchema.safeParse(imp).success).toBe(true);
        }
    });
});

describe('FeedbackEventSchema', () => {
    const validContext = {
        url: 'http://localhost:5174/demo',
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0',
        timestamp: NOW,
        consoleErrors: [],
        networkErrors: [],
        breadcrumbs: [],
    };

    const validEvent = {
        type: 'feedback' as const,
        project_id: 'test-project',
        timestamp: NOW,
        title: 'Great product',
        description: 'Love the new feature',
        context: validContext,
    };

    it('validates a minimal valid event', () => {
        const result = FeedbackEventSchema.safeParse(validEvent);
        expect(result.success).toBe(true);
    });

    it('validates a full event with all optional fields', () => {
        const result = FeedbackEventSchema.safeParse({
            ...validEvent,
            type: 'bug_report',
            category: 'bug',
            severity: 'high',
            impact: 'blocks_me',
            email: 'user@example.com',
            screenshots: ['data:image/png;base64,abc'],
            highlighted_element: {
                selector: 'button#submit',
                bounding_box: { x: 100, y: 200, width: 120, height: 40 },
                tag_name: 'BUTTON',
                text: 'Submit',
            },
            user_id: 'user-123',
            tenant_id: 'tenant-456',
            role: 'admin',
            metadata: { source: 'test' },
        });
        expect(result.success).toBe(true);
    });

    it('rejects empty title', () => {
        const result = FeedbackEventSchema.safeParse({ ...validEvent, title: '' });
        expect(result.success).toBe(false);
    });

    it('rejects title longer than 200 chars', () => {
        const result = FeedbackEventSchema.safeParse({ ...validEvent, title: 'x'.repeat(201) });
        expect(result.success).toBe(false);
    });

    it('rejects description longer than 5000 chars', () => {
        const result = FeedbackEventSchema.safeParse({ ...validEvent, description: 'x'.repeat(5001) });
        expect(result.success).toBe(false);
    });

    it('rejects invalid email format', () => {
        const result = FeedbackEventSchema.safeParse({ ...validEvent, email: 'not-an-email' });
        expect(result.success).toBe(false);
    });

    it('rejects invalid type', () => {
        const result = FeedbackEventSchema.safeParse({ ...validEvent, type: 'complaint' });
        expect(result.success).toBe(false);
    });

    it('rejects missing context', () => {
        const { context, ...noContext } = validEvent;
        const result = FeedbackEventSchema.safeParse(noContext);
        expect(result.success).toBe(false);
    });

    it('enforces consoleErrors max of 10', () => {
        const tooMany = Array.from({ length: 11 }, (_, i) => ({
            message: `Error ${i}`,
            timestamp: NOW,
        }));
        const result = FeedbackEventSchema.safeParse({
            ...validEvent,
            context: { ...validContext, consoleErrors: tooMany },
        });
        expect(result.success).toBe(false);
    });

    it('enforces networkErrors max of 5', () => {
        const tooMany = Array.from({ length: 6 }, (_, i) => ({
            endpoint: `/api/${i}`,
            status: 500,
            method: 'GET',
            timestamp: NOW,
        }));
        const result = FeedbackEventSchema.safeParse({
            ...validEvent,
            context: { ...validContext, networkErrors: tooMany },
        });
        expect(result.success).toBe(false);
    });

    it('enforces breadcrumbs max of 20', () => {
        const tooMany = Array.from({ length: 21 }, (_, i) => ({
            type: 'click' as const,
            target: `element-${i}`,
            timestamp: NOW,
        }));
        const result = FeedbackEventSchema.safeParse({
            ...validEvent,
            context: { ...validContext, breadcrumbs: tooMany },
        });
        expect(result.success).toBe(false);
    });
});
