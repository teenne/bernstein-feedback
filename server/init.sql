-- Feedback table for @bernstein/feedback
-- Works on both Supabase and local PostgreSQL
-- Schema aligned with examples/supabase-setup.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS feedback_context;
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS project_usage;
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS user_roles;

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
  type TEXT NOT NULL CHECK (type IN ('status_change', 'resolved')),
  title TEXT NOT NULL,
  message TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- Verify
SELECT 'Feedback tables created successfully' as status;
