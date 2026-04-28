-- ============================================================
-- Migration 017 — Keep plan + plan_id columns in sync
-- ============================================================
-- plan_id is the authoritative FK into the plans table.
-- plan is the legacy text column kept for backwards compatibility.
-- A BEFORE UPDATE trigger ensures they always agree after any write,
-- so helpers/plan.ts and COALESCE(plan_id, plan) never see stale data.
-- plan_id wins when both change simultaneously (e.g. a direct SQL UPDATE
-- that sets them to different values).
-- Idempotent + additive.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_project_plan_columns()
RETURNS TRIGGER AS $$
DECLARE
  effective TEXT;
BEGIN
  -- plan_id is authoritative; fall back to plan if plan_id is null
  effective := COALESCE(NEW.plan_id, NEW.plan);
  NEW.plan    := effective;
  NEW.plan_id := effective;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_project_plan ON public.projects;
CREATE TRIGGER trg_sync_project_plan
  BEFORE UPDATE OF plan, plan_id
  ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.sync_project_plan_columns();

-- Backfill any rows that already drifted (plan_id wins)
UPDATE public.projects
   SET plan    = COALESCE(plan_id, plan),
       plan_id = COALESCE(plan_id, plan)
 WHERE plan IS DISTINCT FROM plan_id;
