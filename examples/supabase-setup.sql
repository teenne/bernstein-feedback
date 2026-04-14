-- Feedback tables for @bernstein/feedback (Supabase)
-- Run this in your Supabase SQL Editor (Database > SQL Editor).
--
-- This script is IDEMPOTENT and SAFE to re-run on existing deployments:
--   * Uses CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN IF NOT EXISTS
--   * Uses CREATE INDEX IF NOT EXISTS
--   * Seeds plans with ON CONFLICT DO NOTHING
--   * Drops + recreates RLS policies (stateless — no data loss)
--   * No DROP TABLE / TRUNCATE / destructive DELETE statements
--
-- It will NOT delete any existing rows. Schema-changing operations are
-- additive only (new tables, new columns, new indexes, new policies).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- User Roles (dynamic admin system)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_email ON user_roles(email);

-- Helper function for RLS policies (SECURITY DEFINER to avoid circular RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Auto-provision new users with 'user' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_count INT;
  assigned_role TEXT;
BEGIN
  -- First user becomes admin automatically, everyone else gets 'user'
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'user';
  END IF;

  INSERT INTO public.user_roles (user_id, email, role)
  VALUES (NEW.id, NEW.email, assigned_role)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Plans (single source of truth for plan definitions)
-- ============================================================
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly INTEGER DEFAULT 0,          -- cents (0 = free, 2900 = $29)
  max_projects INTEGER DEFAULT 1,
  max_tickets_per_month INTEGER DEFAULT 50,
  features JSONB DEFAULT '{}',              -- feature flags: { ai_clustering, posthog, api_access, etc. }
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
   '{"ai_clustering": true, "posthog": true, "api_access": true, "self_hosted": false}', 2)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Projects table
-- ============================================================
-- Note: `plan` CHECK constraint is added separately below so existing
-- deployments with the legacy ('free','pro') constraint can be migrated
-- without conflicts on re-run.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_email TEXT,
  plan TEXT DEFAULT 'free',
  plan_id TEXT REFERENCES plans(id) DEFAULT 'free',
  plan_limits JSONB DEFAULT '{"max_projects": 1, "max_tickets_per_month": 50}',
  config JSONB DEFAULT '{}',
  api_key TEXT DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Additive migrations for deployments that pre-date the plans system
ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES plans(id) DEFAULT 'free';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan_limits JSONB DEFAULT '{"max_projects": 1, "max_tickets_per_month": 50}';

-- Ensure 'free' default is set on existing deployments (idempotent)
ALTER TABLE projects ALTER COLUMN plan SET DEFAULT 'free';
ALTER TABLE projects ALTER COLUMN plan_id SET DEFAULT 'free';

-- Migrate any legacy 'pro' plan values to 'paid' (matches current plans seed)
UPDATE projects SET plan = 'paid' WHERE plan = 'pro';

-- Backfill plan_id from plan, and default any null plans to 'free'
UPDATE projects SET plan = 'free' WHERE plan IS NULL;
UPDATE projects SET plan_id = plan WHERE plan_id IS DISTINCT FROM plan;

-- Refresh the plan CHECK constraint (drops legacy ('free','pro') if present)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_plan_check;
ALTER TABLE projects ADD CONSTRAINT projects_plan_check CHECK (plan IN ('free', 'paid'));

CREATE INDEX IF NOT EXISTS idx_projects_plan_id ON projects(plan_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_email ON projects(owner_email);

-- ============================================================
-- Project Members (assign users to projects)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'viewer')) DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

-- ============================================================
-- Auto-register the project owner as a project_member with role 'owner'
-- on every new project. This keeps "who receives notifications for project X"
-- fully described by project_members alone — the new-feedback trigger
-- doesn't need a special branch for projects.owner_id.
-- ============================================================
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
-- Owner transfer requires a separate UPDATE flow (not yet implemented).
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

-- One-time backfill: ensure existing projects also have their owner
-- registered as a member. Idempotent — re-running has no effect.
INSERT INTO project_members (project_id, user_id, email, role)
SELECT p.id, p.owner_id, p.owner_email, 'owner'
FROM projects p
WHERE p.owner_id IS NOT NULL
  AND p.owner_email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = p.id AND pm.user_id = p.owner_id
  );

