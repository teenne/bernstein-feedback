-- ============================================================
-- Migration 008 — Per-project agent webhook URL
-- ============================================================
-- Lets a project owner configure an outbound webhook URL that the
-- admin UI's "Ask the agent" button hits. The Node server POSTs a
-- payload describing a cluster to this URL; the external agent
-- (Claude Code / Codex / custom script) runs, generates a diff, and
-- calls the Agent API back via POST /clusters/:id/propose-fix.
--
-- Nullable: projects without a configured URL disable the button
-- gracefully. Idempotent + additive.
-- ============================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS agent_webhook_url TEXT;
