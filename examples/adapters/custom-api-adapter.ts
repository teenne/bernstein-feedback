/**
 * Custom API Adapter for @bernstein/feedback
 *
 * This example shows how to send feedback to your own REST API endpoint.
 * Customize the request format, headers, and error handling as needed.
 */

import type { FeedbackAdapter, FeedbackEvent } from '@bernstein/feedback'

interface CustomApiAdapterOptions {
  /** Your API endpoint URL */
  endpoint: string
  /** Optional auth token or API key */
  apiKey?: string
  /** Optional custom headers */
  headers?: Record<string, string>
  /** Transform the event before sending (optional) */
  transform?: (event: FeedbackEvent) => unknown
}

export function customApiAdapter(options: CustomApiAdapterOptions): FeedbackAdapter {
  const { endpoint, apiKey, headers = {}, transform } = options

  return {
    async send(event: FeedbackEvent) {
      // Use custom transform or default payload
      const payload = transform ? transform(event) : {
        // Flatten the structure for typical REST APIs
        id: crypto.randomUUID(),
        projectId: event.projectId,
        type: event.type,
        title: event.form.title,
        description: event.form.description,
        category: event.form.category,
        impact: event.form.impact,
        email: event.form.email,

        // Context data
        url: event.context?.url,
        userAgent: event.context?.userAgent,
        viewport: event.context?.viewport,
        screenId: event.context?.screenId,
        pageName: event.context?.pageName,
        userId: event.context?.userId,
        tenantId: event.context?.tenantId,

        // Error context
        consoleErrors: event.context?.consoleErrors,
        networkErrors: event.context?.networkErrors,
        breadcrumbs: event.context?.breadcrumbs,

        // Attachments
        screenshot: event.screenshot,
        highlightedElement: event.highlightedElement,

        // Metadata
        appVersion: event.context?.appVersion,
        buildSha: event.context?.buildSha,
        env: event.context?.env,
        timestamp: event.timestamp,
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
          ...headers,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API error ${response.status}: ${errorText}`)
      }

      const result = await response.json()
      return { id: result.id || result.feedbackId || crypto.randomUUID() }
    },
  }
}

// Usage examples:
//
// Basic usage:
// customApiAdapter({
//   endpoint: 'https://api.myapp.com/feedback',
//   apiKey: process.env.FEEDBACK_API_KEY,
// })
//
// With custom headers:
// customApiAdapter({
//   endpoint: 'https://api.myapp.com/feedback',
//   headers: {
//     'X-API-Key': 'your-key',
//     'X-Client-Version': '1.0.0',
//   },
// })
//
// With custom transform (e.g., for a specific API schema):
// customApiAdapter({
//   endpoint: 'https://api.myapp.com/tickets',
//   transform: (event) => ({
//     subject: event.form.title,
//     body: event.form.description,
//     priority: event.form.impact === 'blocks_me' ? 'high' : 'normal',
//     tags: [event.type, event.form.category].filter(Boolean),
//     metadata: JSON.stringify(event.context),
//   }),
// })
