-- Feedback table for @bernstein/feedback
-- Run this in your Supabase SQL Editor (Database > SQL Editor)

-- Drop existing table if repurposing
DROP TABLE IF EXISTS feedback;

-- Create feedback table
CREATE TABLE feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('feedback', 'bug_report', 'feature_request')),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  impact TEXT CHECK (impact IN ('blocks_me', 'annoying', 'minor') OR impact IS NULL),
  email TEXT,
  context JSONB,
  screenshot TEXT,  -- base64 data URL (can be large)
  highlighted_element JSONB,
  user_id TEXT,
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_feedback_project ON feedback(project_id);
CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX idx_feedback_user ON feedback(user_id) WHERE user_id IS NOT NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to insert feedback (public submission)
CREATE POLICY "Allow public feedback submission" ON feedback
  FOR INSERT WITH CHECK (true);

-- Policy: Only authenticated users can read feedback
-- (adjust this based on your needs)
CREATE POLICY "Allow authenticated read" ON feedback
  FOR SELECT USING (auth.role() = 'authenticated');

-- Optional: Allow service role full access (for admin dashboards)
CREATE POLICY "Allow service role full access" ON feedback
  FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions
GRANT INSERT ON feedback TO anon;
GRANT SELECT ON feedback TO authenticated;
GRANT ALL ON feedback TO service_role;

-- Verify table was created
SELECT 'Feedback table created successfully!' AS status;
