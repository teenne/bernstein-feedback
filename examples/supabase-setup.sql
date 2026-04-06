-- Feedback tables for @bernstein/feedback
-- Run this in your Supabase SQL Editor (Database > SQL Editor)

DROP TABLE IF EXISTS feedback_context;
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS user_roles;

-- ============================================================
-- User Roles (dynamic admin system)
-- ============================================================
CREATE TABLE user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_email ON user_roles(email);

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
-- Projects table
-- ============================================================
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_email TEXT,
  plan TEXT CHECK (plan IN ('free', 'pro')) DEFAULT 'free',
  config JSONB DEFAULT '{}',
  api_key TEXT DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_email ON projects(owner_email);

-- ============================================================
-- Project Members (assign users to projects)
-- ============================================================
CREATE TABLE project_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'viewer')) DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);

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

-- Indexes
CREATE INDEX idx_feedback_project ON feedback(project_id);
CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX idx_feedback_user ON feedback(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_feedback_screen ON feedback(screen_id) WHERE screen_id IS NOT NULL;
CREATE INDEX idx_feedback_context_fid ON feedback_context(feedback_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- user_roles RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Allow public feedback submission" ON feedback
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Read feedback for own/member projects, admin reads all" ON feedback
  FOR SELECT USING (
    public.is_admin()
    OR project_id IN (SELECT public.user_project_ids())
  );
CREATE POLICY "Allow service role full access" ON feedback
  FOR ALL USING (auth.role() = 'service_role');

-- Feedback context RLS
ALTER TABLE feedback_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public context insert" ON feedback_context
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated context read" ON feedback_context
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow service role context access" ON feedback_context
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- Grants
-- ============================================================
GRANT SELECT ON user_roles TO authenticated;
GRANT ALL ON user_roles TO service_role;
GRANT INSERT ON feedback TO anon;
GRANT SELECT ON feedback TO authenticated;
GRANT ALL ON feedback TO service_role;
GRANT INSERT ON feedback_context TO anon;
GRANT SELECT ON feedback_context TO authenticated;
GRANT ALL ON feedback_context TO service_role;
GRANT ALL ON projects TO authenticated;
GRANT ALL ON projects TO service_role;
GRANT ALL ON project_members TO authenticated;
GRANT ALL ON project_members TO service_role;

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

SELECT 'All tables created successfully!' AS status;
