-- Feedback table for @bernstein/feedback
-- Works on both Supabase and local PostgreSQL
-- Schema aligned with examples/supabase-setup.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS feedback_context;
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS user_roles;

-- User Roles (dynamic admin system)
-- First user to register becomes admin, everyone else gets 'user'
CREATE TABLE user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_roles_email ON user_roles(email);

-- Projects table (registered apps that can send feedback)
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT,
  owner_id TEXT,
  owner_email TEXT,
  plan TEXT CHECK (plan IN ('free', 'pro')) DEFAULT 'free',
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

-- Verify
SELECT 'Feedback tables created successfully' as status;
