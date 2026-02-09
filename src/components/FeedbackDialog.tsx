import { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import * as Switch from '@radix-ui/react-switch';
import html2canvas from 'html2canvas';
import { useFeedback } from '../context';
import type { FeedbackFormState, Impact, FeedbackType } from '../schemas';

interface HighlightedElement {
  selector: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  tagName: string;
  text?: string;
}

export function FeedbackDialog() {
  const {
    isOpen,
    isSubmitting,
    submitError,
    close,
    submit,
    initialFormState,
    config,
    captureContext,
  } = useFeedback();

  const [formState, setFormState] = useState<FeedbackFormState>({
    type: 'feedback',
    title: '',
    description: '',
    includeScreenshot: true,
    includeTechnicalDetails: true,
    includeRecentSteps: true,
    includeEmail: false,
  });

  const [screenshot, setScreenshot] = useState<string | undefined>();
  const [isHighlightMode, setIsHighlightMode] = useState(false);
  const [isSnipMode, setIsSnipMode] = useState(false);
  const [snipStart, setSnipStart] = useState<{ x: number; y: number } | null>(null);
  const [snipCurrent, setSnipCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isScreenshotting, setIsScreenshotting] = useState(false);
  const [highlightedElement, setHighlightedElement] = useState<HighlightedElement | null>(null);

  // Get recent steps from context for bug reports
  const context = captureContext();
  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setFormState({
        type: initialFormState.type || 'feedback',
        title: initialFormState.title || '',
        description: initialFormState.description || '',
        category: initialFormState.category,
        impact: initialFormState.impact,
        email: initialFormState.email || '',
        includeScreenshot: true,
        includeTechnicalDetails: true,
        includeRecentSteps: true,
        includeEmail: !!initialFormState.email,
      });
      setScreenshot(undefined);
      setHighlightedElement(null);
      setIsScreenshotting(false);
      setIsSnipMode(false);
      setSnipStart(null);
      setSnipCurrent(null);
    }
  }, [isOpen, initialFormState]);

  const handleTabChange = (value: string) => {
    const type = value as FeedbackType;
    setFormState((prev) => ({
      ...prev,
      type,
      category: type === 'bug_report' ? 'bug' : type === 'feature_request' ? 'feature' : prev.category,
    }));
  };

  const startSnipMode = useCallback(() => {
    setIsSnipMode(true);
    setSnipStart(null);
    setSnipCurrent(null);
    document.body.style.cursor = 'crosshair';
  }, []);

  const performCapture = useCallback(async (rect?: { x: number; y: number; width: number; height: number }) => {
    try {
      setIsSnipMode(false);
      setIsScreenshotting(true);
      document.body.style.cursor = '';

      // Wait for the render cycle to hide the overlays
      await new Promise(resolve => setTimeout(resolve, 300));

      const options: any = {
        useCORS: true,
        allowTaint: true,
        logging: false,
        ignoreElements: (element: Element) => {
          return element.hasAttribute('data-html2canvas-ignore') ||
            element.id === 'bernstein-snip-overlay';
        }
      };

      if (rect) {
        options.x = window.scrollX + rect.x;
        options.y = window.scrollY + rect.y;
        options.width = rect.width;
        options.height = rect.height;
      } else {
        // Fallback or full screen if no rect provided (optional, though logic below handles rect)
        options.x = window.scrollX;
        options.y = window.scrollY;
        options.width = document.documentElement.clientWidth;
        options.height = document.documentElement.clientHeight;
      }

      const canvas = await html2canvas(document.body, options);

      setScreenshot(canvas.toDataURL('image/png'));
      setFormState((prev) => ({ ...prev, includeScreenshot: true }));
    } catch (err) {
      console.error('Failed to capture screenshot:', err);
    } finally {
      setIsScreenshotting(false);
    }
  }, []);

  // Snip mode event handlers
  useEffect(() => {
    if (!isSnipMode) return;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      setSnipStart({ x: e.clientX, y: e.clientY });
      setSnipCurrent({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (snipStart) {
        e.preventDefault();
        setSnipCurrent({ x: e.clientX, y: e.clientY });
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!snipStart) return;
      e.preventDefault();

      const start = snipStart;
      const end = { x: e.clientX, y: e.clientY };

      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);

      // If drag is very small, assume full viewport capture or cancel? 
      // User requested "selective frame", so let's stick to area. 
      // If just a click (size ~0), we capture the viewport as a fallback/UX choice.
      if (width < 5 || height < 5) {
        performCapture(); // Capture full visible viewport
      } else {
        performCapture({ x, y, width, height });
      }

      setSnipStart(null);
      setSnipCurrent(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSnipMode(false);
        setSnipStart(null);
        setSnipCurrent(null);
        document.body.style.cursor = '';
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSnipMode, snipStart, performCapture]);

  // Highlight mode - let user click to select an element
  const startHighlightMode = useCallback(() => {
    setIsHighlightMode(true);

    // Add a style tag for the highlight effect
    const styleId = 'bf-highlight-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        .bf-highlight-hover {
          outline: 2px solid #3b82f6 !important;
          outline-offset: 2px !important;
          cursor: crosshair !important;
        }
      `;
      document.head.appendChild(style);
    }

    let lastHighlighted: HTMLElement | null = null;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Ignore clicks inside the dialog
      const dialogContent = document.querySelector('[data-radix-dialog-content]');
      if (dialogContent && dialogContent.contains(target)) return;

      if (lastHighlighted && lastHighlighted !== target) {
        lastHighlighted.classList.remove('bf-highlight-hover');
      }

      target.classList.add('bf-highlight-hover');
      lastHighlighted = target;
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Ignore clicks inside the dialog
      const dialogContent = document.querySelector('[data-radix-dialog-content]');
      if (dialogContent && dialogContent.contains(target)) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = target.getBoundingClientRect();

      // Generate a simple selector
      const selector = generateSelector(target);

      setHighlightedElement({
        selector,
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        tagName: target.tagName.toLowerCase(),
        text: target.innerText?.slice(0, 50).replace(/\n/g, ' ') || undefined,
      });

      // Cleanup
      cleanup();
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
      }
    };

    const cleanup = () => {
      setIsHighlightMode(false);
      if (lastHighlighted) {
        lastHighlighted.classList.remove('bf-highlight-hover');
      }
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleEscape, true);
      document.body.style.cursor = '';

      const style = document.getElementById(styleId);
      if (style) style.remove();
    };

    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleEscape, true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Build the submission with consent-based inclusions
    const submissionState = {
      ...formState,
      email: formState.includeEmail ? formState.email : undefined,
    };

    await submit(
      submissionState,
      formState.includeScreenshot ? screenshot : undefined,
      highlightedElement || undefined
    );
  };

  const enableScreenshot = config.enableScreenshot !== false;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && close()} modal={!isHighlightMode}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={`bf-fixed bf-inset-0 bf-bg-black/50 bf-animate-fade-in bf-z-[9998] ${isHighlightMode || isSnipMode || isScreenshotting ? 'bf-opacity-0 bf-pointer-events-none' : ''}`}
          style={{ visibility: (isHighlightMode || isSnipMode || isScreenshotting) ? 'hidden' : 'visible' }}
          data-html2canvas-ignore="true"
        />
        <Dialog.Content
          onInteractOutside={(e) => {
            if (isHighlightMode || isSnipMode) {
              e.preventDefault();
            }
          }}
          className="bf-fixed bf-top-1/2 bf-left-1/2 bf-bg-feedback-bg bf-rounded-2xl bf-w-full bf-max-w-md bf-max-h-[85vh] bf-overflow-y-auto bf-z-[9999] bf-p-6"
          style={{
            visibility: (isHighlightMode || isSnipMode || isScreenshotting) ? 'hidden' : 'visible',
            transform: 'translate(-50%, -50%)',
            boxShadow: 'var(--feedback-shadow, 0 25px 50px -12px rgba(0, 0, 0, 0.25))',
            animation: 'dialogSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          data-html2canvas-ignore="true"
        >
          <style>{`
            @keyframes dialogSlideUp {
              from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
              to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }
          `}</style>


          <Dialog.Title className="bf-text-lg bf-font-semibold bf-text-feedback-text bf-mb-4">
            Send Feedback
          </Dialog.Title>

          <Tabs.Root value={formState.type} onValueChange={handleTabChange}>
            <Tabs.List className="bf-flex bf-gap-1 bf-mb-5 bf-bg-feedback-bg-secondary bf-p-1.5 bf-rounded-xl">
              <Tabs.Trigger
                value="feedback"
                className="bf-flex-1 bf-px-3 bf-py-2.5 bf-text-sm bf-font-medium bf-rounded-lg bf-transition-all bf-duration-200 data-[state=active]:bf-bg-feedback-bg data-[state=active]:bf-text-feedback-text data-[state=active]:bf-shadow-sm data-[state=inactive]:bf-text-feedback-text-muted hover:bf-text-feedback-text"
              >
                Feedback
              </Tabs.Trigger>
              <Tabs.Trigger
                value="feature_request"
                className="bf-flex-1 bf-px-3 bf-py-2.5 bf-text-sm bf-font-medium bf-rounded-lg bf-transition-all bf-duration-200 data-[state=active]:bf-bg-feedback-bg data-[state=active]:bf-text-feedback-text data-[state=active]:bf-shadow-sm data-[state=inactive]:bf-text-feedback-text-muted hover:bf-text-feedback-text"
              >
                Feature
              </Tabs.Trigger>
              <Tabs.Trigger
                value="bug_report"
                className="bf-flex-1 bf-px-3 bf-py-2.5 bf-text-sm bf-font-medium bf-rounded-lg bf-transition-all bf-duration-200 data-[state=active]:bf-bg-feedback-bg data-[state=active]:bf-text-feedback-text data-[state=active]:bf-shadow-sm data-[state=inactive]:bf-text-feedback-text-muted hover:bf-text-feedback-text"
              >
                Bug
              </Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>

          <form onSubmit={handleSubmit} className="bf-space-y-4">
            {/* Title */}
            <div>
              <label
                htmlFor="feedback-title"
                className="bf-block bf-text-sm bf-font-medium bf-text-feedback-text bf-mb-1"
              >
                {formState.type === 'bug_report' ? 'What went wrong?' :
                  formState.type === 'feature_request' ? 'What would you like?' : 'Title'}
              </label>
              <input
                id="feedback-title"
                type="text"
                value={formState.title}
                onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))}
                placeholder={
                  formState.type === 'bug_report'
                    ? 'e.g., Button doesn\'t work on the checkout page'
                    : formState.type === 'feature_request'
                      ? 'e.g., Add dark mode support'
                      : 'Brief summary'
                }
                required
                maxLength={200}
                className="bf-w-full bf-px-3 bf-py-2.5 bf-border bf-border-feedback-border bf-rounded-lg bf-text-feedback-text bf-bg-feedback-bg bf-placeholder-feedback-text-muted bf-transition-all bf-duration-200 focus:bf-outline-none focus:bf-ring-2 focus:bf-ring-feedback-primary focus:bf-border-transparent"
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="feedback-description"
                className="bf-block bf-text-sm bf-font-medium bf-text-feedback-text bf-mb-1"
              >
                Details (optional)
              </label>
              <textarea
                id="feedback-description"
                value={formState.description}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder={
                  formState.type === 'bug_report'
                    ? 'Any additional context...'
                    : formState.type === 'feature_request'
                      ? 'Why would this be useful?'
                      : 'Tell us more...'
                }
                rows={3}
                maxLength={5000}
                className="bf-w-full bf-px-3 bf-py-2.5 bf-border bf-border-feedback-border bf-rounded-lg bf-text-feedback-text bf-bg-feedback-bg bf-placeholder-feedback-text-muted bf-resize-none bf-transition-all bf-duration-200 focus:bf-outline-none focus:bf-ring-2 focus:bf-ring-feedback-primary focus:bf-border-transparent"
              />
            </div>

            {/* Bug-specific: Impact */}
            {formState.type === 'bug_report' && (
              <div>
                <label className="bf-block bf-text-sm bf-font-medium bf-text-feedback-text bf-mb-2">
                  How bad is it?
                </label>
                <div className="bf-flex bf-gap-2">
                  {[
                    { value: 'blocks_me', label: 'Blocks me', color: 'bf-bg-red-50 bf-text-red-600 bf-border-red-200' },
                    { value: 'annoying', label: 'Annoying', color: 'bf-bg-amber-50 bf-text-amber-600 bf-border-amber-200' },
                    { value: 'minor', label: 'Minor', color: 'bf-bg-emerald-50 bf-text-emerald-600 bf-border-emerald-200' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormState((prev) => ({ ...prev, impact: option.value as Impact }))}
                      className={`bf-flex-1 bf-px-3 bf-py-2 bf-text-sm bf-font-medium bf-rounded-lg bf-border bf-transition-all bf-duration-200 ${formState.impact === option.value
                        ? option.color + ' bf-ring-2 bf-ring-offset-1'
                        : 'bf-bg-feedback-bg-secondary bf-text-feedback-text-muted bf-border-feedback-border hover:bf-border-feedback-text-muted'
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Highlight element button */}
            <div className="bf-flex bf-gap-2">
              {enableScreenshot && (
                <button
                  type="button"
                  onClick={startSnipMode}
                  className="bf-flex bf-items-center bf-gap-1.5 bf-px-3 bf-py-2 bf-text-sm bf-font-medium bf-text-feedback-text-muted bf-bg-feedback-bg-secondary bf-rounded-lg hover:bf-bg-feedback-border bf-transition-all bf-duration-200"
                >
                  <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 3C1.44772 3 1 3.44772 1 4V11C1 11.5523 1.44772 12 2 12H13C13.5523 12 14 11.5523 14 11V4C14 3.44772 13.5523 3 13 3H2ZM0 4C0 2.89543 0.895431 2 2 2H13C14.1046 2 15 2.89543 15 4V11C15 12.1046 14.1046 13 13 13H2C0.895431 13 0 12.1046 0 11V4ZM2 4.25C2 4.11193 2.11193 4 2.25 4H4.75C4.88807 4 5 4.11193 5 4.25V4.75C5 4.88807 4.88807 5 4.75 5H2.25C2.11193 5 2 4.88807 2 4.75V4.25ZM10.5 7C10.5 8.38071 9.38071 9.5 8 9.5C6.61929 9.5 5.5 8.38071 5.5 7C5.5 5.61929 6.61929 4.5 8 4.5C9.38071 4.5 10.5 5.61929 10.5 7ZM11.5 7C11.5 8.933 9.933 10.5 8 10.5C6.067 10.5 4.5 8.933 4.5 7C4.5 5.067 6.067 3.5 8 3.5C9.933 3.5 11.5 5.067 11.5 7Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
                  </svg>
                  {screenshot ? 'Retake' : 'Screenshot'}
                </button>
              )}
              <button
                type="button"
                onClick={startHighlightMode}
                disabled={isHighlightMode}
                className="bf-flex bf-items-center bf-gap-1.5 bf-px-3 bf-py-1.5 bf-text-sm bf-text-feedback-text-muted bf-bg-feedback-bg-secondary bf-rounded-md hover:bf-bg-feedback-border bf-transition-colors disabled:bf-opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9.62129 1.13607C9.81656 0.940808 10.1331 0.940809 10.3284 1.13607L11.3891 2.19673L12.8033 3.61094L13.8639 4.6716C14.0592 4.86687 14.0592 5.18345 13.8639 5.37871C13.6687 5.57397 13.3521 5.57397 13.1568 5.37871L12.0962 4.31805L10.682 2.90384L9.62129 1.84318C9.42603 1.64792 9.42603 1.33133 9.62129 1.13607ZM8.56063 2.19673C8.7559 2.00147 9.07248 2.00147 9.26774 2.19673L10.3284 3.25739L11.7426 4.6716L12.8033 5.73226C12.9985 5.92752 12.9985 6.24411 12.8033 6.43937C12.608 6.63463 12.2914 6.63463 12.0962 6.43937L11.0355 5.37871L9.62129 3.96449L8.56063 2.90384C8.36537 2.70857 8.36537 2.39199 8.56063 2.19673ZM8.56063 3.96449C8.7559 3.76923 9.07248 3.76923 9.26774 3.96449L10.3284 5.02515L11.7426 6.43937C11.9379 6.63463 11.9379 6.95121 11.7426 7.14648L6.73839 12.1507C6.64316 12.2459 6.51657 12.3025 6.38276 12.3099L3.2143 12.4817C3.01695 12.4931 2.83987 12.3569 2.80097 12.1635L2.19013 9.30046C2.16394 9.17556 2.19278 9.04555 2.26929 8.94198L7.49997 2.19673C7.69523 2.00147 8.01181 2.00147 8.20707 2.19673L8.56063 3.96449ZM8.56063 5.02515L7.85352 4.31805L3.27471 9.59343L3.73551 11.7502L5.9032 11.6304L10.9749 6.55871L8.56063 5.02515Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
                </svg>
                {highlightedElement ? 'Re-highlight' : 'Highlight area'}
              </button>
            </div>

            {/* Show highlighted element */}
            {highlightedElement && (
              <div className="bf-p-2 bf-bg-feedback-bg-secondary bf-rounded-md bf-text-xs bf-text-feedback-text-muted">
                <span className="bf-font-medium">Highlighted:</span> {highlightedElement.tagName}
                {highlightedElement.text && ` - "${highlightedElement.text.slice(0, 30)}..."`}
              </div>
            )}

            {/* We'll include section */}
            <div className="bf-border-t bf-border-feedback-border bf-pt-4 bf-mt-4">
              <p className="bf-text-sm bf-font-medium bf-text-feedback-text bf-mb-2">
                We'll include:
              </p>
              <p className="bf-text-xs bf-text-feedback-text-muted bf-mb-3">
                Do not include passwords or payment info in your message.
              </p>
              <div className="bf-space-y-2">
                {enableScreenshot && (
                  <ConsentToggle
                    label="Screenshot of this screen"
                    checked={formState.includeScreenshot}
                    onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, includeScreenshot: checked }))}
                    disabled={!screenshot}
                    hint={!screenshot ? '(not captured yet)' : undefined}
                  >
                    {screenshot && formState.includeScreenshot && (
                      <div className="bf-mt-2 bf-rounded-md bf-overflow-hidden bf-border bf-border-feedback-border">
                        <img src={screenshot} alt="Screenshot preview" className="bf-w-full bf-h-auto bf-block" />
                      </div>
                    )}
                  </ConsentToggle>
                )}
                <ConsentToggle
                  label="Technical details"
                  hint="browser, viewport, page URL"
                  checked={formState.includeTechnicalDetails}
                  onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, includeTechnicalDetails: checked }))}
                />
                <ConsentToggle
                  label="Recent steps"
                  hint={`${context.breadcrumbs.length} actions tracked`}
                  checked={formState.includeRecentSteps}
                  onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, includeRecentSteps: checked }))}
                />
                <ConsentToggle
                  label="Your email"
                  hint={formState.email ? formState.email : 'for follow-up'}
                  checked={formState.includeEmail}
                  onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, includeEmail: checked }))}
                >
                  {formState.includeEmail && (
                    <input
                      type="email"
                      value={formState.email || ''}
                      onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="your@email.com"
                      className="bf-mt-1 bf-w-full bf-px-2 bf-py-1 bf-text-sm bf-border bf-border-feedback-border bf-rounded bf-bg-feedback-bg bf-text-feedback-text bf-placeholder-gray-500 dark:bf-placeholder-gray-400 focus:bf-outline-none focus:bf-ring-2 focus:bf-ring-feedback-primary"
                    />
                  )}
                </ConsentToggle>
              </div>
            </div>

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


          <button
            onClick={close}
            type="button"
            className="bf-absolute bf-top-3 bf-right-3 bf-w-8 bf-h-8 bf-flex bf-items-center bf-justify-center bf-rounded-lg hover:bf-bg-red-50 bf-transition-all bf-duration-200 focus:bf-outline-none focus:bf-ring-2 focus:bf-ring-feedback-primary bf-z-[10000]"
            aria-label="Close"
            style={{ color: '#4b5563', zIndex: 10000 }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: '16px', height: '16px', display: 'block', minWidth: '16px', minHeight: '16px' }}
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </Dialog.Content>
      </Dialog.Portal>


      {/* Snip Mode Overlay */}
      {
        isSnipMode && (
          <div
            id="bernstein-snip-overlay"
            className="bf-fixed bf-inset-0 bf-z-[10000] bf-cursor-crosshair"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }}
            data-html2canvas-ignore="true"
          >
            {/* Instructions */}
            <div className="bf-fixed bf-top-4 bf-left-1/2 bf-transform bf--translate-x-1/2 bf-bg-black/80 bf-text-white bf-px-4 bf-py-2 bf-rounded-full bf-text-sm bf-font-medium bf-pointer-events-none bf-select-none">
              Drag to select area, or click for full screen
            </div>

            {/* Selection Box */}
            {snipStart && snipCurrent && (
              <div
                className="bf-absolute bf-border-2 bf-border-feedback-primary bf-bg-feedback-primary/20"
                style={{
                  left: Math.min(snipStart.x, snipCurrent.x),
                  top: Math.min(snipStart.y, snipCurrent.y),
                  width: Math.abs(snipCurrent.x - snipStart.x),
                  height: Math.abs(snipCurrent.y - snipStart.y),
                }}
              />
            )}
          </div>
        )
      }
    </Dialog.Root >
  );
}

