import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { useFeedback } from '../context';
import { FeedbackErrorBoundary } from './ErrorBoundary';
import { ConsentToggle } from './ConsentToggle';
import { IntegrityFooter } from './IntegrityFooter';
import type { FeedbackFormState, Impact, Severity, FeedbackCategory, FeedbackType } from '../schemas';
import { useRef } from 'react';

export function FeedbackDialog({ portalContainer }: { portalContainer?: HTMLElement }) {
  const {
    isOpen,
    isSubmitting,
    submitError,
    close,
    submit,
    initialFormState,
    config,
    captureContext,
    isLimitReached,
    planStatus,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    showNotifications,
    setShowNotifications,
  } = useFeedback();

  const [formState, setFormState] = useState<FeedbackFormState>({
    type: 'feedback',
    title: '',
    description: '',
    includeTechnicalDetails: true,
    includeRecentSteps: true,
    includeEmail: false,
    includeScreenshot: false,
    screenshots: [],
  });

  const [isHidingForCapture, setIsHidingForCapture] = useState(false);
  const [highlightedElement, setHighlightedElement] = useState<any>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // No baseImage needed before selection

  // Get recent steps from context for bug reports
  const context = captureContext();

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setFormState({
        type: initialFormState.type || 'feedback',
        title: initialFormState.title || '',
        description: initialFormState.description || '',
        includeTechnicalDetails: true,
        includeRecentSteps: true,
        includeEmail: !!initialFormState.email,
        includeScreenshot: !!initialFormState.screenshots?.length,
        screenshots: initialFormState.screenshots || [],
      });
    }
  }, [isOpen, initialFormState]);

  const handleTabChange = (value: string) => {
    const type = value as FeedbackType;
    setFormState((prev) => ({
      ...prev,
      type,
      title: '',
      description: '',
      impact: undefined,
      severity: undefined,
      category: type === 'bug_report' ? 'bug' : type === 'feature_request' ? 'feature' : undefined,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Build the submission with consent-based inclusions
    const submissionState = {
      ...formState,
      email: formState.includeEmail ? formState.email : undefined,
    };

    await submit(
      submissionState,
      formState.includeScreenshot ? formState.screenshots : [],
      highlightedElement
    );
  };

  const [uploadError, setUploadError] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadError('');

      // Only allow image files
      if (!file.type.startsWith('image/')) {
        setUploadError('Only image files are allowed (PNG, JPG, GIF, WebP).');
        e.target.value = '';
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setUploadError('File too large. Maximum size is 5MB.');
        e.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        setFormState(prev => ({
          ...prev,
          screenshots: [...prev.screenshots, event.target?.result as string],
          includeScreenshot: true
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleHighlight = () => {
    setIsHidingForCapture(true);
    
    // Create a floating label that follows the mouse
    const label = document.createElement('div');
    label.id = 'bernstein-highlight-helper';
    Object.assign(label.style, {
      position: 'fixed',
      zIndex: '100000',
      padding: '6px 10px',
      background: 'var(--feedback-primary, #f59e0b)',
      color: 'white',
      borderRadius: '6px',
      fontSize: '11px',
      fontWeight: '600',
      pointerEvents: 'none',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      whiteSpace: 'nowrap',
      transition: 'opacity 0.2s',
      opacity: '0'
    });
    label.innerText = 'Click an element to highlight';
    document.body.appendChild(label);

    const handleMouseMove = (e: MouseEvent) => {
      label.style.opacity = '1';
      label.style.left = `${e.clientX + 15}px`;
      label.style.top = `${e.clientY + 15}px`;
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.id === 'bernstein-widget-root' || target.closest('#bernstein-widget-root')) return;
      
      target.style.outline = '2px solid var(--feedback-primary, #f59e0b)';
      target.style.outlineOffset = '2px';
      target.style.cursor = 'crosshair';
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      target.style.outline = '';
      target.style.cursor = '';
    };

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const target = e.target as HTMLElement;
      const rect = target.getBoundingClientRect();
      
      // Clear outline immediately
      target.style.outline = '';
      target.style.cursor = '';

      setHighlightedElement({
        selector: target.tagName.toLowerCase() + 
                 (target.id ? `#${target.id}` : '') + 
                 (target.className && typeof target.className === 'string' ? `.${target.className.split(' ').filter(c => !c.includes(':')).join('.')}` : ''),
        boundingBox: { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height },
        tagName: target.tagName,
        text: target.innerText?.slice(0, 100).trim()
      });

      cleanup();
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('click', handleClick, true);
      
      const el = document.getElementById('bernstein-highlight-helper');
      if (el) el.remove();
      
      // Return to dialog
      setIsHidingForCapture(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('click', handleClick, true);
  };


  return (
    <FeedbackErrorBoundary>
      <Dialog.Root open={isOpen} onOpenChange={(open: boolean) => !open && close()}>
        <Dialog.Portal container={portalContainer}>
          <Dialog.Overlay
            className={`bf-fixed bf-inset-0 bf-bg-black/50 bf-animate-fade-in bf-z-[9998] bf-transition-opacity bf-duration-200 ${isHidingForCapture ? 'bf-opacity-0 bf-pointer-events-none' : 'bf-opacity-100'}`}
            data-html2canvas-ignore="true"
            data-bernstein-dialog-overlay="true"
          />
          <Dialog.Content
            className={`bf-fixed bf-bottom-0 bf-left-0 bf-w-full bf-max-w-[95vw] bf-mx-auto bf-max-h-[90vh] bf-bg-feedback-bg bf-rounded-t-2xl bf-z-[9999] bf-p-4 md:bf-top-1/2 md:bf-left-1/2 md:bf-bottom-auto md:bf-w-full md:bf-max-w-md md:bf-max-h-[85vh] md:bf-rounded-2xl md:bf-p-6 bf-overflow-y-auto bf-transition-opacity bf-duration-200 ${isHidingForCapture ? 'bf-opacity-0 bf-pointer-events-none' : 'bf-opacity-100'}`}
            style={{
              transform: window.innerWidth >= 768 ? 'translate(-50%, -50%)' : 'none',
              boxShadow: 'var(--feedback-shadow, 0 25px 50px -12px rgba(0, 0, 0, 0.25))',
              animation: window.innerWidth >= 768 ? 'dialogSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'dialogSlideInBottom 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            data-html2canvas-ignore="true"
            data-bernstein-dialog-content="true"
          >
            <style>{`
            @keyframes dialogSlideUp {
              from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
              to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }
            @keyframes dialogSlideInBottom {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
          `}</style>


            <Dialog.Title className="bf-text-lg bf-font-semibold bf-text-feedback-text bf-mb-4 bf-flex bf-items-baseline bf-gap-2 bf-pr-8">
              <span>Feedback</span>
              {config.showBranding && (
                <a href="https://bernstein.ai" target="_blank" rel="noopener" className="bf-text-[10px] bf-font-medium bf-text-feedback-text-muted hover:bf-text-feedback-primary bf-uppercase bf-tracking-wider bf-transition-colors" tabIndex={-1}>
                  by Bernstein
                </a>
              )}
            </Dialog.Title>

            {/* Plan limit reached — show message instead of form */}
            {isLimitReached && planStatus && planStatus.tickets_limit > 0 && (
              <div className="bf-py-8 bf-text-center">
                <div className="bf-mx-auto bf-w-12 bf-h-12 bf-rounded-full bf-bg-amber-100 bf-flex bf-items-center bf-justify-center bf-mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <h3 className="bf-text-base bf-font-semibold bf-text-feedback-text bf-mb-2">
                  Feedback limit reached
                </h3>
                <p className="bf-text-sm bf-text-feedback-text-muted bf-mb-4 bf-max-w-xs bf-mx-auto">
                  {planStatus?.message || 'This project has reached its monthly feedback limit. The developer has been notified.'}
                </p>
                {planStatus && (
                  <div className="bf-text-xs bf-text-feedback-text-muted">
                    {planStatus.tickets_used} / {planStatus.tickets_limit} tickets used this month
                  </div>
                )}
                <button
                  type="button"
                  onClick={close}
                  className="bf-mt-6 bf-px-4 bf-py-2 bf-text-sm bf-font-medium bf-text-feedback-text bf-bg-feedback-bg-secondary bf-rounded-md hover:bf-bg-feedback-border bf-transition-colors focus:bf-outline-none focus-visible:bf-ring-2 focus-visible:bf-ring-feedback-primary"
                >
                  Close
                </button>
              </div>
            )}

            {/* Notifications / Updates view */}
            {showNotifications && notifications.length > 0 && (
              <div>
                <div className="bf-flex bf-items-center bf-justify-between bf-mb-4">
                  <h3 className="bf-text-sm bf-font-semibold bf-text-feedback-text">
                    Updates ({unreadCount} new)
                  </h3>
                  <div className="bf-flex bf-gap-2">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        className="bf-text-xs bf-text-feedback-primary hover:bf-underline"
                      >
                        Mark all read
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowNotifications(false)}
                      className="bf-text-xs bf-text-feedback-primary bf-font-medium hover:bf-underline"
                    >
                      New feedback
                    </button>
                  </div>
                </div>
                <div className="bf-space-y-2 bf-max-h-[50vh] bf-overflow-y-auto">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => markNotificationRead(n.id)}
                      className={`bf-w-full bf-text-left bf-p-3 bf-rounded-lg bf-border bf-transition-all ${
                        n.read
                          ? 'bf-bg-feedback-bg bf-border-feedback-border bf-opacity-60'
                          : 'bf-bg-feedback-primary/5 bf-border-feedback-primary/20'
                      }`}
                    >
                      <div className="bf-flex bf-items-start bf-gap-2">
                        <div className={`bf-mt-0.5 bf-w-2 bf-h-2 bf-rounded-full bf-shrink-0 ${n.read ? 'bf-bg-gray-300' : 'bf-bg-feedback-primary'}`} />
                        <div className="bf-flex-1 bf-min-w-0">
                          <p className="bf-text-sm bf-font-medium bf-text-feedback-text bf-truncate">{n.title}</p>
                          {n.message && (
                            <p className="bf-text-xs bf-text-feedback-text-muted bf-mt-0.5 bf-truncate">{n.message}</p>
                          )}
                          <p className="bf-text-[10px] bf-text-feedback-text-muted bf-mt-1">
                            {new Date(n.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="bf-text-green-500 bf-shrink-0 bf-mt-0.5">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Show empty notifications state if toggled but nothing to show */}
            {showNotifications && notifications.length === 0 && (
              <div className="bf-py-8 bf-text-center">
                <p className="bf-text-sm bf-text-feedback-text-muted bf-mb-4">No updates yet</p>
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  className="bf-text-sm bf-text-feedback-primary bf-font-medium hover:bf-underline"
                >
                  Send feedback instead
                </button>
              </div>
            )}

            {!showNotifications && !(isLimitReached && planStatus && planStatus.tickets_limit > 0) && <><Tabs.Root value={formState.type} onValueChange={handleTabChange}>
              {/* Tabs List */}
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
                  className="bf-w-full bf-px-3 bf-py-2.5 bf-border bf-border-feedback-border bf-rounded-lg bf-text-base md:bf-text-sm bf-text-feedback-text bf-bg-feedback-bg bf-placeholder-feedback-text-muted bf-transition-all bf-duration-200 focus:bf-outline-none focus:bf-ring-2 focus:bf-ring-feedback-primary focus:bf-border-transparent"
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
                  className="bf-w-full bf-px-3 bf-py-2.5 bf-border bf-border-feedback-border bf-rounded-lg bf-text-base md:bf-text-sm bf-text-feedback-text bf-bg-feedback-bg bf-placeholder-feedback-text-muted bf-resize-none bf-transition-all bf-duration-200 focus:bf-outline-none focus:bf-ring-2 focus:bf-ring-feedback-primary focus:bf-border-transparent"
                />
              </div>

              {/* Category selector (Feedback + Feature tabs) */}
              {formState.type !== 'bug_report' && (
                <div>
                  <label className="bf-block bf-text-sm bf-font-medium bf-text-feedback-text bf-mb-1">
                    Category
                  </label>
                  <select
                    value={formState.category || ''}
                    onChange={(e) => setFormState((prev) => ({ ...prev, category: (e.target.value || undefined) as FeedbackCategory | undefined }))}
                    className="bf-w-full bf-px-3 bf-py-2.5 bf-border bf-border-feedback-border bf-rounded-lg bf-text-base md:bf-text-sm bf-text-feedback-text bf-bg-feedback-bg bf-transition-all bf-duration-200 focus:bf-outline-none focus:bf-ring-2 focus:bf-ring-feedback-primary focus:bf-border-transparent"
                  >
                    <option value="">Select category...</option>
                    <option value="improvement">Improvement</option>
                    <option value="feature">Feature</option>
                    <option value="question">Question</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}

              {/* Bug-specific: Severity + Impact */}
              {formState.type === 'bug_report' && (
                <div>
                  <label className="bf-block bf-text-sm bf-font-medium bf-text-feedback-text bf-mb-2">
                    Severity
                  </label>
                  <div className="bf-flex bf-gap-2 bf-mb-4">
                    {[
                      { value: 'critical', label: 'Critical', color: 'bf-bg-red-50 bf-text-red-600 bf-border-red-200' },
                      { value: 'high', label: 'High', color: 'bf-bg-amber-50 bf-text-amber-600 bf-border-amber-200' },
                      { value: 'medium', label: 'Medium', color: 'bf-bg-blue-50/50 bf-text-blue-700 bf-border-blue-100' },
                      { value: 'low', label: 'Low', color: 'bf-bg-emerald-50 bf-text-emerald-600 bf-border-emerald-200' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormState((prev) => ({ ...prev, severity: option.value as Severity }))}
                        className={`bf-flex-1 bf-px-3 bf-py-2 bf-text-sm bf-font-medium bf-rounded-lg bf-border bf-transition-all bf-duration-200 focus:bf-outline-none focus-visible:bf-ring-2 focus-visible:bf-ring-feedback-primary focus-visible:bf-ring-offset-1 ${formState.severity === option.value
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
                        className={`bf-flex-1 bf-px-3 bf-py-2 bf-text-sm bf-font-medium bf-rounded-lg bf-border bf-transition-all bf-duration-200 focus:bf-outline-none focus-visible:bf-ring-2 focus-visible:bf-ring-feedback-primary focus-visible:bf-ring-offset-1 ${formState.impact === option.value
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

              {/* We'll include section */}
              <div className="bf-border-t bf-border-feedback-border bf-pt-4 bf-mt-4">
                <p className="bf-text-sm bf-font-medium bf-text-feedback-text bf-mb-2">
                  We'll include:
                </p>
                <p className="bf-text-xs bf-text-feedback-text-muted bf-mb-3">
                  Do not include passwords or payment info in your message.
                </p>
                <div className="bf-space-y-2">
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
                        required
                        value={formState.email || ''}
                        onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="your@email.com"
                        className="bf-mt-1 bf-w-full bf-px-2 bf-py-1 bf-text-base md:bf-text-sm bf-border bf-border-feedback-border bf-rounded bf-bg-feedback-bg bf-text-feedback-text bf-placeholder-gray-500 dark:bf-placeholder-gray-400 focus:bf-outline-none focus:bf-ring-2 focus:bf-ring-feedback-primary"
                      />
                    )}
                  </ConsentToggle>

                  <div className="bf-flex bf-flex-col bf-gap-2">
                    <div className="bf-flex bf-items-center bf-justify-between">
                      <div className="bf-flex bf-flex-col">
                        <span className="bf-text-sm bf-font-medium bf-text-feedback-text bf-select-none">Context</span>
                        <span className="bf-text-[11px] bf-text-feedback-text-muted">Upload image or pick element</span>
                      </div>
                      <div className="bf-flex bf-gap-2">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          accept="image/*"
                          className="bf-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="bf-flex bf-items-center bf-gap-2 bf-px-3 bf-py-1.5 bf-text-xs bf-font-semibold bf-text-feedback-primary bf-bg-feedback-primary/5 hover:bf-bg-feedback-primary/10 bf-rounded-full bf-transition-all bf-border bf-border-feedback-primary/20"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          Upload
                        </button>
                        <button
                          type="button"
                          onClick={handleHighlight}
                          className={`bf-flex bf-items-center bf-gap-2 bf-px-3 bf-py-1.5 bf-text-xs bf-font-semibold bf-rounded-full bf-transition-all bf-border ${highlightedElement ? 'bf-text-green-600 bf-bg-green-50 bf-border-green-200' : 'bf-text-feedback-primary bf-bg-feedback-primary/5 bf-border-feedback-primary/20 hover:bf-bg-feedback-primary/10'}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          {highlightedElement ? 'Element Picked' : 'Highlight'}
                        </button>
                      </div>
                    </div>

                    {highlightedElement && (
                      <div className="bf-p-2 bf-bg-blue-50/50 bf-border bf-border-blue-100 bf-rounded bf-text-[11px] bf-text-blue-700 bf-flex bf-justify-between bf-items-center bf-animate-fade-in">
                        <span className="bf-truncate bf-max-w-[80%]">Target: <code>{highlightedElement.selector}</code></span>
                        <button type="button" onClick={() => setHighlightedElement(undefined)} className="hover:bf-text-blue-900 bf-font-bold">✕</button>
                      </div>
                    )}

                    {uploadError && (
                      <div className="bf-p-2 bf-bg-red-50 bf-border bf-border-red-200 bf-rounded bf-text-xs bf-text-red-600 bf-animate-fade-in">
                        {uploadError}
                      </div>
                    )}

                    {formState.screenshots.length > 0 && (
                      <div className="bf-flex bf-gap-2 bf-overflow-x-auto bf-pb-2 bf-mt-1 scrollbar-hide">
                        {formState.screenshots.map((src, index) => (
                          <div key={index} className="bf-relative bf-group bf-shrink-0">
                            <div className="bf-w-24 bf-h-16 bf-rounded-lg bf-overflow-hidden bf-border bf-border-feedback-border bf-bg-black/5 bf-flex bf-items-center bf-justify-center">
                              <img 
                                src={src} 
                                alt={`Screenshot ${index + 1}`} 
                                className="bf-h-full bf-w-full bf-object-cover"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setFormState(prev => ({ 
                                ...prev, 
                                screenshots: prev.screenshots.filter((_, i) => i !== index),
                                includeScreenshot: prev.screenshots.length > 1
                              }))}
                              className="bf-absolute -bf-top-1.5 -bf-right-1.5 bf-bg-red-500 bf-text-white bf-p-1 bf-rounded-full bf-shadow-lg bf-opacity-0 group-hover:bf-opacity-100 bf-transition-opacity"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
                  className="bf-px-4 bf-py-2 bf-text-sm bf-font-medium bf-text-feedback-text bf-bg-feedback-bg-secondary bf-rounded-md hover:bf-bg-feedback-border bf-transition-colors disabled:bf-opacity-50 focus:bf-outline-none focus-visible:bf-ring-2 focus-visible:bf-ring-feedback-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !formState.title.trim()}
                  className="bf-px-4 bf-py-2 bf-text-sm bf-font-medium bf-text-white bf-bg-feedback-primary bf-rounded-md hover:bf-bg-feedback-primary-hover bf-transition-colors disabled:bf-opacity-50 focus:bf-outline-none focus-visible:bf-ring-2 focus-visible:bf-ring-offset-1 focus-visible:bf-ring-feedback-primary"
                >
                  {isSubmitting ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form></>}

            {config.showBranding && <IntegrityFooter />}


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
      </Dialog.Root >
    </FeedbackErrorBoundary>
  );
}

