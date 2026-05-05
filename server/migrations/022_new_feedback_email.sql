-- Migration 022: new_feedback email for project subscribers
--
-- When new feedback is submitted, any team member (owner/admin/member)
-- who has turned on the subscription bell for that project receives an
-- email notification. Members who have NOT subscribed still get the
-- in-app bell notification as before — no existing behaviour changes.
--
-- Changes:
--   1. Extend email_queue.event_type CHECK to allow 'new_feedback'.
--   2. Create queue_email_on_new_feedback() trigger function.
--   3. Attach it as an AFTER INSERT trigger on feedback.
--
-- Idempotent: safe to re-run (ALTER ... IF NOT EXISTS / CREATE OR REPLACE).

-- 1. Extend the CHECK constraint
ALTER TABLE email_queue DROP CONSTRAINT IF EXISTS email_queue_event_type_check;
ALTER TABLE email_queue ADD CONSTRAINT email_queue_event_type_check
  CHECK (event_type IN ('resolved', 'plan_warning', 'plan_limit', 'invite', 'new_feedback'));

-- 2. Trigger function
CREATE OR REPLACE FUNCTION public.queue_email_on_new_feedback()
RETURNS TRIGGER AS $$
DECLARE
  project_name TEXT;
  type_label   TEXT;
BEGIN
  SELECT COALESCE(name, id) INTO project_name
    FROM public.projects WHERE id = NEW.project_id;

  type_label := CASE NEW.type
    WHEN 'bug_report'      THEN 'bug report'
    WHEN 'feature_request' THEN 'feature request'
    ELSE                        'feedback'
  END;

  INSERT INTO public.email_queue
    (to_email, subject, body_text, event_type, context, project_id, feedback_id, dedupe_key)
  SELECT
    recipient_email,
    'New ' || type_label || ' in ' || COALESCE(project_name, NEW.project_id) ||
      ': "' || COALESCE(NEW.title, '(no title)') || '"',
    'Hi,' || E'\n\n' ||
      'A new ' || type_label || ' was just submitted in ' ||
      COALESCE(project_name, NEW.project_id) || '.' || E'\n\n' ||
      '  "' || COALESCE(NEW.title, '(no title)') || '"' || E'\n\n' ||
      '— Bernstein Feedback',
    'new_feedback',
    jsonb_build_object(
      'project_id',          NEW.project_id,
      'project_name',        COALESCE(project_name, NEW.project_id),
      'feedback_id',         NEW.id,
      'feedback_title',      COALESCE(NEW.title, '(no title)'),
      'feedback_type',       NEW.type,
      'description_preview', LEFT(COALESCE(NEW.description, ''), 200),
      'submitted_at',        NEW.created_at
    ),
    NEW.project_id,
    NEW.id,
    'new_feedback:' || NEW.id::text || ':' || recipient_email
  FROM (
    -- Subscribed team members: look up email from user_roles.
    -- (Supabase deployments: also add auth.users lookup if user_roles
    --  doesn't cover all auth users on your instance.)
    SELECT DISTINCT ur.email AS recipient_email
      FROM public.project_subscriptions ps
      JOIN public.user_roles ur ON ur.user_id = ps.user_id
     WHERE ps.project_id = NEW.project_id
       AND ur.email IS NOT NULL
       AND ur.email <> ''
       AND ps.user_id <> COALESCE(NEW.user_id, '')
  ) r
  WHERE r.recipient_email IS NOT NULL
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach trigger
DROP TRIGGER IF EXISTS on_new_feedback_email ON public.feedback;
CREATE TRIGGER on_new_feedback_email
  AFTER INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.queue_email_on_new_feedback();

SELECT 'Migration 022_new_feedback_email completed' AS status;
