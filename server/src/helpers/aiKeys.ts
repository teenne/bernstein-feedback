import { query } from '../db';

const ENCRYPTION_SECRET = process.env.AI_KEY_ENCRYPTION_SECRET;

export type AiKeyProvider = 'openai';

export interface AiKeyMetadata {
    project_id: string;
    provider: AiKeyProvider;
    key_hint: string;
    updated_at: string;
}

/**
 * Throws if BYOK encryption isn't configured. Called by every mutating
 * endpoint so we fail fast rather than persist a half-encrypted row.
 */
function requireSecret(): string {
    if (!ENCRYPTION_SECRET || ENCRYPTION_SECRET.trim() === '') {
        throw new Error(
            'AI_KEY_ENCRYPTION_SECRET is not set. BYOK AI keys cannot be stored. ' +
            'Set a 32+ char random string in server/.env and restart.',
        );
    }
    return ENCRYPTION_SECRET;
}

/** Last-4 display hint for an OpenAI-style key. Never stores the full key. */
function buildKeyHint(rawKey: string): string {
    const trimmed = rawKey.trim();
    if (trimmed.length <= 4) return '***';
    return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
}

/**
 * Upsert a BYOK key for a project. Encrypts with pgp_sym_encrypt before
 * persisting so the raw value is never at rest.
 */
export async function saveProjectAiKey(
    projectId: string,
    provider: AiKeyProvider,
    rawKey: string,
): Promise<AiKeyMetadata> {
    const secret = requireSecret();
    const trimmed = rawKey.trim();
    if (trimmed.length < 16) {
        throw new Error('API key looks too short to be valid.');
    }
    const hint = buildKeyHint(trimmed);

    const result = await query<AiKeyMetadata>(
        `INSERT INTO project_ai_keys (project_id, provider, encrypted_key, key_hint, updated_at)
         VALUES ($1, $2, pgp_sym_encrypt($3, $4), $5, NOW())
         ON CONFLICT (project_id) DO UPDATE
           SET provider      = EXCLUDED.provider,
               encrypted_key = EXCLUDED.encrypted_key,
               key_hint      = EXCLUDED.key_hint,
               updated_at    = NOW()
         RETURNING project_id, provider, key_hint, updated_at`,
        [projectId, provider, trimmed, secret, hint],
    );
    return result.rows[0];
}

/** Read-only metadata for the admin UI. Does NOT decrypt the key. */
export async function getProjectAiKeyMetadata(
    projectId: string,
): Promise<AiKeyMetadata | null> {
    const result = await query<AiKeyMetadata>(
        `SELECT project_id, provider, key_hint, updated_at
           FROM project_ai_keys
          WHERE project_id = $1`,
        [projectId],
    );
    return result.rows[0] ?? null;
}

/**
 * Resolve the raw API key for a project. Only ever called by the cluster
 * worker inside the Node server process. Returns `null` if the project
 * has no BYOK key — callers should fall back to the global OPENAI_API_KEY.
 */
export async function getProjectAiKey(
    projectId: string,
): Promise<{ provider: AiKeyProvider; key: string } | null> {
    if (!ENCRYPTION_SECRET) return null;
    const result = await query<{ provider: AiKeyProvider; decrypted: string }>(
        `SELECT provider, pgp_sym_decrypt(encrypted_key, $2)::TEXT AS decrypted
           FROM project_ai_keys
          WHERE project_id = $1`,
        [projectId, ENCRYPTION_SECRET],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    if (!row.decrypted) return null;
    return { provider: row.provider, key: row.decrypted };
}

export async function deleteProjectAiKey(projectId: string): Promise<boolean> {
    const result = await query<{ project_id: string }>(
        `DELETE FROM project_ai_keys WHERE project_id = $1 RETURNING project_id`,
        [projectId],
    );
    return result.rows.length > 0;
}

export function isByokConfigured(): boolean {
    return !!ENCRYPTION_SECRET && ENCRYPTION_SECRET.trim() !== '';
}
