-- Migration 001: Plan System Overhaul
-- Adds usage-based plan limits (free = 50 tickets/month, 1 project)

-- Monthly usage tracking per project
CREATE TABLE IF NOT EXISTS project_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  month TEXT NOT NULL,              -- 'YYYY-MM' format (UTC)
  ticket_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, month)
);

CREATE INDEX IF NOT EXISTS idx_project_usage_project_month ON project_usage(project_id, month);

-- Add plan_limits column to projects for flexible tier configuration
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS plan_limits JSONB DEFAULT '{"max_projects": 1, "max_tickets_per_month": 50}';

-- Update existing projects with correct plan_limits based on current plan
UPDATE projects SET plan_limits = '{"max_projects": 1, "max_tickets_per_month": 50}' WHERE plan = 'free' AND plan_limits IS NULL;
UPDATE projects SET plan_limits = '{"max_projects": 10, "max_tickets_per_month": 5000}' WHERE plan = 'pro' AND plan_limits IS NULL;

SELECT 'Migration 001_plan_system completed' as status;
