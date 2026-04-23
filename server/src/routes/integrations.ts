import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { requirePlanFeature, getProjectPlanStatus, incrementUsageCount } from '../helpers/plan';
import { requireProjectApiKey } from '../middleware/agentAuth';

const router = Router();

/**
 * Inbound integrations — webhooks from third-party tools that create
 * feedback rows automatically. All routes use the `X-API-Key` header
 * against `projects.api_key` (same as the Agent API) and are gated on
 * the relevant plan feature flag.
 */

/**
 * PostHog-compatible error payload. Accepts either PostHog's native
 * webhook shape (event + properties) or a simplified normalized form.
 * Only the fields we can safely map to a feedback row are extracted —
 * anything else is dropped on the floor.
 */
const PostHogErrorSchema = z.object({
    event: z.string().optional(),
    timestamp: z.string().optional(),
    distinct_id: z.string().optional(),
    properties: z
        .object({
            $exception_message: z.string().optional(),
            $exception_type: z.string().optional(),
            $exception_stack: z.string().optional(),
            $current_url: z.string().optional(),
            $pathname: z.string().optional(),
            $session_id: z.string().optional(),
            $session_recording_url: z.string().optional(),
            email: z.string().optional(),
            user_properties: z.record(z.unknown()).optional(),
        })
        .passthrough()
        .optional(),
    // Normalized shortcut form — what you'd post from a custom script
    // instead of PostHog itself.
    title: z.string().optional(),
    description: z.string().optional(),
    stack: z.string().optional(),
    url: z.string().optional(),
    session_id: z.string().optional(),
    session_replay_url: z.string().optional(),
    email: z.string().optional(),
    user_properties: z.record(z.unknown()).optional(),
});

/**
 * POST /api/v1/integrations/posthog/:projectId/error
 *
 * Create a bug-report feedback row from a PostHog error webhook. Gated
 * by `features.posthog` on the project's plan. Ticket limits apply
 * exactly as they would for a user-submitted ticket — a project stuck
 * at 100% will receive a 429 and the error is NOT silently ingested.
 *
 * Dedupe: PostHog's distinct_id + exception_type + today's date is
 * used as an `event_id` so the same error on the same user collapses
 * into one row per day instead of one per page-load.
 */
router.post(
    '/posthog/:projectId/error',
    requireProjectApiKey,
    requirePlanFeature('posthog'),
    async (req, res) => {
        try {
            const body = PostHogErrorSchema.parse(req.body ?? {});
            const props = body.properties ?? {};

            // Title: prefer explicit, then PostHog exception message
            const title =
                body.title?.slice(0, 200) ??
                props.$exception_message?.slice(0, 200) ??
                'Automatic error from PostHog';
            const description =
                body.description ??
                [props.$exception_type, props.$exception_message, props.$exception_stack]
                    .filter(Boolean)
                    .join('\n\n')
                    .slice(0, 5000);

            const url = body.url ?? props.$current_url ?? null;
            const route = props.$pathname ?? null;
            const sessionId = body.session_id ?? props.$session_id ?? null;
            const sessionReplayUrl =
                body.session_replay_url ?? props.$session_recording_url ?? null;
            const email = body.email ?? props.email ?? null;
            const userProperties = body.user_properties ?? props.user_properties ?? null;

            const projectId = req.params.projectId;

            // Plan usage gate — matches the widget submit path.
            const planStatus = await getProjectPlanStatus(projectId);
            if (!planStatus.can_submit) {
                res.status(429).json({
                    success: false,
                    error: 'limit_reached',
                    message: planStatus.message,
                });
                return;
            }

            const today = new Date().toISOString().slice(0, 10);
            // Dedupe: same user + same exception type + same day ≡ same ticket.
            // md5 → 32 hex chars; Postgres' UUID parser accepts 32 unbroken
            // hex chars, so `md5(text)::uuid` is valid.
            const dedupeSeed = `${projectId}|${body.distinct_id ?? ''}|${props.$exception_type ?? ''}|${today}`;

            // Check for an existing row with the same dedupe event_id before
            // inserting. Avoids relying on a UNIQUE constraint on event_id
            // (which existing widget events already satisfy per-submission).
            const existing = await query<{ id: string }>(
                `SELECT id FROM feedback
                   WHERE project_id = $1
                     AND event_id = md5($2)::uuid
                     AND type = 'bug_report'
                   LIMIT 1`,
                [projectId, dedupeSeed],
            );
            if (existing.rows.length > 0) {
                res.json({ success: true, id: existing.rows[0].id, deduplicated: true });
                return;
            }

            const result = await query<{ id: string }>(
                `INSERT INTO feedback (
                    project_id, type, timestamp, event_id, title, description,
                    url, route,
                    user_id, email,
                    session_id, session_provider, session_replay_url, user_properties
                 ) VALUES (
                    $1, 'bug_report', $2, md5($3)::uuid, $4, $5,
                    $6, $7,
                    $8, $9,
                    $10, 'posthog', $11, $12
                 )
                 RETURNING id`,
                [
                    projectId,
                    body.timestamp ?? new Date().toISOString(),
                    dedupeSeed,
                    title,
                    description,
                    url,
                    route,
                    body.distinct_id ?? null,
                    email,
                    sessionId,
                    sessionReplayUrl,
                    userProperties ? JSON.stringify(userProperties) : null,
                ],
            );

            await incrementUsageCount(projectId);
            res.status(201).json({ success: true, id: result.rows[0].id });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
                return;
            }
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    },
);

export default router;
