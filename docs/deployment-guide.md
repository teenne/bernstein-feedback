# Feedback Platform — Complete Deployment Guide

This guide covers everything needed to deploy, maintain, and integrate the Bernstein Feedback system. It includes the npm package (`akk-feedback`), the Express API server, the Supabase/PostgreSQL database, and the admin panel.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Repository Structure](#2-repository-structure)
3. [Render Services (What's Deployed)](#3-render-services-whats-deployed)
4. [Database Options (Supabase vs Render DB)](#4-database-options-supabase-vs-render-db)
5. [First-Time Deployment (From Scratch)](#5-first-time-deployment-from-scratch)
6. [Supabase Setup](#6-supabase-setup)
7. [Environment Variables Reference](#7-environment-variables-reference)
8. [Database Schema & Migration](#8-database-schema--migration)
9. [Publishing the npm Package](#9-publishing-the-npm-package)
10. [Integrating the Package in a Project](#10-integrating-the-package-in-a-project)
11. [Using the Admin Panel](#11-using-the-admin-panel)
12. [Local Development Setup](#12-local-development-setup)
13. [Redeployment & Updates](#13-redeployment--updates)
14. [Troubleshooting](#14-troubleshooting)
15. [Cost Summary](#15-cost-summary)

---

## 1. Architecture Overview

```
+---------------------+       +----------------------+       +---------------------+
|   Client Apps       |       |   feedback-server    |       |   feedback-admin    |
|   (React/Web)       | ----> |   (Express API)      | <---- |   (React SPA)       |
|                     |       |                      |       |                     |
|  npm install        |       |  POST /api/feedback  |       |  View, filter,      |
|  akk-feedback       |       |  GET  /api/feedback  |       |  manage all         |
|                     |       |  Auth, Projects,     |       |  feedback entries    |
|  Widget sends       |       |  Notifications, WS   |       |                     |
|  feedback via HTTP  |       |  Email worker        |       |  Login with          |
+---------------------+       +----------+-----------+       |  email/password     |
                                         |                   +---------------------+
                              +----------v-----------+
                              |   Supabase PostgreSQL |
                              |   (Primary Database)  |
                              |                       |
                              |  Tables:              |
                              |  - user_roles         |
                              |  - plans              |
                              |  - projects           |
                              |  - project_members    |
                              |  - feedback           |
                              |  - feedback_context   |
                              |  - notifications      |
                              |  - project_usage      |
                              |  - email_queue        |
                              +-----------------------+
```

### How it works:

1. A developer installs `akk-feedback` (npm package) in their React app
2. The widget shows a floating feedback button in the app
3. When a user submits feedback, the widget sends it to `feedback-server`
4. The server stores it in Supabase PostgreSQL (or Render DB as fallback)
5. Team members open `feedback-admin` to view and manage all feedback
6. When a ticket is resolved, the submitter gets a notification badge on the widget
7. Email notifications are sent for resolved tickets and plan limit warnings

Each feedback entry is tagged with a `project_id` (e.g., "meraki", "bas-core"), so the admin panel can filter by project.

---

## 2. Repository Structure

```
lib-bernstein-feedback/
|
+-- packages/feedback/           # npm package (akk-feedback)
|   +-- src/
|   |   +-- components/          # FeedbackButton, FeedbackDialog, FeedbackToast
|   |   +-- adapters/            # http, supabase, webhook, localStorage, console, auto
|   |   +-- hooks/               # useNotifications, useFeedbackConfig, useSubscription
|   |   +-- sessionProviders/    # PostHog session provider (Tier 1)
|   |   +-- utils/               # redact.ts, dom.ts
|   |   +-- context.tsx          # FeedbackProvider — state, capture, plan check, notifications
|   |   +-- schemas.ts           # Zod schemas, TypeScript types, SessionProvider interface
|   +-- dist/                    # Built output (ESM, CJS, types, CSS)
|   +-- package.json             # Published as "akk-feedback" on npm
|
+-- server/                      # Express API server
|   +-- src/
|   |   +-- routes/              # auth, feedback, projects, notifications, plans, health
|   |   +-- middleware/          # JWT auth middleware
|   |   +-- schemas/             # Zod validation schemas
|   |   +-- lib/                 # email, pgListener, notificationsWs, notificationBus
|   |   +-- workers/             # emailWorker (polls email_queue, sends SMTP)
|   |   +-- helpers/             # plan.ts (usage tracking)
|   |   +-- db.ts                # Database connection (cloud/local/memory modes)
|   |   +-- migrate.ts           # Migration script
|   |   +-- index.ts             # Express app + HTTP server + WebSocket
|   +-- init.sql                 # Full database schema (9 tables + triggers + functions)
|   +-- .env.example             # Environment variable template
|
+-- apps/admin/                  # Admin panel (React SPA)
|   +-- src/
|   |   +-- pages/               # FeedbackList, FeedbackDetail, Stats, Settings, UserManagement, Demo
|   |   +-- components/          # GlassCard, LayoutWrapper, ConfirmDialog, Notification, LoadingSpinner
|   |   +-- lib/                 # feedbackApi.ts, supabaseClient.ts, constants.ts, types.ts
|   |   +-- hooks/               # useAuth, useFeedbackConfig, useSubscription
|   |   +-- auth/                # Login, Register, Dashboard, AuthGateway, LocalLoginPage
|   |   +-- App.tsx              # Main app with routing
|   +-- .env.example             # Environment variable template
|
+-- render.yaml                  # Render Blueprint (defines all services)
+-- docs/                        # Documentation
```

---

## 3. Render Services (What's Deployed)

| Service Name | Type | Runtime | Region | What It Does |
|-------------|------|---------|--------|--------------|
| **feedback-server** | Web Service | Node.js | Oregon | Express API + WebSocket — receives feedback, manages auth/projects/notifications, sends emails |
| **feedback-db** | Database | PostgreSQL 18 | Oregon | Render-managed DB (fallback — currently unused, Supabase is primary) |
| **feedback-admin** | Static Site | Static | Global | Admin dashboard to view/manage feedback |

All three are defined in `render.yaml` at the project root and deployed together via Render Blueprints.

---

## 4. Database Options (Supabase vs Render DB)

The server supports **two database backends**. The active one is determined by environment variables.

| Option | Connection Var | When to Use |
|--------|---------------|-------------|
| **Supabase (Primary)** | `DATABASE_SUP_URL` | Production. Supabase handles auth + DB. Free tier available. |
| **Render DB (Fallback)** | `DATABASE_URL` | If Supabase is unavailable. Render-managed PostgreSQL ($7/month). |
| **Local PostgreSQL** | `DB_HOST`, `DB_PORT`, etc. | Local development only. |
| **In-Memory** | `DB_MODE=memory` | Testing only. Data lost on restart. |

### Priority Order (db.ts logic)

```
1. If DB_MODE is explicitly set → use that mode
2. If DATABASE_URL exists → use it (Render DB)
3. If DATABASE_SUP_URL exists → use it (Supabase)
4. Neither → use local DB vars (DB_HOST, DB_PORT, etc.)
```

**Current Production Setup:**
- `DATABASE_URL` is removed from Render env vars
- `DATABASE_SUP_URL` is set to the Supabase **Session Pooler** URL
- Server connects to Supabase for all data

### Important: Supabase Connection from Render

Supabase's direct connection (`db.xxxxx.supabase.co:5432`) does **NOT work from Render** because:
- Supabase uses IPv6, Render uses IPv4
- Direct port 5432 is blocked from external IPv4 networks

**You MUST use the Session Pooler URL** (available in Supabase Dashboard → Connect → Direct → Session pooler):

```
postgresql://postgres.<project-ref>:<PASSWORD>@aws-<n>-<region>.pooler.supabase.com:5432/postgres
```

For the current project:
```
postgresql://postgres.xutstgzigcoarbktasxm:<PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

The key differences from the direct URL:
- Host: `aws-1-ap-southeast-1.pooler.supabase.com` (NOT `db.xxxxx.supabase.co`)
- Username: `postgres.xutstgzigcoarbktasxm` (NOT just `postgres`)

---

## 5. First-Time Deployment (From Scratch)

### Step 1: Create Blueprint on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **Blueprints** in the left sidebar
3. Click **New Blueprint Instance**
4. Connect your GitHub repo: `basglobal/lib-bernstein-feedback`
5. Select the **Staging** branch
6. Name it: `feedback-platform`
7. Render will detect `render.yaml` and show services to create

### Step 2: Set Environment Variables (Before Applying)

**For feedback-admin (static site):**

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_API_URL` | Leave blank initially | Set AFTER server deploys |
| `VITE_ADMIN_PASSWORD` | `your-secure-password` | For local auth login |
| `VITE_ADMIN_EMAILS` | `admin@example.com` | Comma-separated admin emails |
| `VITE_SUPABASE_URL` | `https://xutstgzigcoarbktasxm.supabase.co` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Supabase anon key |

### Step 3: Apply and Wait

Click **Apply** — Render provisions all services. This takes 3-5 minutes.

### Step 4: Set `DATABASE_SUP_URL` on feedback-server

1. Get the **Session Pooler URL** from Supabase (see [Section 4](#4-database-options-supabase-vs-render-db))
2. Go to **Render → feedback-server → Environment**
3. Add `DATABASE_SUP_URL` = the pooler URL
4. **Remove** `DATABASE_URL` (so server uses Supabase, not Render DB)
5. Save and restart

### Step 5: Run Database Migration

**Option A: Via Supabase SQL Editor (Recommended)**
1. Go to **Supabase Dashboard → SQL Editor**
2. Click **New query**
3. Copy entire contents of `server/init.sql` and paste
4. Click **Run**
5. Should see: `Feedback tables created successfully`

**Option B: Via Render Shell**
```bash
psql "$DATABASE_SUP_URL" -f init.sql
```

### Step 6: Set VITE_API_URL on feedback-admin

1. Go to **feedback-server** → copy the service URL
2. Go to **feedback-admin** → **Environment** tab
3. Set `VITE_API_URL` = the server URL (e.g., `https://feedback-server-xxxx.onrender.com`)
4. Click **Save Changes**
5. **Manual Deploy** → Deploy latest commit (VITE_ vars are build-time)

### Step 7: Verify

1. Visit `https://feedback-server-XXXX.onrender.com/health`
   - Expected: `{"status":"ok","db":"connected"}`

2. Visit `https://feedback-admin-XXXX.onrender.com`
   - Register with your email — **first user automatically becomes admin**

3. Test a feedback submission:
   ```bash
   curl -X POST https://feedback-server-XXXX.onrender.com/api/feedback \
     -H "Content-Type: application/json" \
     -d '{
       "project_id": "test-project",
       "type": "feedback",
       "title": "First test feedback",
       "description": "Testing the deployment",
       "timestamp": "2026-04-17T00:00:00.000Z",
       "context": {}
     }'
   ```

---

## 6. Supabase Setup

### Project Details

| Item | Value |
|------|-------|
| Organization | Akkomplish |
| Project Name | feedback |
| Project ID | `xutstgzigcoarbktasxm` |
| Region | `ap-southeast-1` (Singapore) |
| Plan | Free |
| API URL | `https://xutstgzigcoarbktasxm.supabase.co` |

### Getting the Pooler URL

1. Go to **Supabase Dashboard** → your project
2. Click **Connect** button (top bar)
3. Select **Direct** tab
4. Under **Connection Method**, select **Session pooler**
5. Keep Type as **URI**
6. Copy the connection string and replace `[YOUR-PASSWORD]` with the DB password

### Tables in Supabase

| Table | Rows | Purpose |
|-------|------|---------|
| `user_roles` | Auth users | Email, password hash, role (admin/user) |
| `plans` | 2 (free/paid) | Plan definitions with limits |
| `projects` | Per project | Registered apps with API keys, config, plan |
| `project_members` | Per member | Maps users to projects (owner/member/viewer) |
| `feedback` | Growing | Core feedback data with status tracking |
| `feedback_context` | Growing | Technical context (console errors, network, breadcrumbs) |
| `notifications` | Growing | Resolved/status change notifications for users |
| `project_usage` | Per project/month | Monthly ticket count for plan enforcement |
| `email_queue` | Transient | Pending emails drained by the server's email worker |

### Database Triggers (auto-created by init.sql)

| Trigger | Fires On | What It Does |
|---------|----------|-------------|
| `on_project_owner_membership` | INSERT on projects | Auto-adds owner as project member |
| `on_project_member_delete_guard` | DELETE on project_members | Prevents removing project owner |
| `on_new_feedback` | INSERT on feedback | Creates notification for project members + admins |
| `on_feedback_resolved` | UPDATE status on feedback | Notifies submitter when ticket is resolved |
| `on_feedback_resolved_email` | UPDATE status on feedback | Queues resolution email to submitter |
| `on_plan_usage_email` | INSERT/UPDATE on project_usage | Queues warning/limit emails at 80%/100% usage |
| `on_notification_pg_notify` | INSERT on notifications | Fires pg_notify for WebSocket push |

### Database Functions

| Function | Purpose |
|----------|---------|
| `feedback_loop_health(project_id)` | Returns 3 health metrics: avg resolution time, % closed in 14 days, return rate |

### RLS (Row Level Security)

Currently **disabled** (tables show "UNRESTRICTED"). This is fine because:
- The Node server connects with the `postgres` role (full access)
- All authorization is handled by JWT auth in Express routes
- The admin app goes through the server API, not directly to tables

---

## 7. Environment Variables Reference

### feedback-server (Express API)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_SUP_URL` | Yes (production) | — | Supabase **Session Pooler** connection string. Must use pooler host, NOT `db.xxx.supabase.co`. |
| `DATABASE_URL` | No | — | Render DB connection string. Remove this to use Supabase instead. |
| `DB_MODE` | No | auto-detect | Force a mode: `cloud`, `local`, or `memory`. |
| `DB_HOST` | No | `127.0.0.1` | Local dev only (when no DATABASE_URL/SUP_URL) |
| `DB_PORT` | No | `5432` | Local dev only |
| `DB_USER` | No | `postgres` | Local dev only |
| `DB_PASSWORD` | No | `postgres` | Local dev only |
| `DB_NAME` | No | `postgres` | Local dev only |
| `DB_SSL` | No | `true` (cloud) / `false` (local) | Set to `false` for local dev |
| `PORT` | No | `3000` | Render sets this automatically |
| `NODE_ENV` | No | `development` | Set to `production` on Render |
| `JWT_SECRET` | Yes (production) | fallback string | Secret for signing auth tokens. Auto-generated by Render Blueprint. |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS origins (admin URL + client app URLs) |
| `SMTP_HOST` | No | — | Email server (e.g., `smtp.gmail.com`) |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | — | Email account |
| `SMTP_PASS` | No | — | Email App Password (NOT your Google password) |
| `SMTP_FROM` | No | — | From address (e.g., `"Bernstein Feedback <you@gmail.com>"`) |

### feedback-admin (Static Site)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | Yes | `http://localhost:3000` | URL of feedback-server. **Must be the Render URL in production.** |
| `VITE_ADMIN_PASSWORD` | No | `admin` | Password for local auth (when Supabase not configured) |
| `VITE_ADMIN_EMAILS` | No | — | Comma-separated admin emails |
| `VITE_SUPABASE_URL` | No | — | Supabase project URL. Enables Supabase auth + direct queries. |
| `VITE_SUPABASE_ANON_KEY` | No | — | Supabase anon key. Required with VITE_SUPABASE_URL. |
| `VITE_POSTHOG_KEY` | No | — | PostHog project key. Enables session replay links on tickets. |
| `VITE_POSTHOG_HOST` | No | `https://us.i.posthog.com` | PostHog API host |

**Important:** All `VITE_` variables are baked at build time. After changing them, you **must trigger a Manual Deploy** on feedback-admin.

---

## 8. Database Schema & Migration

### Schema (init.sql)

9 tables + 7 triggers + 1 function. See [Section 6](#6-supabase-setup) for details.

### Running Migration

**Via Supabase SQL Editor (Recommended for production):**
1. Go to Supabase Dashboard → SQL Editor
2. Paste contents of `server/init.sql`
3. Click Run

**Via Render Shell (if using Render DB):**
```bash
psql $DATABASE_URL -f init.sql
```

**Via Render Shell (if using Supabase):**
```bash
psql "$DATABASE_SUP_URL" -f init.sql
```

**Locally:**
```bash
cd server
docker-compose up -d
npm run build && npm run migrate
```

### Warning

`init.sql` runs `DROP TABLE IF EXISTS` — **it wipes all existing data**. Only run on a fresh database or when you intentionally want to reset.

For incremental changes, use Supabase SQL Editor to run individual `ALTER TABLE` statements.

---

## 9. Publishing the npm Package

Published as `akk-feedback` on [npmjs.com](https://www.npmjs.com/package/akk-feedback).

### Prerequisites

- npm account: `shwetatrivedi`
- Granular access token with "Bypass 2FA" enabled
- Token created at: npmjs.com → Settings → Access Tokens → Granular Access Token

### Steps to Publish

1. **Bump version** in `packages/feedback/package.json`:
   ```json
   "version": "1.2.4"
   ```
   Semver: patch (bug fix) / minor (new feature) / major (breaking change)

2. **Also update** `apps/admin/package.json` to match:
   ```json
   "akk-feedback": "1.2.4"
   ```

3. **Login** (if not already):
   ```bash
   npm login
   ```

4. **Publish**:
   ```bash
   cd packages/feedback
   npm publish --access public
   ```
   Builds automatically via `prepublishOnly` hook.

5. **Verify**:
   ```bash
   npm view akk-feedback version
   ```

6. **Commit** both package.json changes and push. Render auto-deploys feedback-admin with the new version.

### Current Version History

| Version | Changes |
|---------|---------|
| 1.0.0 | Initial release — core widget, adapters, schemas |
| 1.0.1 | React 19 peer dependency support |
| 1.1.0 | WebSocket notifications, plan status |
| 1.2.0 | Notification hooks, session provider interface |
| 1.2.1 | Bug fixes |
| 1.2.2 | Updated adapters, Supabase adapter with plan support |
| 1.2.3 | Latest — auto-screenshot, PostHog provider, email integration |

---

## 10. Integrating the Package in a Project

### Install

```bash
npm install akk-feedback
```

### Basic Setup

```tsx
import 'akk-feedback/styles.css';
import {
  FeedbackProvider, FeedbackButton, FeedbackDialog, FeedbackToast
} from 'akk-feedback';
import { httpAdapter } from 'akk-feedback/adapters';

function App() {
  return (
    <FeedbackProvider
      config={{
        projectId: 'your-project-name',
        adapter: httpAdapter({
          endpoint: 'https://feedback-server-XXXX.onrender.com/api/feedback',
        }),
      }}
    >
      <YourApp />
      <FeedbackButton position="bottom-right" />
      <FeedbackDialog />
      <FeedbackToast />
    </FeedbackProvider>
  );
}
```

### Full Config Options

```tsx
config={{
  // Required
  projectId: 'meraki',
  adapter: httpAdapter({
    endpoint: 'https://feedback-server-XXXX.onrender.com/api/feedback',
    wsEndpoint: 'wss://feedback-server-XXXX.onrender.com/api/notifications/ws', // real-time notifications
  }),

  // Optional — Session Provider (PostHog integration)
  sessionProvider: posthogSessionProvider(posthogInstance),

  // Optional — User Identity
  userId: currentUser.id,
  userEmail: currentUser.email,
  tenantId: 'org-123',
  role: 'admin',

  // Optional — Build Identity
  appVersion: '2.1.0',
  buildSha: 'abc123',
  env: 'production',

  // Optional — Screen Identity
  screenId: 'checkout',
  pageName: 'Checkout Page',

  // Optional — Notifications
  enableNotifications: true,
  notificationPollInterval: 30000,

  // Optional — Screenshots
  autoScreenshot: true,

  // Optional — Capture Limits
  maxConsoleErrors: 10,
  maxNetworkErrors: 5,
  maxBreadcrumbs: 20,

  // Optional — Privacy
  redact: [/custom-secret-pattern/gi],
}}
```

### Programmatic API

```tsx
const {
  openFeedback,              // Open dialog in feedback mode
  openBugReport,             // Open dialog in bug report mode
  reportBug,                 // Pre-fill and open bug report
  addBreadcrumb,             // Track custom user actions
  captureContext,            // Get current context snapshot
  lastReportId,              // ID of last submitted report
  setScreen,                 // Update screen identity
  planStatus,                // Current plan status (can_submit, tickets_used, etc.)
  isLimitReached,            // Whether project hit ticket limit
  notifications,             // User's notifications
  unreadCount,               // Number of unread notifications
  markNotificationRead,      // Mark single notification as read
  markAllNotificationsRead,  // Mark all as read
} = useFeedback();
```

### Available Adapters

```tsx
import {
  httpAdapter,          // REST endpoint (recommended)
  supabaseAdapter,      // Direct to Supabase
  consoleAdapter,       // Browser console (dev)
  localStorageAdapter,  // localStorage (testing)
  webhookAdapter,       // Slack/Discord/Teams webhook
  autoAdapter,          // Auto-selects based on config
} from 'akk-feedback/adapters';
```

### Currently Integrated Projects

| Project | Render Service | projectId |
|---------|---------------|-----------|
| Meraki | `meraki-frontend` | `meraki` |
| BAS Core | `bas-core-react` | `bas-core` |
| Feedback Admin | `feedback-admin` | `feedback-admin` |

---

## 11. Using the Admin Panel

### URL

`https://feedback-admin-XXXX.onrender.com`

### First-Time Setup

1. Open the admin panel URL
2. Click **Register** and create an account
3. **First user automatically becomes admin**
4. Additional users get "user" role

### Features

| Page | What It Does |
|------|-------------|
| **Feedback** | List all feedback. Filter by type, project, status, priority. Click any row for details. |
| **Feedback Detail** | Full details — title, description, screenshots, console errors, network failures, breadcrumbs, browser info. Status management (Open → In Progress → Resolved → Closed). Resolution notes. |
| **Stats** | Analytics — total count, breakdown by type, severity, and status. Loop health metrics. |
| **Settings** | Widget configuration — theme, dark mode, capture limits. |
| **Users** | Admin-only. Manage user roles (promote/demote). |
| **Demo** | Live demo of the feedback widget with test error triggers. |

### Auth System

| Mode | How It Works |
|------|-------------|
| **With Supabase** | OAuth / email login via Supabase Auth |
| **Without Supabase** | Email + password login via Node server (bcrypt + JWT) |
| **JWT tokens** | 7-day expiry, stored in browser localStorage |

### Notification System

- When a developer resolves a ticket → submitter gets a notification
- Badge appears on the widget bubble with unread count
- WebSocket for real-time push (falls back to 30s polling)
- Email notification sent if SMTP is configured

---

## 12. Local Development Setup

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL) or a local PostgreSQL instance

### Server

```bash
cd server
docker-compose up -d        # Start local PostgreSQL
npm install
cp .env.example .env        # Configure local vars
npm run build
npm run migrate             # Create tables in local DB
npm run dev                 # Runs on http://127.0.0.1:3000
```

### Admin Panel

```bash
cd apps/admin
npm install
cp .env.example .env        # Set VITE_API_URL=http://localhost:3000
npm run dev                 # Runs on http://localhost:5174
```

Vite dev server proxies `/api` requests to `localhost:3000` automatically.

### Feedback Package

```bash
cd packages/feedback
npm install
npm run dev                 # Runs example app
npm run test                # Run tests
npm run build               # Build ESM/CJS/types/CSS
npm run typecheck           # Type check only
```

---

## 13. Redeployment & Updates

### When to Redeploy What

| Change Made | What to Redeploy | How |
|-------------|-----------------|-----|
| `server/src/*` changed | feedback-server | Auto-deploys on push to Staging |
| `apps/admin/src/*` changed | feedback-admin | Auto-deploys on push to Staging |
| `packages/feedback/src/*` changed | Publish new npm version | `npm publish --access public` then push version bump |
| `server/init.sql` changed | Run migration | Supabase SQL Editor (paste & run) — WARNING: drops tables |
| `VITE_*` env vars changed | feedback-admin | Must trigger **Manual Deploy** after saving env vars |
| `render.yaml` changed | All services | Push to repo → Render auto-syncs |
| Server env vars changed | feedback-server | Save in Render → auto-restarts |

### npm Package + Admin Sync

When you publish a new npm version:
1. Bump version in `packages/feedback/package.json`
2. Update version in `apps/admin/package.json`
3. Publish: `cd packages/feedback && npm publish --access public`
4. Commit both files and push
5. Render auto-deploys feedback-admin with the new version

---

## 14. Troubleshooting

### Server shows "SWITCHING TO IN-MEMORY MODE"

The server can't connect to the database. Check:
- `DATABASE_SUP_URL` is set to the **Session Pooler** URL (NOT the direct `db.xxx.supabase.co:5432` URL)
- `DATABASE_URL` is removed (if you want Supabase as primary)
- The pooler URL uses format: `postgres.<project-ref>@aws-<n>-<region>.pooler.supabase.com`

### "Tenant or user not found" when connecting to Supabase

Wrong region or pooler format. The correct format for this project:
```
postgresql://postgres.xutstgzigcoarbktasxm:<PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```
Key: it's `aws-1` not `aws-0`, and region is `ap-southeast-1`.

### "Network is unreachable" from Render Shell

You're using the direct Supabase URL (port 5432). Switch to the Session Pooler URL. See [Section 4](#4-database-options-supabase-vs-render-db).

### Migration fails with ECONNREFUSED

`dotenv.config()` in migrate.ts may load a `.env` file that overrides shell env vars. Use `psql` directly:
```bash
psql "$DATABASE_SUP_URL" -f init.sql
```
Or paste `init.sql` into Supabase SQL Editor.

### Admin panel shows "Failed to connect to server"

- Check `VITE_API_URL` is set correctly (must include `https://`, no trailing slash)
- Check CORS: `ALLOWED_ORIGINS` on the server must include the admin panel URL
- After changing `VITE_API_URL`, you **must Manual Deploy** feedback-admin

### Email worker spam in logs

```
[Memory] Unhandled query: SELECT ... FROM email_queue
```
This means the server is in in-memory mode and the email worker can't find the `email_queue` table. Fix the database connection (see first issue above).

### CORS errors in browser

- Add the client app's origin URL to `ALLOWED_ORIGINS` on feedback-server
- Format: comma-separated, no spaces
- Restart feedback-server after changing

### Sign-up shows "processing" forever

Server is in in-memory mode — user registration fails silently. Fix the database connection.

### Auth issues

- First registered user becomes admin automatically
- JWT tokens expire after 7 days
- If locked out, update `user_roles` table directly in Supabase Table Editor

---

## 15. Cost Summary

### Current Services

| Service | Plan | Cost |
|---------|------|------|
| feedback-server | Render Free tier | $0/month (spins down after 15 min) |
| feedback-db | Render Basic 256MB | $7/month (fallback, currently unused) |
| feedback-admin | Render Static (free) | $0/month |
| Supabase (primary DB) | Free tier | $0/month |
| **Total** | | **$7/month** |

### Notes

- Free-tier server spins down after 15 min inactivity. First request takes ~30 seconds.
- Upgrade server to Starter ($7/month) for always-on. Total becomes $14/month.
- Supabase free tier: 500MB storage, 2GB bandwidth, 50K monthly active users.
- The Render `feedback-db` ($7/month) can be removed if you're fully on Supabase — saves $7/month.

---

## API Endpoints Reference

### Public (No Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/feedback` | Submit feedback (used by npm package) |
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login and get JWT token |
| `GET` | `/health` | Health check |
| `GET` | `/api/plans` | List available plans |

### Authenticated (Requires JWT)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/me` | Get current user info |
| `GET` | `/api/feedback` | List feedback (filters: type, project_id, status, priority, limit, offset) |
| `GET` | `/api/feedback/stats/summary` | Analytics summary |
| `GET` | `/api/feedback/:id` | Single feedback with full context |
| `PATCH` | `/api/feedback/:id` | Update status, priority, labels, resolution note |
| `GET` | `/api/projects` | List projects |
| `POST` | `/api/projects` | Create a project |
| `GET` | `/api/projects/:id` | Get project details |
| `GET` | `/api/projects/:id/plan-status` | Check plan limits and usage |
| `GET` | `/api/projects/:id/usage` | Monthly usage breakdown |
| `GET` | `/api/projects/:id/members` | List project members |
| `POST` | `/api/projects/:id/members` | Add a member |
| `DELETE` | `/api/projects/:id/members/:user_id` | Remove a member |
| `GET` | `/api/notifications` | Get user's notifications |
| `PATCH` | `/api/notifications/:id/read` | Mark notification as read |
| `PATCH` | `/api/notifications/read-all` | Mark all as read |
| `WS` | `/api/notifications/ws` | WebSocket for real-time notification push |

### Admin Only (Requires JWT + Admin Role)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/users` | List all users |
| `PATCH` | `/api/auth/users/:user_id` | Update user role (admin/user) |
| `GET` | `/api/auth/role` | Get current user's role |
