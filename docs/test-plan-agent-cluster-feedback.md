# Test plan — `agent-cluster-feedback` branch

End-to-end verification for every change shipped on this branch before merge. Steps are ordered so failures block obvious downstream checks. All SQL runs against `$DATABASE_URL`; all HTTP runs against the Node server at `http://localhost:3000`.

## 0. Prerequisites

- Postgres (local or Supabase) accessible via `$DATABASE_URL`
- Node server env: `SMTP_USER`/`SMTP_PASS` set (for email fan-out checks)
- `OPENAI_API_KEY` OR `AI_KEY_ENCRYPTION_SECRET` + a BYOK key (for clustering checks)
- A **paid-plan** project with `features.posthog=true` and `features.api_access=true` (seeded default for `plan_id='paid'`)
- A **free-plan** project (for negative plan-gate checks)

```bash
# Shell exports used throughout
export PAID_PID=<project_id>             # paid-plan project
export PAID_KEY=<projects.api_key>       # its api_key
export FREE_PID=<project_id>             # free-plan project
export FREE_KEY=<api_key>                # its api_key
export OTHER_PID=<project_id>            # a third project for isolation checks
```

## 1. Migrations apply cleanly

```bash
cd server
psql $DATABASE_URL -f migrations/005_agent_api.sql
psql $DATABASE_URL -f migrations/006_auto_resolvable.sql
# Re-run both — must succeed without error (idempotency check)
psql $DATABASE_URL -f migrations/005_agent_api.sql
psql $DATABASE_URL -f migrations/006_auto_resolvable.sql
```

Verify schema:

```sql
\d feedback                              -- agent_notes column present
\d clusters                              -- is_auto_resolvable + proposed_fix present

-- Guards in resolve triggers
SELECT pg_get_functiondef('public.handle_feedback_resolved'::regprocedure)
  ~ 'clusters.*resolved_at IS NOT NULL' AS has_guard;   -- expect: t
SELECT pg_get_functiondef('public.queue_email_on_feedback_resolved'::regprocedure)
  ~ 'clusters.*resolved_at IS NOT NULL' AS has_guard;   -- expect: t

-- Classifier + trigger
SELECT proname FROM pg_proc WHERE proname = 'classify_cluster_auto_resolvable';
SELECT tgname FROM pg_trigger WHERE tgname = 'on_cluster_upsert_classify';
```

## 2. Seed test data

```sql
-- Seed a cluster with 3 members on the paid project.
-- If you have live data, skip this and use existing cluster IDs.
INSERT INTO feedback (project_id, type, title, description, email, user_id)
VALUES
  ($PAID_PID, 'bug_report', 'Login button broken',      'Clicking the login button does nothing', 'alice@example.com', 'user-a'),
  ($PAID_PID, 'bug_report', 'Login does not work',      'Button unresponsive',                    'bob@example.com',   'user-b'),
  ($PAID_PID, 'bug_report', 'Typo in welcome message',  'Says "Welcom" instead of "Welcome"',     'carol@example.com', 'user-c');
```

Wait 30–60 seconds for the cluster worker to group similar rows. Verify:

```sql
SELECT c.id, c.feedback_type, c.submission_count, c.is_auto_resolvable
  FROM clusters c WHERE c.project_id = $PAID_PID;
-- Expect: at least one cluster. The "Login" cluster should group ≥2 rows.
-- The "Typo" cluster (single member) should have is_auto_resolvable=TRUE
-- because "typo" triggers the classifier.
```

```bash
export CID=<cluster_id of the Login cluster>           # multi-member
export TYPO_CID=<cluster_id of the Typo cluster>        # auto-resolvable
```

## 3. Agent API

### 3.1 Auth + plan gate

