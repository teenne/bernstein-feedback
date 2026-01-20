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
      className={`bf-fixed ${positionClasses[position]} bf-flex bf-items-center bf-gap-2 bf-px-4 bf-py-2.5 bf-bg-feedback-primary bf-text-white bf-rounded-full bf-shadow-lg hover:bf-bg-feedback-primary-hover bf-transition-all hover:bf-shadow-xl bf-z-[9990] ${className}`}
      aria-label="Send feedback"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="bf-shrink-0"
      >
        <path
          d="M2 2.5C2 2.22386 2.22386 2 2.5 2H13.5C13.7761 2 14 2.22386 14 2.5V10.5C14 10.7761 13.7761 11 13.5 11H8.70711L5.85355 13.8536C5.53857 14.1685 5 13.9464 5 13.5V11H2.5C2.22386 11 2 10.7761 2 10.5V2.5Z"
          fill="currentColor"
        />
      </svg>
      <span className="bf-text-sm bf-font-medium">{label}</span>
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
 * Minimal icon-only feedback button
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
            className={`bf-fixed ${positionClasses[position]} bf-flex bf-items-center bf-justify-center bf-w-12 bf-h-12 bf-bg-feedback-primary bf-text-white bf-rounded-full bf-shadow-lg hover:bf-bg-feedback-primary-hover bf-transition-all hover:bf-shadow-xl bf-z-[9990] ${className}`}
            aria-label="Send feedback"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2 2.5C2 2.22386 2.22386 2 2.5 2H13.5C13.7761 2 14 2.22386 14 2.5V10.5C14 10.7761 13.7761 11 13.5 11H8.70711L5.85355 13.8536C5.53857 14.1685 5 13.9464 5 13.5V11H2.5C2.22386 11 2 10.7761 2 10.5V2.5Z"
                fill="currentColor"
              />
            </svg>
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
