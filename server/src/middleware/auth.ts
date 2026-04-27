import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { query } from '../db';
import { UserRole } from '../schemas/tables';

const JWT_SECRET = process.env.JWT_SECRET || 'bernstein-feedback-secret-change-in-production';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET; // HS256 fallback (legacy Supabase projects)

// JWKS-based verification for Supabase projects using asymmetric signing
// (ES256/RS256). Newer Supabase projects sign with a private key and
// expose the matching public keys at /auth/v1/.well-known/jwks.json;
// HS256 shared-secret verification can never work for these tokens.
//
// Derived from SUPABASE_URL env, or from DATABASE_SUP_URL by parsing
// the project ref. Falls back to disabled if neither resolves.
function buildJwksUrl(): URL | null {
    const explicit = process.env.SUPABASE_URL;
    if (explicit) {
        try { return new URL('/auth/v1/.well-known/jwks.json', explicit); } catch { /* bad URL */ }
    }
    // Parse from DATABASE_SUP_URL: postgresql://postgres.<ref>:<pw>@...
    const dbUrl = process.env.DATABASE_SUP_URL || '';
    const match = dbUrl.match(/postgres\.([a-z0-9]+)[:@]/);
    if (match) {
        return new URL(`https://${match[1]}.supabase.co/auth/v1/.well-known/jwks.json`);
    }
    return null;
}

const SUPABASE_JWKS_URL = buildJwksUrl();
const supabaseJwks = SUPABASE_JWKS_URL
    ? createRemoteJWKSet(SUPABASE_JWKS_URL, { cacheMaxAge: 10 * 60 * 1000 })
    : null;

export interface JwtPayload {
    user_id: string;
    email: string;
    role: 'admin' | 'user';
}

export function generateToken(payload: JwtPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verify a Bearer token. Tries the local JWT first. When that fails,
 * falls back to Supabase's JWT (if SUPABASE_JWT_SECRET is configured) —
 * lets admins signed in via Supabase call Node routes without a
 * separate login.
 *
 * Supabase JWTs carry `sub` (user uuid) and `email` claims. Role defaults
 * to `'user'`; `getFreshRole()` elevates to `'admin'` by reading
 * `user_roles.role` from the DB on each request that needs it.
 */
export function verifyToken(token: string): JwtPayload | null {
    // 1) Local JWT
    try {
        return jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
        /* fall through */
    }
    // 2) Supabase JWT
    if (SUPABASE_JWT_SECRET) {
        try {
            const decoded = jwt.verify(token, SUPABASE_JWT_SECRET) as {
                sub?: string;
                email?: string;
                user_metadata?: { email?: string };
            };
            if (decoded.sub) {
                return {
                    user_id: decoded.sub,
                    email: (decoded.email || decoded.user_metadata?.email || '').toLowerCase(),
                    role: 'user',
                };
            }
        } catch {
            /* not a valid Supabase JWT either */
        }
    }
    return null;
}

/**
 * Async JWKS verification for Supabase tokens signed with ES256/RS256.
 * The sync `verifyToken()` can't handle these because public-key lookup
 * requires a network fetch (cached by jose for 10 minutes).
 */
async function verifyTokenAsync(token: string): Promise<JwtPayload | null> {
    // 1) Try sync paths first (local JWT + HS256 Supabase)
    const sync = verifyToken(token);
    if (sync) return sync;

    // 2) JWKS fallback for asymmetric Supabase JWTs
    if (supabaseJwks) {
        try {
            const { payload } = await jwtVerify(token, supabaseJwks, {
                // Supabase issuer: https://<ref>.supabase.co/auth/v1
                // audience: 'authenticated' for signed-in users
                audience: 'authenticated',
            });
            if (typeof payload.sub === 'string') {
                return {
                    user_id: payload.sub,
                    email: String((payload as any).email || (payload as any).user_metadata?.email || '').toLowerCase(),
                    role: 'user',
                };
            }
        } catch (err) {
            // Temporary verbose logging to diagnose why Supabase JWT verification fails.
            // Remove once the flow is working in your deployment.
            const msg = err instanceof Error ? err.message : String(err);
            console.warn('[auth] JWKS verify failed:', msg);
        }
    }
    return null;
}

// Middleware: require valid JWT. Tries local JWT, HS256 Supabase, then
// JWKS-based ES256/RS256 Supabase in that order — first to succeed wins.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
    }

    const payload = await verifyTokenAsync(header.slice(7));
    if (!payload) {
        res.status(401).json({ success: false, error: 'Invalid or expired token' });
        return;
    }

    (req as any).user = payload;
    next();
}

// Short-TTL in-process caches for role + project-id lookups.
// Both values are stable across the lifetime of a typical request burst.
// 2-minute TTL means a role change or new project membership is visible
// within 2 minutes without a DB call on every authenticated route.
const roleCache = new Map<string, { role: string; cachedAt: number }>();
const projectIdsCache = new Map<string, { ids: string[]; cachedAt: number }>();
const AUTH_CACHE_TTL_MS = 2 * 60 * 1000;

// Helper: get fresh role from DB (JWT role may be stale after role change)
export async function getFreshRole(userId: string, fallback: string = 'user'): Promise<string> {
    const cached = roleCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < AUTH_CACHE_TTL_MS) return cached.role;
    try {
        const result = await query<Pick<UserRole, 'role'>>('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
        const role = result.rows.length > 0 ? result.rows[0].role : fallback;
        roleCache.set(userId, { role, cachedAt: Date.now() });
        return role;
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
    const cached = projectIdsCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < AUTH_CACHE_TTL_MS) return cached.ids;
    const result = await query(
        `SELECT id FROM projects WHERE owner_id = $1
         UNION
         SELECT project_id FROM project_members WHERE user_id = $1`,
        [userId]
    );
    const ids = result.rows.map((r) => r.id || r.project_id);
    projectIdsCache.set(userId, { ids, cachedAt: Date.now() });
    return ids;
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
