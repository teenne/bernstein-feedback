-- ============================================================
-- Migration 011 — Add Cohere as a BYOK embedding provider
-- ============================================================
-- Loosens the CHECK constraint on project_ai_keys.provider to
-- accept 'cohere' alongside 'openai'. The cluster worker already
-- branches on provider — this migration makes the schema match.
--
-- Additive and idempotent. Safe to re-run.
-- ============================================================

-- Drop the old single-value constraint and replace with one that
-- includes both supported providers.
ALTER TABLE project_ai_keys
  DROP CONSTRAINT IF EXISTS project_ai_keys_provider_check;

ALTER TABLE project_ai_keys
  ADD CONSTRAINT project_ai_keys_provider_check
  CHECK (provider IN ('openai', 'cohere'));

-- Update the column default comment (cosmetic only).
COMMENT ON COLUMN project_ai_keys.provider IS
  'Embedding provider: openai (text-embedding-3-small) or cohere (embed-english-v3.0)';
