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
      className={`bf-fixed bf-bottom-4 bf-right-4 bf-z-[10000] bf-transition-all bf-duration-300 ${
        isVisible ? 'bf-opacity-100 bf-translate-y-0' : 'bf-opacity-0 bf-translate-y-2'
      }`}
    >
      <div
        className={`bf-flex bf-items-start bf-gap-3 bf-p-4 bf-rounded-lg bf-shadow-lg bf-max-w-sm ${
          isSuccess
            ? 'bf-bg-green-50 bf-border bf-border-green-200'
            : 'bf-bg-red-50 bf-border bf-border-red-200'
        }`}
        role="alert"
      >
        {/* Icon */}
        <div className={`bf-flex-shrink-0 ${isSuccess ? 'bf-text-green-500' : 'bf-text-red-500'}`}>
          {isSuccess ? (
            <svg
              className="bf-w-5 bf-h-5"
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
              className="bf-w-5 bf-h-5"
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
        <div className="bf-flex-1 bf-min-w-0">
          <p
            className={`bf-text-sm bf-font-medium ${
              isSuccess ? 'bf-text-green-800' : 'bf-text-red-800'
            }`}
          >
            {toast.message}
          </p>
          {toast.feedbackId && (
            <p className="bf-text-xs bf-text-green-600 bf-mt-1 bf-font-mono">
              {toast.feedbackId}
            </p>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={dismissToast}
          className={`bf-flex-shrink-0 bf-p-1 bf-rounded bf-transition-colors ${
            isSuccess
              ? 'bf-text-green-400 hover:bf-text-green-600 hover:bf-bg-green-100'
              : 'bf-text-red-400 hover:bf-text-red-600 hover:bf-bg-red-100'
          }`}
          aria-label="Dismiss"
        >
          <svg className="bf-w-4 bf-h-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Progress bar for auto-dismiss */}
        {toastDuration > 0 && (
          <div className="bf-absolute bf-bottom-0 bf-left-0 bf-right-0 bf-h-1 bf-overflow-hidden bf-rounded-b-lg">
            <div
              className={`bf-h-full ${isSuccess ? 'bf-bg-green-400' : 'bf-bg-red-400'}`}
              style={{
                animation: `bf-shrink ${toastDuration}ms linear forwards`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
