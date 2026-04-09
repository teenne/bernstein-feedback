import { z } from 'zod';

export const FeedbackSchema = z.object({
    project_id: z.string().min(1, 'project_id is required'),
    type: z.enum(['feedback', 'bug_report', 'feature_request']),
    timestamp: z.string().datetime().optional(),
    event_id: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    severity: z.string().optional(),
    impact: z.string().optional(),
    email: z.string().optional(),
    context: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
    screenshots: z.array(z.string()).default([]),
    highlighted_element: z.record(z.unknown()).optional(),
    user_id: z.string().optional(),
    tenant_id: z.string().optional(),
    role: z.string().optional(),
    screen_id: z.string().optional(),
    page_name: z.string().optional(),
    bernstein_run_id: z.string().optional().or(z.literal(null)),
}).passthrough();

export const UpdateFeedbackStatusSchema = z.object({
    status: z.enum(['open', 'in_progress', 'resolved', 'closed'], {
        message: 'status must be one of: open, in_progress, resolved, closed',
    }),
    resolution_note: z.string().optional(),
});
