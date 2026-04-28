import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { query } from '../db';
import { requirePlanFeature, getProjectPlanStatus, incrementUsageCount } from '../helpers/plan';
import { requireProjectApiKey, requireApiKeyLookup, AgentAuthContext } from '../middleware/agentAuth';

const router = Router();

/**
 * Optional HMAC-SHA256 signature verification for the PostHog webhook.
 * If POSTHOG_WEBHOOK_SECRET env is set, we verify `x-posthog-signature`
 * against HMAC(secret, raw-body). If not set, we fall through to
 * X-API-Key auth alone — useful for local testing and gradual rollout.
 *
 * Constant-time comparison via crypto.timingSafeEqual prevents timing
 * attacks on the secret. A missing or malformed header when the secret
 * IS configured is a hard 401 — once you've turned on signing you don't
 * want to silently accept unsigned requests.
 */
function verifyPostHogSignature(req: Request, res: Response, next: NextFunction): void {
    const secret = process.env.POSTHOG_WEBHOOK_SECRET;
    if (!secret) { next(); return; }

    const headerSig = req.headers['x-posthog-signature'];
    const sig = Array.isArray(headerSig) ? headerSig[0] : headerSig;
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (typeof sig !== 'string' || !rawBody) {
        res.status(401).json({ success: false, error: 'Missing or malformed x-posthog-signature header' });
        return;
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        res.status(401).json({ success: false, error: 'Invalid PostHog signature' });
        return;
    }
    next();
}

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
 * Shared handler for both PostHog error routes. Reads the project id from
 * `req.agent` (set by whichever auth middleware ran — requireProjectApiKey
 * or requireApiKeyLookup) so the same logic serves both the per-project URL
 * and the key-only URL.
 */
async function handlePostHogError(req: Request, res: Response): Promise<void> {
    try {
        const body = PostHogErrorSchema.parse(req.body ?? {});
        const props = body.properties ?? {};

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

        const { project_id: projectId } = (req as any).agent as AgentAuthContext;

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
        const dedupeSeed = `${projectId}|${body.distinct_id ?? ''}|${props.$exception_type ?? ''}|${today}`;

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
}

/**
 * POST /api/v1/integrations/posthog/error  (key-only — single webhook for all projects)
 *
 * The X-API-Key header identifies which project this event belongs to, so
 * one PostHog webhook destination covers every Bernstein project. Register
 * BEFORE the /:projectId route so Express doesn't match 'error' as a param.
 */
router.post(
    '/posthog/error',
    requireApiKeyLookup,
    verifyPostHogSignature,
    requirePlanFeature('posthog'),
    handlePostHogError,
);

/**
 * POST /api/v1/integrations/posthog/:projectId/error  (project-id in URL)
 *
 * Kept for backwards compatibility — existing webhook destinations that
 * already embed the project id in the URL continue to work unchanged.
 */
router.post(
    '/posthog/:projectId/error',
    requireProjectApiKey,
    verifyPostHogSignature,
    requirePlanFeature('posthog'),
    handlePostHogError,
);

export default router;
