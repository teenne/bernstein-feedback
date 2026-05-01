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
-- pgvector is required for AI clustering (Tier 2). Supabase has it
-- pre-installed. On self-hosted Postgres, install it:
--   Linux:   apt-get install postgresql-17-pgvector
--   Windows: download from https://github.com/pgvector/pgvector/releases
--            copy vector.dll + vector.control + vector--*.sql into
--            C:\Program Files\PostgreSQL\17\lib\ and \share\extension\
-- If unavailable the init continues — core feedback still works; the
-- cluster worker self-disables at runtime.
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector not installed — AI clustering disabled. Install from https://github.com/pgvector/pgvector';
END $$;

-- CASCADE so drops in any order resolve FK dependencies automatically.
-- (notifications.feedback_id → feedback, feedback_context.feedback_id → feedback,
-- project_usage.project_id → projects, project_members.project_id → projects,
-- projects.plan_id → plans, email_queue has no FK but is included for a clean slate.)
DROP TABLE IF EXISTS email_queue              CASCADE;
DROP TABLE IF EXISTS feedback_context         CASCADE;
DROP TABLE IF EXISTS feedback                 CASCADE;
DROP TABLE IF EXISTS notifications            CASCADE;
DROP TABLE IF EXISTS project_subscriptions   CASCADE;
DROP TABLE IF EXISTS project_usage            CASCADE;
DROP TABLE IF EXISTS project_members          CASCADE;
DROP TABLE IF EXISTS projects                 CASCADE;
DROP TABLE IF EXISTS plans                    CASCADE;
DROP TABLE IF EXISTS user_roles               CASCADE;

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
  -- Per-project outbound webhook URL. Admin UI's "Ask the agent" button
  -- POSTs a cluster payload here so the project's agent (e.g. a GitHub
  -- Action running Claude Code) can generate a fix and call back via
  -- the Agent API.
  agent_webhook_url TEXT,
  repo_url          TEXT,
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

