-- Migration 018: Project Subscriptions
--
-- Per-user project notification subscriptions. Rows here mean "this user wants
-- to receive notifications for this project" even if they are not a formal
-- project member. Project members and admins are already fanned-out by the
-- notification triggers; this table lets any user opt-in to additional
-- projects (or lets admins scope their bell to specific projects they care
-- about).
--
-- Idempotent: safe to re-run on existing databases.

CREATE TABLE IF NOT EXISTS project_subscriptions (
  user_id    TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_subscriptions_user
  ON project_subscriptions(user_id);

SELECT 'Migration 018_project_subscriptions completed' AS status;
