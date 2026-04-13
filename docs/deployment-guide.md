# Feedback Platform — Complete Deployment Guide

This guide covers everything needed to deploy, maintain, and integrate the Bernstein Feedback system. It includes the npm package (`akk-feedback`), the Express API server, the PostgreSQL database, and the admin panel.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Repository Structure](#2-repository-structure)
3. [Render Services (What's Deployed)](#3-render-services-whats-deployed)
4. [First-Time Deployment (From Scratch)](#4-first-time-deployment-from-scratch)
5. [Environment Variables Reference](#5-environment-variables-reference)
6. [Database Setup & Migration](#6-database-setup--migration)
7. [Publishing the npm Package](#7-publishing-the-npm-package)
8. [Integrating the Package in a Project](#8-integrating-the-package-in-a-project)
9. [Using the Admin Panel](#9-using-the-admin-panel)
10. [Local Development Setup](#10-local-development-setup)
11. [Redeployment & Updates](#11-redeployment--updates)
12. [Troubleshooting](#12-troubleshooting)
13. [Cost Summary](#13-cost-summary)

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
|  Widget sends       |       |  User Management     |       |                     |
|  feedback via HTTP  |       |                      |       |  Login with          |
+---------------------+       +----------+-----------+       |  email/password     |
                                         |                   +---------------------+
                               +---------v----------+
                               |    feedback-db     |
                               |    (PostgreSQL)    |
                               |                    |
                               |  Tables:           |
                               |  - feedback        |
                               |  - feedback_context|
                               |  - user_roles      |
                               |  - projects        |
                               |  - project_members |
                               +--------------------+
```

### How it works:

1. A developer installs `akk-feedback` (npm package) in their React app
2. The widget shows a floating feedback button in the app
3. When a user submits feedback, the widget sends it to `feedback-server`
4. The server stores it in `feedback-db` (PostgreSQL)
5. Team members open `feedback-admin` to view and manage all feedback

Each feedback entry is tagged with a `project_id` (e.g., "meraki", "bas-core"), so the admin panel can filter by project.

---

## 2. Repository Structure

```
lib-bernstein-feedback/
|
+-- packages/feedback/        # npm package (akk-feedback)
|   +-- src/                  # Widget source code (React components, adapters, schemas)
|   +-- dist/                 # Built output (ESM, CJS, types, CSS)
|   +-- package.json          # Published as "akk-feedback" on npm
|
+-- server/                   # Express API server
|   +-- src/
|   |   +-- index.ts          # All API routes (auth, feedback, projects)
|   |   +-- db.ts             # Database connection (PostgreSQL / in-memory fallback)
|   |   +-- migrate.ts        # Migration script (runs init.sql)
|   +-- init.sql              # Database schema (all tables and indexes)
|   +-- package.json          # Server dependencies
|   +-- .env.example          # Environment variable template
|
+-- apps/admin/               # Admin panel (React SPA)
|   +-- src/
|   |   +-- App.tsx           # Main app with routing
|   |   +-- pages/            # FeedbackList, FeedbackDetail, Stats, Settings, UserManagement
|   |   +-- lib/feedbackApi.ts # API client for fetching feedback
|   |   +-- hooks/            # Auth, config hooks
|   |   +-- auth/             # Login, Register, Dashboard pages
|   +-- .env.example          # Environment variable template
|   +-- package.json          # Uses akk-feedback from npm
|
+-- render.yaml               # Render Blueprint (defines all 3 services)
+-- docs/                     # Documentation
```

---

## 3. Render Services (What's Deployed)

| Service Name | Type | Runtime | Region | What It Does |
|-------------|------|---------|--------|--------------|
| **feedback-server** | Web Service | Node.js | Oregon | Express API — receives and serves feedback data |
| **feedback-db** | Database | PostgreSQL 18 | Oregon | Stores all feedback, users, projects |
| **feedback-admin** | Static Site | Static | Global | Admin dashboard to view/manage feedback |

All three are defined in `render.yaml` at the project root and deployed together via Render Blueprints.

---

## 4. First-Time Deployment (From Scratch)

If you need to deploy this system for the first time on a new Render account:

### Step 1: Create Blueprint on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **Blueprints** in the left sidebar
3. Click **New Blueprint Instance**
4. Connect your GitHub repo: `basglobal/lib-bernstein-feedback`
5. Select the **Staging** branch (or whichever branch has `render.yaml`)
6. Name it: `feedback-platform`
7. Render will detect `render.yaml` and show 3 services to create

### Step 2: Set Environment Variables

Before clicking "Apply", fill in the env vars Render asks for:

**For feedback-admin (static site):**

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_API_URL` | `https://feedback-server-XXXX.onrender.com` | Set AFTER server deploys. Get URL from feedback-server dashboard. |
| `VITE_ADMIN_PASSWORD` | `your-secure-password` | Password for local auth login |
| `VITE_ADMIN_EMAILS` | `admin@example.com,dev@example.com` | Comma-separated admin emails |
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | Optional — enables Supabase auth |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Optional — enables Supabase auth |

**For feedback-server (auto-configured by Blueprint):**

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | Auto-injected by Render | Comes from feedback-db |
| `NODE_ENV` | `production` | Set in render.yaml |
| `JWT_SECRET` | Auto-generated by Render | Used for auth tokens |
| `ALLOWED_ORIGINS` | Admin URL + client app URLs | Comma-separated, set in render.yaml |

### Step 3: Apply and Wait

Click **Apply** — Render provisions all 3 services. This takes 3-5 minutes.

### Step 4: Run Database Migration

1. Go to **feedback-server** on Render dashboard
2. Click the **Shell** tab
3. Run:
   ```bash
   npm run migrate
   ```
4. You should see: `Migration completed successfully.`

This creates all 5 tables: `user_roles`, `projects`, `project_members`, `feedback`, `feedback_context`.

### Step 5: Set VITE_API_URL

1. Go to **feedback-server** → copy the service URL (e.g., `https://feedback-server-abc123.onrender.com`)
2. Go to **feedback-admin** → **Environment** tab
3. Set `VITE_API_URL` = the server URL you copied
4. Click **Save Changes**
5. Go to **Manual Deploy** → click **Deploy latest commit** (VITE_ vars are baked at build time, so a redeploy is required)

### Step 6: Verify

1. Visit `https://feedback-server-XXXX.onrender.com/health`
   - Expected: `{"status":"ok","db":"connected"}`

2. Visit `https://feedback-admin-XXXX.onrender.com`
   - You should see the login page
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
       "timestamp": "2026-04-07T00:00:00.000Z",
       "context": {}
     }'
   ```
   - Expected: `{"success":true,"id":"some-uuid"}`
   - Check the admin panel — the feedback should appear in the list

---

## 5. Environment Variables Reference

### feedback-server (Express API)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes (production) | — | PostgreSQL connection string. Render auto-injects this. |
| `DB_HOST` | No | `127.0.0.1` | Used only if `DATABASE_URL` is not set (local dev) |
| `DB_PORT` | No | `5432` | Used only if `DATABASE_URL` is not set |
| `DB_USER` | No | `postgres` | Used only if `DATABASE_URL` is not set |
| `DB_PASSWORD` | No | `postgres` | Used only if `DATABASE_URL` is not set |
| `DB_NAME` | No | `postgres` | Used only if `DATABASE_URL` is not set |
| `DB_SSL` | No | `true` | Set to `false` for local development (no SSL) |
| `PORT` | No | `3000` | Render sets this automatically |
| `NODE_ENV` | No | `development` | Set to `production` on Render |
| `JWT_SECRET` | Yes (production) | fallback string | Secret key for signing auth tokens. **Must be a secure random string in production.** |
| `ALLOWED_ORIGINS` | No | `*` (all origins) | Comma-separated list of allowed CORS origins. Set to admin panel URL + client app URLs. |

### feedback-admin (Static Site)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | Yes | `http://localhost:3000` | URL of the feedback-server. **Must be the Render URL in production.** |
| `VITE_ADMIN_PASSWORD` | No | `admin` | Password for local auth (when Supabase is not configured) |
| `VITE_ADMIN_EMAILS` | No | — | Comma-separated emails that get admin privileges |
| `VITE_SUPABASE_URL` | No | — | Supabase project URL. If set, enables Supabase auth. |
| `VITE_SUPABASE_ANON_KEY` | No | — | Supabase anonymous key. Required if `VITE_SUPABASE_URL` is set. |

**Important:** All `VITE_` variables are embedded into the static build at compile time. If you change any of them, you **must redeploy** feedback-admin for changes to take effect.

---

## 6. Database Setup & Migration

### Schema (init.sql)

The database has 5 tables:

| Table | Purpose |
|-------|---------|
| `user_roles` | Admin users — email, password hash, role (admin/user). First registered user becomes admin. |
| `projects` | Registered apps that can send feedback. Has API key, config, owner info. |
| `project_members` | Maps users to projects with roles (owner/member/viewer). |
| `feedback` | Core feedback data — title, description, type, severity, screenshots, etc. |
| `feedback_context` | Technical context (console errors, network errors, breadcrumbs, viewport). Separated for performance. |

### Running Migration

**On Render (production):**
1. Go to feedback-server → Shell tab
2. Run: `npm run migrate`

**Locally:**
1. Start PostgreSQL (via Docker Compose):
   ```bash
   cd server
   docker-compose up -d
   ```
2. Run migration:
   ```bash
   npm run build && npm run migrate
   ```

### Re-running Migration

The migration script runs `DROP TABLE IF EXISTS` before creating tables. **This will delete all existing data.** Only re-run if you need to reset the schema.

For incremental schema changes, manually run SQL via the Render Shell:
```bash
# Connect to the database
psql $DATABASE_URL

# Run your ALTER TABLE or CREATE TABLE commands
```

---

## 7. Publishing the npm Package

The feedback widget is published as `akk-feedback` on [npmjs.com](https://www.npmjs.com/package/akk-feedback).

### Prerequisites

- npm account: `shwetatrivedi` (or whoever has publish access)
- Granular access token with "Bypass 2FA" enabled

### Steps to Publish a New Version

1. **Update the version** in `packages/feedback/package.json`:
   ```json
   "version": "1.0.2"
   ```
   Use [semver](https://semver.org/):
   - Patch (`1.0.1` → `1.0.2`): bug fixes
   - Minor (`1.0.2` → `1.1.0`): new features, backward-compatible
   - Major (`1.1.0` → `2.0.0`): breaking changes

2. **Login to npm** (if not already):
   ```bash
   npm login
   ```

3. **Publish**:
   ```bash
   cd packages/feedback
   npm publish --access public
   ```
   This automatically runs `npm run build` before publishing (via `prepublishOnly` hook).

4. **Verify**:
   ```bash
   npm view akk-feedback version
   ```

### What Gets Published

The `files` field in package.json controls what's included:
- `dist/` — compiled JS (ESM + CJS), TypeScript declarations, CSS
- `README.md`

Source code (`src/`) is NOT published.

---

## 8. Integrating the Package in a Project

### Install

```bash
npm install akk-feedback
```

### Basic Setup (3 steps)

**Step 1:** Import styles in your app entry point (e.g., `main.tsx` or `App.tsx`):

```tsx
import 'akk-feedback/styles.css';
```

**Step 2:** Wrap your app with `FeedbackProvider`:

```tsx
import {
  FeedbackProvider,
  FeedbackButton,
  FeedbackDialog,
  FeedbackToast
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

**Step 3:** That's it. The floating button appears in the bottom-right corner. Users click it, fill in feedback, and it's sent to the server.

### Full Config Options

```tsx
<FeedbackProvider
  config={{
    // Required
    projectId: 'meraki',
    adapter: httpAdapter({
      endpoint: 'https://feedback-server-XXXX.onrender.com/api/feedback',
    }),

    // Optional — User Identity
    userId: currentUser.id,
    tenantId: 'org-123',
    role: 'admin',

    // Optional — Build Identity
    appVersion: '2.1.0',
    buildSha: 'abc123',
    env: 'production',

    // Optional — Screen Identity (update on navigation)
    screenId: 'checkout',
    pageName: 'Checkout Page',

    // Optional — Capture Limits
    maxConsoleErrors: 10,
    maxNetworkErrors: 5,
    maxBreadcrumbs: 20,

    // Optional — Privacy
    redact: [/custom-secret-pattern/gi],
  }}
>
```

### Programmatic API

```tsx
import { useFeedback } from 'akk-feedback';

function MyComponent() {
  const {
    openFeedback,       // Open dialog in feedback mode
    openBugReport,      // Open dialog in bug report mode
    reportBug,          // Pre-fill and open bug report
    addBreadcrumb,      // Track custom user actions
    captureContext,     // Get current context snapshot
    lastReportId,       // ID of last submitted report
    setScreen,          // Update screen identity
  } = useFeedback();

  return (
    <>
      <button onClick={() => openFeedback()}>Give Feedback</button>
      <button onClick={() => reportBug({ title: 'Page crashed' })}>Report Bug</button>
    </>
  );
}
```

### Available Adapters

```tsx
import {
  httpAdapter,          // Send to REST endpoint (recommended for production)
  supabaseAdapter,      // Send directly to Supabase
  consoleAdapter,       // Log to browser console (development)
  localStorageAdapter,  // Store in localStorage (testing)
  webhookAdapter,       // Send to webhook URL
  autoAdapter,          // Auto-selects based on available config
} from 'akk-feedback/adapters';
```

### Currently Integrated Projects

| Project | Render Service | projectId |
|---------|---------------|-----------|
| Meraki | `meraki-frontend` | `meraki` |
| BAS Core | `bas-core-react` | `bas-core` |
| Feedback Admin | `feedback-admin` | `feedback-admin` |

---

## 9. Using the Admin Panel

### URL

`https://feedback-admin-XXXX.onrender.com` (replace with your actual Render URL)

### First-Time Setup

1. Open the admin panel URL
2. Click **Register** and create an account with email + password
3. **The first user to register automatically becomes admin**
4. Additional users who register get the "user" role

### Features

| Page | What It Does |
|------|-------------|
| **Feedback** | List all feedback from all projects. Filter by type, project. Click any row for details. |
| **Feedback Detail** | Full details — title, description, screenshots, console errors, network failures, breadcrumbs, browser info. |
| **Stats** | Analytics summary — total count, breakdown by type and severity. |
| **Settings** | Widget configuration — theme color, dark mode, capture limits, adapter settings. |
| **Users** | Admin-only. Manage user roles (promote/demote admin). |
| **Demo** | Live demo of the feedback widget with test error triggers. |

### Auth System

- **With Supabase configured:** OAuth / email login via Supabase
- **Without Supabase:** Email + password login (stored in `user_roles` table via bcrypt)
- **JWT tokens:** 7-day expiry, stored in the browser

---

## 10. Local Development Setup

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL) or a local PostgreSQL instance

### Server (Express API)

```bash
cd server

# Start PostgreSQL
docker-compose up -d

# Install dependencies
npm install

# Copy env file and configure
cp .env.example .env

# Build and run migration
npm run build
npm run migrate

# Start dev server
npm run dev
# Server runs on http://127.0.0.1:3000
```

### Admin Panel

```bash
cd apps/admin

# Install dependencies
npm install

# Copy env file and configure
cp .env.example .env
# Edit .env — set VITE_API_URL=http://localhost:3000

# Start dev server
npm run dev
# Admin runs on http://localhost:5174
```

The admin panel's Vite config proxies `/api` requests to `localhost:3000`, so API calls work automatically in dev mode.

### Feedback Package (for development/testing)

```bash
cd packages/feedback

# Install dependencies
npm install

# Start dev server (runs example app)
npm run dev

# Run tests
npm run test

# Build
npm run build

# Type check
npm run typecheck
```

---

## 11. Redeployment & Updates

### When to Redeploy What

| Change Made | What to Redeploy | How |
|-------------|-----------------|-----|
| `server/src/*` changed | feedback-server | Auto-deploys on push to Staging branch |
| `apps/admin/src/*` changed | feedback-admin | Auto-deploys on push to Staging branch |
| `packages/feedback/src/*` changed | Publish new npm version | See [Section 7](#7-publishing-the-npm-package) |
| `server/init.sql` changed | Run migration | Render Shell → `npm run migrate` (WARNING: drops tables) |
| `VITE_*` env vars changed | feedback-admin | Must trigger **Manual Deploy** after changing env vars |
| `render.yaml` changed | All services | Push to repo → Render auto-syncs |

### Auto-Deploy

Both `feedback-server` and `feedback-admin` auto-deploy when you push to the `Staging` branch. Render watches the branch specified in the Blueprint.

### Manual Deploy

If auto-deploy is disabled or you need to force a redeploy:
1. Go to the service on Render dashboard
2. Click **Manual Deploy** → **Deploy latest commit**

---

## 12. Troubleshooting

### Server won't start

**Check logs:** Render dashboard → feedback-server → Logs tab

**Common issues:**
- `Cannot find module 'express'` → Build command needs `--include=dev`. Check render.yaml.
- `ECONNREFUSED` to database → Database not ready. Wait 1-2 minutes and retry.
- `relation "feedback" does not exist` → Migration not run. Go to Shell → `npm run migrate`.

### Admin panel shows "Failed to connect to server"

- Check `VITE_API_URL` is set correctly (must include `https://`, no trailing slash)
- Check CORS: `ALLOWED_ORIGINS` on the server must include the admin panel URL
- After changing `VITE_API_URL`, you **must redeploy** feedback-admin

### Database connection fails

- Check `DATABASE_URL` is set on feedback-server
- Visit `/health` endpoint — should return `{"status":"ok","db":"connected"}`
- If using in-memory fallback, the server logs will say "SWITCHING TO IN-MEMORY MODE"

### npm package not found

- Package is published as `akk-feedback` (not `@bernstein/feedback`)
- Verify: `npm view akk-feedback version`

### CORS errors in browser console

- Add the client app's origin URL to `ALLOWED_ORIGINS` on feedback-server
- Format: comma-separated, no spaces (e.g., `https://app1.onrender.com,https://app2.onrender.com`)
- Redeploy feedback-server after changing

### Auth issues

- First registered user becomes admin automatically
- JWT tokens expire after 7 days — user must re-login
- If locked out, connect to DB and update `user_roles` table directly

---

## 13. Cost Summary

### Current Render Services

| Service | Plan | Cost |
|---------|------|------|
| feedback-server | Free tier | $0/month (spins down after 15 min inactivity) |
| feedback-db | Basic 256MB | $7/month |
| feedback-admin | Static (free) | $0/month |
| **Total** | | **$7/month** |

### Notes

- Free-tier server spins down after 15 minutes of inactivity. First request after spin-down takes ~30 seconds.
- To keep the server always-on, upgrade to Starter plan ($7/month) — total becomes $14/month.
- Database has 256MB RAM and 1GB storage on the Basic plan. Sufficient for thousands of feedback entries.

---

## API Endpoints Reference

### Public (No Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/feedback` | Submit feedback (used by npm package) |
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login and get JWT token |
| `GET` | `/health` | Health check |

### Authenticated (Requires JWT)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/me` | Get current user info |
| `GET` | `/api/feedback` | List feedback (with filters: type, project_id, limit, offset) |
| `GET` | `/api/feedback/stats/summary` | Get analytics summary |
| `GET` | `/api/feedback/:id` | Get single feedback with full context |
| `GET` | `/api/projects` | List projects |
| `POST` | `/api/projects` | Create a project |
| `GET` | `/api/projects/:id` | Get project details |
| `GET` | `/api/projects/:id/members` | List project members |
| `POST` | `/api/projects/:id/members` | Add a member to project |
| `DELETE` | `/api/projects/:id/members/:user_id` | Remove a member |

### Admin Only (Requires JWT + Admin Role)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/users` | List all users |
| `PATCH` | `/api/auth/users/:user_id` | Update user role (admin/user) |
| `GET` | `/api/auth/role` | Get current user's role |
