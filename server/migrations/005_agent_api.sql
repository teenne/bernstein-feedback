-- ============================================================
-- Migration 005 — AI Agent API
-- ============================================================
-- Ships the /api/v1/agent/* surface that external coding assistants
-- (Codex, Claude Code, etc.) use to read the prioritised cluster
-- backlog and close whole clusters in one call. Idempotent, additive.
--
-- Two changes:
--   1. feedback.agent_notes JSONB — investigation notes authored by
--      an agent. Separate from resolution_note so notes can be added
--      while a ticket is still open.
--   2. Trigger guards on handle_feedback_resolved() +
--      queue_email_on_feedback_resolved() — skip fan-out when the
--      cluster is already resolved. Without this, closing a cluster
--      with N members fires the resolve trigger N times, producing N
--      duplicate notifications per recipient.
-- ============================================================

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS agent_notes JSONB NOT NULL DEFAULT '[]';

-- Replace the resolve-notification trigger with a guarded version.
-- Behavior is identical for single-row resolves; cluster-wide resolves
-- only fan out on the first row in the txn.
CREATE OR REPLACE FUNCTION public.handle_feedback_resolved()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('resolved', 'closed')
     AND COALESCE(OLD.status, '') NOT IN ('resolved', 'closed')
  THEN
    IF NEW.cluster_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.clusters
          WHERE id = NEW.cluster_id AND resolved_at IS NOT NULL
       )
    THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (project_id, feedback_id, user_id, type, title, message)
    SELECT
      NEW.project_id, NEW.id, f.user_id, 'resolved',
      'Your feedback "' || COALESCE(NEW.title, '(no title)') || '" has been resolved',
      NEW.resolution_note
    FROM public.feedback f
    WHERE (
        (NEW.cluster_id IS NOT NULL AND f.cluster_id = NEW.cluster_id)
        OR (NEW.cluster_id IS NULL AND f.id = NEW.id)
      )
      AND f.user_id IS NOT NULL
      AND f.user_id <> ''
    GROUP BY f.user_id;

    IF NEW.cluster_id IS NOT NULL THEN
      UPDATE public.clusters
         SET resolved_at = NOW()
       WHERE id = NEW.cluster_id AND resolved_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Same guard on the email queue trigger.
CREATE OR REPLACE FUNCTION public.queue_email_on_feedback_resolved()
RETURNS TRIGGER AS $$
DECLARE
  project_name TEXT;
  body TEXT;
BEGIN
  IF NEW.status IN ('resolved', 'closed')
     AND COALESCE(OLD.status, '') NOT IN ('resolved', 'closed')
  THEN
    IF NEW.cluster_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.clusters
          WHERE id = NEW.cluster_id AND resolved_at IS NOT NULL
       )
    THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(name, id) INTO project_name
      FROM public.projects WHERE id = NEW.project_id;

    body := 'Hi,' || E'\n\n' ||
            'Your recent feedback has been marked as resolved:' || E'\n\n' ||
            '  "' || COALESCE(NEW.title, '(no title)') || '"' || E'\n\n';
    IF NEW.resolution_note IS NOT NULL AND NEW.resolution_note <> '' THEN
      body := body || 'The developer left a note:' || E'\n  ' || NEW.resolution_note || E'\n\n';
    END IF;
    body := body || 'Thanks for helping improve ' || COALESCE(project_name, NEW.project_id) || '.' || E'\n\n' ||
            '— Bernstein Feedback';

    INSERT INTO public.email_queue
      (to_email, subject, body_text, event_type, context, project_id, feedback_id, dedupe_key)
    SELECT
      recipient_email,
      'Your feedback in ' || COALESCE(project_name, NEW.project_id) || ' has been resolved',
      body,
      'resolved',
      jsonb_build_object(
        'project_id',       NEW.project_id,
        'project_name',     COALESCE(project_name, NEW.project_id),
        'feedback_id',      NEW.id,
        'feedback_title',   COALESCE(NEW.title, '(no title)'),
        'feedback_type',    NEW.type,
        'resolution_note',  NEW.resolution_note,
        'resolved_at',      NEW.resolved_at
      ),
      NEW.project_id,
      NEW.id,
      'resolved:' || NEW.id::text || ':' || recipient_email
    FROM (
      SELECT DISTINCT COALESCE(
        NULLIF(f.email, ''),
        (SELECT ur.email FROM public.user_roles ur WHERE ur.user_id::text = f.user_id LIMIT 1)
      ) AS recipient_email
      FROM public.feedback f
      WHERE (
          (NEW.cluster_id IS NOT NULL AND f.cluster_id = NEW.cluster_id)
          OR (NEW.cluster_id IS NULL AND f.id = NEW.id)
      )
    ) r
    WHERE r.recipient_email IS NOT NULL AND r.recipient_email <> ''
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
