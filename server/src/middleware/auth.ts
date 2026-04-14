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
