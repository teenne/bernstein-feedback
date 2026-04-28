import { query } from '../db';

const ENCRYPTION_SECRET = process.env.AI_KEY_ENCRYPTION_SECRET;

export interface GitTokenMetadata {
    project_id: string;
    token_hint: string;
    updated_at: string;
}

function requireSecret(): string {
    if (!ENCRYPTION_SECRET?.trim()) {
        throw new Error(
            'AI_KEY_ENCRYPTION_SECRET is not set. Git tokens cannot be stored. ' +
            'Set a 32+ char random string in server/.env and restart.',
        );
    }
    return ENCRYPTION_SECRET;
}

function buildTokenHint(raw: string): string {
    const t = raw.trim();
    if (t.length <= 4) return '***';
    return `${t.slice(0, 4)}...${t.slice(-4)}`;
}

export async function saveProjectGitToken(
    projectId: string,
    rawToken: string,
): Promise<GitTokenMetadata> {
    const secret = requireSecret();
    const trimmed = rawToken.trim();
    if (trimmed.length < 10) throw new Error('Token looks too short to be valid.');
    const hint = buildTokenHint(trimmed);

    const result = await query<GitTokenMetadata>(
        `INSERT INTO project_git_tokens (project_id, encrypted_token, token_hint, updated_at)
         VALUES ($1, pgp_sym_encrypt($2, $3), $4, NOW())
         ON CONFLICT (project_id) DO UPDATE
           SET encrypted_token = EXCLUDED.encrypted_token,
               token_hint      = EXCLUDED.token_hint,
               updated_at      = NOW()
         RETURNING project_id, token_hint, updated_at`,
        [projectId, trimmed, secret, hint],
    );
    return result.rows[0];
}

export async function getProjectGitTokenMetadata(
    projectId: string,
): Promise<GitTokenMetadata | null> {
    const result = await query<GitTokenMetadata>(
        `SELECT project_id, token_hint, updated_at
           FROM project_git_tokens
          WHERE project_id = $1`,
        [projectId],
    );
    return result.rows[0] ?? null;
}

/** Decrypt and return the raw token. Only called by agentWorker inside the server. */
export async function getProjectGitToken(projectId: string): Promise<string | null> {
    if (!ENCRYPTION_SECRET) return null;
    const result = await query<{ decrypted: string }>(
        `SELECT pgp_sym_decrypt(encrypted_token, $2)::TEXT AS decrypted
           FROM project_git_tokens
          WHERE project_id = $1`,
        [projectId, ENCRYPTION_SECRET],
    );
    return result.rows[0]?.decrypted ?? null;
}

export async function deleteProjectGitToken(projectId: string): Promise<boolean> {
    const result = await query<{ project_id: string }>(
        `DELETE FROM project_git_tokens WHERE project_id = $1 RETURNING project_id`,
        [projectId],
    );
    return result.rows.length > 0;
}