```bash
# 401 no key
curl -i http://localhost:3000/api/v1/agent/$PAID_PID/backlog

# 401 wrong key
curl -i -H "X-API-Key: bogus" http://localhost:3000/api/v1/agent/$PAID_PID/backlog

# 403 free plan
curl -i -H "X-API-Key: $FREE_KEY" http://localhost:3000/api/v1/agent/$FREE_PID/backlog

# 200 paid plan
curl -s -H "X-API-Key: $PAID_KEY" http://localhost:3000/api/v1/agent/$PAID_PID/backlog | jq '.data[0]'

# 401 project key mismatch
curl -i -H "X-API-Key: $PAID_KEY" http://localhost:3000/api/v1/agent/$OTHER_PID/backlog
```

### 3.2 Backlog returns prioritised clusters + standalone rows

```bash
curl -s -H "X-API-Key: $PAID_KEY" \
  "http://localhost:3000/api/v1/agent/$PAID_PID/backlog?type=bug_report&limit=10" | jq
```

Expected shape:
- `data` array with `cluster_id`, `submission_count`, `priority_score`, `canonical_id`, `session_replay_url`, `user_properties`
- Sorted by priority_score DESC
- Standalone rows (no cluster yet) appear with `cluster_id: null`

### 3.3 Cluster detail

```bash
curl -s -H "X-API-Key: $PAID_KEY" \
  http://localhost:3000/api/v1/agent/$PAID_PID/clusters/$CID | jq '{cluster, members: (.members|length)}'
```

Expected: `cluster` object, `members` array with each feedback row's `console_errors`, `network_errors`, `breadcrumbs` fields.

Standalone fallback — pass a feedback UUID with no cluster:

```bash
curl -s -H "X-API-Key: $PAID_KEY" \
  http://localhost:3000/api/v1/agent/$PAID_PID/clusters/<feedback_uuid_no_cluster> | jq '.members | length'
# Expect: 1
```

### 3.4 Agent note

```bash
curl -s -X POST -H "X-API-Key: $PAID_KEY" -H "Content-Type: application/json" \
  -d '{"note":"likely nullref in CartProvider.tsx:142","author":"claude-code"}' \
  http://localhost:3000/api/v1/agent/$PAID_PID/feedback/<any_feedback_id>/note | jq
```

```sql
SELECT jsonb_array_length(agent_notes), agent_notes
  FROM feedback WHERE id = '<uuid>';
-- Expect: length 1, entry has {at, author: "claude-code", note: "..."}
```

Send a second note → length becomes 2.

### 3.5 **Critical invariant** — cluster close fans out exactly once

Capture baseline:

```sql
SELECT COUNT(DISTINCT user_id) AS expected
  FROM feedback WHERE cluster_id = '$CID' AND user_id <> '';
```

Close the cluster:

```bash
curl -s -X POST -H "X-API-Key: $PAID_KEY" -H "Content-Type: application/json" \
  -d '{"resolution_note":"Fixed in PR #999","actor":"claude-code"}' \
  http://localhost:3000/api/v1/agent/$PAID_PID/clusters/$CID/close | jq
```

Verify:

```sql
-- All members resolved
SELECT status, resolved_by FROM feedback WHERE cluster_id = '$CID';
-- Expect: all 'resolved', resolved_by='agent:claude-code'

-- Cluster marked resolved
SELECT resolved_at FROM clusters WHERE id = '$CID';

-- CRITICAL: notifications count = unique reporters, not members × reporters
SELECT COUNT(*) FROM notifications
  WHERE type='resolved' AND feedback_id IN (SELECT id FROM feedback WHERE cluster_id='$CID');
-- Expect: equals `expected` from baseline. NOT multiplied.

-- Email queue deduped
SELECT to_email, COUNT(*) FROM email_queue
  WHERE event_type='resolved' AND feedback_id IN (SELECT id FROM feedback WHERE cluster_id='$CID')
  GROUP BY to_email;
-- Expect: each unique email appears exactly once.
```

**If notification count > unique reporters, migration 005 didn't apply the trigger guard. Re-run it.**

## 4. Auto-resolvable flagging + diff preview

### 4.1 Classifier flagged the typo cluster

```sql
SELECT id, title, is_auto_resolvable FROM clusters WHERE id = '$TYPO_CID';
-- Expect: is_auto_resolvable = TRUE
```

### 4.2 Agent attaches a proposed fix

