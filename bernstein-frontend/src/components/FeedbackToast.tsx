import { useEffect, useState } from 'react';
import { useFeedback } from '../context';

export function FeedbackToast() {
  const { toast, dismissToast, config } = useFeedback();
  const [isVisible, setIsVisible] = useState(false);

  const toastDuration = config.toastDuration ?? 5000;

  useEffect(() => {
    if (toast) {
      // Small delay for enter animation
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [toast]);

  if (!toast) return null;

  const isSuccess = toast.type === 'success';

  return (
    <div
      className={`fixed bottom-4 right-4 z-[10000] transition-all duration-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
    >
      <div
        className={`flex items-start gap-3 p-4 rounded-lg shadow-lg max-w-sm ${isSuccess
            ? 'bg-green-50 border border-green-200'
            : 'bg-red-50 border border-red-200'
          }`}
        role="alert"
      >
        {/* Icon */}
        <div className={`flex-shrink-0 ${isSuccess ? 'text-green-500' : 'text-red-500'}`}>
          {isSuccess ? (
            <svg
              className="w-5 h-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium ${isSuccess ? 'text-green-800' : 'text-red-800'
              }`}
          >
            {toast.message}
          </p>
          {toast.feedbackId && (
            <p className="text-xs text-green-600 mt-1 font-mono">
              {toast.feedbackId}
            </p>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={dismissToast}
          className={`flex-shrink-0 p-1 rounded transition-colors ${isSuccess
              ? 'text-green-400 hover:text-green-600 hover:bg-green-100'
              : 'text-red-400 hover:text-red-600 hover:bg-red-100'
            }`}
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Progress bar for auto-dismiss */}
        {toastDuration > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-lg">
            <div
              className={`h-full ${isSuccess ? 'bg-green-400' : 'bg-red-400'}`}
              style={{
                animation: `shrink ${toastDuration}ms linear forwards`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
