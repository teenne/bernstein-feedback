import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { requireAuth, getFreshRole, JwtPayload } from '../middleware/auth';
import { CreateProjectSchema, UpdateProjectSchema, AddMemberSchema } from '../schemas/project';
import { ProjectMember, Project, UserRole } from '../schemas/tables';

const router = Router();

// ──────────────────────────────
// Project Members
// ──────────────────────────────

// List members of a project
router.get('/:id/members', requireAuth, async (req, res) => {
    try {
        const result = await query<ProjectMember>(
            'SELECT * FROM project_members WHERE project_id = $1 ORDER BY created_at ASC',
            [req.params.id]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Add member to project
router.post('/:id/members', requireAuth, async (req, res) => {
    try {
        const { user_id, email, role } = AddMemberSchema.parse(req.body);

        let memberId = user_id;
        if (!memberId) {
            const userResult = await query<Pick<UserRole, 'user_id'>>('SELECT user_id FROM user_roles WHERE email = $1', [email]);
            if (userResult.rows.length === 0) {
                res.status(404).json({ success: false, error: `No user found with email: ${email}` });
                return;
            }
            memberId = userResult.rows[0].user_id;
        }

        const result = await query<ProjectMember>(
            `INSERT INTO project_members (project_id, user_id, email, role)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (project_id, user_id) DO UPDATE SET role = $4
             RETURNING *`,
            [req.params.id, memberId, email, role]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    }
});

// Remove member from project
router.delete('/:id/members/:user_id', requireAuth, async (req, res) => {
    try {
        const result = await query<Pick<ProjectMember, 'id'>>(
            'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.params.user_id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Member not found' });
            return;
        }
        res.json({ success: true });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// ──────────────────────────────
// Project CRUD
// ──────────────────────────────

// Create project (with free-tier 1-project limit enforcement)
router.post('/', requireAuth, async (req, res) => {
    try {
        const { id, name, owner_id, owner_email } = CreateProjectSchema.parse(req.body);

        const user = (req as any).user as JwtPayload;
        const ownerId = owner_id || user.user_id;

        // Account-level project limit: count ALL projects, check against highest plan
        const allProjects = await query<{ id: string; plan: string; plan_id: string | null; max_projects: number; plan_name: string | null }>(
            `SELECT p.id, p.plan, p.plan_id,
                    COALESCE(pl.max_projects, (p.plan_limits->>'max_projects')::int, 1) AS max_projects,
                    pl.name AS plan_name
             FROM projects p
             LEFT JOIN plans pl ON pl.id = COALESCE(p.plan_id, p.plan)`
        );

        if (allProjects.rows.length > 0) {
            const maxProjects = Math.max(...allProjects.rows.map((p) => p.max_projects ?? 1));
            if (maxProjects > 0 && allProjects.rows.length >= maxProjects) {
                const planName = allProjects.rows[0]?.plan_name || allProjects.rows[0]?.plan || 'free';
                res.status(403).json({
                    success: false,
                    error: `Your ${planName} plan allows ${maxProjects} project${maxProjects > 1 ? 's' : ''}. Upgrade to create more.`,
                });
                return;
            }
        }

        const result = await query<Project>(
            `INSERT INTO projects (id, name, owner_id, owner_email) VALUES ($1, $2, $3, $4) RETURNING *`,
            [id, name || id, ownerId, owner_email || null]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
        } else if (error?.code === '23505') {
            res.status(409).json({ success: false, error: 'Project ID already exists' });
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    }
});

// List projects — scoped by role
router.get('/', requireAuth, async (req, res) => {
    try {
        const authUser = (req as any).user as JwtPayload;
        const freshRole = await getFreshRole(authUser.user_id, authUser.role);

        const { owner_email, owner_id, user_id } = req.query;
        let sql = 'SELECT id, name, owner_id, owner_email, plan, created_at FROM projects';
        const params: any[] = [];

        if (freshRole === 'admin') {
            if (owner_id) {
                sql += ' WHERE owner_id = $1';
                params.push(owner_id);
            } else if (owner_email) {
                sql += ' WHERE owner_email = $1';
                params.push(owner_email);
            } else if (user_id) {
                sql += ` WHERE owner_id = $1 OR id IN (SELECT project_id FROM project_members WHERE user_id = $1)`;
                params.push(user_id);
            }
        } else {
            sql += ` WHERE owner_id = $1 OR id IN (SELECT project_id FROM project_members WHERE user_id = $1)`;
            params.push(authUser.user_id);
        }
        sql += ' ORDER BY created_at DESC';

        const result = await query<Pick<Project, 'id' | 'name' | 'owner_id' | 'owner_email' | 'plan' | 'created_at'>>(sql, params);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Get single project
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const result = await query<Project>('SELECT * FROM projects WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Update project
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const data = UpdateProjectSchema.parse(req.body);
        const sets: string[] = [];
        const values: any[] = [];
        let i = 1;

        if (data.name !== undefined) { sets.push(`name = $${i++}`); values.push(data.name); }
        if (data.plan !== undefined) { sets.push(`plan = $${i++}`); values.push(data.plan); }
        if (data.plan_id !== undefined) { sets.push(`plan_id = $${i++}`); values.push(data.plan_id); }
        if (data.config !== undefined) { sets.push(`config = $${i++}`); values.push(JSON.stringify(data.config)); }
        if (data.plan_limits !== undefined) { sets.push(`plan_limits = $${i++}`); values.push(JSON.stringify(data.plan_limits)); }

        values.push(req.params.id);
        const result = await query<Project>(
            `UPDATE projects SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    }
});

// Delete project
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const result = await query<Pick<Project, 'id'>>('DELETE FROM projects WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        res.json({ success: true });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

export default router;
