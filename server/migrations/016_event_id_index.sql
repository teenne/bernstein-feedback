-- Add partial index on feedback(event_id) for the PostHog dedup query.
-- integrations.ts runs `WHERE event_id = md5($2)::uuid` on every webhook
-- call. Without this index it scans the entire project's feedback rows.
CREATE INDEX IF NOT EXISTS idx_feedback_event_id
    ON feedback (event_id)
    WHERE event_id IS NOT NULL;
