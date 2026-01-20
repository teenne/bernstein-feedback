import { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import * as Select from '@radix-ui/react-select';
import { useFeedback } from '../context';
import type { FeedbackFormState, FeedbackCategory, Severity } from '../schemas';

export function FeedbackDialog() {
  const {
    isOpen,
    isSubmitting,
    submitError,
    close,
    submit,
    initialFormState,
    config,
  } = useFeedback();

  const [formState, setFormState] = useState<FeedbackFormState>({
    type: 'feedback',
    title: '',
    description: '',
    includeScreenshot: false,
  });

  const [screenshot, setScreenshot] = useState<string | undefined>();

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setFormState({
        type: initialFormState.type || 'feedback',
        title: initialFormState.title || '',
        description: initialFormState.description || '',
        category: initialFormState.category,
        severity: initialFormState.severity,
        email: initialFormState.email,
        includeScreenshot: false,
      });
      setScreenshot(undefined);
    }
  }, [isOpen, initialFormState]);

  const handleTabChange = (value: string) => {
    setFormState((prev) => ({
      ...prev,
      type: value as 'feedback' | 'bug_report',
      category: value === 'bug_report' ? 'bug' : undefined,
    }));
  };

  const handleCaptureScreenshot = useCallback(async () => {
    try {
      // Use html2canvas if available, otherwise skip
      if (typeof window !== 'undefined' && 'html2canvas' in window) {
        const html2canvas = (window as unknown as { html2canvas: (el: HTMLElement) => Promise<HTMLCanvasElement> }).html2canvas;
        const canvas = await html2canvas(document.body);
        setScreenshot(canvas.toDataURL('image/png'));
        setFormState((prev) => ({ ...prev, includeScreenshot: true }));
      } else {
        // Fallback: just mark as included (adapter handles)
        setFormState((prev) => ({ ...prev, includeScreenshot: true }));
      }
    } catch (err) {
      console.error('Failed to capture screenshot:', err);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submit(formState, screenshot);
  };

  const enableScreenshot = config.enableScreenshot !== false;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="bf-fixed bf-inset-0 bf-bg-black/50 bf-animate-fade-in bf-z-[9998]" />
        <Dialog.Content className="bf-fixed bf-top-1/2 bf-left-1/2 bf-transform bf--translate-x-1/2 bf--translate-y-1/2 bf-bg-feedback-bg bf-rounded-lg bf-shadow-xl bf-w-full bf-max-w-md bf-max-h-[90vh] bf-overflow-hidden bf-animate-slide-up bf-z-[9999]">
          <div className="bf-p-6">
            <Dialog.Title className="bf-text-lg bf-font-semibold bf-text-feedback-text bf-mb-4">
              Send Feedback
            </Dialog.Title>

            <Tabs.Root value={formState.type} onValueChange={handleTabChange}>
              <Tabs.List className="bf-flex bf-gap-1 bf-mb-4 bf-bg-feedback-bg-secondary bf-p-1 bf-rounded-lg">
                <Tabs.Trigger
                  value="feedback"
                  className="bf-flex-1 bf-px-3 bf-py-2 bf-text-sm bf-font-medium bf-rounded-md bf-transition-colors data-[state=active]:bf-bg-feedback-bg data-[state=active]:bf-text-feedback-text data-[state=inactive]:bf-text-feedback-text-muted hover:bf-text-feedback-text"
                >
                  Feedback
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="bug_report"
                  className="bf-flex-1 bf-px-3 bf-py-2 bf-text-sm bf-font-medium bf-rounded-md bf-transition-colors data-[state=active]:bf-bg-feedback-bg data-[state=active]:bf-text-feedback-text data-[state=inactive]:bf-text-feedback-text-muted hover:bf-text-feedback-text"
                >
                  Bug Report
                </Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>

            <form onSubmit={handleSubmit} className="bf-space-y-4">
              <div>
                <label
                  htmlFor="feedback-title"
                  className="bf-block bf-text-sm bf-font-medium bf-text-feedback-text bf-mb-1"
                >
                  Title
                </label>
                <input
                  id="feedback-title"
                  type="text"
                  value={formState.title}
                  onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder={formState.type === 'bug_report' ? 'What went wrong?' : 'Summary of your feedback'}
                  required
                  maxLength={200}
                  className="bf-w-full bf-px-3 bf-py-2 bf-border bf-border-feedback-border bf-rounded-md bf-text-feedback-text bf-bg-feedback-bg bf-placeholder-feedback-text-muted focus:bf-outline-none focus:bf-ring-2 focus:bf-ring-feedback-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="feedback-description"
                  className="bf-block bf-text-sm bf-font-medium bf-text-feedback-text bf-mb-1"
                >
                  Description
                </label>
                <textarea
                  id="feedback-description"
                  value={formState.description}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder={
                    formState.type === 'bug_report'
                      ? 'Steps to reproduce, expected vs actual behavior...'
                      : 'Tell us more about your feedback...'
                  }
                  rows={4}
                  maxLength={5000}
                  className="bf-w-full bf-px-3 bf-py-2 bf-border bf-border-feedback-border bf-rounded-md bf-text-feedback-text bf-bg-feedback-bg bf-placeholder-feedback-text-muted bf-resize-none focus:bf-outline-none focus:bf-ring-2 focus:bf-ring-feedback-primary"
                />
              </div>

              <div className="bf-grid bf-grid-cols-2 bf-gap-4">
                {formState.type === 'feedback' && (
                  <div>
                    <label className="bf-block bf-text-sm bf-font-medium bf-text-feedback-text bf-mb-1">
                      Category
                    </label>
                    <Select.Root
                      value={formState.category || ''}
                      onValueChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          category: value as FeedbackCategory,
                        }))
                      }
                    >
                      <Select.Trigger className="bf-w-full bf-px-3 bf-py-2 bf-border bf-border-feedback-border bf-rounded-md bf-text-feedback-text bf-bg-feedback-bg bf-text-left focus:bf-outline-none focus:bf-ring-2 focus:bf-ring-feedback-primary">
                        <Select.Value placeholder="Select..." />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="bf-bg-feedback-bg bf-border bf-border-feedback-border bf-rounded-md bf-shadow-lg bf-z-[10000]">
                          <Select.Viewport className="bf-p-1">
                            <Select.Item
                              value="improvement"
                              className="bf-px-3 bf-py-2 bf-text-sm bf-text-feedback-text bf-rounded hover:bf-bg-feedback-bg-secondary bf-cursor-pointer bf-outline-none"
                            >
                              <Select.ItemText>Improvement</Select.ItemText>
                            </Select.Item>
                            <Select.Item
                              value="feature"
                              className="bf-px-3 bf-py-2 bf-text-sm bf-text-feedback-text bf-rounded hover:bf-bg-feedback-bg-secondary bf-cursor-pointer bf-outline-none"
                            >
                              <Select.ItemText>Feature Request</Select.ItemText>
                            </Select.Item>
                            <Select.Item
                              value="question"
                              className="bf-px-3 bf-py-2 bf-text-sm bf-text-feedback-text bf-rounded hover:bf-bg-feedback-bg-secondary bf-cursor-pointer bf-outline-none"
                            >
                              <Select.ItemText>Question</Select.ItemText>
                            </Select.Item>
                            <Select.Item
                              value="other"
                              className="bf-px-3 bf-py-2 bf-text-sm bf-text-feedback-text bf-rounded hover:bf-bg-feedback-bg-secondary bf-cursor-pointer bf-outline-none"
                            >
                              <Select.ItemText>Other</Select.ItemText>
                            </Select.Item>
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </div>
                )}

                {formState.type === 'bug_report' && (
                  <div>
                    <label className="bf-block bf-text-sm bf-font-medium bf-text-feedback-text bf-mb-1">
                      Severity
                    </label>
                    <Select.Root
                      value={formState.severity || ''}
                      onValueChange={(value) =>
                        setFormState((prev) => ({ ...prev, severity: value as Severity }))
                      }
                    >
                      <Select.Trigger className="bf-w-full bf-px-3 bf-py-2 bf-border bf-border-feedback-border bf-rounded-md bf-text-feedback-text bf-bg-feedback-bg bf-text-left focus:bf-outline-none focus:bf-ring-2 focus:bf-ring-feedback-primary">
                        <Select.Value placeholder="Select..." />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="bf-bg-feedback-bg bf-border bf-border-feedback-border bf-rounded-md bf-shadow-lg bf-z-[10000]">
                          <Select.Viewport className="bf-p-1">
                            <Select.Item
                              value="low"
                              className="bf-px-3 bf-py-2 bf-text-sm bf-text-feedback-text bf-rounded hover:bf-bg-feedback-bg-secondary bf-cursor-pointer bf-outline-none"
                            >
                              <Select.ItemText>Low</Select.ItemText>
                            </Select.Item>
                            <Select.Item
                              value="medium"
                              className="bf-px-3 bf-py-2 bf-text-sm bf-text-feedback-text bf-rounded hover:bf-bg-feedback-bg-secondary bf-cursor-pointer bf-outline-none"
                            >
                              <Select.ItemText>Medium</Select.ItemText>
                            </Select.Item>
                            <Select.Item
                              value="high"
                              className="bf-px-3 bf-py-2 bf-text-sm bf-text-feedback-text bf-rounded hover:bf-bg-feedback-bg-secondary bf-cursor-pointer bf-outline-none"
                            >
                              <Select.ItemText>High</Select.ItemText>
                            </Select.Item>
                            <Select.Item
                              value="critical"
                              className="bf-px-3 bf-py-2 bf-text-sm bf-text-feedback-text bf-rounded hover:bf-bg-feedback-bg-secondary bf-cursor-pointer bf-outline-none"
                            >
                              <Select.ItemText>Critical</Select.ItemText>
                            </Select.Item>
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="feedback-email"
                    className="bf-block bf-text-sm bf-font-medium bf-text-feedback-text bf-mb-1"
                  >
                    Email (optional)
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    value={formState.email || ''}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, email: e.target.value || undefined }))
                    }
                    placeholder="For follow-up"
                    className="bf-w-full bf-px-3 bf-py-2 bf-border bf-border-feedback-border bf-rounded-md bf-text-feedback-text bf-bg-feedback-bg bf-placeholder-feedback-text-muted focus:bf-outline-none focus:bf-ring-2 focus:bf-ring-feedback-primary"
                  />
                </div>
              </div>

              {enableScreenshot && (
                <div className="bf-flex bf-items-center bf-gap-3">
                  <button
                    type="button"
                    onClick={handleCaptureScreenshot}
                    className="bf-text-sm bf-text-feedback-primary hover:bf-text-feedback-primary-hover bf-underline"
                  >
                    {screenshot ? 'Retake screenshot' : 'Attach screenshot'}
                  </button>
                  {screenshot && (
                    <span className="bf-text-sm bf-text-feedback-success">Screenshot captured</span>
                  )}
                </div>
              )}

              {submitError && (
                <div className="bf-p-3 bf-bg-red-50 bf-border bf-border-feedback-error bf-rounded-md bf-text-sm bf-text-feedback-error">
                  {submitError}
                </div>
              )}

              <div className="bf-flex bf-justify-end bf-gap-3 bf-pt-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={isSubmitting}
                  className="bf-px-4 bf-py-2 bf-text-sm bf-font-medium bf-text-feedback-text bf-bg-feedback-bg-secondary bf-rounded-md hover:bf-bg-feedback-border bf-transition-colors disabled:bf-opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !formState.title.trim()}
                  className="bf-px-4 bf-py-2 bf-text-sm bf-font-medium bf-text-white bf-bg-feedback-primary bf-rounded-md hover:bf-bg-feedback-primary-hover bf-transition-colors disabled:bf-opacity-50"
                >
                  {isSubmitting ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>

          <Dialog.Close asChild>
            <button
              className="bf-absolute bf-top-4 bf-right-4 bf-text-feedback-text-muted hover:bf-text-feedback-text bf-transition-colors"
              aria-label="Close"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 15 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                  fill="currentColor"
                  fillRule="evenodd"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
