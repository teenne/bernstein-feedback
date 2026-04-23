# Server — implementation notes

Guidance for future Claude sessions working on `server/`. Covers the pieces shipped in the Plan/Pricing, AI Clustering, and BYOK passes. Read this before touching plan gating, clusters, billing, BYOK keys, or the agent API.

## Recently shipped (in order)

- **Plan/Pricing Overhaul** — `plans.features` JSONB flags (ai_clustering / posthog / api_access / self_hosted) + `requirePlanFeature` middleware. Stale `plan === 'pro'` comparisons removed. Self-serve upgrade route + dashboard banner.
- **AI Ticket Clustering** — `clusterWorker`, `clusters` / `feedback_embeddings` tables, pgvector cosine NN, priority scoring, fan-out triggers on resolve/notification.
- **Ownership checks** — `requireProjectOwner` middleware guarding PATCH/DELETE/upgrade.
- **Billing seam** — `POST /api/projects/:id/upgrade` split from generic PATCH so a real provider can drop in via `BILLING_PROVIDER` env.
- **Clusters-list dedup** — admin `fetchFeedbackList` collapses cluster members to one row (latest) with `×N` badge.
- **Self-healing cluster counts** — `submission_count` recomputed via `COUNT(*)` on every attach, so retries/replays can't drift.
- **BYOK** — per-project OpenAI keys encrypted at rest via pgcrypto; owner-gated admin UI on Settings; worker resolves per-project key with global fallback.
- **Cross-project admin bell** — admin notifications now fetch across every project the user can see (not scoped to the feedback-list dropdown). Implemented via a dedicated admin hook that bypasses the widget; the widget also gained a `notificationScope: 'project' | 'all'` config flag for future use.
- **Agent API** — `/api/v1/agent/:projectId/*` live. `requireProjectApiKey` middleware + `features.api_access` gate. Endpoints: `GET /backlog`, `GET /clusters/:id`, `POST /clusters/:id/close`, `POST /feedback/:id/note`. Cluster-close guard added to resolve triggers so bulk close fans out exactly once.

## What's in this package

Express + Postgres. Boots via `src/index.ts` which mounts:

