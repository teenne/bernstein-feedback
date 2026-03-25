/**
 * Tests for the localStorageAdapter and consoleAdapter.
 *
 * These tests verify the adapter interface contract:
 * - submit() returns { success: true, id: string }
 * - localStorageAdapter persists events to storage
 * - consoleAdapter logs without persistence
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { localStorageAdapter, consoleAdapter } from '../adapters/localStorage';
import type { FeedbackEvent } from '../schemas';

// Mock localStorage for Node/jsdom environment
const createMockStorage = () => {
    const store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
        removeItem: vi.fn((key: string) => { delete store[key]; }),
        clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
        get length() { return Object.keys(store).length; },
        key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
        _store: store,
    };
};

// Minimal valid FeedbackEvent fixture
const createTestEvent = (overrides?: Partial<FeedbackEvent>): FeedbackEvent => ({
    type: 'feedback',
    project_id: 'test-project',
    timestamp: new Date().toISOString(),
    title: 'Test feedback',
    description: 'This is a test.',
    context: {
        url: 'https://example.com',
        viewport: { width: 1920, height: 1080 },
        userAgent: 'TestAgent/1.0',
        timestamp: new Date().toISOString(),
        consoleErrors: [],
        networkErrors: [],
        breadcrumbs: [],
    },
    ...overrides,
});

describe('localStorageAdapter', () => {
    let mockStorage: ReturnType<typeof createMockStorage>;

    beforeEach(() => {
        mockStorage = createMockStorage();
        Object.defineProperty(globalThis, 'localStorage', {
            value: mockStorage,
            writable: true,
        });

        // Mock crypto.randomUUID
        vi.stubGlobal('crypto', {
            randomUUID: () => 'test-uuid-12345678',
        });
    });

    it('should return success with an id on submit', async () => {
        const adapter = localStorageAdapter({ logToConsole: false });
        const result = await adapter.submit(createTestEvent());

        expect(result.success).toBe(true);
        expect(result.id).toBeDefined();
        expect(typeof result.id).toBe('string');
    });

    it('should persist events to localStorage', async () => {
        const adapter = localStorageAdapter({ logToConsole: false });
        await adapter.submit(createTestEvent({ title: 'First' }));
        await adapter.submit(createTestEvent({ title: 'Second' }));

        const events = adapter.getEvents();
        expect(events).toHaveLength(2);
        expect(events[0].title).toBe('First');
        expect(events[1].title).toBe('Second');
    });

    it('should respect maxEvents limit', async () => {
        const adapter = localStorageAdapter({ maxEvents: 2, logToConsole: false });

        await adapter.submit(createTestEvent({ title: 'Event 1' }));
        await adapter.submit(createTestEvent({ title: 'Event 2' }));
        await adapter.submit(createTestEvent({ title: 'Event 3' }));

        const events = adapter.getEvents();
        // maxEvents truncates oldest events on save
        expect(events.length).toBeLessThanOrEqual(2);
    });

    it('should clear all events', async () => {
        const adapter = localStorageAdapter({ logToConsole: false });
        await adapter.submit(createTestEvent());

        adapter.clearEvents();
        expect(adapter.getEvents()).toHaveLength(0);
    });

    it('should export events as JSON string', async () => {
        const adapter = localStorageAdapter({ logToConsole: false });
        await adapter.submit(createTestEvent({ title: 'Export test' }));

        const exported = adapter.exportEvents();
        const parsed = JSON.parse(exported);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed[0].title).toBe('Export test');
    });
});

describe('consoleAdapter', () => {
    it('should return success with an id on submit', async () => {
        vi.stubGlobal('crypto', {
            randomUUID: () => 'console-uuid-12345678',
        });

        const spy = vi.spyOn(console, 'group').mockImplementation(() => { });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        const endSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => { });

        const adapter = consoleAdapter();
        const result = await adapter.submit(createTestEvent());

        expect(result.success).toBe(true);
        expect(result.id).toBeDefined();

        spy.mockRestore();
        logSpy.mockRestore();
        endSpy.mockRestore();
    });

    it('should log event details to console', async () => {
        vi.stubGlobal('crypto', {
            randomUUID: () => 'console-uuid-abcdef',
        });

        const groupFn = vi.fn();
        const logFn = vi.fn();
        vi.spyOn(console, 'group').mockImplementation(groupFn);
        vi.spyOn(console, 'log').mockImplementation(logFn);
        vi.spyOn(console, 'groupEnd').mockImplementation(() => { });

        const adapter = consoleAdapter();
        await adapter.submit(createTestEvent({ title: 'Console test' }));

        expect(groupFn).toHaveBeenCalled();
        // At least 'Title:' should be logged
        expect(logFn).toHaveBeenCalledWith('Title:', 'Console test');

        vi.restoreAllMocks();
    });
});
