-- ============================================================
-- Migration 009 — Per-project GitHub repo URL
-- ============================================================
-- Stores the GitHub (or any git) repo URL for a project so the
-- ask-agent webhook payload can tell the receiving agent which
-- codebase to clone and search for the reported bug.
--
-- Nullable: projects without a repo URL still work; the Ask the
-- Agent button includes repo_url: null and the agent must fall
-- back to its own environment context.
-- Idempotent + additive.
-- ============================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_url TEXT;
