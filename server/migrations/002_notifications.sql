-- Migration 002: Loop-Close Notification System
-- Adds ticket status tracking and user notification delivery

-- Add status tracking to feedback table
ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')) DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by TEXT,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;

CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);

-- Notifications table for end-user delivery via widget polling
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

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(project_id, user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_feedback ON notifications(feedback_id);

-- Set all existing feedback to 'open' status
UPDATE feedback SET status = 'open' WHERE status IS NULL;

SELECT 'Migration 002_notifications completed' as status;
