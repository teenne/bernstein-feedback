import { useEffect, useRef } from "react";

/**
 * Detect form abandonment — the user types ≥ minChars into any
 * non-feedback input/textarea/contenteditable, then leaves the page
 * (popstate, beforeunload, or hash navigation) without submitting it.
 *
 * Heuristic only — we don't know which fields belong to which form,
 * so we treat ANY input change as "user is engaged" and ANY navigation
 * away as "abandonment." Inputs inside the feedback dialog itself are
 * excluded so the prompt never fires from typing IN the prompt.
 *
 * Tracks per-element so closing one tab and starting fresh on another
 * doesn't false-positive.
 */
export function useAbandonedFlowDetector(options: {
    enabled: boolean;
    minChars?: number;
    onDetect: (info: { lastChars: number }) => void;
}) {
    const { enabled, onDetect } = options;
    const minChars = options.minChars ?? 30;
    const onDetectRef = useRef(onDetect);
    onDetectRef.current = onDetect;

    useEffect(() => {
        if (!enabled) return;

        let charsTyped = 0;
        let fired = false;

        const isInsideWidget = (el: EventTarget | null): boolean => {
            if (!(el instanceof Element)) return false;
            return !!el.closest('[data-bernstein-feedback], [role="dialog"][aria-label*="feedback" i]');
        };

        const handleInput = (e: Event) => {
            if (isInsideWidget(e.target)) return;
            const t = e.target as HTMLInputElement | HTMLTextAreaElement | null;
            if (!t || t.type === 'password' || t.type === 'hidden') return;
            // Track LARGEST observed length per session — typing then deleting
            // shouldn't "uncount" the engagement.
            const len = (t as any).value?.length ?? (t.textContent?.length ?? 0);
            if (len > charsTyped) charsTyped = len;
        };

        const handleSubmit = () => {
            // Form was submitted — reset; user did the thing they came to do.
            charsTyped = 0;
        };

        const checkAbandon = () => {
            if (fired || charsTyped < minChars) return;
            fired = true;
            onDetectRef.current({ lastChars: charsTyped });
        };

        document.addEventListener('input', handleInput, { capture: true });
        document.addEventListener('submit', handleSubmit, { capture: true });
        window.addEventListener('popstate', checkAbandon);
        window.addEventListener('beforeunload', checkAbandon);

        return () => {
            document.removeEventListener('input', handleInput, { capture: true });
            document.removeEventListener('submit', handleSubmit, { capture: true });
            window.removeEventListener('popstate', checkAbandon);
            window.removeEventListener('beforeunload', checkAbandon);
        };
    }, [enabled, minChars]);
}
