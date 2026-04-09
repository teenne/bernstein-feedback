import { query } from '../db';

function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7); // 'YYYY-MM' in UTC
}

export { getCurrentMonth };

export async function getProjectPlanStatus(projectId: string): Promise<{
    can_submit: boolean;
    tickets_used: number;
    tickets_limit: number;
    plan: string;
    message?: string;
}> {
    const projectResult = await query(
        `SELECT p.plan, p.plan_id, p.plan_limits,
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

    if (ticketsUsed >= maxTickets) {
        return {
            can_submit: false,
            tickets_used: ticketsUsed,
            tickets_limit: maxTickets,
            plan: project.plan,
            message: 'Monthly feedback limit reached. Upgrade your plan to continue collecting feedback.',
        };
    }

    return {
        can_submit: true,
        tickets_used: ticketsUsed,
        tickets_limit: maxTickets,
        plan: project.plan,
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
