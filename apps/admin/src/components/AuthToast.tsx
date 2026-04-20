import { useEffect, useRef, useState } from 'react';

export type AuthToastKind = 'error' | 'info' | 'success';

interface AuthToastProps {
    message: string;
    kind?: AuthToastKind;
    /** Auto-dismiss after this many ms. 0 to disable. Default 5000. */
    durationMs?: number;
    onDismiss: () => void;
}

/**
 * Lightweight fixed-position toast for the login / signup screens.
 *
 * Renders nothing when `message` is empty. Auto-dismisses after
 * `durationMs`. The parent component is the single source of truth —
 * clearing `message` hides the toast, setting a new `message` re-shows it.
 */
export function AuthToast({ message, kind = 'error', durationMs = 5000, onDismiss }: AuthToastProps) {
    const [visible, setVisible] = useState(false);

    // Keep onDismiss in a ref so the auto-dismiss effect below doesn't
    // re-run every time the parent re-renders (which would clear+reset the
    // 5s timer repeatedly and could flash the toast invisible in StrictMode).
    const dismissRef = useRef(onDismiss);
    useEffect(() => {
        dismissRef.current = onDismiss;
    }, [onDismiss]);

    useEffect(() => {
        if (!message) {
            setVisible(false);
            return;
        }
        // Defer the paint-in to the next frame so CSS transitions actually
        // animate from opacity-0 → opacity-100. Toggling visibility inside
        // the same frame as mount skips the transition entirely.
        const raf = requestAnimationFrame(() => setVisible(true));
        if (durationMs <= 0) return () => cancelAnimationFrame(raf);
        const id = setTimeout(() => {
            setVisible(false);
            // Give the exit transition a moment, then clear the parent state.
            setTimeout(() => dismissRef.current(), 200);
        }, durationMs);
        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(id);
        };
    }, [message, durationMs]);

    if (!message) return null;

    const palette =
        kind === 'error'
            ? 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900/40'
            : kind === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900/40'
            : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/40';

    const icon =
        kind === 'error' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        ) : kind === 'success' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        );

    return (
        <div
            role={kind === 'error' ? 'alert' : 'status'}
            aria-live={kind === 'error' ? 'assertive' : 'polite'}
            className={`fixed top-6 right-6 z-50 max-w-sm min-w-[260px] px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm flex items-start gap-3 transition-all duration-200 ease-out ${palette} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
        >
            <span className="flex-shrink-0 mt-0.5">{icon}</span>
            <span className="text-sm font-medium leading-snug flex-1">{message}</span>
            <button
                type="button"
                onClick={() => {
                    setVisible(false);
                    setTimeout(() => dismissRef.current(), 200);
                }}
                aria-label="Dismiss"
                className="flex-shrink-0 ml-1 opacity-60 hover:opacity-100 transition-opacity"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
    );
}
