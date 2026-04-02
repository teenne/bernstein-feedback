-- Feedback table for @bernstein/feedback
-- Adapted for standard PostgreSQL with JSONB support

DROP TABLE IF EXISTS feedback;

CREATE TABLE feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  
  -- Event Metadata
  type TEXT NOT NULL CHECK (type IN ('feedback', 'bug_report', 'feature_request')),
  timestamp TIMESTAMPTZ NOT NULL,
  event_id UUID,

  -- User Input (TEXT for potential redaction length variance)
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  severity TEXT,
  impact TEXT CHECK (impact IN ('blocks_me', 'annoying', 'minor') OR impact IS NULL),
  email TEXT,

  -- Context (JSONB for efficient querying)
  context JSONB,
  
  -- Flexible Metadata (Key-value store)
  metadata JSONB,
  
  -- Assets
  screenshots JSONB DEFAULT '[]',  -- array of base64 data URLs or storage URLs
  highlighted_element JSONB,

  -- Identity Fields
  user_id TEXT,
  tenant_id TEXT,
  role TEXT,
  
  -- Screen Identity
  screen_id TEXT,
  page_name TEXT,
  
  -- Integration
  bernstein_run_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_feedback_project ON feedback(project_id);
CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX idx_feedback_user ON feedback(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_feedback_screen ON feedback(screen_id) WHERE screen_id IS NOT NULL;

-- Verify table creation
SELECT 'Feedback table created successfully' as status;
