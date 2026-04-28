import { useEffect, useState } from "react";

/**
 * Small non-intrusive card shown at bottom-left when a proactive trigger
 * fires (e.g. rage click). Dismissible, auto-hides after 15s, and opens
 * the bug-report dialog when the user clicks "Report it".
 *
 * Kept visually distinct from the floating feedback bubble (which is
 * bottom-right) so users see two clearly separate affordances.
 */
interface ProactivePromptProps {
    show: boolean;
    title: string;
    message: string;
    onReport: () => void;
    onDismiss: () => void;
}

export function ProactivePrompt({
    show,
    title,
    message,
    onReport,
    onDismiss,
}: ProactivePromptProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!show) {
            setVisible(false);
            return;
        }
        // Small delay so the fade-in is perceptible.
        const enterTimer = setTimeout(() => setVisible(true), 50);
        // Auto-dismiss after 15s
        const exitTimer = setTimeout(() => {
            setVisible(false);
            setTimeout(onDismiss, 200);
        }, 15000);
        return () => {
            clearTimeout(enterTimer);
            clearTimeout(exitTimer);
        };
    }, [show, onDismiss]);

    if (!show) return null;

    return (
        <div
            role="alertdialog"
            aria-live="polite"
            className={`bf-fixed bf-bottom-4 bf-left-4 bf-z-50 bf-max-w-sm bf-transition-all bf-duration-200 ${
                visible ? "bf-opacity-100 bf-translate-y-0" : "bf-opacity-0 bf-translate-y-2"
            }`}
            style={{
                position: "fixed",
                bottom: "1rem",
                left: "1rem",
                zIndex: 50,
                maxWidth: "24rem",
                transition: "all 200ms",
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(0.5rem)",
            }}
        >
            <div
                style={{
                    background: "white",
                    color: "#111827",
                    borderRadius: "0.75rem",
                    boxShadow: "0 10px 30px -10px rgba(0,0,0,0.25)",
                    padding: "1rem",
                    border: "1px solid #e5e7eb",
                }}
            >
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0 }}>
                            {title}
                        </p>
                        <p
                            style={{
                                fontSize: "0.8125rem",
                                color: "#6b7280",
                                marginTop: "0.25rem",
                                marginBottom: 0,
                            }}
                        >
                            {message}
                        </p>
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                            <button
                                onClick={onReport}
                                style={{
                                    fontSize: "0.8125rem",
                                    fontWeight: 500,
                                    padding: "0.375rem 0.75rem",
                                    borderRadius: "0.5rem",
                                    background: "linear-gradient(90deg, #f59e0b, #f97316)",
                                    color: "white",
                                    border: "none",
                                    cursor: "pointer",
                                }}
                            >
                                Report it
                            </button>
                            <button
                                onClick={onDismiss}
                                style={{
                                    fontSize: "0.8125rem",
                                    padding: "0.375rem 0.75rem",
                                    borderRadius: "0.5rem",
                                    background: "transparent",
                                    color: "#6b7280",
                                    border: "none",
                                    cursor: "pointer",
                                }}
                            >
                                Not now
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={onDismiss}
                        aria-label="Dismiss"
                        style={{
                            background: "transparent",
                            border: "none",
                            color: "#9ca3af",
                            cursor: "pointer",
                            padding: 0,
                            fontSize: "1.25rem",
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                </div>
            </div>
        </div>
    );
}
