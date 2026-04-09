import { Router } from 'express';
import { query } from '../db';
import { requireAuth } from '../middleware/auth';
import { getProjectPlanStatus, getCurrentMonth } from '../helpers/plan';
import { Plan, ProjectUsage } from '../schemas/tables';

const router = Router();

// List available plans (public)
router.get('/', async (_req, res) => {
    try {
        const result = await query<Pick<Plan, 'id' | 'name' | 'description' | 'price_monthly' | 'max_projects' | 'max_tickets_per_month' | 'features' | 'display_order'>>(
            `SELECT id, name, description, price_monthly, max_projects, max_tickets_per_month, features, display_order
             FROM plans WHERE is_active = TRUE ORDER BY display_order ASC`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Plan status for a project (public — widget calls this)
router.get('/projects/:id/plan-status', async (req, res) => {
    try {
        const status = await getProjectPlanStatus(req.params.id);
        res.json({ success: true, data: status });
    } catch (error) {
        // Fail-safe: if we can't check, allow submissions (never break host app)
        res.json({ success: true, data: { can_submit: true, tickets_used: 0, tickets_limit: 50, plan: 'free' } });
    }
});

// Project usage (auth required)
router.get('/projects/:id/usage', requireAuth, async (req, res) => {
    try {
        const month = getCurrentMonth();
        const projectResult = await query<{ plan: string; plan_id: string | null; plan_limits: Record<string, any> | null; plan_max_tickets: number | null; plan_name: string | null }>(
            `SELECT p.plan, p.plan_id, p.plan_limits,
                    pl.max_tickets_per_month AS plan_max_tickets,
                    pl.name AS plan_name
             FROM projects p
             LEFT JOIN plans pl ON pl.id = COALESCE(p.plan_id, p.plan)
             WHERE p.id = $1`,
            [req.params.id]
        );

        if (projectResult.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }

        const project = projectResult.rows[0];
        const maxTickets = project.plan_max_tickets
            ?? project.plan_limits?.max_tickets_per_month
            ?? 50;

        const currentUsage = await query<Pick<ProjectUsage, 'ticket_count'>>(
            'SELECT ticket_count FROM project_usage WHERE project_id = $1 AND month = $2',
            [req.params.id, month]
        );
        const ticketsUsed = currentUsage.rows.length > 0 ? currentUsage.rows[0].ticket_count : 0;

        const history = await query<Pick<ProjectUsage, 'month' | 'ticket_count'>>(
            `SELECT month, ticket_count FROM project_usage
             WHERE project_id = $1
             ORDER BY month DESC LIMIT 6`,
            [req.params.id]
        );

        res.json({
            success: true,
            data: {
                plan: project.plan,
                tickets_used: ticketsUsed,
                tickets_limit: maxTickets,
                percentage_used: maxTickets > 0 ? Math.round((ticketsUsed / maxTickets) * 100) : 0,
                month,
                history: history.rows,
            },
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

export default router;
