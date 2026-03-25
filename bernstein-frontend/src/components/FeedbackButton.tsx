import * as Tooltip from '@radix-ui/react-tooltip';
import { useFeedback } from '../context';

type Position = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

interface FeedbackButtonProps {
  /** Position of the floating button */
  position?: Position;
  /** Custom label for the button */
  label?: string;
  /** Whether to show the tooltip */
  showTooltip?: boolean;
  /** Custom class name for additional styling */
  className?: string;
}

const positionClasses: Record<Position, string> = {
  'bottom-right': 'bottom-6 right-6',
  'bottom-left': 'bottom-6 left-6',
  'top-right': 'top-6 right-6',
  'top-left': 'top-6 left-6',
};

/**
 * A floating feedback button that opens the feedback dialog.
 * Can be positioned in any corner of the screen.
 */
export function FeedbackButton({
  position = 'bottom-right',
  label = 'Feedback',
  showTooltip = true,
  className = '',
}: FeedbackButtonProps) {
  const { openFeedback } = useFeedback();

  const button = (
    <button
      onClick={() => openFeedback()}
      className={`fixed ${positionClasses[position]} flex items-center gap-2 px-4 py-2.5 bg-feedback-primary text-white rounded-full shadow-lg hover:bg-feedback-primary-hover transition-all hover:shadow-xl z-[9990] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-feedback-primary ${className}`}
      aria-label="Send feedback"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      </svg>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );

  if (!showTooltip) {
    return button;
  }

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-feedback-text text-feedback-bg px-3 py-1.5 rounded text-sm shadow-md z-[9995]"
            side={position.startsWith('bottom') ? 'top' : 'bottom'}
            sideOffset={8}
          >
            Send feedback or report a bug
            <Tooltip.Arrow className="fill-feedback-text" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

/**
 * Minimal icon-only version of the feedback button.
 */
export function FeedbackIconButton({
  position = 'bottom-right',
  className = '',
}: Pick<FeedbackButtonProps, 'position' | 'className'>) {
  const { openFeedback } = useFeedback();

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={() => openFeedback()}
            className={`fixed ${positionClasses[position]} flex items-center justify-center w-12 h-12 bg-feedback-primary text-white rounded-full shadow-lg hover:bg-feedback-primary-hover transition-all hover:shadow-xl z-[9990] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-feedback-primary ${className}`}
            aria-label="Send feedback"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            </svg>
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-feedback-text text-feedback-bg px-3 py-1.5 rounded text-sm shadow-md z-[9995]"
            side={position.startsWith('bottom') ? 'top' : 'bottom'}
            sideOffset={8}
          >
            Send feedback or report a bug
            <Tooltip.Arrow className="fill-feedback-text" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