- `/api/auth` — JWT signup/login (legacy, plus Supabase-session passthrough)
- `/api/projects` — project CRUD, members, plan upgrade
- `/api/feedback` — submissions, list, detail, triage, cluster siblings, loop-health stats
- `/api/notifications` + WS `/api/notifications/ws` — loop-close push. Accepts `?project_id=` for scoped mode (widget) or no param for cross-project mode (admin bell). See [Notifications](#notifications).
- `/api/plans` — list plans, plan-status (public, called by widget)
- `/api/v1/agent` — reserved for the AI agent API (stub today)

Two background workers start on boot:
- `emailWorker` — drains `email_queue` every 30s via SMTP. Silent no-op if `SMTP_USER`/`SMTP_PASS` are unset.
- `clusterWorker` — embeds unclustered feedback via OpenAI, groups by cosine similarity. Silent no-op only if **both** `OPENAI_API_KEY` and `AI_KEY_ENCRYPTION_SECRET` are unset (i.e. neither a global key nor BYOK is configured). See [AI Ticket Clustering](#ai-ticket-clustering--srcworkersclusterworkerts).

Feedback submission always works regardless of worker state.

## Plan gating

Plans live in the `plans` table (seeded `free`/`paid` rows). Each plan carries a `features` JSONB with `ai_clustering`, `posthog`, `api_access`, `self_hosted`. Do **not** hardcode plan IDs in feature checks — always read `plans.features` through the helper.

### Helper: `src/helpers/plan.ts`

```ts
getProjectPlanStatus(projectId)   // ticket usage + can_submit
getProjectFeature<T>(projectId, key)
getProjectFeatures(projectId)     // whole features JSONB
requirePlanFeature(key)           // Express middleware → 403 if flag is not true
incrementUsageCount(projectId)
```

### Using the gate on a new route

Every new paid-tier route should be gated. The middleware expects the project id at `req.params.id` or `req.params.projectId`.

```ts
// PostHog session-enrichment endpoint (hypothetical)
router.get(
  '/:id/posthog/replay',
  requireAuth,
  requirePlanFeature('posthog'),
  handler,
);
```

Currently wired gates:
- `src/workers/clusterWorker.ts` — joins `plans.features ->> 'ai_clustering'` inside the fetch SQL, so free projects never touch OpenAI.
- `src/routes/agent.ts` — catch-all `requirePlanFeature('api_access')`.
- `src/routes/projects.ts` — BYOK routes (`GET/PUT/DELETE /:id/ai-key`) are gated on `ai_clustering`.

### Adding a new plan feature

1. Add the key to the `features` JSONB default in `server/init.sql`, `examples/supabase-setup.sql`, and a new `server/migrations/NNN_*.sql`. Memory note: keep these three files in sync on every schema change.
2. Update the seeded rows in those files so existing plans have the flag set to the correct boolean.
3. Wire `requirePlanFeature('your_key')` on the routes that need it.
4. Update `apps/admin/src/lib/constants.ts` if the UI should render a label for the flag.

## Billing seam — `POST /api/projects/:id/upgrade`

Owner-gated (see "Ownership checks" below). Behavior is driven by the `BILLING_PROVIDER` env var:

| `BILLING_PROVIDER` | Behavior |
|---|---|
| unset (default) | Flips `projects.plan`/`plan_id` to the requested plan immediately. Used by the dashboard's "Upgrade to Paid" button. |
| `stripe` / any value | Returns 501. Real checkout flow must be wired before the route succeeds. Intended pairing: a separate `POST /:id/billing/confirm` webhook handler that flips the plan after the provider confirms payment. |

Why a dedicated route instead of `PATCH /:id`: keeps "change metadata" and "start billing" distinguishable for analytics/authz without body parsing. The admin UI already routes upgrades through this endpoint via `apps/admin/src/lib/feedbackApi.ts:updateProjectPlan`.

**To add a real billing provider**:
1. Implement provider checkout init inside the `if (provider)` branch (return checkout URL).
2. Add `POST /:id/billing/confirm` that verifies the webhook signature, then flips the plan with the same UPDATE used in the default branch.
3. Do **not** remove the default-branch flip — self-hosted deploys rely on it.

## Ownership checks

Auth model has three layers:
- `requireAuth` — valid JWT.
- `requireAdmin` — global admin role (fresh from DB, not JWT).
- `requireProjectOwner` — owner of the project at `req.params.id`. Accepts:
  - `projects.owner_id` match, **or**
  - `project_members.role = 'owner'` for (project, user), **or**
  - global admin.

Currently applied to `PATCH /:id`, `DELETE /:id`, `POST /:id/upgrade`, and all three BYOK routes (`GET/PUT/DELETE /:id/ai-key`). Add it to any future route that mutates billing, membership, API keys, or project-level settings. Team members with role `member`/`viewer` should never change the plan, delete the project, or rotate a BYOK key.

## AI Ticket Clustering — `src/workers/clusterWorker.ts`

> Deployment + credentials checklist lives in [`docs/ai-clustering-setup.md`](../docs/ai-clustering-setup.md). Read that when a user asks "how do I turn this on" or "why isn't it clustering on Supabase".

### What it does

Polls every `CLUSTER_POLL_INTERVAL_MS` (default 30000) for unclustered feedback on paid projects. Per row:

1. Build embedding input: `title + '\n\n' + description`, capped at 8000 chars.
2. Call OpenAI `text-embedding-3-small` (1536 dims). Model configurable via `CLUSTER_EMBEDDING_MODEL`.
3. Store vector in `feedback_embeddings` (sidecar table).
4. Query for the nearest existing cluster member in the same project + same feedback type, using pgvector `<=>` cosine distance.
5. If `1 - distance >= CLUSTER_SIMILARITY_THRESHOLD` (default 0.85) → attach to that cluster, bump `submission_count` + `last_seen_at`, recompute `priority_score` via the SQL function `feedback_cluster_priority(id)`.
6. Else → create a new cluster with this row as `canonical_feedback_id`.

### Env vars

```
OPENAI_API_KEY=sk-...                    # optional — global fallback when a project has no BYOK key
AI_KEY_ENCRYPTION_SECRET=<32+ chars>     # optional — enables per-project BYOK (see below)
CLUSTER_POLL_INTERVAL_MS=30000
CLUSTER_BATCH_SIZE=10
CLUSTER_SIMILARITY_THRESHOLD=0.85        # 0-1, higher = stricter grouping
CLUSTER_EMBEDDING_MODEL=text-embedding-3-small
```

Worker is disabled entirely only when BOTH `OPENAI_API_KEY` and `AI_KEY_ENCRYPTION_SECRET` are unset.

### BYOK — per-project OpenAI keys

Paid-plan owners can store their own OpenAI key on the Settings page. The worker resolves the key per project at embedding time (no browser exposure, no env round-trip). Implementation:

- Schema: `project_ai_keys(project_id PK, provider, encrypted_key BYTEA, key_hint, created_at, updated_at)`. See [`server/migrations/004_project_ai_keys.sql`](migrations/004_project_ai_keys.sql).
- Encryption: pgcrypto `pgp_sym_encrypt` keyed off `AI_KEY_ENCRYPTION_SECRET`. Raw keys never leave the server.
- Helper module: [`src/helpers/aiKeys.ts`](src/helpers/aiKeys.ts) — `saveProjectAiKey`, `getProjectAiKey`, `deleteProjectAiKey`, `getProjectAiKeyMetadata`.
- Routes (owner-gated + `features.ai_clustering`-gated): `GET/PUT/DELETE /api/projects/:id/ai-key`.
- Worker resolution precedence (per row):
  1. Project BYOK key (if set)
  2. Global `OPENAI_API_KEY` env var
  3. Skip the row (warn-once per project so logs don't flood)

Rotating `AI_KEY_ENCRYPTION_SECRET` invalidates every stored key — owners must re-enter. Document this before rotating.

### Fail-soft behavior

- Neither `OPENAI_API_KEY` nor `AI_KEY_ENCRYPTION_SECRET` set → logs once at boot, worker never starts.
- Worker started but project has no resolvable key (no BYOK + no global) → logs once per project ("skipping project=X"), polls continue for other projects.
- Missing clustering tables → disables after first fetch error (safe on a DB that hasn't been migrated yet).
- Missing pgvector (`operator does not exist <=>`) → disables after first row attempt.
- Per-row errors → 5-minute in-memory backoff, doesn't block the rest of the batch.
- BYOK key decrypt fails (wrong `AI_KEY_ENCRYPTION_SECRET` after a rotation) → falls back to global key for that project, logs a warning.

### Downstream wiring already in place (do not touch)

- Resolve-email trigger (`queue_email_on_feedback_resolved`) fans out to every email in the cluster.
- Resolve-notification trigger (`handle_feedback_resolved`) fans out to every cluster reporter, so in-widget badges light up for all of them.
- Admin `FeedbackDetailPage` shows "Also reported by N other users" driven by `GET /api/feedback/:id/cluster-siblings`.
- Admin `FeedbackListPage` collapses a cluster to **one row** with a `×N` badge (client-side dedup in `fetchFeedbackList` using `dedupeClusteredRows`). Over-fetches 3× the requested limit to keep pagination stable after dedup. Proper fix is a SQL view; deferred until volume warrants it.
- `submission_count` is self-healing: every attach recomputes from `COUNT(*) FROM feedback WHERE cluster_id = $1` instead of incrementing — replays and retries converge.

### Known limitations (flagged for future passes)

- **Multi-instance race** — if two Node instances run, both workers can race on the same unclustered rows. Wrap the `fetchUnclustered` query in `FOR UPDATE SKIP LOCKED` before horizontal scaling. Same issue exists in `emailWorker`; fix both together.
- **No retroactive clustering** — rows created before pgvector was set up stay unclustered until someone calls a rebuild endpoint (not yet implemented). Backfill is possible via `DELETE FROM feedback_embeddings WHERE feedback_id IN (...)` — the worker picks them up on the next poll.
- **Order-dependence** — online NN is order-sensitive. An offline `POST /api/projects/:id/clusters/rebuild` pass (most-submissions-first) would clean drift; not yet built.
- **Cost ceiling** — paid plan with `max_tickets_per_month = -1` could accrue noticeable OpenAI spend. BYOK pushes the cost to the owner, but a per-project monthly embedding cap is still worth adding.
- **BYOK secret rotation** — changing `AI_KEY_ENCRYPTION_SECRET` invalidates every stored key (owners re-enter). A proper dual-key migration (`secret_v1` + `secret_v2`) is deferred.
- **Single BYOK provider** — schema CHECK allows only `'openai'`. Anthropic has no embeddings API; if we ever add Cohere or Voyage, loosen the CHECK and branch in `resolveClientForProject`.

## Notifications

Two channels: **in-app bell** (rows in `notifications` table, pushed via Supabase Realtime or WebSocket `/api/notifications/ws`) and **email** (rows in `email_queue`, drained by `emailWorker` via SMTP). Both are **trigger-driven** in SQL — no API route creates notifications directly, so the same behavior holds whether the feedback came in via `POST /api/feedback` or the Supabase adapter writing directly.

### Triggers

| Trigger | Fires on | Writes | Recipients | Source |
|---|---|---|---|---|
| `handle_new_feedback_notification` | `INSERT INTO feedback` | `notifications` rows (`type='new_feedback'`) | Project members (role ∈ owner/member; viewers excluded) **UNION** global admins (`user_roles.role='admin'`). **Submitter excluded.** | `server/init.sql` + `examples/supabase-setup.sql` |
| `handle_feedback_resolved` | `UPDATE feedback SET status` going not-resolved → `resolved`/`closed` | `notifications` rows (`type='resolved'`) | **Every unique submitter in the cluster** (or the single submitter if no cluster). Also sets `clusters.resolved_at = NOW()`. | same |
| `queue_email_on_feedback_resolved` | same as above | `email_queue` rows (`event_type='resolved'`) | `feedback.email` for every unique email in the cluster. Falls back to `user_roles.email` via `user_id` if no direct email. Skipped silently if neither exists. | same |
| `queue_email_on_plan_usage` | `INSERT OR UPDATE OF ticket_count ON project_usage` | `email_queue` rows (`event_type='plan_warning'` at 80%, `='plan_limit'` at 100%) | Project owner (`projects.owner_email`). Skipped when `max_tickets ≤ 0` (unlimited) or owner has no email. | same |
| `notify_new_notification` | `INSERT INTO notifications` | `pg_notify('new_notification', ...)` | WebSocket listener (`src/lib/pgListener.ts`) → any connected `/api/notifications/ws` clients | same |

### Who-gets-what

| Role | new_feedback | resolved | plan_warning / plan_limit |
|---|---|---|---|
| Global admin (`user_roles.role='admin'`) | ✅ every project | ❌ | ❌ |
| Project owner (`projects.owner_id` or `project_members.role='owner'`) | ✅ their projects | ❌ | ✅ email |
| Project member (role='member') | ✅ their projects | ❌ | ❌ |
| Project viewer (role='viewer') | ❌ | ❌ | ❌ |
| Feedback submitter (end-user) | ❌ (self-excluded) | ✅ in-app + email | — |
| Anonymous submitter (no `user_id`) | — | email only if `feedback.email` set | — |

### Dedup keys (load-bearing)

`email_queue.dedupe_key` is `UNIQUE` and prevents re-sends:
- Resolve email: `resolved:<feedback_id>:<email>` — same ticket never double-sends to the same recipient.
- Plan warning: `warning:<project_id>:<month>` — owner gets max one warning email per project per month.
- Plan limit: `limit:<project_id>:<month>` — same, for 100%.

Don't change these formats without a migration that clears or re-keys existing rows — duplicates will leak through.

### API routes — `src/routes/notifications.ts`

- `GET /api/notifications?project_id=<id>` — project-scoped (widget, end-user mode).
- `GET /api/notifications` (no param) — cross-project (admin bell). Returns every unread+read notification for the JWT user across every project they can access. Safe because the recipient-fan-out trigger only writes rows for legitimate recipients; filtering by `user_id = auth.uid()` is sufficient access control.
- `PATCH /api/notifications/:id/read` — marks one as read (401-equivalent via 404 if not the user's row).
- `POST /api/notifications/mark-all-read` — body `{ project_id? }`. With project_id: scoped. Without: every unread the user has.
- WebSocket `/api/notifications/ws` — push channel. See `src/lib/notificationsWs.ts` + `src/lib/pgListener.ts`.

### Admin bell vs widget bell

Two consumers, two hooks, same underlying data:

- **Widget** — `packages/feedback/src/hooks/useNotifications.ts`. Scoped to `config.projectId` by default. A `notificationScope: 'all'` config flag switches it to cross-project (passes empty `project_id` downstream). Added for admin use but only takes effect after the widget's next release.
- **Admin app** — `apps/admin/src/hooks/useAdminNotifications.ts`. Goes directly against the `notifications` table (Supabase Realtime) or the Node server (HTTP+polling). Always cross-project. Deliberately bypasses the widget so the dropdown for feedback-list scope does NOT affect the bell. Clicking a notification for a different project auto-switches the dropdown (`onProjectSwitch` callback) before navigating.

### Invariants (don't break)

- **Submitter never notified of their own submission** — the `recipient_id <> NEW.user_id` filter in `handle_new_feedback_notification`.
- **Viewers never get new_feedback** — `role IN ('owner','member')` filter. Adding `'viewer'` leaks feedback to roles that shouldn't see it.
- **Cluster resolve fans out to every reporter** — if you scope to `feedback.id = NEW.id` instead of `f.cluster_id = NEW.cluster_id`, the other N reporters in a cluster will never hear back.
- **Plan emails deduped per-project-per-month** — `dedupe_key` on `email_queue` is load-bearing.
- **`notifications` fan-out writes reach the admin bell via `pg_notify`** — both self-hosted (WebSocket listener) and Supabase (Realtime publication) subscribe to it. The `supabase_realtime` publication add is at the bottom of `examples/supabase-setup.sql`; don't remove.

### What intentionally does NOT fire a notification

Priority change, label add/remove, status `open → in_progress` (only final `resolved`/`closed`), new cluster created, cluster merged, BYOK key configured, plan upgraded. If you want any of these, add a new trigger + extend the `notifications.type` CHECK constraint.

## AI Agent API — `src/routes/agent.ts`

External coding agents (Codex, Claude Code, CI runners) read the prioritised backlog and close whole clusters over REST. Every route is per-project; the URL always contains `:projectId`. Paid-plan only — free projects get 403.

### Auth

`X-API-Key` header matched against `projects.api_key`. Middleware: `src/middleware/agentAuth.ts` (`requireProjectApiKey`). Keys are per-project — the same key won't work on another project. Runs BEFORE `requirePlanFeature('api_access')` so plan-gate 403s are only shown to authenticated callers.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/agent/:projectId/backlog` | Prioritised cluster list + any unclustered feedback. Query: `type`, `limit`, `offset`, `include_resolved`. Returns rows with `cluster_id` (null for standalone) and `priority_score`. |
| GET | `/api/v1/agent/:projectId/clusters/:clusterId` | Cluster + every member with full `feedback_context` (console_errors, network_errors, breadcrumbs). Accepts a feedback UUID as `:clusterId` for standalone rows. |
| POST | `/api/v1/agent/:projectId/clusters/:clusterId/close` | Bulk-resolve every open member. Body: `{ resolution_note?, actor? }`. Fires the resolve trigger **exactly once per cluster** thanks to the guard in `handle_feedback_resolved()` — see next section. |
| POST | `/api/v1/agent/:projectId/feedback/:feedbackId/note` | Append to `feedback.agent_notes` JSONB. Body: `{ note, author? }`. Does NOT change status. |

### The cluster-close fan-out guard (load-bearing)

Before migration 005, closing a cluster with N members would fire the resolve trigger N times, producing N duplicate notifications per recipient (there's no UNIQUE on `notifications`). Migration 005 adds an in-txn guard at the top of both `handle_feedback_resolved()` and `queue_email_on_feedback_resolved()`:

```sql
IF NEW.cluster_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM clusters WHERE id = NEW.cluster_id AND resolved_at IS NOT NULL
   )
THEN
  RETURN NEW;
END IF;
```

First row in the UPDATE fans out and then sets `clusters.resolved_at = NOW()`. Subsequent rows see it set and exit early. Behavior for single-row admin resolves is identical to before.

**Don't remove this guard** — the agent close endpoint and any future bulk resolve depend on it. Mirrored in `server/init.sql` and `examples/supabase-setup.sql`.

### Agent notes

`feedback.agent_notes` is a JSONB array of `{at, author, note}` entries, appended via `agent_notes || $entry::jsonb`. Separate from `resolution_note` so agents can add investigation context while a ticket is still open without pretending to resolve it.

## Database invariants

Three SQL files must stay in sync on any schema change (see memory):
- `server/init.sql` — fresh-install schema for self-hosted Postgres
- `examples/supabase-setup.sql` — fresh-install schema for Supabase (includes RLS)
- `server/migrations/NNN_*.sql` — additive migration for existing installs

Destructive SQL (DROP / TRUNCATE / destructive ALTER) is forbidden on Supabase; default to additive `IF NOT EXISTS` migrations.

Plan IDs in the DB are `'free'` and `'paid'`. Legacy `'pro'` appears in old code paths — treat both as "paid" in any new comparison (see `useSubscription` hook on the admin side).

## Widget ↔ server contract

The widget needs three anon-safe RPCs when running against Supabase (not the Node server): `get_project_plan`, `increment_project_usage`, `get_project_usage`. These are `SECURITY DEFINER` functions defined in `examples/supabase-setup.sql`. Keep them in sync with `packages/feedback/src/adapters/supabase-adapter.ts`.

## Common pitfalls

- **Don't hardcode `plan === 'pro'`** — the DB uses `'paid'`. This already bit us in `useSubscription`; use `PAID_PLAN_IDS` or read `features` flags directly.
- **Don't skip the cluster-worker feature gate** — the global `OPENAI_API_KEY` would otherwise pay for free-tier clustering. The gate lives in the fetch SQL, not in JS.
- **Don't put billing mutations on `PATCH /:id`** — that route is for project metadata. Use `POST /:id/upgrade` so the billing seam stays distinct.
- **Don't scope the admin notification bell by `projectId`** — the bell must reflect activity across every project the user can see, independent of the feedback-list dropdown. Use `useAdminNotifications` in the admin app, not the widget's `useNotifications`.
- **Don't create `notifications` rows from application code** — they're all trigger-driven. Writing directly from a route would bypass the recipient fan-out and the pg_notify push.
- **Don't remove the `email_queue.dedupe_key` UNIQUE constraint** — it's the only thing preventing a project stuck at 100% usage from emailing its owner on every single submission attempt.
- **Don't forget to update `CLAUDE.md`** — when you add a new route/worker/env var/trigger, update this file so future sessions don't have to rediscover the model.
