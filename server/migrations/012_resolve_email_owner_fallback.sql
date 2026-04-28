-- ============================================================
-- Migration 012 — Owner-fallback on resolve email
-- ============================================================
-- Problem: queue_email_on_feedback_resolved found no recipient
-- when feedback was submitted anonymously (no email, no user_id).
-- The trigger silently skipped the insert so SMTP was never called.
--
-- Fix: when no submitter email exists in the cluster, fall back to
-- the project owner_email. The same dedupe_key pattern prevents
-- double-sends on re-resolve.
--
-- Safe to re-run (CREATE OR REPLACE + idempotent trigger recreate).
-- ============================================================

CREATE OR REPLACE FUNCTION public.queue_email_on_feedback_resolved()
RETURNS TRIGGER AS $$
DECLARE
  project_name TEXT;
  body TEXT;
BEGIN
  IF NEW.status IN ('resolved', 'closed')
     AND COALESCE(OLD.status, '') NOT IN ('resolved', 'closed')
  THEN
    -- Agent API guard: bulk cluster-close should only queue one email
    -- per unique recipient, not one per cluster member.
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
        'project_id',      NEW.project_id,
        'project_name',    COALESCE(project_name, NEW.project_id),
        'feedback_id',     NEW.id,
        'feedback_title',  COALESCE(NEW.title, '(no title)'),
        'feedback_type',   NEW.type,
        'resolution_note', NEW.resolution_note,
        'resolved_at',     NEW.resolved_at
      ),
      NEW.project_id,
      NEW.id,
      'resolved:' || NEW.id::text || ':' || recipient_email
    FROM (
      -- Three-level submitter lookup:
      --   1. feedback.email  (explicitly provided via consent toggle)
      --   2. user_roles.email (project-member lookup)
      --   3. auth.users.email (Supabase auth — catches all signed-in users
      --      who were never synced to user_roles, e.g. created after setup)
      SELECT DISTINCT COALESCE(
        NULLIF(f.email, ''),
        (SELECT ur.email FROM public.user_roles ur WHERE ur.user_id::text = f.user_id LIMIT 1),
        (SELECT au.email FROM auth.users au WHERE au.id::text = f.user_id LIMIT 1)
      ) AS recipient_email
      FROM public.feedback f
      WHERE (
          (NEW.cluster_id IS NOT NULL AND f.cluster_id = NEW.cluster_id)
          OR (NEW.cluster_id IS NULL AND f.id = NEW.id)
      )

      UNION

      -- Fallback: when the submitter is truly anonymous (no email anywhere),
      -- notify the project owner so resolves never go completely unnoticed.
      SELECT owner_email AS recipient_email
      FROM public.projects
      WHERE id = NEW.project_id
        AND owner_email IS NOT NULL
        AND owner_email <> ''
        AND NOT EXISTS (
          SELECT 1 FROM public.feedback f2
          WHERE (
              (NEW.cluster_id IS NOT NULL AND f2.cluster_id = NEW.cluster_id)
              OR (NEW.cluster_id IS NULL AND f2.id = NEW.id)
          )
          AND (
            NULLIF(f2.email, '') IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.user_roles ur2 WHERE ur2.user_id::text = f2.user_id AND ur2.email IS NOT NULL)
            OR EXISTS (SELECT 1 FROM auth.users au2 WHERE au2.id::text = f2.user_id AND au2.email IS NOT NULL)
          )
        )
    ) r
    WHERE r.recipient_email IS NOT NULL AND r.recipient_email <> ''
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_feedback_resolved_email ON public.feedback;
CREATE TRIGGER on_feedback_resolved_email
  AFTER UPDATE OF status ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.queue_email_on_feedback_resolved();