```bash
curl -s -X POST -H "X-API-Key: $PAID_KEY" -H "Content-Type: application/json" \
  -d @- http://localhost:3000/api/v1/agent/$PAID_PID/clusters/$TYPO_CID/propose-fix <<'EOF'
{
  "summary": "Fix typo: Welcom → Welcome",
  "diff": "--- a/src/Welcome.tsx\n+++ b/src/Welcome.tsx\n@@ -1,3 +1,3 @@\n-<h1>Welcom</h1>\n+<h1>Welcome</h1>",
  "files": ["src/Welcome.tsx"],
  "confidence": 0.95,
  "proposed_by": "claude-code"
}
EOF
```

Verify:

```sql
SELECT proposed_fix FROM clusters WHERE id = '$TYPO_CID';
-- Expect: JSONB object with summary, diff, files, confidence, proposed_by, proposed_at
```

### 4.3 Admin UI shows the Proposed Fix panel

1. Log in to admin dashboard → open the typo feedback in detail view
2. Verify a **Proposed Fix** card appears above the Cluster Siblings section
3. Card shows: summary text, file list chips, confidence %, raw diff in a monospace block, **Approve & Resolve** button

### 4.4 Approve the fix (admin UI or curl)

```bash
# Replace TYPO_CID with the cluster id and use an admin JWT
curl -s -X POST -H "Authorization: Bearer $ADMIN_JWT" \
  http://localhost:3000/api/feedback/clusters/$TYPO_CID/approve-fix | jq
```

Verify:

```sql
SELECT status, resolved_by, resolution_note FROM feedback WHERE cluster_id='$TYPO_CID';
-- Expect: status='resolved', resolved_by='admin:<email>',
--         resolution_note starts with "Auto-fix:"
```

### 4.5 Negative — approve fails when no proposal

```bash
# A cluster with no proposed_fix should 400
curl -i -X POST -H "Authorization: Bearer $ADMIN_JWT" \
  http://localhost:3000/api/feedback/clusters/<some_other_cid>/approve-fix
# Expect: 400 "No proposed_fix on this cluster..."
```

## 5. PostHog error webhook

### 5.1 Plan gate

```bash
# Free plan → 403
curl -i -X POST -H "X-API-Key: $FREE_KEY" -H "Content-Type: application/json" \
  -d '{"title":"test","description":"x"}' \
  http://localhost:3000/api/v1/integrations/posthog/$FREE_PID/error
```

### 5.2 Native PostHog payload creates feedback

```bash
curl -s -X POST -H "X-API-Key: $PAID_KEY" -H "Content-Type: application/json" \
  -d @- http://localhost:3000/api/v1/integrations/posthog/$PAID_PID/error <<'EOF'
{
  "event": "$exception",
  "timestamp": "2026-04-23T10:00:00Z",
  "distinct_id": "ph-user-123",
  "properties": {
    "$exception_type": "TypeError",
    "$exception_message": "Cannot read property 'cart' of undefined",
    "$exception_stack": "at Cart.tsx:42\n at render (...)",
    "$current_url": "https://app.example.com/checkout",
    "$pathname": "/checkout",
    "$session_id": "ph-session-abc",
    "$session_recording_url": "https://app.posthog.com/replay/ph-session-abc",
    "email": "ph-user@example.com"
  }
}
EOF
```

Verify:

```sql
SELECT id, title, session_provider, session_replay_url, user_id, email
  FROM feedback WHERE session_provider = 'posthog' ORDER BY created_at DESC LIMIT 1;
-- Expect: title = "Cannot read property 'cart' of undefined"
--         session_replay_url populated, user_id = 'ph-user-123'
```

### 5.3 Dedupe — same error same day = one row

Re-run the same curl → response `{ success: true, deduplicated: true, id: <same> }`.

```sql
SELECT COUNT(*) FROM feedback
  WHERE session_provider='posthog' AND user_id='ph-user-123'
    AND DATE(created_at) = CURRENT_DATE;
-- Expect: 1 (not 2)
```

### 5.4 Usage counted

