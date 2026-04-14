-- ============================================================================
-- @bernstein/feedback — LOCAL PostgreSQL schema (DESTRUCTIVE)
--
-- ⚠️  DO NOT RUN THIS AGAINST SUPABASE (or any database with real data).
-- ⚠️  The DROP TABLE statements below wipe every row in every table.
-- ⚠️  For Supabase, use examples/supabase-setup.sql instead — it's fully
-- ⚠️  additive (CREATE IF NOT EXISTS, ALTER ADD COLUMN IF NOT EXISTS).
--
-- This file is the one-shot initializer for the self-hosted Node server's
-- local feedback_db. Run it against a fresh Postgres (or an empty db you
-- don't mind wiping):
--     psql -h 127.0.0.1 -U postgres -d feedback_db -f server/init.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CASCADE so drops in any order resolve FK dependencies automatically.
-- (notifications.feedback_id → feedback, feedback_context.feedback_id → feedback,
-- project_usage.project_id → projects, project_members.project_id → projects,
-- projects.plan_id → plans, email_queue has no FK but is included for a clean slate.)
DROP TABLE IF EXISTS email_queue       CASCADE;
DROP TABLE IF EXISTS feedback_context  CASCADE;
DROP TABLE IF EXISTS feedback          CASCADE;
DROP TABLE IF EXISTS notifications     CASCADE;
DROP TABLE IF EXISTS project_usage     CASCADE;
DROP TABLE IF EXISTS project_members   CASCADE;
DROP TABLE IF EXISTS projects          CASCADE;
DROP TABLE IF EXISTS plans             CASCADE;
DROP TABLE IF EXISTS user_roles        CASCADE;

-- User Roles (dynamic admin system)
-- First user to register becomes admin, everyone else gets 'user'
CREATE TABLE user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_roles_email ON user_roles(email);

-- Plans (single source of truth for plan definitions)
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly INTEGER DEFAULT 0,
  max_projects INTEGER DEFAULT 1,
  max_tickets_per_month INTEGER DEFAULT 50,
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed plans: Free + Paid (per product doc)
INSERT INTO plans (id, name, description, price_monthly, max_projects, max_tickets_per_month, features, display_order)
VALUES
  ('free', 'Free', 'For individuals and small projects. No expiry, no credit card required.', 0, 1, 50,
   '{"ai_clustering": false, "posthog": false, "api_access": false, "self_hosted": false}', 1),
  ('paid', 'Paid', 'For teams shipping real products. Multiple projects, higher volume, advanced features.', 0, -1, -1,
   '{"ai_clustering": true, "posthog": true, "api_access": true, "self_hosted": false}', 2);

-- Projects table (registered apps that can send feedback)
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT,
  owner_id TEXT,
  owner_email TEXT,
  plan TEXT DEFAULT 'free',
  plan_id TEXT REFERENCES plans(id) DEFAULT 'free',
  plan_limits JSONB DEFAULT '{"max_projects": 1, "max_tickets_per_month": 50}',
  config JSONB DEFAULT '{}',
  api_key TEXT DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_email ON projects(owner_email);

-- Project Members (assign users to projects)
CREATE TABLE project_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'viewer')) DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);

-- Auto-register the project owner as a project_member with role 'owner'
-- on every new project, so the new-feedback trigger doesn't need a
-- separate branch for projects.owner_id.
CREATE OR REPLACE FUNCTION public.handle_new_project_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL AND NEW.owner_email IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, user_id, email, role)
    VALUES (NEW.id, NEW.owner_id, NEW.owner_email, 'owner')
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_project_owner_membership ON public.projects;
CREATE TRIGGER on_project_owner_membership
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_project_owner_membership();

-- Prevent removal of the project owner from project_members.
-- Owners can only be replaced via an explicit ownership transfer (not
-- yet implemented in the UI); straight DELETE of the owner row is
-- refused with a clear error. Non-owner members delete normally.
CREATE OR REPLACE FUNCTION public.prevent_owner_removal()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove the project owner. Transfer ownership first.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_project_member_delete_guard ON public.project_members;
CREATE TRIGGER on_project_member_delete_guard
  BEFORE DELETE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_owner_removal();

