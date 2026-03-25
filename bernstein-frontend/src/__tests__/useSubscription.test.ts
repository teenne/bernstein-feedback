import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSubscription } from '../hooks/useSubscription';
import { supabase } from '../lib/supabaseClient';

// Mock Supabase
vi.mock('../lib/supabaseClient', () => ({
    supabase: {
        from: vi.fn(),
    },
}));

describe('useSubscription', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return isPro = true when plan is pro', async () => {
        // Setup chainable mock
        const mockSingle = vi.fn().mockResolvedValue({ data: { plan: 'pro' }, error: null });
        const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
        const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
        (supabase.from as any).mockReturnValue({ select: mockSelect });

        const { result } = renderHook(() => useSubscription('test-project'));

        // Initially loading
        expect(result.current.loading).toBe(true);

        // Wait for update
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.isPro).toBe(true);
    });

    it('should return isPro = false when plan is free', async () => {
        const mockSingle = vi.fn().mockResolvedValue({ data: { plan: 'free' }, error: null });
        const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
        const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
        (supabase.from as any).mockReturnValue({ select: mockSelect });

        const { result } = renderHook(() => useSubscription('test-project'));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.isPro).toBe(false);
    });

    it('should default to false on error', async () => {
        const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'Network error' } });
        const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
        const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
        (supabase.from as any).mockReturnValue({ select: mockSelect });

        const { result } = renderHook(() => useSubscription('test-project'));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.isPro).toBe(false);
    });
});