-- Helper functions for RLS (SECURITY DEFINER to avoid circular recursion)
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.user_project_ids()
RETURNS SETOF TEXT AS $$
  SELECT id FROM public.projects WHERE owner_id = auth.uid()
  UNION
  SELECT project_id FROM public.project_members WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Core feedback table
-- ============================================================
-- Note: `status` column and its CHECK constraint are added below via ALTER
-- so existing deployments without the column get migrated cleanly.
CREATE TABLE IF NOT EXISTS feedback (
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

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Additive migrations for status tracking (loop-close notifications)
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved_by TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolution_note TEXT;

-- Triage fields (P3) — labels array + priority enum. Additive, safe re-run.
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS labels TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_priority_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'urgent') OR priority IS NULL);
CREATE INDEX IF NOT EXISTS idx_feedback_priority ON feedback(priority) WHERE priority IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_labels ON feedback USING GIN (labels);

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_status_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_status_check
  CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'));

-- Technical context (heavy data, separated for performance)
CREATE TABLE IF NOT EXISTS feedback_context (
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

-- ============================================================
-- Monthly usage tracking per project (plan system)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  month TEXT NOT NULL,              -- 'YYYY-MM' format (UTC)
  ticket_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, month)
);

-- ============================================================
-- Notifications for end-user loop-close delivery
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
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

-- Safely update legacy constraints if present
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('status_change', 'resolved', 'new_feedback'));

