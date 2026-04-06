-- Migration: Project Members
-- Run this in Supabase SQL Editor to add project member support
-- Allows assigning users to projects so they can see feedback

-- ============================================================
-- 1. Create project_members table
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
-- 2. Helper functions (SECURITY DEFINER to avoid circular RLS)
-- ============================================================

-- Check if current user is a member of a project (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if current user owns a project (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get all project IDs the current user has access to (owner + member)
CREATE OR REPLACE FUNCTION public.user_project_ids()
RETURNS SETOF TEXT AS $$
  SELECT id FROM public.projects WHERE owner_id = auth.uid()
  UNION
  SELECT project_id FROM public.project_members WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 3. RLS policies for project_members
-- ============================================================
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read own memberships" ON project_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Owners and admins can read all members" ON project_members
  FOR SELECT USING (
    public.is_admin() OR public.is_project_owner(project_id)
  );

CREATE POLICY "Owners and admins can insert members" ON project_members
  FOR INSERT WITH CHECK (
    public.is_admin() OR public.is_project_owner(project_id)
  );

CREATE POLICY "Owners and admins can update members" ON project_members
  FOR UPDATE USING (
    public.is_admin() OR public.is_project_owner(project_id)
  );

CREATE POLICY "Owners and admins can delete members" ON project_members
  FOR DELETE USING (
    public.is_admin() OR public.is_project_owner(project_id)
  );

CREATE POLICY "Service role members access" ON project_members
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON project_members TO authenticated;
GRANT ALL ON project_members TO service_role;

-- ============================================================
-- 4. Update projects RLS — members can see projects they belong to
-- ============================================================
DROP POLICY IF EXISTS "Read own projects or admin reads all" ON projects;
DROP POLICY IF EXISTS "Read own or member projects, admin reads all" ON projects;

CREATE POLICY "Read own or member projects, admin reads all" ON projects
  FOR SELECT USING (
    auth.uid() = owner_id
    OR public.is_admin()
    OR public.is_project_member(id)
  );

-- ============================================================
-- 5. Update feedback RLS — members can see feedback for their projects
-- ============================================================
DROP POLICY IF EXISTS "Read feedback for own projects or admin reads all" ON feedback;
DROP POLICY IF EXISTS "Read feedback for own/member projects, admin reads all" ON feedback;

CREATE POLICY "Read feedback for own/member projects, admin reads all" ON feedback
  FOR SELECT USING (
    public.is_admin()
    OR project_id IN (SELECT public.user_project_ids())
  );

SELECT 'Migration complete! project_members table created, RLS updated.' AS status;
