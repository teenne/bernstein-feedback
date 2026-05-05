import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import pool, { query } from '../db';
import { generateToken, requireAuth, requireAdmin, JwtPayload } from '../middleware/auth';
import { RegisterSchema, LoginSchema, UpdateRoleSchema } from '../schemas/auth';
import { UserRole } from '../schemas/tables';
import { isEmailEnabled } from '../lib/email';
import { renderInviteEmail } from '../lib/emailTemplates/invite';

const router = Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { success: false, error: 'Too many login attempts. Try again in 15 minutes.' },
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many registration attempts. Try again in an hour.' },
});

const inviteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many invite attempts. Try again in an hour.' },
});

// Public endpoint — rate-limit to prevent token enumeration (256-bit tokens make
// brute-force computationally infeasible, but rate-limiting adds defence-in-depth).
const inviteValidateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Try again shortly.' },
});

// Register a new user
router.post('/register', registerLimiter, async (req, res) => {
    try {
        const { email, password } = RegisterSchema.parse(req.body);
        const inviteToken: string | undefined = typeof req.body.invite_token === 'string' ? req.body.invite_token : undefined;
        const normalEmail = email.toLowerCase();

        // If an invite token was supplied, validate it matches the email
        if (inviteToken) {
            const inv = await query<{ email: string }>(
                `SELECT email FROM invite_tokens WHERE token = $1 AND accepted_at IS NULL AND expires_at > NOW()`,
                [inviteToken]
            );
            if (inv.rows.length === 0) {
                res.status(400).json({ success: false, error: 'Invalid or expired invitation link.' });
                return;
            }
            if (inv.rows[0].email !== normalEmail) {
                res.status(400).json({ success: false, error: 'This invitation was sent to a different email address.' });
                return;
            }
        }

        const existing = await query<Pick<UserRole, 'user_id'>>('SELECT user_id FROM user_roles WHERE email = $1', [normalEmail]);
        if (existing.rows.length > 0) {
            res.status(409).json({ success: false, error: 'Email already registered' });
            return;
        }

        // First user becomes admin
        const countResult = await query<{ count: string }>('SELECT COUNT(*) as count FROM user_roles');
        const assignedRole = parseInt(countResult.rows[0].count) === 0 ? 'admin' : 'user';

        const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const passwordHash = await bcrypt.hash(password, 10);

        // Run insert + token consume atomically so a crash between them
        // cannot leave a consumed token pointing at a half-created user,
        // or a created user with a reusable invite token.
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO user_roles (user_id, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
                [userId, normalEmail, passwordHash, assignedRole]
            );
            if (inviteToken) {
                await client.query(
                    `UPDATE invite_tokens SET accepted_at = NOW() WHERE token = $1`,
                    [inviteToken]
                );
            }
            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }

        const token = generateToken({ user_id: userId, email: normalEmail, role: assignedRole as 'admin' | 'user' });

        res.status(201).json({
            success: true,
            data: { token, user_id: userId, email: normalEmail, role: assignedRole }
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

// Validate an invite token (public — called by the login page before showing the signup form)
router.get('/invite/:token', inviteValidateLimiter, async (req, res) => {
    try {
        const result = await query<{ email: string; expires_at: string }>(
            `SELECT email, expires_at FROM invite_tokens
              WHERE token = $1 AND accepted_at IS NULL AND expires_at > NOW()`,
            [req.params.token]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Invalid or expired invitation' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Send an invite email (admin only)
router.post('/invite', inviteLimiter, requireAuth, requireAdmin, async (req, res) => {
    try {
        const { email } = z.object({ email: z.string().email() }).parse(req.body);
        const normalEmail = email.toLowerCase();
        const inviter = (req as any).user as JwtPayload;

        // Reject if email is already registered
        const existing = await query<Pick<UserRole, 'user_id'>>(
            'SELECT user_id FROM user_roles WHERE email = $1', [normalEmail]
        );
        if (existing.rows.length > 0) {
            res.status(409).json({ success: false, error: 'This email is already registered.' });
            return;
        }

        // Remove any existing pending invites for this email (resend = fresh token)
        await query(`DELETE FROM invite_tokens WHERE email = $1 AND accepted_at IS NULL`, [normalEmail]);

        // Create a new invite token
        const result = await query<{ token: string; expires_at: string }>(
            `INSERT INTO invite_tokens (email, invited_by_user_id) VALUES ($1, $2)
             RETURNING token, expires_at`,
            [normalEmail, inviter.user_id]
        );
        const { token, expires_at } = result.rows[0];

        // Build the invite URL — use APP_URL or ALLOWED_ORIGINS only; never
        // req.get('host') which is attacker-controlled via the Host header.
        const allowedOrigin = process.env.ALLOWED_ORIGINS?.split(',')[0]?.trim();
        const appUrl = process.env.APP_URL || allowedOrigin;
        if (!appUrl) {
            res.status(500).json({ success: false, error: 'APP_URL is not configured on the server.' });
            return;
        }
        const inviteUrl = `${appUrl}?invite=${token}`;
        const expiresAt = new Date(expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

        // Queue the invite email (non-fatal if email is not configured).
        // Context stores only display metadata — NOT the raw token — so a DB
        // leak does not expose live invite links.
        if (isEmailEnabled()) {
            try {
                const rendered = renderInviteEmail({ invitedByEmail: inviter.email, inviteUrl, expiresAt });
                await query(
                    `INSERT INTO email_queue (to_email, subject, body_text, body_html, event_type, context)
                     VALUES ($1, $2, $3, $4, 'invite', $5)`,
                    [normalEmail, rendered.subject, rendered.text, rendered.html,
                     JSON.stringify({ invitedByEmail: inviter.email, expiresAt })]
                );
            } catch (emailErr) {
                console.warn('[invite] Failed to queue invite email:', emailErr instanceof Error ? emailErr.message : emailErr);
            }
        }

        res.json({ success: true, data: { email: normalEmail, invite_url: inviteUrl, expires_at } });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(500).json({ success: false, error: msg });
        }
    }
});

// List all invites (admin only)
router.get('/invites', requireAuth, requireAdmin, async (_req, res) => {
    try {
        const result = await query<{
            id: string; email: string; invited_by_user_id: string | null;
            role: string; accepted_at: string | null; expires_at: string; created_at: string;
        }>(
            `SELECT id, email, invited_by_user_id, role, accepted_at, expires_at, created_at
               FROM invite_tokens ORDER BY created_at DESC`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Cancel a pending invite (admin only)
router.delete('/invites/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await query(`DELETE FROM invite_tokens WHERE id = $1 AND accepted_at IS NULL`, [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

// Login with email + password
router.post('/login', loginLimiter, async (req, res) => {
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
