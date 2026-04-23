# AI Clustering — setup & dual-mode deployment

Reference for standing up AI ticket clustering against Supabase or self-hosted Postgres. Pairs with `server/CLAUDE.md` (which documents the worker internals).

## TL;DR

Clustering works in both Supabase-direct and Node-server modes because both write to the same `feedback` table. The worker that *does* the clustering lives in the Node server process — so the Node server must run somewhere, even for Supabase-only deployments. A paid project can either rely on the server's global OpenAI key, or supply its own (BYOK) through the admin UI.

## Required credentials / config

All server-side. Never ship OpenAI keys to the browser.

| Setting | Location | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` (optional) | `server/.env` | Global fallback used for paid projects that haven't set a BYOK key. Leave unset in pure-BYOK deployments. |
| `AI_KEY_ENCRYPTION_SECRET` (optional) | `server/.env` | 32+ char random secret used to encrypt BYOK keys at rest via `pgp_sym_encrypt`. Required only if you want paid owners to supply their own keys through Settings. |
| `DATABASE_URL` | `server/.env` | Node worker's Postgres connection. Use Supabase → Settings → Database → Connection string → **Transaction pooler** (port 6543). |
| `DB_MODE=cloud` | `server/.env` | Forces cloud mode so `DATABASE_URL` is used. |
| `DB_SSL=true` | `server/.env` | Supabase pooler requires TLS. |
| pgvector extension | Supabase SQL: `CREATE EXTENSION IF NOT EXISTS vector;` | Provides `vector(1536)` + `<=>` cosine operator. |
| Clustering schema | Apply the Tier 2 block from `examples/supabase-setup.sql` | Creates `clusters`, `feedback_embeddings`, `feedback.cluster_id` FK, ivfflat index. Idempotent. |
| BYOK schema (optional) | Apply `server/migrations/004_project_ai_keys.sql` or the block in `examples/supabase-setup.sql` | Creates `project_ai_keys` table. Required only if `AI_KEY_ENCRYPTION_SECRET` is set. |
| Plan flag | `SELECT features->>'ai_clustering' FROM plans;` | Worker filters out free-plan projects at SQL level. |
| Target project on `paid` | `UPDATE projects SET plan='paid', plan_id='paid' WHERE id='<id>';` or Dashboard → Upgrade | Free projects are skipped — no embeddings, no OpenAI cost. |

**Worker is disabled entirely only when BOTH `OPENAI_API_KEY` and `AI_KEY_ENCRYPTION_SECRET` are unset.** Either one (or both) enables it.

Optional tuning:
```
CLUSTER_POLL_INTERVAL_MS=30000
CLUSTER_BATCH_SIZE=10
CLUSTER_SIMILARITY_THRESHOLD=0.85
CLUSTER_EMBEDDING_MODEL=text-embedding-3-small
```

## BYOK — bring your own OpenAI key

Paid-plan project owners can supply their own OpenAI key per project. The worker uses that key for embedding calls, so cost is attributed to the customer, not the platform.

### Enabling BYOK on the server

1. Generate a secret: `openssl rand -base64 48`.
2. Add to `server/.env`:
   ```
   AI_KEY_ENCRYPTION_SECRET=<paste>
   ```
3. Apply the BYOK schema (runs fresh or against existing deployments):
   ```sql
   -- from server/migrations/004_project_ai_keys.sql
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   CREATE TABLE IF NOT EXISTS project_ai_keys (
     project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
     provider   TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai')),
     encrypted_key BYTEA NOT NULL,
     key_hint   TEXT NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   ALTER TABLE project_ai_keys ENABLE ROW LEVEL SECURITY;
   DROP POLICY IF EXISTS "Service role project_ai_keys access" ON project_ai_keys;
   CREATE POLICY "Service role project_ai_keys access" ON project_ai_keys
     FOR ALL USING (auth.role() = 'service_role');
   GRANT SELECT, INSERT, UPDATE, DELETE ON project_ai_keys TO service_role;
   ```
4. Restart the Node server. Boot log shows `byok=yes`.
5. In the admin → Settings → "AI Clustering Key (BYOK)" card → paste and save.

### Key resolution precedence (per feedback row)

1. Project BYOK key (from `project_ai_keys`, decrypted at call time)
2. Global `OPENAI_API_KEY` env var (if set)
3. Skip — log once per project, continue with other rows

### Security model

- Raw keys are never returned by any API. The admin UI only ever sees `key_hint` (e.g. `sk-...abcd`).
- RLS on `project_ai_keys` blocks non-service-role reads at the DB level — even if PostgREST exposed the table, anon/authenticated clients would see zero rows.
- Owner-gated writes: `requireProjectOwner` + `requirePlanFeature('ai_clustering')` on all three endpoints.
- Rotating `AI_KEY_ENCRYPTION_SECRET` invalidates every stored key — owners must re-enter. Document this before rotating.

### API surface (owner + `ai_clustering` gated)

```
GET    /api/projects/:id/ai-key        → { data: { key_hint, provider, updated_at } | null, byok_configured: boolean }
PUT    /api/projects/:id/ai-key        → body: { provider: 'openai', api_key: 'sk-...' }
DELETE /api/projects/:id/ai-key        → removes the stored key
```

## How it works with both admin-path modes

The admin app has two data paths configured by `VITE_USE_SUPABASE_DIRECTLY`:

- **Supabase-direct**: widget and admin talk to Supabase PostgREST.
- **Node server**: widget `POST /api/feedback`, admin calls `/api/*`.

**The worker is mode-agnostic.** It polls `SELECT ... FROM feedback WHERE cluster_id IS NULL`. It doesn't care which route inserted the row.

```
widget ──(direct)──▶ Supabase feedback table ◀──(INSERT)── Node /api/feedback ◀── widget
                              │
                              ▼  polls every 30s
                    Node clusterWorker (reads OPENAI_API_KEY)
                              │
                              ▼  writes
                    clusters + feedback_embeddings
                              │
                              ▼  read by both paths
        Supabase PostgREST FK join     Node LEFT JOIN clusters
        (feedbackApi.ts uses           (server/src/routes/feedback.ts)
         clusters!feedback_cluster_id_fkey)
```

## Display-side FK hint (PostgREST)

`feedback` and `clusters` have two FKs between them, so PostgREST cannot auto-pick. Always embed with the explicit FK name:

```
clusters!feedback_cluster_id_fkey(submission_count)
```

See `apps/admin/src/lib/feedbackApi.ts` for the live query. PGRST201 errors on `clusters(...)` embeds are always this.

## Deployment matrix

| Architecture | Worker runs? | Action |
| --- | --- | --- |
| Admin + widget → Node server → self-hosted Postgres | Yes | Nothing extra. |
| Admin + widget → Node server → Supabase pooler | Yes | Nothing extra — Node server running anyway. |
| Admin + widget → Supabase direct; Node server also deployed pointing at the same Supabase | Yes | Deploy Node as a lightweight "worker box" even if nothing routes traffic through its API. |
| Admin + widget → Supabase direct; **no Node server** | **No** | Deploy the Node server. Or build a Supabase Edge Function + `pg_cron` replacement (not shipped today). |

## Smoke test after deploy

1. `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('clusters','feedback_embeddings');` → 2 rows.
2. `SELECT id, features->>'ai_clustering' FROM plans;` → `free=false`, `paid=true`.
3. Server log on boot: `[cluster] worker started. model=text-embedding-3-small interval=30000ms batch=10 threshold=0.85`.
4. Submit 3 similar tickets on a paid project.
5. Server log within ~60s: `[cluster] attached feedback=... → cluster=... similarity=0.9X`.
6. Admin list: `×N` badge on the clustered rows.
7. Admin detail page: "Also reported by N other users" card.

## Failure modes and what they tell you

| Symptom | Likely cause |
| --- | --- |
| `[cluster] Neither OPENAI_API_KEY nor AI_KEY_ENCRYPTION_SECRET is set` | Configure at least one. Global key for single-tenant; BYOK secret for multi-tenant. |
| `[cluster] skipping project=X — no BYOK key and no global` | BYOK is enabled server-side but this project hasn't set a key and there's no global fallback. Owner sets one in Settings. |
| `[cluster] pgvector not available — disabling worker` | `CREATE EXTENSION vector;` not run on the target DB. |
| Worker runs but never logs "attached" or "new cluster" | Target project is on `free`. Upgrade to `paid`. |
| PGRST200 on admin list query | Tier 2 schema block not applied — run it. |
| PGRST201 on admin list query | Missing FK disambiguation — use `clusters!feedback_cluster_id_fkey(...)`. |
| PUT `/ai-key` returns `AI_KEY_ENCRYPTION_SECRET is not set` | Server doesn't have BYOK enabled. Set the secret, apply the schema, restart. |
| Every row becomes its own cluster | `CLUSTER_SIMILARITY_THRESHOLD` too high, or tickets are too dissimilar. Lower threshold or test with closer text. |
| Admin list shows 2 rows for the same cluster | Hard-refresh — `fetchFeedbackList` now dedupes client-side, but cached responses may be stale. |
| `submission_count` drifts from actual count | Self-healing on next attach. Force fix: `UPDATE clusters c SET submission_count = (SELECT COUNT(*) FROM feedback WHERE cluster_id = c.id);` |

## Future: Supabase-native worker

The cleanest "no Node server" option is a Supabase Edge Function that runs the same `clusterWorker` loop, scheduled via `pg_cron` every 30s. `OPENAI_API_KEY` goes into Edge Function secrets. Not built today; flagged as an option when Supabase-only deployment becomes a hard requirement.
