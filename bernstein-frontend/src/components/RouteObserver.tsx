import { useEffect, useRef } from 'react';
import { useFeedback } from '../context';

/**
 * RouteObserver component for automatic navigation tracking.
 * Place this inside FeedbackProvider to automatically update screen identity on route changes.
 * 
 * @example
 * <FeedbackProvider config={...}>
 *   <RouteObserver />
 *   <App />
 * </FeedbackProvider>
 */
export function RouteObserver() {
    const { setScreen, addBreadcrumb } = useFeedback();
    const previousPathRef = useRef<string>(window.location.pathname);

    useEffect(() => {
        const handleNavigation = () => {
            const currentPath = window.location.pathname;

            // Only update if path actually changed
            if (currentPath !== previousPathRef.current) {
                previousPathRef.current = currentPath;

                // Update screen identity
                setScreen({
                    screenId: currentPath,
                    pageName: document.title || currentPath,
                });

                // Add navigation breadcrumb
                addBreadcrumb({
                    type: 'navigation',
                    target: currentPath,
                });
            }
        };

        // Listen for popstate (browser back/forward)
        window.addEventListener('popstate', handleNavigation);

        // Override pushState and replaceState for SPA navigation
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function (...args) {
            originalPushState.apply(this, args);
            handleNavigation();
        };

        history.replaceState = function (...args) {
            originalReplaceState.apply(this, args);
            handleNavigation();
        };

        // Initial call to set current screen
        handleNavigation();

        return () => {
            window.removeEventListener('popstate', handleNavigation);
            history.pushState = originalPushState;
            history.replaceState = originalReplaceState;
        };
    }, [setScreen, addBreadcrumb]);

    return null;
}
