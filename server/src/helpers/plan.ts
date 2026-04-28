import type { Request, Response, NextFunction } from 'express';
import { query } from '../db';

function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7); // 'YYYY-MM' in UTC
}

export { getCurrentMonth };

/**
 * Read a single feature flag from the project's plan.
 * Returns `undefined` if the project or feature key is missing.
 * The `features` JSONB on `plans` holds boolean/string flags like
 * `ai_clustering`, `posthog`, `api_access`, `self_hosted`.
 */
export async function getProjectFeature<T = unknown>(
    projectId: string,
    featureKey: string,
): Promise<T | undefined> {
    const result = await query<{ value: T | null }>(
        `SELECT pl.features -> $2 AS value
           FROM projects p
           LEFT JOIN plans pl ON pl.id = COALESCE(p.plan_id, p.plan)
          WHERE p.id = $1`,
        [projectId, featureKey],
    );
    if (result.rows.length === 0) return undefined;
    const raw = result.rows[0].value as unknown;
    return (raw === null ? undefined : (raw as T));
}

/**
 * Fetch the complete features object for a project.
 * Returns {} if the project has no plan joined.
 */
export async function getProjectFeatures(
    projectId: string,
): Promise<Record<string, unknown>> {
    const result = await query<{ features: Record<string, unknown> | null }>(
        `SELECT pl.features
           FROM projects p
           LEFT JOIN plans pl ON pl.id = COALESCE(p.plan_id, p.plan)
          WHERE p.id = $1`,
        [projectId],
    );
    return result.rows[0]?.features ?? {};
}

/**
 * Express middleware that rejects with 403 when the project identified by
 * `req.params.id` does not have `featureKey` enabled on its plan.
 * Intended for per-project routes where `:id` is the project id.
 */
export function requirePlanFeature(featureKey: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const projectId = req.params.id || (req.params as any).projectId;
        if (!projectId) {
            res.status(400).json({ success: false, error: 'Project id missing from route' });
            return;
        }
        try {
            const value = await getProjectFeature<boolean>(projectId, featureKey);
            if (value !== true) {
                res.status(403).json({
                    success: false,
                    error: `Feature "${featureKey}" is not available on this project's plan.`,
                    feature: featureKey,
                });
                return;
            }
            next();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ success: false, error: msg });
        }
    };
}

export async function getProjectPlanStatus(projectId: string): Promise<{
    can_submit: boolean;
    tickets_used: number;
    tickets_limit: number;
    plan: string;
    message?: string;
}> {
    const projectResult = await query(
        `SELECT p.plan, p.plan_id, p.plan_limits,
                COALESCE(p.plan_id, p.plan) AS effective_plan,
                pl.max_tickets_per_month AS plan_max_tickets,
                pl.max_projects AS plan_max_projects
         FROM projects p
         LEFT JOIN plans pl ON pl.id = COALESCE(p.plan_id, p.plan)
         WHERE p.id = $1`,
        [projectId]
    );

    if (projectResult.rows.length === 0) {
        return { can_submit: true, tickets_used: 0, tickets_limit: 50, plan: 'free' };
    }

    const project = projectResult.rows[0];
    const maxTickets = project.plan_max_tickets
        ?? project.plan_limits?.max_tickets_per_month
        ?? 50;

    const month = getCurrentMonth();
    const usageResult = await query(
        'SELECT ticket_count FROM project_usage WHERE project_id = $1 AND month = $2',
        [projectId, month]
    );

    const ticketsUsed = usageResult.rows.length > 0 ? parseInt(usageResult.rows[0].ticket_count) : 0;

    const effectivePlan: string = project.effective_plan ?? project.plan;

    if (ticketsUsed >= maxTickets) {
        return {
            can_submit: false,
            tickets_used: ticketsUsed,
            tickets_limit: maxTickets,
            plan: effectivePlan,
            message: 'Monthly feedback limit reached. Upgrade your plan to continue collecting feedback.',
        };
    }

    return {
        can_submit: true,
        tickets_used: ticketsUsed,
        tickets_limit: maxTickets,
        plan: effectivePlan,
    };
}

/**
 * Notify project owner when ticket limit is reached.
 * Currently logs to console. Replace with SMTP/SendGrid when email is configured.
 */
export async function notifyLimitReached(projectId: string, ticketsUsed: number, ticketsLimit: number): Promise<void> {
    try {
        const projectResult = await query(
            'SELECT owner_email, name FROM projects WHERE id = $1',
            [projectId]
        );
        const project = projectResult.rows[0];
        const ownerEmail = project?.owner_email;
        const projectName = project?.name || projectId;

        console.warn(
            `[PLAN LIMIT] Project "${projectName}" (${projectId}) reached ticket limit: ${ticketsUsed}/${ticketsLimit}.` +
            (ownerEmail ? ` Owner: ${ownerEmail}` : ' No owner email set.')
        );
    } catch (err) {
        console.error('[PLAN LIMIT] Failed to send notification:', err);
    }
}

export async function incrementUsageCount(projectId: string): Promise<number> {
    const month = getCurrentMonth();
    const result = await query(
        `INSERT INTO project_usage (project_id, month, ticket_count)
         VALUES ($1, $2, 1)
         ON CONFLICT (project_id, month)
         DO UPDATE SET ticket_count = project_usage.ticket_count + 1, updated_at = NOW()
         RETURNING ticket_count`,
        [projectId, month]
    );
    return parseInt(result.rows[0].ticket_count);
}
