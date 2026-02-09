import type { FeedbackAdapter, FeedbackEvent } from '../schemas';

export interface WebhookAdapterOptions {
    /** The webhook URL to send feedback to (e.g., Slack, Discord, Teams) */
    webhookUrl: string;
    /** Request timeout in milliseconds (default: 10000) */
    timeout?: number;
    /** Transform the event before sending (for custom webhook formats) */
    transform?: (event: FeedbackEvent) => unknown;
}

/**
 * Webhook adapter for sending feedback to Slack, Discord, Teams, or other webhook endpoints.
 *
 * @example
 * const adapter = createWebhookAdapter({
 *   webhookUrl: 'https://hooks.slack.com/services/xxx/yyy/zzz',
 *   transform: (event) => ({
 *     text: `New ${event.type}: ${event.title}`,
 *     blocks: [
 *       { type: 'section', text: { type: 'mrkdwn', text: `*${event.title}*\n${event.description}` } }
 *     ]
 *   })
 * });
 */
export function createWebhookAdapter(options: WebhookAdapterOptions): FeedbackAdapter {
    const { webhookUrl, timeout = 10000, transform } = options;

    return {
        async submit(event: FeedbackEvent) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try {
                const body = transform ? transform(event) : {
                    // Default format compatible with most webhooks
                    text: `New ${event.type.replace('_', ' ')}: ${event.title}`,
                    embeds: [{
                        title: event.title,
                        description: event.description,
                        color: event.type === 'bug_report' ? 0xff0000 : 0x00ff00,
                        fields: [
                            { name: 'Type', value: event.type, inline: true },
                            { name: 'Project', value: event.project_id, inline: true },
                            ...(event.user_id ? [{ name: 'User', value: event.user_id, inline: true }] : []),
                            ...(event.severity ? [{ name: 'Severity', value: event.severity, inline: true }] : []),
                        ],
                        timestamp: event.timestamp,
                    }],
                };

                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    return {
                        success: false,
                        error: `Webhook error: ${response.status} - ${errorText}`,
                    };
                }

                return { success: true };
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

// Alias for backwards compatibility
export const webhookAdapter = createWebhookAdapter;
