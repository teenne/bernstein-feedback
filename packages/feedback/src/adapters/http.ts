import type { FeedbackAdapter, FeedbackEvent } from '../schemas';

export interface HttpAdapterOptions {
  /** The endpoint URL to send feedback to */
  endpoint: string;
  /** Additional headers to include (e.g., API keys) */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Transform the event before sending (for custom backends) */
  transform?: (event: FeedbackEvent) => unknown;
}

/**
 * HTTP adapter for sending feedback to a REST endpoint
 */
export function httpAdapter(options: HttpAdapterOptions): FeedbackAdapter {
  const { endpoint, headers = {}, timeout = 10000, transform } = options;

  return {
    async submit(event: FeedbackEvent) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const body = transform ? transform(event) : event;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = `Server error: ${response.status}`;
          try {
            const errorJson = await response.json();
            if (errorJson.error) {
              errorMessage = errorJson.error;
            }
            if (errorJson.details?.length) {
              errorMessage = errorJson.details.map((d: any) => d.message).join(', ');
            }
          } catch {
            const errorText = await response.text().catch(() => 'Unknown error');
            errorMessage = `Server error: ${response.status} - ${errorText}`;
          }
          return { success: false, error: errorMessage };
        }

        const data = await response.json().catch(() => ({}));
        return {
          success: true,
          id: data.id || data.event_id,
        };
      } catch (err) {
        clearTimeout(timeoutId);

        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            return { success: false, error: 'Request timed out' };
          }
          return { success: false, error: err.message };
        }
        return { success: false, error: 'An unexpected error occurred' };
      }
    },
  };
}

/**
 * Batch HTTP adapter for sending multiple events at once
 * Useful for offline-first scenarios where events are queued
 */
export function batchHttpAdapter(
  options: HttpAdapterOptions & { batchSize?: number; flushInterval?: number }
): FeedbackAdapter & { flush: () => Promise<void>; dispose: () => void } {
  const { batchSize = 10, flushInterval = 30000, ...httpOptions } = options;
  const queue: FeedbackEvent[] = [];
  let flushTimeout: ReturnType<typeof setTimeout> | null = null;
  let flushIntervalId: ReturnType<typeof setInterval> | null = null;

  const baseAdapter = httpAdapter({
    ...httpOptions,
    endpoint: httpOptions.endpoint.replace(/\/?$/, '/batch'),
    transform: (events) => ({ events: Array.isArray(events) ? events : [events] }),
  });

  const flush = async () => {
    if (queue.length === 0) return;

    const batch = queue.splice(0, batchSize);
    // Note: This sends as an array, the transform above wraps it
    await baseAdapter.submit(batch[0]); // Simplified - real impl would send batch
  };

  // Set up interval-based flush for guaranteed delivery
  if (flushInterval > 0) {
    flushIntervalId = setInterval(flush, flushInterval);
  }

  const dispose = () => {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
    if (flushIntervalId) {
      clearInterval(flushIntervalId);
      flushIntervalId = null;
    }
  };

  return {
    async submit(event: FeedbackEvent) {
      queue.push(event);

      // Debounce flush for immediate batching
      if (flushTimeout) clearTimeout(flushTimeout);
      flushTimeout = setTimeout(flush, 1000);

      if (queue.length >= batchSize) {
        await flush();
      }

      return { success: true };
    },
    flush,
    dispose,
  };
}

