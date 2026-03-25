import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { useFeedback } from '../context';
import { FeedbackErrorBoundary } from './ErrorBoundary';
import { ConsentToggle } from './ConsentToggle';
import { IntegrityFooter } from './IntegrityFooter';
import type { FeedbackFormState, Impact, FeedbackType } from '../schemas';
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
      category: type === 'bug_report' ? 'bug' : type === 'feature_request' ? 'feature' : prev.category,
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) return;
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
            className={`fixed inset-0 bg-black/50 animate-fade-in z-[9998] transition-opacity duration-200 ${isHidingForCapture ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            data-html2canvas-ignore="true"
            data-bernstein-dialog-overlay="true"
          />
          <Dialog.Content
            className={`fixed bottom-0 left-0 w-full max-w-[95vw] mx-auto max-h-[90vh] bg-feedback-bg rounded-t-2xl z-[9999] p-4 md:top-1/2 md:left-1/2 md:bottom-auto md:w-full md:max-w-md md:max-h-[85vh] md:rounded-2xl md:p-6 overflow-y-auto transition-opacity duration-200 ${isHidingForCapture ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
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


            <Dialog.Title className="text-lg font-semibold text-feedback-text mb-4 flex items-baseline gap-2 pr-8">
              <span>Feedback</span>
              {config.showBranding && (
                <a href="https://bernstein.ai" target="_blank" rel="noopener" className="text-[10px] font-medium text-feedback-text-muted hover:text-feedback-primary uppercase tracking-wider transition-colors" tabIndex={-1}>
                  by Bernstein
                </a>
              )}
            </Dialog.Title>

            <Tabs.Root value={formState.type} onValueChange={handleTabChange}>
              {/* Tabs List */}
              <Tabs.List className="flex gap-1 mb-5 bg-feedback-bg-secondary p-1.5 rounded-xl">
                <Tabs.Trigger
                  value="feedback"
                  className="flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 data-[state=active]:bg-feedback-bg data-[state=active]:text-feedback-text data-[state=active]:shadow-sm data-[state=inactive]:text-feedback-text-muted hover:text-feedback-text"
                >
                  Feedback
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="feature_request"
                  className="flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 data-[state=active]:bg-feedback-bg data-[state=active]:text-feedback-text data-[state=active]:shadow-sm data-[state=inactive]:text-feedback-text-muted hover:text-feedback-text"
                >
                  Feature
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="bug_report"
                  className="flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 data-[state=active]:bg-feedback-bg data-[state=active]:text-feedback-text data-[state=active]:shadow-sm data-[state=inactive]:text-feedback-text-muted hover:text-feedback-text"
                >
                  Bug
                </Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label
                  htmlFor="feedback-title"
                  className="block text-sm font-medium text-feedback-text mb-1"
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
                  className="w-full px-3 py-2.5 border border-feedback-border rounded-lg text-base md:text-sm text-feedback-text bg-feedback-bg placeholder-feedback-text-muted transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-feedback-primary focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="feedback-description"
                  className="block text-sm font-medium text-feedback-text mb-1"
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
                  className="w-full px-3 py-2.5 border border-feedback-border rounded-lg text-base md:text-sm text-feedback-text bg-feedback-bg placeholder-feedback-text-muted resize-none transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-feedback-primary focus:border-transparent"
                />
              </div>

              {/* Bug-specific: Impact */}
              {formState.type === 'bug_report' && (
                <div>
                  <label className="block text-sm font-medium text-feedback-text mb-2">
                    How bad is it?
                  </label>
                  <div className="flex gap-2">
                    {[
                      { value: 'blocks_me', label: 'Blocks me', color: 'bg-red-50 text-red-600 border-red-200' },
                      { value: 'annoying', label: 'Annoying', color: 'bg-amber-50 text-amber-600 border-amber-200' },
                      { value: 'minor', label: 'Minor', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormState((prev) => ({ ...prev, impact: option.value as Impact }))}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-feedback-primary focus-visible:ring-offset-1 ${formState.impact === option.value
                          ? option.color + ' ring-2 ring-offset-1'
                          : 'bg-feedback-bg-secondary text-feedback-text-muted border-feedback-border hover:border-feedback-text-muted'
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* We'll include section */}
              <div className="border-t border-feedback-border pt-4 mt-4">
                <p className="text-sm font-medium text-feedback-text mb-2">
                  We'll include:
                </p>
                <p className="text-xs text-feedback-text-muted mb-3">
                  Do not include passwords or payment info in your message.
                </p>
                <div className="space-y-2">
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
                        className="mt-1 w-full px-2 py-1 text-base md:text-sm border border-feedback-border rounded bg-feedback-bg text-feedback-text placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-feedback-primary"
                      />
                    )}
                  </ConsentToggle>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-feedback-text select-none">Context</span>
                        <span className="text-[11px] text-feedback-text-muted">Upload image or pick element</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          accept="image/*"
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-feedback-primary bg-feedback-primary/5 hover:bg-feedback-primary/10 rounded-full transition-all border border-feedback-primary/20"
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
                          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-full transition-all border ${highlightedElement ? 'text-green-600 bg-green-50 border-green-200' : 'text-feedback-primary bg-feedback-primary/5 border-feedback-primary/20 hover:bg-feedback-primary/10'}`}
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
                      <div className="p-2 bg-blue-50/50 border border-blue-100 rounded text-[11px] text-blue-700 flex justify-between items-center animate-fade-in">
                        <span className="truncate max-w-[80%]">Target: <code>{highlightedElement.selector}</code></span>
                        <button type="button" onClick={() => setHighlightedElement(undefined)} className="hover:text-blue-900 font-bold">✕</button>
                      </div>
                    )}

                    {formState.screenshots.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2 mt-1 scrollbar-hide">
                        {formState.screenshots.map((src, index) => (
                          <div key={index} className="relative group shrink-0">
                            <div className="w-24 h-16 rounded-lg overflow-hidden border border-feedback-border bg-black/5 flex items-center justify-center">
                              <img 
                                src={src} 
                                alt={`Screenshot ${index + 1}`} 
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setFormState(prev => ({ 
                                ...prev, 
                                screenshots: prev.screenshots.filter((_, i) => i !== index),
                                includeScreenshot: prev.screenshots.length > 1
                              }))}
                              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
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
                <div className="p-3 bg-red-50 border border-feedback-error rounded-md text-sm text-feedback-error">
                  {submitError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-feedback-text bg-feedback-bg-secondary rounded-md hover:bg-feedback-border transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-feedback-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !formState.title.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-feedback-primary rounded-md hover:bg-feedback-primary-hover transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-feedback-primary"
                >
                  {isSubmitting ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>

            {config.showBranding && <IntegrityFooter />}


            <button
              onClick={close}
              type="button"
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-feedback-primary z-[10000]"
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

