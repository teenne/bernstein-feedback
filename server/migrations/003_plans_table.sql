-- Migration 003: Plans Table
-- Single source of truth for plan definitions (replaces static JSON plan_limits)

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

-- Add plan_id FK to projects (references plans table)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES plans(id) DEFAULT 'free';

-- Migrate existing projects: set plan_id from current plan column
UPDATE projects SET plan_id = plan WHERE plan_id IS NULL OR plan_id = 'free';

-- Create index
CREATE INDEX IF NOT EXISTS idx_projects_plan_id ON projects(plan_id);

SELECT 'Migration 003_plans_table completed' as status;