// Consent toggle component
function ConsentToggle({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  children,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <label className="bf-flex bf-items-center bf-justify-between bf-gap-2">
        <span className="bf-text-sm bf-text-feedback-text">
          {label}
          {hint && <span className="bf-text-feedback-text-muted bf-ml-1">({hint})</span>}
        </span>
        <Switch.Root
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          className="bf-w-10 bf-h-6 bf-bg-feedback-border bf-rounded-full bf-relative bf-flex bf-items-center data-[state=checked]:bf-bg-feedback-primary bf-transition-colors disabled:bf-opacity-50"
        >
          <Switch.Thumb className="bf-block bf-w-5 bf-h-5 bf-bg-feedback-bg bf-rounded-full bf-shadow-md bf-border bf-border-feedback-border bf-transition-transform bf-translate-x-0.5 data-[state=checked]:bf-translate-x-[18px] data-[state=checked]:bf-bg-white" />
        </Switch.Root>
      </label>
      {children}
    </div>
  );
}

// Generate a simple CSS selector for an element
function generateSelector(el: HTMLElement): string {
  if (el.id) {
    return `#${el.id}`;
  }

  const tag = el.tagName.toLowerCase();
  const classes = el.className && typeof el.className === 'string'
    ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.')
    : '';

  // Try to find a unique identifier
  if (el.getAttribute('data-testid')) {
    return `[data-testid="${el.getAttribute('data-testid')}"]`;
  }

  if (el.getAttribute('name')) {
    return `${tag}[name="${el.getAttribute('name')}"]`;
  }

  return `${tag}${classes}`;
}
