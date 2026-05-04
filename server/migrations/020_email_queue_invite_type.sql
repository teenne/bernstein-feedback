-- Add 'invite' to the email_queue event_type CHECK constraint.
-- PostgreSQL doesn't support ALTER CHECK in-place; drop and recreate.
ALTER TABLE email_queue DROP CONSTRAINT IF EXISTS email_queue_event_type_check;
ALTER TABLE email_queue ADD CONSTRAINT email_queue_event_type_check
  CHECK (event_type IN ('resolved', 'plan_warning', 'plan_limit', 'invite'));
