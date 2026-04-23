-- ============================================================
-- Migration 006 — Auto-resolvable cluster flagging
-- ============================================================
-- Phase 3/4: clusters that look like narrow, self-contained fixes
-- (typos, colour fixes, null checks) get flagged so the admin UI can
-- render a "Proposed Fix" panel and the agent API can attach a diff
-- proposal via POST /api/v1/agent/.../propose-fix.
-- Idempotent + additive.
-- ============================================================

ALTER TABLE clusters ADD COLUMN IF NOT EXISTS is_auto_resolvable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS proposed_fix JSONB;

CREATE OR REPLACE FUNCTION public.classify_cluster_auto_resolvable(p_cluster_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_type TEXT;
  v_text TEXT;
  v_keyword_hit BOOLEAN;
BEGIN
  SELECT c.feedback_type,
         LOWER(COALESCE(f.title, '') || ' ' || COALESCE(f.description, ''))
    INTO v_type, v_text
    FROM public.clusters c
    LEFT JOIN public.feedback f ON f.id = c.canonical_feedback_id
   WHERE c.id = p_cluster_id;

  IF v_type IS NULL OR v_type <> 'bug_report' THEN RETURN FALSE; END IF;
  IF LENGTH(v_text) > 600 THEN RETURN FALSE; END IF;

  v_keyword_hit := v_text ~* '\m(typo|misspell|spelling|wrong text|wrong label|label says|placeholder text|button text|color|colour|css|margin|padding|alignment|align|null\s*check|undefined|nullref|null\s*reference|nil\s*pointer|404 on|broken link|dead link)\M';
  RETURN v_keyword_hit;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.refresh_cluster_classification()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_auto_resolvable := public.classify_cluster_auto_resolvable(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_cluster_upsert_classify ON public.clusters;
CREATE TRIGGER on_cluster_upsert_classify
  BEFORE INSERT OR UPDATE OF canonical_feedback_id, submission_count
  ON public.clusters
  FOR EACH ROW EXECUTE FUNCTION public.refresh_cluster_classification();

-- Backfill: re-classify every existing cluster so the flag is accurate
-- on upgrade without waiting for the next worker recount.
UPDATE clusters SET canonical_feedback_id = canonical_feedback_id
  WHERE canonical_feedback_id IS NOT NULL;