```sql
SELECT ticket_count FROM project_usage
  WHERE project_id = $PAID_PID AND month = to_char(now(), 'YYYY-MM');
-- Should have incremented by exactly 1 for the first call, not the dedup'd second.
```

### 5.5 Simplified payload (non-PostHog)

```bash
curl -s -X POST -H "X-API-Key: $PAID_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Checkout 500","description":"Server returned 500","url":"/api/checkout","email":"x@y.com"}' \
  http://localhost:3000/api/v1/integrations/posthog/$PAID_PID/error | jq
# Expect: 201 + new feedback id
```

## 6. Widget proactive prompt (rage-click)

### 6.1 Example app setup

In `example/App.tsx` (or wherever the example renders `FeedbackProvider`):

```tsx
<FeedbackProvider
  config={{
    projectId: '<paid-project-id>',
    adapter: httpAdapter({ endpoint: 'http://localhost:3000/api/feedback' }),
    proactiveTriggers: { rageClick: true },
  }}
>
  <FeedbackButton />
  <YourApp />
</FeedbackProvider>
```

```bash
npm run dev       # from packages/feedback
```

### 6.2 Trigger a rage click

- Open the example app in a browser
- Pick any button or link
- Click it **4 times in under 1.5 seconds**

Expected:
- A card appears **bottom-left** (distinct from the bubble at bottom-right)
- Card reads: *"Something not working? We noticed a few clicks on <element>. If it's broken, tell us and we'll take a look."*
- Two buttons: **Report it** and **Not now**

### 6.3 "Report it" opens prefilled bug dialog

- Click **Report it**
- The feedback dialog opens in **Bug Report** mode
- Title is prefilled: *"Clicks on <element> don't seem to work"*
- Description is prefilled

### 6.4 Frequency cap

- Dismiss the prompt (× button or "Not now")
- Rage-click again
- Expected: **no second prompt** in the same session
- Refresh the page → trigger again → prompt appears again (session = page load)

### 6.5 Disabled → no prompt

- Remove `proactiveTriggers` from config (or set `false`)
- Rage-click again → no prompt, widget works normally

## 7. Email fan-out (optional — requires SMTP configured)

Close a 3-member cluster via `POST /agent/clusters/:id/close` and confirm each unique email recipient gets one message. Watch the server logs for lines like:

```
[email] sent id=<uuid> to=alice@example.com event=resolved
[email] sent id=<uuid> to=bob@example.com event=resolved
[email] sent id=<uuid> to=carol@example.com event=resolved
```

No more than one row per email in `email_queue` for the closed cluster:

```sql
SELECT to_email, COUNT(*) FROM email_queue
  WHERE event_type='resolved'
    AND feedback_id IN (SELECT id FROM feedback WHERE cluster_id='<closed_cluster_id>')
  GROUP BY to_email;
```

## 8. Regression — single-row admin resolve still works

Submit one new feedback (no cluster yet), then resolve via admin dashboard. Confirm:
- submitter receives exactly one `resolved` notification
- submitter receives exactly one resolved email

This proves the trigger guard only kicks in for already-resolved clusters and doesn't break the non-cluster path.

## 9. Typecheck + lint

```bash
cd server               && npx tsc --noEmit
cd packages/feedback    && npx tsc --noEmit
cd apps/admin           && npx tsc --noEmit
```

All three must produce zero output.

## Commit-readiness checklist

- [ ] All migrations apply + re-apply cleanly (step 1)
- [ ] Agent API auth + plan gate enforced (step 3.1)
- [ ] **Cluster close notification count = unique reporters** (step 3.5 — load-bearing)
- [ ] Classifier flags typo/colour/null-ref clusters (step 4.1)
- [ ] Agent proposed fix visible in admin UI (step 4.3)
- [ ] PostHog webhook creates + dedupes feedback (steps 5.2, 5.3)
- [ ] Rage-click prompt appears and prefills dialog (steps 6.2, 6.3)
- [ ] Rage-click frequency cap holds in same session (step 6.4)
- [ ] Single-row resolve regression check (step 8)
- [ ] All typechecks pass (step 9)
