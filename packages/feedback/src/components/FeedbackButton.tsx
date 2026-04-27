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
  'bottom-right': 'bf-bottom-6 bf-right-6',
  'bottom-left': 'bf-bottom-6 bf-left-6',
  'top-right': 'bf-top-6 bf-right-6',
  'top-left': 'bf-top-6 bf-left-6',
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
  const { openFeedback, unreadCount } = useFeedback();

  const button = (
    <button
      onClick={() => openFeedback()}
      className={`bf-fixed ${positionClasses[position]} bf-flex bf-items-center bf-gap-2 bf-px-4 bf-py-2.5 bf-bg-feedback-primary bf-text-white bf-rounded-full bf-shadow-lg hover:bf-bg-feedback-primary-hover bf-transition-all hover:bf-shadow-xl bf-z-[9990] focus:bf-outline-none focus-visible:bf-ring-2 focus-visible:bf-ring-offset-2 focus-visible:bf-ring-feedback-primary ${className}`}
      aria-label={unreadCount > 0 ? `Send feedback (${unreadCount} update${unreadCount > 1 ? 's' : ''})` : 'Send feedback'}
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
        className="bf-shrink-0"
      >
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      </svg>
      <span className="bf-text-sm bf-font-medium">{label}</span>
      {unreadCount > 0 && (
        <span
          style={{ position: 'absolute', top: '-7px', right: '-7px' }}
          className="bf-min-w-[18px] bf-h-[18px] bf-px-1 bf-flex bf-items-center bf-justify-center bf-rounded-full bf-bg-red-500 bf-text-white bf-text-[10px] bf-font-bold bf-leading-none bf-shadow-sm bf-animate-pulse"
          aria-hidden="true"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
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
            className="bf-bg-feedback-text bf-text-feedback-bg bf-px-3 bf-py-1.5 bf-rounded bf-text-sm bf-shadow-md bf-z-[9995]"
            side={position.startsWith('bottom') ? 'top' : 'bottom'}
            sideOffset={8}
          >
            Send feedback or report a bug
            <Tooltip.Arrow className="bf-fill-feedback-text" />
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
  const { openFeedback, unreadCount } = useFeedback();

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={() => openFeedback()}
            className={`bf-fixed ${positionClasses[position]} bf-flex bf-items-center bf-justify-center bf-w-12 bf-h-12 bf-bg-feedback-primary bf-text-white bf-rounded-full bf-shadow-lg hover:bf-bg-feedback-primary-hover bf-transition-all hover:bf-shadow-xl bf-z-[9990] focus:bf-outline-none focus-visible:bf-ring-2 focus-visible:bf-ring-offset-2 focus-visible:bf-ring-feedback-primary ${className}`}
            aria-label={unreadCount > 0 ? `Send feedback (${unreadCount} update${unreadCount > 1 ? 's' : ''})` : 'Send feedback'}
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
            {unreadCount > 0 && (
              <span
                style={{ position: 'absolute', top: '-7px', right: '-7px' }}
                className="bf-min-w-[18px] bf-h-[18px] bf-px-1 bf-flex bf-items-center bf-justify-center bf-rounded-full bf-bg-red-500 bf-text-white bf-text-[10px] bf-font-bold bf-leading-none bf-shadow-sm bf-animate-pulse"
                aria-hidden="true"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bf-bg-feedback-text bf-text-feedback-bg bf-px-3 bf-py-1.5 bf-rounded bf-text-sm bf-shadow-md bf-z-[9995]"
            side={position.startsWith('bottom') ? 'top' : 'bottom'}
            sideOffset={8}
          >
            Send feedback or report a bug
            <Tooltip.Arrow className="bf-fill-feedback-text" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
