import { useEffect, useRef } from "react";

/**
 * Detect rage clicks — a burst of 4+ clicks on the same element within a
 * short window, a classic signal of user frustration. When triggered,
 * calls `onDetect` at most once per session (enforced by the caller via
 * its own state).
 *
 * Runs in capture phase at document level so it works anywhere in the
 * host app. No-op when disabled or the threshold isn't set.
 */
export function useRageClickDetector(options: {
    enabled: boolean;
    threshold?: number;
    windowMs?: number;
    onDetect: (info: { target: string; count: number }) => void;
}) {
    const { enabled, onDetect } = options;
    const threshold = options.threshold ?? 4;
    const windowMs = options.windowMs ?? 1500;

    // Ref so listener doesn't rebind on every onDetect identity change.
    const onDetectRef = useRef(onDetect);
    onDetectRef.current = onDetect;

    useEffect(() => {
        if (!enabled) return;

        let bursts: { target: EventTarget | null; times: number[] } = {
            target: null,
            times: [],
        };

        const handler = (e: MouseEvent) => {
            const now = performance.now();
            if (bursts.target !== e.target) {
                bursts = { target: e.target, times: [now] };
                return;
            }
            // Trim clicks outside the window
            bursts.times = bursts.times.filter((t) => now - t <= windowMs);
            bursts.times.push(now);

            if (bursts.times.length >= threshold) {
                const target = e.target as HTMLElement | null;
                const descriptor = target
                    ? `${target.tagName.toLowerCase()}${
                          target.id ? "#" + target.id : ""
                      }${target.className && typeof target.className === "string"
                          ? "." + target.className.split(/\s+/).slice(0, 2).join(".")
                          : ""}`
                    : "unknown";
                onDetectRef.current({ target: descriptor, count: bursts.times.length });
                // Reset so we don't re-fire on every subsequent click.
                bursts = { target: null, times: [] };
            }
        };

        document.addEventListener("click", handler, { capture: true });
        return () => document.removeEventListener("click", handler, { capture: true });
    }, [enabled, threshold, windowMs]);
}
