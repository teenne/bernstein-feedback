import type { FeedbackAdapter, FeedbackEvent } from '../schemas';

export interface LocalStorageAdapterOptions {
  /** Storage key prefix (default: 'bernstein-feedback') */
  prefix?: string;
  /** Maximum events to store (default: 100) */
  maxEvents?: number;
  /** Log events to console (default: true in development) */
  logToConsole?: boolean;
}

const STORAGE_KEY = 'bernstein-feedback-events';

/**
 * Local storage adapter for development and offline scenarios
 * Stores feedback events in localStorage for later export/review
 */
export function localStorageAdapter(options: LocalStorageAdapterOptions = {}): FeedbackAdapter & {
  getEvents: () => FeedbackEvent[];
  clearEvents: () => void;
  exportEvents: () => string;
} {
  const {
    prefix = 'bernstein-feedback',
    maxEvents = 100,
    logToConsole = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development',
  } = options;

  const storageKey = `${prefix}-${STORAGE_KEY}`;

  const getEvents = (): FeedbackEvent[] => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const saveEvents = (events: FeedbackEvent[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(events.slice(-maxEvents)));
    } catch (err) {
      console.warn('Failed to save feedback to localStorage:', err);
    }
  };

  return {
    async submit(event: FeedbackEvent) {
      const eventWithId = {
        ...event,
        event_id: event.event_id || crypto.randomUUID(),
      };

      const events = getEvents();
      events.push(eventWithId);
      saveEvents(events);

      if (logToConsole) {
        console.group('📝 Feedback captured (localStorage)');
        console.log('Type:', event.type);
        console.log('Title:', event.title);
        console.log('Description:', event.description);
        console.log('Context:', event.context);
        console.groupEnd();
      }

      return { success: true, id: eventWithId.event_id };
    },

    getEvents,

    clearEvents: () => {
      localStorage.removeItem(storageKey);
    },

    exportEvents: () => {
      const events = getEvents();
      return JSON.stringify(events, null, 2);
    },
  };
}

/**
 * Console-only adapter for testing
 * Simply logs events to the console without persistence
 */
export function consoleAdapter(): FeedbackAdapter {
  return {
    async submit(event: FeedbackEvent) {
      const id = crypto.randomUUID();

      console.group(`📝 Feedback: ${event.type}`);
      console.log('ID:', id);
      console.log('Title:', event.title);
      console.log('Description:', event.description);
      if (event.category) console.log('Category:', event.category);
      if (event.severity) console.log('Severity:', event.severity);
      console.log('Context:', event.context);
      if (event.screenshot) console.log('Screenshot:', '(attached)');
      console.groupEnd();

      return { success: true, id };
    },
  };
}
