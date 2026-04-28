-- Replace the single-column email_queue index with a composite that also
-- covers the `attempts < MAX_ATTEMPTS` filter, so the worker can evaluate
-- the WHERE clause entirely within the index without a heap fetch for that
-- predicate.
DROP INDEX IF EXISTS idx_email_queue_pending;
CREATE INDEX IF NOT EXISTS idx_email_queue_pending
    ON email_queue (created_at ASC, attempts ASC)
    WHERE sent_at IS NULL AND failed_at IS NULL;
