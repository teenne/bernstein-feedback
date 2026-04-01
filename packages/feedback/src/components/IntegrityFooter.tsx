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
            if (el.classList.contains('bf-hidden')) el.classList.remove('bf-hidden');
            if (el.classList.contains('hidden')) el.classList.remove('hidden');
            if (el.classList.contains('bf-invisible')) el.classList.remove('bf-invisible');
            if (el.classList.contains('invisible')) el.classList.remove('invisible');
            if (el.classList.contains('bf-opacity-0')) el.classList.remove('bf-opacity-0');
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
            className="bf-mt-4 bf-flex bf-items-center bf-justify-center bf-gap-1.5 bf-opacity-60 hover:bf-opacity-100 bf-transition-opacity"
            style={{ display: 'flex', opacity: 1, visibility: 'visible' }} // Initial inline styles
        >
            <span className="bf-text-[10px] bf-text-gray-400 dark:bf-text-gray-500 bf-uppercase bf-tracking-wider bf-font-medium">
                Powered by
            </span>
            <div className="bf-flex bf-items-center bf-gap-1">
                <span className="bf-text-[11px] bf-font-bold bf-text-gray-900 dark:bf-text-gray-100 bf-tracking-tight">
                    BERNSTE<span className="bf-lowercase">i</span>N
                </span>
            </div>
        </div>
    );
}