-- ============================================================
-- Tier 2: Clusters (AI ticket deduplication)
-- A cluster is a group of feedback rows that are "the same issue."
-- Rows are grouped by the cluster worker based on embedding similarity.
-- canonical_feedback_id points at the first ticket to start the cluster
-- (used as the representative title/description in the admin list).
-- priority_score is computed by feedback_cluster_priority() — see below.
-- ============================================================
CREATE TABLE clusters (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feedback_type        TEXT NOT NULL CHECK (feedback_type IN ('feedback', 'bug_report', 'feature_request')),
  canonical_feedback_id UUID,   -- FK added after feedback table is created
  title                TEXT NOT NULL,
  submission_count     INT  NOT NULL DEFAULT 1,
  first_seen_at        TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at         TIMESTAMPTZ DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ,
  priority_score       NUMERIC DEFAULT 0,
  -- Auto-resolvable flagging (Phase 3/4): narrow, self-contained tickets
  -- (typos, colour fixes, null checks) that agents can propose a one-click
  -- diff for. Flag is set by the classifier (classify_cluster_auto_resolvable);
  -- proposed_fix is attached by the agent via POST /agent/.../propose-fix.
  is_auto_resolvable   BOOLEAN NOT NULL DEFAULT FALSE,
  proposed_fix         JSONB,   -- {summary, diff, files, confidence, proposed_by, proposed_at}
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clusters_project ON clusters(project_id);
CREATE INDEX idx_clusters_unresolved ON clusters(project_id, priority_score DESC) WHERE resolved_at IS NULL;

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

  -- Triage fields (P3) — free-form labels + bounded priority enum.
  -- Labels are array of short strings ("backend", "duplicate", "ux-bug").
  -- Priority is optional; NULL means not prioritised yet.
  labels TEXT[] NOT NULL DEFAULT '{}',
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Tier 2 Agent API: investigation notes authored by an AI coding
  -- assistant. Separate from `resolution_note` because agents add
  -- context while a ticket is still open. Array of
  -- {at: timestamptz, author: text, note: text} objects, appended via
  -- POST /api/v1/agent/:projectId/feedback/:id/note.
  agent_notes JSONB NOT NULL DEFAULT '[]',

  -- Session provider fields (Tier 1) — populated when the host app
  -- configures a `sessionProvider` (PostHog, LogRocket, FullStory, etc.).
  -- Nullable so session-less hosts keep working unchanged.
  session_id          TEXT,
  session_provider    TEXT,   -- provider name, e.g. 'posthog'
  session_replay_url  TEXT,   -- deep link into the recorded session
  user_properties     JSONB,  -- identity traits (plan, role, custom fields)

  -- Tier 2: cluster assignment. Nullable — the cluster worker populates
  -- it asynchronously after computing the embedding. Rows without a
  -- cluster are treated as standalone tickets in the admin UI.
  cluster_id UUID REFERENCES clusters(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Now that feedback exists, complete the circular FK from clusters.
ALTER TABLE clusters
  ADD CONSTRAINT clusters_canonical_fk
  FOREIGN KEY (canonical_feedback_id) REFERENCES feedback(id) ON DELETE SET NULL;

-- Feedback embeddings — requires pgvector. Skipped gracefully if the
-- extension is not installed; the cluster worker self-disables at runtime.
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS feedback_embeddings (
    feedback_id     UUID PRIMARY KEY REFERENCES feedback(id) ON DELETE CASCADE,
    embedding       vector(1536) NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_feedback_embeddings_cosine
    ON feedback_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping feedback_embeddings table — pgvector not available.';
END $$;

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

-- Per-user project notification subscriptions.
-- Rows here mean "this user wants to receive notifications for this project"
-- even if they are not a formal project member.  Project members and admins
-- are already fanned-out by the notification triggers; this table lets any
-- user opt-in to additional projects (or lets admins scope their bell to
-- specific projects they care about).
CREATE TABLE project_subscriptions (
  user_id    TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX idx_project_subscriptions_user ON project_subscriptions(user_id);

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
  ON email_queue (created_at ASC, attempts ASC)
  WHERE sent_at IS NULL AND failed_at IS NULL;

-- Indexes
CREATE INDEX idx_feedback_project ON feedback(project_id);
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_project_status ON feedback(project_id, status);
CREATE INDEX idx_feedback_project_created ON feedback(project_id, created_at DESC);
CREATE INDEX idx_feedback_priority ON feedback(priority) WHERE priority IS NOT NULL;
CREATE INDEX idx_feedback_labels ON feedback USING GIN (labels);
CREATE INDEX idx_feedback_session_id ON feedback(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_feedback_cluster ON feedback(cluster_id) WHERE cluster_id IS NOT NULL;
-- Needed for the worker's "unembedded" poll. Fast even when the table grows
-- because the partial index only covers rows still awaiting embedding.
CREATE INDEX idx_feedback_needs_embedding
  ON feedback(id)
  WHERE cluster_id IS NULL;
CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX idx_feedback_user ON feedback(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_feedback_screen ON feedback(screen_id) WHERE screen_id IS NOT NULL;
CREATE INDEX idx_feedback_event_id ON feedback(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_feedback_context_fid ON feedback_context(feedback_id);
CREATE INDEX idx_notifications_user ON notifications(project_id, user_id, read);
CREATE INDEX idx_notifications_feedback ON notifications(feedback_id);
CREATE INDEX idx_project_usage_project_month ON project_usage(project_id, month);

-- ============================================================
-- BYOK AI keys — per-project OpenAI credentials for the cluster worker
-- Encrypted with pgp_sym_encrypt using AI_KEY_ENCRYPTION_SECRET.
-- The raw key never leaves the server.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS project_ai_keys (
  project_id    TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai', 'cohere')),
  encrypted_key BYTEA NOT NULL,
  key_hint      TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

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
  THEN
    -- Agent API guard: when closing a cluster via POST /agent/clusters/:id/close,
    -- multiple feedback rows transition open → resolved/closed in the same
    -- transaction. Each firing of this trigger would otherwise re-insert
    -- N notifications per cluster member. Skip fan-out if the cluster's
    -- resolved_at was already set (by an earlier firing in this txn or a
    -- prior manual resolve). First row still fans out because the
    -- resolved_at UPDATE below runs at the end of this branch.
    IF NEW.cluster_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.clusters
          WHERE id = NEW.cluster_id AND resolved_at IS NOT NULL
       )
    THEN
      RETURN NEW;
    END IF;

    -- Tier 2: fan out to EVERY reporter in the same cluster, not
    -- just the original submitter. When the feedback has no cluster
    -- (cluster_id IS NULL — embedding worker hasn't run yet), this
    -- still just hits the single submitter.
    INSERT INTO public.notifications (project_id, feedback_id, user_id, type, title, message)
    SELECT
      NEW.project_id,
      NEW.id,
      f.user_id,
      'resolved',
      'Your feedback "' || COALESCE(NEW.title, '(no title)') || '" has been resolved',
      NEW.resolution_note
    FROM public.feedback f
    WHERE (
        -- Same cluster (fan-out case)
        (NEW.cluster_id IS NOT NULL AND f.cluster_id = NEW.cluster_id)
        -- Or no cluster, single submitter (legacy / pre-cluster case)
        OR (NEW.cluster_id IS NULL AND f.id = NEW.id)
      )
      AND f.user_id IS NOT NULL
      AND f.user_id <> ''
    GROUP BY f.user_id;  -- one notification per unique recipient

    -- Mark the whole cluster as resolved if applicable
    IF NEW.cluster_id IS NOT NULL THEN
      UPDATE public.clusters
         SET resolved_at = NOW()
       WHERE id = NEW.cluster_id
         AND resolved_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_feedback_resolved ON public.feedback;
CREATE TRIGGER on_feedback_resolved
  AFTER UPDATE OF status ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.handle_feedback_resolved();

-- ============================================================
-- Status-change notification — open → in_progress.
-- Tells the submitter "we're on it" before resolution. In-app only,
-- no email (would be spammy). Single submitter, no cluster fan-out.
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

-- ============================================================
-- Email trigger 1: feedback resolve → email to submitter
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
    -- For unclustered rows, fall back to feedback.id.
    --
    -- NOTE: do NOT use a cluster guard (checking clusters.resolved_at).
    -- PostgreSQL fires AFTER ROW triggers alphabetically, so
    -- on_feedback_resolved (notification) fires before
    -- on_feedback_resolved_email (email). The notification trigger sets
    -- clusters.resolved_at before this email trigger runs — a cluster guard
    -- here would cause every clustered resolve email to be skipped.
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
      -- Primary: feedback.email from any cluster member,
      -- falling back to user_roles.email by user_id.
      SELECT DISTINCT COALESCE(
        NULLIF(f.email, ''),
        (SELECT ur.email FROM public.user_roles ur WHERE ur.user_id = f.user_id LIMIT 1)
      ) AS recipient_email
      FROM public.feedback f
      WHERE (
          (NEW.cluster_id IS NOT NULL AND f.cluster_id = NEW.cluster_id)
          OR (NEW.cluster_id IS NULL AND f.id = NEW.id)
      )

      UNION

      -- Fallback: when the submitter had no email (anonymous feedback),
      -- notify the project owner so at least someone sees the resolve.
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
            OR EXISTS (
              SELECT 1 FROM public.user_roles ur2 WHERE ur2.user_id = f2.user_id AND ur2.email IS NOT NULL
            )
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

-- ============================================================
-- Tier 2: Cluster priority scoring.
-- Returns a numeric score that ranks clusters for the AI agent's
-- backlog + the admin UI. Signals combined:
--   • submission_count (frequency weight, capped to avoid runaway)
--   • recency — recent bursts rank above slow trickles
--   • paid-user weight — clusters with ≥1 user flagged as 'paid'
--     in user_properties rank higher
--   • bug_report bonus — bugs rank above feature_requests
-- Used as: UPDATE clusters SET priority_score = feedback_cluster_priority(id);
-- Called by the cluster worker on every new submission to that cluster.
-- ============================================================
CREATE OR REPLACE FUNCTION public.feedback_cluster_priority(p_cluster_id UUID)
RETURNS NUMERIC AS $$
  SELECT
    (
      -- Frequency: 5 points per submission, capped at 100
      LEAST(c.submission_count * 5, 100)
      -- Recency: +30 if last submission was within 24h, +15 within 7d, else 0
      + CASE
          WHEN c.last_seen_at > NOW() - INTERVAL '24 hours' THEN 30
          WHEN c.last_seen_at > NOW() - INTERVAL '7 days'   THEN 15
          ELSE 0
        END
      -- Identity weight: +50 if ANY submission in this cluster came from a paid user
      + COALESCE((
          SELECT 50 FROM feedback f
           WHERE f.cluster_id = c.id
             AND f.user_properties ->> 'plan' IN ('paid', 'pro', 'enterprise')
           LIMIT 1
        ), 0)
      -- Type bonus: bugs before features before general feedback
      + CASE c.feedback_type
          WHEN 'bug_report' THEN 20
          WHEN 'feature_request' THEN 10
          ELSE 0
        END
    )::NUMERIC AS priority_score
  FROM clusters c
  WHERE c.id = p_cluster_id;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- Auto-resolvable classifier.
-- Returns TRUE if the cluster looks like a narrow, self-contained fix
-- (per the doc: "an incorrect colour, a missing null check, or a label
-- typo"). Heuristic only — keyword match on the canonical feedback's
-- title + description, short text length, low submission count, and
-- bug_report type. No AI call. Safe to call on every cluster.
--
-- The classifier runs automatically after cluster creation / update via
-- the trigger below, so the admin dashboard always has a fresh flag.
-- ============================================================
CREATE OR REPLACE FUNCTION public.classify_cluster_auto_resolvable(p_cluster_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_type TEXT;
  v_text TEXT;
  v_keyword_hit BOOLEAN;
BEGIN
  SELECT c.feedback_type,
         LOWER(COALESCE(f.title, '') || ' ' || COALESCE(f.description, ''))
    INTO v_type, v_text
    FROM public.clusters c
    LEFT JOIN public.feedback f ON f.id = c.canonical_feedback_id
   WHERE c.id = p_cluster_id;

  IF v_type IS NULL OR v_type <> 'bug_report' THEN
    RETURN FALSE;
  END IF;
  IF LENGTH(v_text) > 600 THEN
    RETURN FALSE;   -- long descriptions = probably not a one-liner fix
  END IF;

  -- Narrow-fix keyword match. Deliberately conservative — false positives
  -- here mean the developer sees a fix panel that isn't actionable, which
  -- is worse UX than hiding it.
  v_keyword_hit := v_text ~* '\m(typo|misspell|spelling|wrong text|wrong label|label says|placeholder text|button text|color|colour|css|margin|padding|alignment|align|null\s*check|undefined|nullref|null\s*reference|nil\s*pointer|404 on|broken link|dead link)\M';

  RETURN v_keyword_hit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger to keep is_auto_resolvable fresh whenever a cluster's canonical
-- feedback changes (first submission AND when submission_count recount
-- reassigns the canonical row via the worker).
CREATE OR REPLACE FUNCTION public.refresh_cluster_classification()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_auto_resolvable := public.classify_cluster_auto_resolvable(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_cluster_upsert_classify ON public.clusters;
CREATE TRIGGER on_cluster_upsert_classify
  BEFORE INSERT OR UPDATE OF canonical_feedback_id, submission_count
  ON public.clusters
  FOR EACH ROW EXECUTE FUNCTION public.refresh_cluster_classification();

-- ============================================================
-- P4: Feedback loop health — three metrics computed per project.
-- Used by the admin dashboard's "Loop Health" card to show a
-- green/amber/red status at a glance.
--
-- Metrics:
--   • avg_resolution_hours: mean time from submission → resolved_at
--     (for feedback resolved/closed in the last 30 days)
--   • pct_closed_14d: of feedback created in the last 30 days, what
--     percentage has been resolved/closed within 14 days of creation
--   • return_rate: fraction of unique submitters who have submitted
--     more than once in the last 90 days (measures "do users come back
--     after the loop closes?")
--
-- Returns a single row. Pass NULL for p_project_id to get global stats.
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
    -- Unique submitters in the last 90 days, with submission count
    SELECT user_id, COUNT(*) AS n
      FROM public.feedback
     WHERE (p_project_id IS NULL OR project_id = p_project_id)
       AND created_at > NOW() - INTERVAL '90 days'
       AND user_id IS NOT NULL
       AND user_id <> ''
     GROUP BY user_id
  )
  SELECT
    -- Mean resolution time in hours (NULL if nothing resolved)
    (SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0)
       FROM recent_resolved)                                                AS avg_resolution_hours,
    -- % of recent submissions resolved within 14 days of creation
    (SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                 ELSE ROUND(100.0 * SUM(CASE
                     WHEN status IN ('resolved','closed')
                      AND resolved_at IS NOT NULL
                      AND (resolved_at - created_at) <= INTERVAL '14 days'
                     THEN 1 ELSE 0 END) / COUNT(*), 1)
            END
       FROM recent)                                                         AS pct_closed_14d,
    -- % of distinct submitters who submitted more than once
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

-- ── plan sync trigger ──────────────────────────────────────────────────────
-- Keeps plan + plan_id identical after any UPDATE so COALESCE(plan_id, plan)
-- never sees stale data. plan_id is authoritative.
CREATE OR REPLACE FUNCTION public.sync_project_plan_columns()
RETURNS TRIGGER AS $$
DECLARE
  effective TEXT;
BEGIN
  effective := COALESCE(NEW.plan_id, NEW.plan);
  NEW.plan    := effective;
  NEW.plan_id := effective;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_project_plan ON public.projects;
CREATE TRIGGER trg_sync_project_plan
  BEFORE UPDATE OF plan, plan_id
  ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.sync_project_plan_columns();

-- Verify
SELECT 'Feedback tables created successfully' as status;