CREATE TABLE feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,

  -- Event Metadata
  type TEXT NOT NULL CHECK (type IN ('feedback', 'bug_report', 'feature_request')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_id UUID,

  -- User Input
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  severity TEXT,
  impact TEXT CHECK (impact IN ('blocks_me', 'annoying', 'minor') OR impact IS NULL),
  email TEXT,

  -- Page Context
  url TEXT,
  route TEXT,
  screen_id TEXT,
  page_name TEXT,

  -- Full Context (JSONB blob)
  context JSONB,

  -- Flexible Metadata
  metadata JSONB,

  -- Assets
  screenshots JSONB DEFAULT '[]',
  highlighted_element JSONB,

  -- Identity Fields
  user_id TEXT,
  tenant_id TEXT,
  role TEXT,

  -- Integration
  bernstein_run_id UUID,

  -- Status tracking (loop-close notifications)
  status TEXT CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')) DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_note TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Technical context (heavy data, separated for performance)
CREATE TABLE feedback_context (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feedback_id UUID REFERENCES feedback(id) ON DELETE CASCADE,
  viewport JSONB,
  user_agent TEXT,
  language TEXT,
  env TEXT,
  app_version TEXT,
  build_sha TEXT,
  console_errors JSONB,
  network_errors JSONB,
  breadcrumbs JSONB,
  timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monthly usage tracking per project (plan system)
CREATE TABLE project_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  month TEXT NOT NULL,              -- 'YYYY-MM' format (UTC)
  ticket_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, month)
);

-- Notifications for end-user loop-close delivery
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('status_change', 'resolved', 'new_feedback')),
  title TEXT NOT NULL,
  message TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safely update constraint if adapting an existing instance
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('status_change', 'resolved', 'new_feedback'));

