-- Migration: Dynamic Admin Role System
-- Run this in Supabase SQL Editor (Database > SQL Editor)
-- This adds a user_roles table, is_admin() function, auto-provisioning trigger,
-- and updates RLS policies so admins can manage all projects.

-- ============================================================
-- 1. Create user_roles table
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

-- ============================================================
-- 2. is_admin() helper — used by RLS policies
--    SECURITY DEFINER so it bypasses RLS on user_roles itself
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 3. Auto-provision new users with 'user' role on signup
-- ============================================================
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

-- Drop trigger if it exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. RLS policies on user_roles
-- ============================================================
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Users can read their own role
CREATE POLICY "Users can read own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can read all roles (for user management UI)
CREATE POLICY "Admins can read all roles" ON user_roles
  FOR SELECT USING (public.is_admin());

-- Admins can update roles (promote/demote)
CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (public.is_admin());

-- Admins can delete roles
CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE USING (public.is_admin());

-- Users can self-insert their own role (fallback if trigger misses)
CREATE POLICY "Users can insert own role" ON user_roles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access on user_roles" ON user_roles
  FOR ALL USING (auth.role() = 'service_role');

-- Grants
GRANT SELECT ON user_roles TO authenticated;
GRANT ALL ON user_roles TO service_role;

-- ============================================================
-- 5. Update projects RLS policies — admins see all
-- ============================================================
DROP POLICY IF EXISTS "Users can read own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;

CREATE POLICY "Read own projects or admin reads all" ON projects
  FOR SELECT USING (auth.uid() = owner_id OR public.is_admin());

CREATE POLICY "Insert own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Update own projects or admin updates all" ON projects
  FOR UPDATE USING (auth.uid() = owner_id OR public.is_admin());

CREATE POLICY "Delete own projects or admin deletes all" ON projects
  FOR DELETE USING (auth.uid() = owner_id OR public.is_admin());

-- ============================================================
-- 6. Update feedback RLS — users see own project feedback, admins see all
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated read" ON feedback;

CREATE POLICY "Read feedback for own projects or admin reads all" ON feedback
  FOR SELECT USING (
    public.is_admin()
    OR project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- ============================================================
-- 7. Backfill existing users with 'user' role
-- ============================================================
INSERT INTO user_roles (user_id, email, role)
SELECT id, email, 'user' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- First user to sign up will automatically become admin (handled by trigger)
-- No manual seeding required!

SELECT 'Migration complete! user_roles table created, RLS updated.' AS status;
