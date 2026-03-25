import { useEffect, useRef } from 'react';

/**
 * THE WATCHDOG
 * 
 * Renders the Bernstein branding and actively defends it against tampering.
 * Uses a MutationObserver to detect CSS/Attribute manipulation.
 */
export function IntegrityFooter() {
    const footerRef = useRef<HTMLDivElement>(null);
    const isRestoring = useRef(false);

    useEffect(() => {
        const el = footerRef.current;
        if (!el) return;

        // Define the "Safe State"
        const enforceStyles = () => {
            if (isRestoring.current) return;
            isRestoring.current = true;

            // Force visibility
            el.style.setProperty('display', 'flex', 'important');
            el.style.setProperty('opacity', '1', 'important');
            el.style.setProperty('visibility', 'visible', 'important');
            el.style.removeProperty('hidden');

            // Reset classes if someone tries to add 'hidden' or 'invisible'
            // We assume the component manages its own classes for layout
            // so we might need to be careful not to strip valid layout classes.
            // But if we detect a "bad" class, we should strip it.
            if (el.classList.contains('hidden')) el.classList.remove('hidden');
            if (el.classList.contains('invisible')) el.classList.remove('invisible');
            if (el.classList.contains('opacity-0')) el.classList.remove('opacity-0');

            requestAnimationFrame(() => {
                isRestoring.current = false;
            });
        };

        // Run once on mount
        enforceStyles();

        // The Observer
        const observer = new MutationObserver((mutations) => {
            if (isRestoring.current) return;

            let tamperingDetected = false;
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
                        tamperingDetected = true;
                    }
                }
            }

            if (tamperingDetected) {
                // Console warning not needed in production, but helpful for dev
                // console.warn("Bernstein Integrity: Tampering detected. Reverting.");
                enforceStyles();
            }
        });

        observer.observe(el, {
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden'],
        });

        // Anti-Delete Watchdog? 
        // If the element is removed from DOM, we can't easily put it back from *inside* the element.
        // The parent would need to monitor it. 
        // For now, we focus on style tampering.

        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={footerRef}
            className="mt-4 flex items-center justify-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity"
            style={{ display: 'flex', opacity: 1, visibility: 'visible' }} // Initial inline styles
        >
            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">
                Powered by
            </span>
            <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                    BERNSTE<span className="lowercase">i</span>N
                </span>
            </div>
        </div>
    );
}
