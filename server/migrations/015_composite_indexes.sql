-- Two missing composite indexes identified during performance audit.
--
-- feedback(project_id, status) — every list / stats / bulk query filters on both.
-- feedback(project_id, created_at DESC) — list queries order by date within project.
--
-- Note: user_roles(user_id) is already covered by the UNIQUE constraint on that
-- column in both init.sql and supabase-setup.sql — no separate index needed.

CREATE INDEX IF NOT EXISTS idx_feedback_project_status
    ON feedback (project_id, status);

CREATE INDEX IF NOT EXISTS idx_feedback_project_created
    ON feedback (project_id, created_at DESC);
