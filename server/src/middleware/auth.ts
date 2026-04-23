import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import { UserRole } from '../schemas/tables';

const JWT_SECRET = process.env.JWT_SECRET || 'bernstein-feedback-secret-change-in-production';

export interface JwtPayload {
    user_id: string;
    email: string;
    role: 'admin' | 'user';
}

export function generateToken(payload: JwtPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
        return null;
    }
}

// Middleware: require valid JWT
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
    }

    const payload = verifyToken(header.slice(7));
    if (!payload) {
        res.status(401).json({ success: false, error: 'Invalid or expired token' });
        return;
    }

    (req as any).user = payload;
    next();
}

// Helper: get fresh role from DB (JWT role may be stale after role change)
export async function getFreshRole(userId: string, fallback: string = 'user'): Promise<string> {
    try {
        const result = await query<Pick<UserRole, 'role'>>('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
        return result.rows.length > 0 ? result.rows[0].role : fallback;
    } catch {
        return fallback;
    }
}

// Middleware: require admin role (checks fresh role from DB, not stale JWT)
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = (req as any).user as JwtPayload;
    const freshRole = await getFreshRole(user.user_id, user.role);
    if (freshRole !== 'admin') {
        res.status(403).json({ success: false, error: 'Admin access required' });
        return;
    }
    (req as any).user = { ...user, role: freshRole };
    next();
}

// Helper: get project IDs accessible to a user (owned + member)
export async function getUserProjectIds(userId: string): Promise<string[]> {
    const result = await query(
        `SELECT id FROM projects WHERE owner_id = $1
         UNION
         SELECT project_id FROM project_members WHERE user_id = $1`,
        [userId]
    );
    return result.rows.map((r) => r.id || r.project_id);
}

/**
 * Middleware: require the authenticated user to be an owner of the project
 * identified by `req.params.id` (or global admin).
 *
 * Accepts ownership via any of:
 *   • `projects.owner_id` = user.user_id
 *   • `project_members.role = 'owner'` row for (project, user)
 *   • global admin (fresh role from `user_roles`)
 *
 * Must be chained after `requireAuth`.
 */
export async function requireProjectOwner(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const user = (req as any).user as JwtPayload | undefined;
    if (!user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
    }
    const projectId = req.params.id || (req.params as any).projectId;
    if (!projectId) {
        res.status(400).json({ success: false, error: 'Project id missing from route' });
        return;
    }

    try {
        const freshRole = await getFreshRole(user.user_id, user.role);
        if (freshRole === 'admin') {
            (req as any).user = { ...user, role: freshRole };
            next();
            return;
        }

        const result = await query<{ is_owner: boolean }>(
            `SELECT TRUE AS is_owner
               FROM projects p
              WHERE p.id = $1
                AND (
                    p.owner_id = $2
                    OR EXISTS (
                        SELECT 1 FROM project_members pm
                         WHERE pm.project_id = p.id
                           AND pm.user_id = $2
                           AND pm.role = 'owner'
                    )
                )
              LIMIT 1`,
            [projectId, user.user_id],
        );

        if (result.rows.length === 0) {
            res.status(403).json({
                success: false,
                error: 'Only the project owner can perform this action.',
            });
            return;
        }
        next();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
}
