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
  type TEXT NOT NULL CHECK (type IN ('status_change', 'resolved')),
  title TEXT NOT NULL,
  message TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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
GRANT INSERT ON notifications TO anon;
GRANT SELECT, UPDATE ON notifications TO authenticated;
GRANT ALL ON notifications TO service_role;

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
