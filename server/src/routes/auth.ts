import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db';
import { generateToken, requireAuth, requireAdmin, JwtPayload } from '../middleware/auth';
import { RegisterSchema, LoginSchema, UpdateRoleSchema } from '../schemas/auth';
import { UserRole } from '../schemas/tables';

const router = Router();

// Register a new user
router.post('/register', async (req, res) => {
    try {
        const { email, password } = RegisterSchema.parse(req.body);

        const existing = await query<Pick<UserRole, 'user_id'>>('SELECT user_id FROM user_roles WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            res.status(409).json({ success: false, error: 'Email already registered' });
            return;
        }

        // First user becomes admin
        const countResult = await query<{ count: string }>('SELECT COUNT(*) as count FROM user_roles');
        const assignedRole = parseInt(countResult.rows[0].count) === 0 ? 'admin' : 'user';

        const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const passwordHash = await bcrypt.hash(password, 10);

        await query(
            `INSERT INTO user_roles (user_id, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
            [userId, email.toLowerCase(), passwordHash, assignedRole]
        );

        const token = generateToken({ user_id: userId, email: email.toLowerCase(), role: assignedRole as 'admin' | 'user' });

        res.status(201).json({
            success: true,
            data: { token, user_id: userId, email: email.toLowerCase(), role: assignedRole }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    }
});

// Login with email + password
router.post('/login', async (req, res) => {
    try {
        const { email, password } = LoginSchema.parse(req.body);

        const result = await query<Pick<UserRole, 'user_id' | 'email' | 'password_hash' | 'role'>>(
            'SELECT user_id, email, password_hash, role FROM user_roles WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            res.status(401).json({ success: false, error: 'Invalid email or password' });
            return;
        }

        const user = result.rows[0];
        if (!user.password_hash) {
            res.status(401).json({ success: false, error: 'Account was created via OAuth. Use Supabase login.' });
            return;
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            res.status(401).json({ success: false, error: 'Invalid email or password' });
            return;
        }

        const token = generateToken({ user_id: user.user_id, email: user.email, role: user.role });

        res.json({
            success: true,
            data: { token, user_id: user.user_id, email: user.email, role: user.role }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    }
});

// Get current user info (verify token + fresh role from DB)
router.get('/me', requireAuth, async (req, res) => {
    const user = (req as any).user as JwtPayload;
    try {
        const result = await query<Pick<UserRole, 'role'>>(
            'SELECT role FROM user_roles WHERE user_id = $1',
            [user.user_id]
        );
        const freshRole = result.rows.length > 0 ? result.rows[0].role : user.role;
        res.json({ success: true, data: { ...user, role: freshRole } });
    } catch {
        res.json({ success: true, data: user });
    }
});

// List all users with roles (admin only)
router.get('/users', requireAuth, requireAdmin, async (_req, res) => {
    try {
        const result = await query<Pick<UserRole, 'id' | 'user_id' | 'email' | 'role' | 'created_at' | 'updated_at'>>(
            'SELECT id, user_id, email, role, created_at, updated_at FROM user_roles ORDER BY created_at ASC'
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Update user role (admin only)
router.patch('/users/:user_id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { role } = UpdateRoleSchema.parse(req.body);

        // Prevent demoting the main admin (first registered user)
        if (role === 'user') {
            const mainAdmin = await query<Pick<UserRole, 'user_id'>>(
                'SELECT user_id FROM user_roles ORDER BY created_at ASC LIMIT 1'
            );
            if (mainAdmin.rows[0]?.user_id === req.params.user_id) {
                res.status(400).json({
                    success: false,
                    error: 'Cannot change the main admin role. This is the account owner.',
                });
                return;
            }

            // Prevent demoting the last admin
            const adminCount = await query<{ count: string }>(
                "SELECT COUNT(*) as count FROM user_roles WHERE role = 'admin'"
            );
            const currentUser = await query<Pick<UserRole, 'role'>>(
                'SELECT role FROM user_roles WHERE user_id = $1',
                [req.params.user_id]
            );

            if (currentUser.rows[0]?.role === 'admin' && parseInt(adminCount.rows[0].count) <= 1) {
                res.status(400).json({
                    success: false,
                    error: 'Cannot remove the last admin. Promote another user to admin first.',
                });
                return;
            }
        }

        const result = await query<Pick<UserRole, 'user_id' | 'email' | 'role'>>(
            'UPDATE user_roles SET role = $1, updated_at = NOW() WHERE user_id = $2 RETURNING user_id, email, role',
            [role, req.params.user_id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'User not found' });
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

export default router;
