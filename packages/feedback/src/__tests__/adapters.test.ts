import { describe, it, expect, vi, beforeEach } from 'vitest';
import { httpAdapter } from '../adapters/http';
import { localStorageAdapter, consoleAdapter } from '../adapters/localStorage';
import type { FeedbackEvent } from '../schemas';

const NOW = new Date().toISOString();

const mockEvent: FeedbackEvent = {
    type: 'feedback',
    project_id: 'test',
    timestamp: NOW,
    title: 'Test feedback',
    description: 'A test',
    context: {
        url: 'http://localhost',
        viewport: { width: 1920, height: 1080 },
        userAgent: 'test',
        timestamp: NOW,
        consoleErrors: [],
        networkErrors: [],
        breadcrumbs: [],
    },
};

describe('httpAdapter', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('sends POST request to the configured endpoint', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ id: 'abc-123' }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const adapter = httpAdapter({ endpoint: 'http://localhost:3000/api/feedback' });
        const result = await adapter.submit(mockEvent);

        expect(result.success).toBe(true);
        expect(result.id).toBe('abc-123');
        expect(mockFetch).toHaveBeenCalledWith(
            'http://localhost:3000/api/feedback',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
            }),
        );
    });

    it('includes custom headers', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({}),
        });
        vi.stubGlobal('fetch', mockFetch);

        const adapter = httpAdapter({
            endpoint: '/api/feedback',
            headers: { 'X-API-Key': 'my-key' },
        });
        await adapter.submit(mockEvent);

        expect(mockFetch).toHaveBeenCalledWith(
            '/api/feedback',
            expect.objectContaining({
                headers: expect.objectContaining({ 'X-API-Key': 'my-key' }),
            }),
        );
    });

    it('applies transform function', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({}),
        });
        vi.stubGlobal('fetch', mockFetch);

        const transform = (event: FeedbackEvent) => ({ custom: event.title });
        const adapter = httpAdapter({ endpoint: '/api', transform });
        await adapter.submit(mockEvent);

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body).toEqual({ custom: 'Test feedback' });
    });

    it('returns error on non-ok response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Internal Server Error'),
        }));

        const adapter = httpAdapter({ endpoint: '/api' });
        const result = await adapter.submit(mockEvent);

        expect(result.success).toBe(false);
        expect(result.error).toContain('500');
    });

    it('returns error on network failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

        const adapter = httpAdapter({ endpoint: '/api' });
        const result = await adapter.submit(mockEvent);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Network error');
    });

    it('returns timeout error when request exceeds timeout', async () => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: any) => {
            return new Promise((_, reject) => {
                opts.signal.addEventListener('abort', () => {
                    const err = new Error('The operation was aborted');
                    err.name = 'AbortError';
                    reject(err);
                });
            });
        }));

        const adapter = httpAdapter({ endpoint: '/api', timeout: 1 });
        const result = await adapter.submit(mockEvent);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Request timed out');
    });
});

describe('localStorageAdapter', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('stores events in localStorage', async () => {
        const adapter = localStorageAdapter({ prefix: 'test' });
        const result = await adapter.submit(mockEvent);

        expect(result.success).toBe(true);
        expect(result.id).toBeTruthy();

        const events = adapter.getEvents();
        expect(events).toHaveLength(1);
        expect(events[0].title).toBe('Test feedback');
    });

    it('accumulates multiple events', async () => {
        const adapter = localStorageAdapter({ prefix: 'test' });
        await adapter.submit(mockEvent);
        await adapter.submit({ ...mockEvent, title: 'Second' });

        expect(adapter.getEvents()).toHaveLength(2);
    });

    it('respects maxEvents limit', async () => {
        const adapter = localStorageAdapter({ prefix: 'test', maxEvents: 2 });
        await adapter.submit({ ...mockEvent, title: 'First' });
        await adapter.submit({ ...mockEvent, title: 'Second' });
        await adapter.submit({ ...mockEvent, title: 'Third' });

        const events = adapter.getEvents();
        expect(events).toHaveLength(2);
        // Should keep the latest
        expect(events[0].title).toBe('Second');
        expect(events[1].title).toBe('Third');
    });

    it('clearEvents removes all stored events', async () => {
        const adapter = localStorageAdapter({ prefix: 'test' });
        await adapter.submit(mockEvent);
        expect(adapter.getEvents()).toHaveLength(1);

        adapter.clearEvents();
        expect(adapter.getEvents()).toHaveLength(0);
    });

    it('exportEvents returns JSON string', async () => {
        const adapter = localStorageAdapter({ prefix: 'test' });
        await adapter.submit(mockEvent);

        const exported = adapter.exportEvents();
        const parsed = JSON.parse(exported);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed[0].title).toBe('Test feedback');
    });

    it('handles corrupted localStorage gracefully', async () => {
        localStorage.setItem('test-bernstein-feedback-events', 'not-json');
        const adapter = localStorageAdapter({ prefix: 'test' });
        expect(adapter.getEvents()).toEqual([]);
    });
});

describe('consoleAdapter', () => {
    it('returns success with an id', async () => {
        vi.spyOn(console, 'group').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

        const adapter = consoleAdapter();
        const result = await adapter.submit(mockEvent);

        expect(result.success).toBe(true);
        expect(result.id).toBeTruthy();
    });
});
