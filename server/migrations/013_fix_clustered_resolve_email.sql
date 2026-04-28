-- ============================================================
-- Migration 013 — Fix resolve email skipped for clustered feedback
-- ============================================================
-- Root cause: PostgreSQL fires AFTER ROW triggers in alphabetical
-- name order. 'on_feedback_resolved' (notification) fires BEFORE
-- 'on_feedback_resolved_email' (email). For the first row the
-- notification trigger sets clusters.resolved_at = NOW(), then the
-- email trigger sees resolved_at IS NOT NULL and hits the cluster
-- guard — silently skipping the email for every clustered ticket.
--
-- Free plan projects (cluster_id IS NULL) were unaffected because the
-- guard condition `NEW.cluster_id IS NOT NULL` was always false.
-- Paid/pro plan projects (ai_clustering enabled, cluster_id set) never
-- received resolve emails.
--
-- Fix: remove the cluster guard from queue_email_on_feedback_resolved.
-- Replace it with a cluster-scoped dedupe_key so ON CONFLICT DO NOTHING
-- handles bulk-close dedup without relying on clusters.resolved_at.
--   old key: 'resolved:<feedback_id>:<email>'
--   new key: 'resolved:<cluster_id_or_feedback_id>:<email>'
--
-- The notification trigger (handle_feedback_resolved) keeps its guard
-- unchanged — it still needs it to prevent duplicate notification rows
-- (notifications has no UNIQUE constraint).
--
-- Safe to re-run (CREATE OR REPLACE + idempotent trigger recreate).
-- ============================================================

CREATE OR REPLACE FUNCTION public.queue_email_on_feedback_resolved()
RETURNS TRIGGER AS $$
DECLARE
  project_name TEXT;
  body TEXT;
  dedup_scope TEXT;
BEGIN
  IF NEW.status IN ('resolved', 'closed')
     AND COALESCE(OLD.status, '') NOT IN ('resolved', 'closed')
  THEN
    -- Use cluster_id as the dedup scope so every row in a bulk-close
    -- shares the same key and only the first INSERT succeeds.
    -- For unclustered rows, fall back to feedback.id as before.
    -- This replaces the old cluster guard that relied on clusters.resolved_at
    -- being NULL, which was set by the alphabetically-earlier notification
    -- trigger before this email trigger ran.
    dedup_scope := COALESCE(NEW.cluster_id::text, NEW.id::text);

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
      'resolved:' || dedup_scope || ':' || recipient_email
    FROM (
      -- Three-level submitter lookup:
      --   1. feedback.email  (explicitly provided via consent toggle)
      --   2. user_roles.email (project-member lookup)
      --   3. auth.users.email (Supabase auth — catches signed-in users
      --      never synced to user_roles)
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

      -- Fallback: truly anonymous submission → notify project owner.
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
