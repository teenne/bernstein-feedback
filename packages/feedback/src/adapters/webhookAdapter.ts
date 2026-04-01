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
                let body: any;

                if (transform) {
                    body = transform(event);
                } else {
                    // Smart formatting based on URL
                    const url = webhookUrl ? webhookUrl.toLowerCase() : '';

                    if (url.includes('discord.com') || url.includes('discordapp.com')) {
                        // Discord format
                        // NOTE: Discord embeds do not support Base64 images in 'image.url'.
                        // We must omit the screenshot to prevent 400 Bad Request.
                        body = {
                            embeds: [{
                                title: event.title,
                                description: event.description || 'No description provided',
                                color: event.type === 'bug_report' ? 0xff0000 : 0x00ff00,
                                fields: [
                                    { name: 'Type', value: event.type, inline: true },
                                    { name: 'Project', value: event.project_id, inline: true },
                                    ...(event.severity ? [{ name: 'Severity', value: event.severity, inline: true }] : []),
                                    ...(event.user_id ? [{ name: 'User', value: event.user_id, inline: true }] : []),
                                    ...(event.highlighted_element ? [{ name: 'Highlight', value: `\`${event.highlighted_element.tag_name}\`: ${event.highlighted_element.selector}`, inline: false }] : []),
                                ],
                                timestamp: event.timestamp,
                                footer: { text: `Bernstein Feedback • ${event.project_id} ${event.screenshots && event.screenshots.length > 0 ? '(Screenshot captured but not attached)' : ''}` }
                            }]
                        };
                    } else if (url.includes('outlook.office.com') || url.includes('webhook.office.com')) {
                        // Microsoft Teams format (MessageCard)
                        body = {
                            "@type": "MessageCard",
                            "@context": "http://schema.org/extensions",
                            "themeColor": event.type === 'bug_report' ? "FF0000" : "00FF00",
                            "summary": `New Feedback: ${event.title}`,
                            "sections": [{
                                "activityTitle": `${event.title}`,
                                "activitySubtitle": `New ${event.type} in ${event.project_id}`,
                                "facts": [
                                    { "name": "Description", "value": event.description || "N/A" },
                                    { "name": "User", "value": event.user_id || "Anonymous" },
                                    { "name": "Severity", "value": event.severity || "N/A" },
                                    { "name": "Page", "value": event.context?.pageName || "N/A" },
                                    ...(event.highlighted_element ? [{ "name": "Highlight", "value": `\`${event.highlighted_element.tag_name}\`` }] : [])
                                ],
                                "markdown": true,
                                "text": [
                                    event.screenshots && event.screenshots.length > 0 ? "_Screenshot captured_ (Base64 images not supported in Teams webhooks)" : "",
                                    event.highlighted_element ? `**Highlight Details:** \`${event.highlighted_element.selector}\`` : ""
                                ].filter(Boolean).join("\n\n")
                            }]
                        };
                    } else if (url.includes('slack.com')) {
                        // Slack format
                        body = {
                            text: `New ${event.type}: *${event.title}*`,
                            attachments: [{
                                color: event.type === 'bug_report' ? '#ff0000' : '#36a64f',
                                fields: [
                                    { title: 'Project', value: event.project_id, short: true },
                                    { title: 'Severity', value: event.severity || 'N/A', short: true },
                                    { title: 'User', value: event.user_id || 'Anonymous', short: true },
                                    { title: 'Description', value: event.description || 'N/A', short: false },
                                    ...(event.highlighted_element ? [{ title: 'Highlight', value: `\`${event.highlighted_element.tag_name}\`: ${event.highlighted_element.selector}`, short: false }] : [])
                                ],
                                footer: event.screenshots && event.screenshots.length > 0 ? "Screenshot captured but not attached (Base64 not supported)" : undefined
                            }]
                        };
                    } else {
                        // Generic Fallback
                        body = {
                            text: `New ${event.type}: ${event.title}`,
                            title: event.title,
                            description: event.description,
                            data: event
                        };
                    }
                }

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