-- Email queue — drained by the Express email worker, fed by triggers below.
-- See examples/supabase-setup.sql for the rationale.
CREATE TABLE email_queue (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body_text   TEXT NOT NULL,
  body_html   TEXT,
  event_type  TEXT NOT NULL CHECK (event_type IN ('resolved', 'plan_warning', 'plan_limit')),
  context     JSONB,
  project_id  TEXT,
  feedback_id UUID,
  dedupe_key  TEXT UNIQUE,
  attempts    INT NOT NULL DEFAULT 0,
  last_error  TEXT,
  sent_at     TIMESTAMPTZ,
  failed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_email_queue_pending
  ON email_queue(created_at)
  WHERE sent_at IS NULL AND failed_at IS NULL;

-- Indexes
CREATE INDEX idx_feedback_project ON feedback(project_id);
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX idx_feedback_user ON feedback(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_feedback_screen ON feedback(screen_id) WHERE screen_id IS NOT NULL;
CREATE INDEX idx_feedback_context_fid ON feedback_context(feedback_id);
CREATE INDEX idx_notifications_user ON notifications(project_id, user_id, read);
CREATE INDEX idx_notifications_feedback ON notifications(feedback_id);
CREATE INDEX idx_project_usage_project_month ON project_usage(project_id, month);

-- ============================================================
-- New Feedback Notification Trigger
-- Recipients:
--   • Every project_members row for NEW.project_id with role
--     'owner' or 'member' (viewers are excluded). Project owners
--     are automatically members thanks to the
--     handle_new_project_owner_membership trigger above.
--   • Every user_roles row with role = 'admin' (global admins
--     receive notifications for ALL projects).
-- The submitter (NEW.user_id) is excluded so users don't get
-- notifications about their own submissions.
-- UNION dedupes anyone in multiple sets. Title is tailored to the
-- feedback type so bug / feature / general feedback are visually
-- distinct in the notification dropdown.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_feedback_notification()
RETURNS TRIGGER AS $$
DECLARE
  type_prefix TEXT;
BEGIN
  type_prefix := CASE NEW.type
    WHEN 'bug_report'      THEN 'New bug reported: '
    WHEN 'feature_request' THEN 'New feature request: '
    ELSE                        'New feedback: '
  END;

  INSERT INTO public.notifications (project_id, feedback_id, user_id, type, title, message)
  SELECT
    NEW.project_id,
    NEW.id,
    recipient_id,
    'new_feedback',
    type_prefix || COALESCE(NEW.title, '(no title)'),
    substr(COALESCE(NEW.description, ''), 1, 140)
  FROM (
    -- Project members (owners auto-included via on_project_owner_membership)
    SELECT pm.user_id::text AS recipient_id
      FROM public.project_members pm
     WHERE pm.project_id = NEW.project_id
       AND pm.role IN ('owner', 'member')
    UNION
    -- Global admins (notified for every project)
    SELECT ur.user_id::text AS recipient_id
      FROM public.user_roles ur
     WHERE ur.role = 'admin'
  ) recipients
  WHERE recipient_id IS NOT NULL
    -- Exclude the submitter so they don't get a self-notification.
    AND recipient_id <> COALESCE(NEW.user_id, '');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_feedback ON public.feedback;
CREATE TRIGGER on_new_feedback
  AFTER INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_feedback_notification();

-- ============================================================
-- Resolve Notification Trigger
-- Notifies the original submitter when their feedback is marked
-- resolved or closed. Mirrors the local Express server's
-- /api/feedback/:id PATCH handler so both backends behave the same.
-- The notification is addressed to feedback.user_id (the submitter),
-- which means whatever id was passed via FeedbackProvider.userId at
-- submission time is echoed back here — bas_frontend's local "3"
-- and admin app UUIDs both work without any translation.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_feedback_resolved()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('resolved', 'closed')
     AND COALESCE(OLD.status, '') NOT IN ('resolved', 'closed')
     AND NEW.user_id IS NOT NULL
     AND NEW.user_id <> ''
  THEN
    INSERT INTO public.notifications (project_id, feedback_id, user_id, type, title, message)
    VALUES (
      NEW.project_id,
      NEW.id,
      NEW.user_id,
      'resolved',
      'Your feedback "' || COALESCE(NEW.title, '(no title)') || '" has been resolved',
      NEW.resolution_note
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_feedback_resolved ON public.feedback;
CREATE TRIGGER on_feedback_resolved
  AFTER UPDATE OF status ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.handle_feedback_resolved();

-- ============================================================
-- Email trigger 1: feedback resolve → email to submitter
-- ============================================================
CREATE OR REPLACE FUNCTION public.queue_email_on_feedback_resolved()
RETURNS TRIGGER AS $$
DECLARE
  recipient_email TEXT;
  body TEXT;
  project_name TEXT;
BEGIN
  IF NEW.status IN ('resolved', 'closed')
     AND COALESCE(OLD.status, '') NOT IN ('resolved', 'closed')
  THEN
    recipient_email := NEW.email;
    IF recipient_email IS NULL OR recipient_email = '' THEN
      SELECT email INTO recipient_email
        FROM public.user_roles
       WHERE user_id = NEW.user_id
       LIMIT 1;
    END IF;

    IF recipient_email IS NOT NULL AND recipient_email <> '' THEN
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
      VALUES (
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
        'resolved:' || NEW.id::text
      )
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_feedback_resolved_email ON public.feedback;
CREATE TRIGGER on_feedback_resolved_email
  AFTER UPDATE OF status ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.queue_email_on_feedback_resolved();

-- ============================================================
-- Email trigger 2: project_usage crosses 80% / 100% → email to owner
-- ============================================================
CREATE OR REPLACE FUNCTION public.queue_email_on_plan_usage()
RETURNS TRIGGER AS $$
DECLARE
  owner_email   TEXT;
  proj_name     TEXT;
  max_tickets   INT;
  threshold_hit TEXT;
  body          TEXT;
BEGIN
  SELECT p.owner_email,
         COALESCE(p.name, p.id),
         COALESCE(pl.max_tickets_per_month,
                  (p.plan_limits ->> 'max_tickets_per_month')::INT,
                  50)
    INTO owner_email, proj_name, max_tickets
    FROM public.projects p
    LEFT JOIN public.plans pl ON pl.id = p.plan_id
   WHERE p.id = NEW.project_id;

  IF owner_email IS NULL OR owner_email = '' THEN RETURN NEW; END IF;
  IF max_tickets <= 0 THEN RETURN NEW; END IF;

  IF NEW.ticket_count >= max_tickets THEN
    threshold_hit := 'limit';
  ELSIF NEW.ticket_count >= (max_tickets * 0.8)::INT THEN
    threshold_hit := 'warning';
  ELSE
    RETURN NEW;
  END IF;

  IF threshold_hit = 'limit' THEN
    body := 'Hi,' || E'\n\n' ||
            'Your project "' || proj_name || '" has received ' || NEW.ticket_count ||
            ' tickets this month, which is the limit on your current plan.' || E'\n\n' ||
            'What happens now:' || E'\n' ||
            '  • Existing tickets and notifications continue as normal' || E'\n' ||
            '  • New feedback submissions are held in read-only mode' || E'\n' ||
            '  • Service resumes next month or when you upgrade' || E'\n\n' ||
            '— Bernstein Feedback';
  ELSE
    body := 'Hi,' || E'\n\n' ||
            'Your project "' || proj_name || '" has received ' || NEW.ticket_count ||
            ' tickets this month, which is 80% of your plan limit (' || max_tickets || ').' || E'\n\n' ||
            'You have ' || (max_tickets - NEW.ticket_count) ||
            ' tickets remaining before new submissions enter read-only mode.' || E'\n\n' ||
            '— Bernstein Feedback';
  END IF;

  INSERT INTO public.email_queue
    (to_email, subject, body_text, event_type, context, project_id, dedupe_key)
  VALUES (
    owner_email,
    CASE threshold_hit
      WHEN 'limit' THEN 'Your project "' || proj_name || '" has reached its monthly feedback limit'
      ELSE                'Your project "' || proj_name || '" is at 80% of its monthly feedback limit'
    END,
    body,
    CASE threshold_hit WHEN 'limit' THEN 'plan_limit' ELSE 'plan_warning' END,
    jsonb_build_object(
      'project_id',   NEW.project_id,
      'project_name', proj_name,
      'ticket_count', NEW.ticket_count,
      'max_tickets',  max_tickets,
      'threshold',    threshold_hit,
      'month',        NEW.month,
      'remaining',    GREATEST(max_tickets - NEW.ticket_count, 0)
    ),
    NEW.project_id,
    threshold_hit || ':' || NEW.project_id || ':' || NEW.month
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_plan_usage_email ON public.project_usage;
CREATE TRIGGER on_plan_usage_email
  AFTER INSERT OR UPDATE OF ticket_count ON public.project_usage
  FOR EACH ROW EXECUTE FUNCTION public.queue_email_on_plan_usage();

-- ============================================================
-- Realtime push: pg_notify on notifications INSERT
-- ============================================================
-- Publishes a notification on the Postgres `new_notification` channel
-- every time a row is inserted into public.notifications. The Node
-- server's WebSocket handler LISTENs on this channel and forwards
-- events to any connected clients subscribed to the matching
-- (project_id, user_id) pair.
--
-- Payload is kept under 8 KB (pg_notify limit) by sending only the
-- identity fields the client needs to decide whether to refetch —
-- the client then GETs the full notification list from /api/notifications.
CREATE OR REPLACE FUNCTION public.notify_new_notification()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'new_notification',
    json_build_object(
      'id',          NEW.id,
      'project_id',  NEW.project_id,
      'user_id',     NEW.user_id,
      'type',        NEW.type,
      'created_at',  NEW.created_at
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_notification_pg_notify ON public.notifications;
CREATE TRIGGER on_notification_pg_notify
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_notification();

-- Verify
SELECT 'Feedback tables created successfully' as status;
