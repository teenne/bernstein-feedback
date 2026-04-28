import { useEffect, useRef } from "react";

/**
 * Detect a burst of console errors — `threshold`+ errors within
 * `windowMs`. A signal that something is broken even if the user
 * doesn't realise it yet (e.g. a render loop or a failed background
 * request stack).
 *
 * Patches `console.error` exactly the same way the main context does.
 * Both patches coexist because each captures into its own ring buffer;
 * the original method is preserved through both.
 */
export function useErrorBurstDetector(options: {
    enabled: boolean;
    threshold?: number;
    windowMs?: number;
    onDetect: (info: { count: number; lastMessage: string }) => void;
}) {
    const { enabled, onDetect } = options;
    const threshold = options.threshold ?? 3;
    const windowMs = options.windowMs ?? 10000;
    const onDetectRef = useRef(onDetect);
    onDetectRef.current = onDetect;

    useEffect(() => {
        if (!enabled) return;
        const original = console.error;
        let times: number[] = [];
        let lastMessage = "";
        let fired = false;

        console.error = (...args: unknown[]) => {
            const now = performance.now();
            times = times.filter(t => now - t <= windowMs);
            times.push(now);
            lastMessage = args
                .map(a => (typeof a === "string" ? a : a instanceof Error ? a.message : ""))
                .join(" ")
                .slice(0, 200);
            if (!fired && times.length >= threshold) {
                fired = true;
                onDetectRef.current({ count: times.length, lastMessage });
            }
            original.apply(console, args);
        };

        return () => { console.error = original; };
    }, [enabled, threshold, windowMs]);
}
