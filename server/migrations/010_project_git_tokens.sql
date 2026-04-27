-- ============================================================
-- Migration 010 — Per-project GitHub access tokens
-- ============================================================
-- Lets paid projects store a GitHub (or GitLab) PAT so the agent
-- worker can clone private repos without a global env var.
-- Encrypted at rest via the same AI_KEY_ENCRYPTION_SECRET used by
-- BYOK OpenAI keys. Raw token never leaves the server.
--
-- Resolution order in agentWorker:
--   1. project_git_tokens row (this table)
--   2. AGENT_GIT_TOKEN env var (global fallback / public repos)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS project_git_tokens (
  project_id      TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  encrypted_token BYTEA NOT NULL,
  token_hint      TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE project_git_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role project_git_tokens access" ON project_git_tokens;
CREATE POLICY "Service role project_git_tokens access" ON project_git_tokens
  FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON project_git_tokens TO service_role;
