-- ============================================================
-- Migration 007 — In-progress status-change notifications
-- ============================================================
-- Before this migration, submitters only heard back when their ticket
-- was resolved. Long-running tickets (>1 day) silently sat at 'open'
-- from the user's perspective, hurting the return rate loop-health
-- metric. This trigger sends a lightweight "we're on it" notification
-- when an admin moves a ticket to 'in_progress'.
--
-- Design:
--   • Notifies only the single original submitter (not the cluster).
--     Cluster fan-out is reserved for resolve — in-progress on one row
--     doesn't mean every reporter's issue is being worked on.
--   • No email — this is an in-app bell notification only. Email on
--     every status transition would feel spammy.
--   • Uses the existing `type='status_change'` enum value (already in
--     the CHECK constraint, just wasn't written by anything).
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_feedback_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'in_progress'
     AND COALESCE(OLD.status, '') = 'open'
     AND NEW.user_id IS NOT NULL
     AND NEW.user_id <> ''
  THEN
    INSERT INTO public.notifications (project_id, feedback_id, user_id, type, title, message)
    VALUES (
      NEW.project_id,
      NEW.id,
      NEW.user_id,
      'status_change',
      'We''re looking into "' || COALESCE(NEW.title, '(no title)') || '"',
      'Your feedback is now in progress. You''ll hear back when it''s resolved.'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_feedback_status_change ON public.feedback;
CREATE TRIGGER on_feedback_status_change
  AFTER UPDATE OF status ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.handle_feedback_status_change();
