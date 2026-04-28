-- ============================================================
-- Migration 004 — BYOK AI keys per project
-- ============================================================
-- Lets paid projects bring their own OpenAI key for the cluster
-- worker, so the platform doesn't fund everyone's embedding spend.
-- Keys are encrypted at rest with pgcrypto.pgp_sym_encrypt using a
-- server-side secret (AI_KEY_ENCRYPTION_SECRET env var). Raw key
-- material NEVER leaves the server — the admin UI only sees a
-- 4-char hint ("sk-...abcd").
--
-- This migration is idempotent and additive. Safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS project_ai_keys (
  project_id    TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai')),
  encrypted_key BYTEA NOT NULL,
  key_hint      TEXT NOT NULL,     -- "sk-...abcd" display-only
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS — keys are strictly service-role readable. The admin UI
-- reads *metadata* (provider + hint + updated_at) through a
-- dedicated SECURITY DEFINER function that does NOT return
-- encrypted_key.
-- ============================================================
ALTER TABLE project_ai_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role project_ai_keys access" ON project_ai_keys;
CREATE POLICY "Service role project_ai_keys access" ON project_ai_keys
  FOR ALL USING (auth.role() = 'service_role');

-- No SELECT/INSERT/UPDATE/DELETE policy for authenticated or anon.
-- Everything goes through the API + SECURITY DEFINER helpers.

GRANT SELECT ON project_ai_keys TO service_role;
GRANT INSERT, UPDATE, DELETE ON project_ai_keys TO service_role;
