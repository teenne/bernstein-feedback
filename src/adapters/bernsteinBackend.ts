import type { FeedbackAdapter, FeedbackEvent } from '../schemas';

/**
 * Configuration options for the Bernstein Backend adapter
 */
export interface BernsteinBackendAdapterOptions {
    /** Base URL for the Bernstein backend API */
    baseUrl: string;
    /** Optional API key for authentication */
    apiKey?: string;
    /** Optional run ID for correlation */
    runId?: string;
    /** Optional custom headers */
    headers?: Record<string, string>;
}

/**
 * Creates a feedback adapter for the Bernstein Backend ecosystem.
 * This adapter sends feedback to a Bernstein-compatible backend API.
 * 
 * @example
 * ```tsx
 * import { bernsteinBackendAdapter } from '@bernstein/feedback/adapters';
 * 
 * const adapter = bernsteinBackendAdapter({
 *   baseUrl: 'https://api.your-backend.com',
 *   apiKey: 'your-api-key',
 *   runId: 'optional-run-id'
 * });
 * ```
 */
export function bernsteinBackendAdapter(options: BernsteinBackendAdapterOptions): FeedbackAdapter {
    const { baseUrl, apiKey, runId, headers: customHeaders } = options;

    return {
        async submit(event: FeedbackEvent) {
            try {
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    ...customHeaders,
                };

                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }

                if (runId) {
                    headers['X-Bernstein-Run-Id'] = runId;
                }

                const endpoint = `${baseUrl.replace(/\/$/, '')}/api/feedback`;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(event),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    return {
                        success: false,
                        error: errorData.message || `Bernstein backend error: ${response.status}`,
                    };
                }

                const data = await response.json().catch(() => ({}));
                return {
                    success: true,
                    id: data.id?.toString(),
                };
            } catch (err) {
                return {
                    success: false,
                    error: err instanceof Error ? err.message : 'Bernstein backend request failed',
                };
            }
        },
    };
}