-- ============================================================
-- Email queue
-- ============================================================
-- Rows are written by triggers (resolve, plan-limit) and drained by the
-- server's email worker which calls SMTP. Email is sent exclusively
-- server-side so anon clients never touch it — there is no RLS to get
-- wrong, no data exposure, and it works identically for host apps that
-- don't use Supabase Auth (bas_frontend, meraki, smart, etc.).
--
-- dedupe_key prevents duplicate sends: for plan-limit the key includes
-- the project id + month + threshold, so a project slamming into its
-- cap 100 times in a row only emails the owner once per month.
CREATE TABLE IF NOT EXISTS email_queue (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body_text   TEXT NOT NULL,                   -- plain-text fallback (always set by trigger)
  body_html   TEXT,                            -- filled by the worker at send time
  event_type  TEXT NOT NULL CHECK (event_type IN ('resolved', 'plan_warning', 'plan_limit')),
  context     JSONB,                           -- structured data the worker uses to render the templated email
  project_id  TEXT,
  feedback_id UUID,
  dedupe_key  TEXT UNIQUE,
  attempts    INT NOT NULL DEFAULT 0,
  last_error  TEXT,
  sent_at     TIMESTAMPTZ,
  failed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill-safe: add context column if the table existed before this migration
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS context JSONB;

CREATE INDEX IF NOT EXISTS idx_email_queue_pending
  ON email_queue(created_at)
  WHERE sent_at IS NULL AND failed_at IS NULL;

-- ============================================================
-- Email trigger 1: feedback resolve → email to submitter
-- ============================================================
-- Recipient lookup order:
--   1. feedback.email (what the widget captured — either typed by the
--      user or passed via FeedbackProvider config.userEmail)
--   2. user_roles.email (Supabase Auth UUID lookup)
-- If neither is available the trigger silently skips — no queue row,
-- no wasted SMTP call.
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
       WHERE user_id::text = NEW.user_id
       LIMIT 1;
    END IF;

    IF recipient_email IS NOT NULL AND recipient_email <> '' THEN
      SELECT COALESCE(name, id) INTO project_name
        FROM public.projects WHERE id = NEW.project_id;

      -- Plain-text fallback body (used only if the worker has no template)
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
-- Fires on every ticket_count change. Dedupes per project+month+
-- threshold so the owner gets at most two emails a month per project
-- (one at 80%, one at 100%), regardless of how many submissions
-- follow. Unlimited plans (-1 limit) skip entirely.
CREATE OR REPLACE FUNCTION public.queue_email_on_plan_usage()
RETURNS TRIGGER AS $$
DECLARE
  owner_email     TEXT;
  proj_name       TEXT;
  max_tickets     INT;
  threshold_hit   TEXT;
  body            TEXT;
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
  IF max_tickets <= 0 THEN RETURN NEW; END IF;  -- -1 means unlimited

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
            '  • Service resumes automatically next month or when you upgrade' || E'\n\n' ||
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
      'project_id',    NEW.project_id,
      'project_name',  proj_name,
      'ticket_count',  NEW.ticket_count,
      'max_tickets',   max_tickets,
      'threshold',     threshold_hit,
      'month',         NEW.month,
      'remaining',     GREATEST(max_tickets - NEW.ticket_count, 0)
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
-- Realtime push (Node-server-side): pg_notify on notifications INSERT
-- ============================================================
-- Used by the Node server's WebSocket handler via LISTEN/NOTIFY.
-- Independent of Supabase Realtime — if both are active, the admin
-- app may receive the same logical event twice (once via Supabase
-- Realtime, once via the Node WebSocket), which is harmless because
-- the client-side dedupes by notification id.
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

-- ============================================================
-- P4: Feedback loop health function — see server/init.sql for
-- detailed docs. Safe to re-run; replaces the function definition.
-- ============================================================
CREATE OR REPLACE FUNCTION public.feedback_loop_health(p_project_id TEXT DEFAULT NULL)
RETURNS TABLE (
  avg_resolution_hours NUMERIC,
  pct_closed_14d       NUMERIC,
  return_rate          NUMERIC,
  total_30d            BIGINT,
  resolved_30d         BIGINT,
  unique_submitters_90d BIGINT,
  returning_submitters_90d BIGINT
) AS $$
  WITH recent AS (
    SELECT *
      FROM public.feedback
     WHERE (p_project_id IS NULL OR project_id = p_project_id)
       AND created_at > NOW() - INTERVAL '30 days'
  ),
  recent_resolved AS (
    SELECT *
      FROM recent
     WHERE status IN ('resolved', 'closed')
       AND resolved_at IS NOT NULL
  ),
  submitters AS (
    SELECT user_id, COUNT(*) AS n
      FROM public.feedback
     WHERE (p_project_id IS NULL OR project_id = p_project_id)
       AND created_at > NOW() - INTERVAL '90 days'
       AND user_id IS NOT NULL
       AND user_id <> ''
     GROUP BY user_id
  )
  SELECT
    (SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0)
       FROM recent_resolved)                                                AS avg_resolution_hours,
    (SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                 ELSE ROUND(100.0 * SUM(CASE
                     WHEN status IN ('resolved','closed')
                      AND resolved_at IS NOT NULL
                      AND (resolved_at - created_at) <= INTERVAL '14 days'
                     THEN 1 ELSE 0 END) / COUNT(*), 1)
            END
       FROM recent)                                                         AS pct_closed_14d,
    (SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                 ELSE ROUND(100.0 * SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END)
                              / COUNT(*), 1)
            END
       FROM submitters)                                                     AS return_rate,
    (SELECT COUNT(*) FROM recent)::BIGINT                                    AS total_30d,
    (SELECT COUNT(*) FROM recent_resolved)::BIGINT                           AS resolved_30d,
    (SELECT COUNT(*) FROM submitters)::BIGINT                                AS unique_submitters_90d,
    (SELECT COUNT(*) FROM submitters WHERE n > 1)::BIGINT                    AS returning_submitters_90d;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION public.feedback_loop_health(TEXT) TO authenticated, service_role;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_project ON feedback(project_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_screen ON feedback(screen_id) WHERE screen_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_context_fid ON feedback_context(feedback_id);
CREATE INDEX IF NOT EXISTS idx_project_usage_project_month ON project_usage(project_id, month);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(project_id, user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_feedback ON notifications(feedback_id);

-- ============================================================
-- New Feedback Notification Trigger
-- Recipients:
--   • Every project_members row for NEW.project_id with role
--     'owner' or 'member' (viewers are excluded). Project owners
--     are automatically members thanks to the
--     handle_new_project_owner_membership trigger above.
--   • Every user_roles row with role = 'admin' (global admins
--     receive notifications for ALL projects).
-- The submitter (NEW.user_id) is excluded from the recipient set
-- so users don't receive notifications about their own submissions.
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
    -- Supabase-auth project members
    SELECT pm.user_id::text AS recipient_id
      FROM public.project_members pm
     WHERE pm.project_id = NEW.project_id
       AND pm.role IN ('owner', 'member')
    UNION
    -- Supabase-auth global admins (notified for every project)
    SELECT ur.user_id::text AS recipient_id
      FROM public.user_roles ur
     WHERE ur.role = 'admin'
  ) recipients
  WHERE recipient_id IS NOT NULL
    -- Exclude the submitter so they don't get a self-notification.
    -- COALESCE handles the case where NEW.user_id is NULL (anonymous
    -- submission) — then no recipient matches '' so nothing is filtered.
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
-- submission time is echoed back here — host-app local ids and
-- Supabase Auth UUIDs both work without any translation.
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
      -- Include the resolution note (if any) as the notification message
      -- so the recipient sees the admin's explanation inline.
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
-- Row Level Security (RLS)
-- ============================================================
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent.
-- Each policy is dropped + recreated so re-runs pick up the latest definition.

-- user_roles RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own role" ON user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;
DROP POLICY IF EXISTS "Users can insert own role" ON user_roles;
DROP POLICY IF EXISTS "Service role full access on user_roles" ON user_roles;

CREATE POLICY "Users can read own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all roles" ON user_roles
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE USING (public.is_admin());
CREATE POLICY "Users can insert own role" ON user_roles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access on user_roles" ON user_roles
  FOR ALL USING (auth.role() = 'service_role');

-- Projects RLS (admins see all, owners + members see their projects)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read own or member projects, admin reads all" ON projects;
DROP POLICY IF EXISTS "Insert own projects" ON projects;
DROP POLICY IF EXISTS "Update own projects or admin updates all" ON projects;
DROP POLICY IF EXISTS "Delete own projects or admin deletes all" ON projects;
DROP POLICY IF EXISTS "Service role projects access" ON projects;

CREATE POLICY "Read own or member projects, admin reads all" ON projects
  FOR SELECT USING (
    auth.uid() = owner_id
    OR public.is_admin()
    OR public.is_project_member(id)
  );
CREATE POLICY "Insert own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Update own projects or admin updates all" ON projects
  FOR UPDATE USING (auth.uid() = owner_id OR public.is_admin());
CREATE POLICY "Delete own projects or admin deletes all" ON projects
  FOR DELETE USING (auth.uid() = owner_id OR public.is_admin());
CREATE POLICY "Service role projects access" ON projects
  FOR ALL USING (auth.role() = 'service_role');

-- Project Members RLS
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own memberships" ON project_members;
DROP POLICY IF EXISTS "Owners and admins can read all members" ON project_members;
DROP POLICY IF EXISTS "Owners and admins can insert members" ON project_members;
DROP POLICY IF EXISTS "Owners and admins can update members" ON project_members;
DROP POLICY IF EXISTS "Owners and admins can delete members" ON project_members;
DROP POLICY IF EXISTS "Service role members access" ON project_members;

CREATE POLICY "Members can read own memberships" ON project_members
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owners and admins can read all members" ON project_members
  FOR SELECT USING (public.is_admin() OR public.is_project_owner(project_id));
CREATE POLICY "Owners and admins can insert members" ON project_members
  FOR INSERT WITH CHECK (public.is_admin() OR public.is_project_owner(project_id));
CREATE POLICY "Owners and admins can update members" ON project_members
  FOR UPDATE USING (public.is_admin() OR public.is_project_owner(project_id));
CREATE POLICY "Owners and admins can delete members" ON project_members
  FOR DELETE USING (public.is_admin() OR public.is_project_owner(project_id));
CREATE POLICY "Service role members access" ON project_members
  FOR ALL USING (auth.role() = 'service_role');

-- Feedback RLS
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public feedback submission" ON feedback;
DROP POLICY IF EXISTS "Read feedback for own/member projects, admin reads all" ON feedback;
DROP POLICY IF EXISTS "Update feedback for own/member projects, admin updates all" ON feedback;
DROP POLICY IF EXISTS "Delete feedback for own/member projects, admin deletes all" ON feedback;
DROP POLICY IF EXISTS "Allow service role full access" ON feedback;

CREATE POLICY "Allow public feedback submission" ON feedback
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Read feedback for own/member projects, admin reads all" ON feedback
  FOR SELECT USING (
    public.is_admin()
    OR project_id IN (SELECT public.user_project_ids())
  );
CREATE POLICY "Update feedback for own/member projects, admin updates all" ON feedback
  FOR UPDATE USING (
    public.is_admin()
    OR project_id IN (SELECT public.user_project_ids())
  )
  WITH CHECK (
    public.is_admin()
    OR project_id IN (SELECT public.user_project_ids())
  );
CREATE POLICY "Delete feedback for own/member projects, admin deletes all" ON feedback
  FOR DELETE USING (
    public.is_admin()
    OR project_id IN (SELECT public.user_project_ids())
  );
CREATE POLICY "Allow service role full access" ON feedback
  FOR ALL USING (auth.role() = 'service_role');

-- Feedback context RLS
ALTER TABLE feedback_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public context insert" ON feedback_context;
DROP POLICY IF EXISTS "Allow authenticated context read" ON feedback_context;
DROP POLICY IF EXISTS "Allow service role context access" ON feedback_context;

CREATE POLICY "Allow public context insert" ON feedback_context
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated context read" ON feedback_context
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow service role context access" ON feedback_context
  FOR ALL USING (auth.role() = 'service_role');

-- Plans RLS (publicly readable, admin-only writes)
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active plans" ON plans;
DROP POLICY IF EXISTS "Admins can insert plans" ON plans;
DROP POLICY IF EXISTS "Admins can update plans" ON plans;
DROP POLICY IF EXISTS "Admins can delete plans" ON plans;
DROP POLICY IF EXISTS "Service role full access on plans" ON plans;

CREATE POLICY "Anyone can read active plans" ON plans
  FOR SELECT USING (true);
CREATE POLICY "Admins can insert plans" ON plans
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update plans" ON plans
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete plans" ON plans
  FOR DELETE USING (public.is_admin());
CREATE POLICY "Service role full access on plans" ON plans
  FOR ALL USING (auth.role() = 'service_role');

-- Project usage RLS
ALTER TABLE project_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read usage for own/member projects, admin reads all" ON project_usage;
DROP POLICY IF EXISTS "Allow public usage insert" ON project_usage;
DROP POLICY IF EXISTS "Allow public usage update" ON project_usage;
DROP POLICY IF EXISTS "Service role full access on project_usage" ON project_usage;

CREATE POLICY "Read usage for own/member projects, admin reads all" ON project_usage
  FOR SELECT USING (
    public.is_admin()
    OR project_id IN (SELECT public.user_project_ids())
  );
CREATE POLICY "Allow public usage insert" ON project_usage
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public usage update" ON project_usage
  FOR UPDATE USING (true);
CREATE POLICY "Service role full access on project_usage" ON project_usage
  FOR ALL USING (auth.role() = 'service_role');

-- Notifications RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
DROP POLICY IF EXISTS "Allow public notification insert" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications (mark read)" ON notifications;
DROP POLICY IF EXISTS "Service role full access on notifications" ON notifications;
DROP POLICY IF EXISTS "Anon can read notifications" ON notifications;
DROP POLICY IF EXISTS "Anon can update notifications" ON notifications;

CREATE POLICY "Users can read own notifications" ON notifications
  FOR SELECT USING (
    user_id = auth.uid()::text
    OR public.is_admin()
    OR project_id IN (SELECT public.user_project_ids())
  );
CREATE POLICY "Allow public notification insert" ON notifications
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own notifications (mark read)" ON notifications
  FOR UPDATE USING (
    user_id = auth.uid()::text
    OR public.is_admin()
    OR project_id IN (SELECT public.user_project_ids())
  );
CREATE POLICY "Service role full access on notifications" ON notifications
  FOR ALL USING (auth.role() = 'service_role');

-- email_queue RLS — only service_role can read/write. Triggers are
-- SECURITY DEFINER so they bypass RLS when inserting queue rows.
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role email_queue access" ON email_queue;
CREATE POLICY "Service role email_queue access" ON email_queue
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- Host-app local user notification access
-- ============================================================
-- For host apps (e.g. bas_frontend) that have their own auth system
-- and pass a host-app id like "2" as FeedbackProvider.userId, you have
-- TWO supported paths to make notifications reach those users.
-- Pick exactly ONE based on your environment.
--
-- ────────────────────────────────────────────────────────────
-- PATH A — PRODUCTION: custom JWT (RECOMMENDED, fully secure)
-- ────────────────────────────────────────────────────────────
-- The host backend mints a Supabase-compatible JWT for each logged-in
-- user, signed with the project's SUPABASE_JWT_SECRET. The JWT includes:
--    { sub: '<host-user-id>', role: 'authenticated', aud: 'authenticated', exp }
-- The frontend passes that JWT as `accessToken` to autoAdapter / FeedbackProvider.
-- The Supabase client uses it for both REST calls AND the realtime websocket,
-- so RLS can identify the user via auth.jwt() WITHOUT touching Supabase Auth.
--
-- Enable Path A by uncommenting this block AND ensuring Path B is removed:
--
-- DROP POLICY IF EXISTS "JWT can read own notifications" ON notifications;
-- CREATE POLICY "JWT can read own notifications" ON notifications
--   FOR SELECT TO authenticated USING (
--     user_id = (auth.jwt() ->> 'sub')
--   );
--
-- DROP POLICY IF EXISTS "JWT can update own notifications" ON notifications;
-- CREATE POLICY "JWT can update own notifications" ON notifications
--   FOR UPDATE TO authenticated USING (
--     user_id = (auth.jwt() ->> 'sub')
--   ) WITH CHECK (
--     user_id = (auth.jwt() ->> 'sub')
--   );
--
-- This is safe for public production deployments: a stolen anon key
-- alone reveals nothing, because notifications require a valid JWT
-- whose `sub` matches the row's user_id.
--
-- ────────────────────────────────────────────────────────────
-- PATH B — DEV / INTERNAL ONLY: permissive anon access
-- ────────────────────────────────────────────────────────────
-- ⚠️ INSECURE — DO NOT USE IN PRODUCTION ⚠️
-- Anyone holding the anon key can read every notification in the
-- database. Acceptable only for local dev and trusted internal tools.
-- The policies below are commented out by default. Uncomment ONLY
-- when you accept the risk; remove them and switch to Path A before
-- shipping to public users.
--
-- DROP POLICY IF EXISTS "Anon can read notifications" ON notifications;
-- CREATE POLICY "Anon can read notifications" ON notifications
--   FOR SELECT TO anon USING (true);
-- DROP POLICY IF EXISTS "Anon can update notifications" ON notifications;
-- CREATE POLICY "Anon can update notifications" ON notifications
--   FOR UPDATE TO anon USING (true) WITH CHECK (true);
-- ============================================================

-- ============================================================
-- Grants (idempotent — re-running has no effect)
-- ============================================================
GRANT SELECT ON user_roles TO authenticated;
GRANT ALL ON user_roles TO service_role;
GRANT INSERT ON feedback TO anon;
GRANT SELECT, UPDATE, DELETE ON feedback TO authenticated;
GRANT ALL ON feedback TO service_role;
GRANT INSERT ON feedback_context TO anon;
GRANT SELECT ON feedback_context TO authenticated;
GRANT ALL ON feedback_context TO service_role;
GRANT ALL ON projects TO authenticated;
GRANT ALL ON projects TO service_role;
GRANT ALL ON project_members TO authenticated;
GRANT ALL ON project_members TO service_role;
GRANT SELECT ON plans TO anon, authenticated;
GRANT ALL ON plans TO service_role;
GRANT INSERT, UPDATE ON project_usage TO anon;
GRANT SELECT ON project_usage TO authenticated;
GRANT ALL ON project_usage TO service_role;
-- notifications:
--   anon: INSERT only (so feedback widgets can write notifications without auth).
--   authenticated: SELECT + UPDATE (RLS policies decide which rows).
--   service_role: full access.
-- For Path B (dev only) you must additionally GRANT SELECT, UPDATE ON
-- notifications TO anon — see the policy block above.
GRANT INSERT ON notifications TO anon;
GRANT SELECT, UPDATE ON notifications TO authenticated;
GRANT ALL ON notifications TO service_role;

-- email_queue: server-only table. Only service_role (used by the email
-- worker) and triggers (SECURITY DEFINER) should touch it.
GRANT ALL ON email_queue TO service_role;

-- ============================================================
-- Realtime: enable push notifications via Supabase Realtime
-- ============================================================
-- Adds the `notifications` table to the supabase_realtime publication so the
-- @bernstein/feedback widget can subscribe to row changes via WebSocket
-- instead of polling. Safe on plain Postgres (publication won't exist there).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- ============================================================
-- Backfill existing users & seed first admin
-- ============================================================
INSERT INTO user_roles (user_id, email, role)
SELECT id, email, 'user' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- Promote first admin (change email to your admin email)
-- INSERT INTO user_roles (user_id, email, role)
-- VALUES ((SELECT id FROM auth.users WHERE email = 'your-email@example.com'), 'your-email@example.com', 'admin')
-- ON CONFLICT (user_id) DO UPDATE SET role = 'admin', updated_at = NOW();

SELECT 'All tables created/migrated successfully!' AS status;
