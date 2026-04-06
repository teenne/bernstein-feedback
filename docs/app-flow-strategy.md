# Bernstein Feedback System - Architecture & Flow Document

## 1. System Overview

Bernstein Feedback is a complete feedback collection system with three parts:

| Component | Tech Stack | Port | Purpose |
|-----------|-----------|------|---------|
| **Feedback Widget** | React 18 + TypeScript + Tailwind | - | Drop-in UI component for any React app |
| **Admin Dashboard** | React + Vite + React Router | 5174 | Manage projects, users, view feedback, analytics |
| **Node Server** | Express + PostgreSQL + Zod | 3000 | REST API, stores feedback, validates projects |

---

## 2. Architecture Diagram

```
                         CONSUMER APPS
                    (any website or React app)
                              |
             +----------------+----------------+
             |                |                |
        React Package    Script Tag       Direct API
        npm install      <script>         POST /api/...
             |                |                |
             +----------------+----------------+
                              |
                    +---------+---------+
                    |                   |
              autoAdapter          supabaseAdapter
              (default)            (direct to DB)
                    |                   |
                    v                   v
            +--------------+    +--------------+
            | Node Server  |    | Supabase     |
            | :3000        |    | (cloud)      |
            | Express API  |    | Direct DB    |
            +--------------+    +--------------+
                   |                   |
            +------+-------------------+
            |       PostgreSQL         |
            |  (local / Render /       |
            |   Supabase)              |
            +--------------------------+
                   |
            +--------------+
            | Admin Portal |
            | :5174        |
            | Dashboard    |
            +--------------+
```

---

## 3. Complete User Flow

### 3.1 First Time Setup

```
1. Run supabase-setup.sql in Supabase SQL Editor
   (creates tables, functions, triggers, RLS policies)

2. First user signs up via Admin Portal
   -> Supabase Auth (Google / GitHub / Email+Password)
   -> Trigger auto-creates user_roles row
   -> First user automatically becomes ADMIN
   -> Every subsequent signup gets USER role
```

### 3.2 Admin Creates a Project

```
Admin logs into Admin Portal
    -> Authentication (Supabase OAuth or local password)
    -> Clicks "Admin Portal" tab
    -> Clicks "+ New Project"
    -> Modal form: Project ID (required), Display Name (optional)
    -> Supabase: INSERT into projects with owner_id = auth.uid()
    -> Node server fallback: POST /api/projects
    -> Project appears in sidebar + project cards
    -> Admin can configure settings, add team members
```

### 3.3 Admin Assigns Team Members

```
Admin selects project in Admin Portal sidebar
    -> "Team Members" section shows
    -> Enter user email -> Click "Add"
    -> Looks up user_id from user_roles table
    -> Inserts into project_members table
    -> Member can now see the project + its feedback
```

### 3.4 Developer Integrates Widget

Three integration methods are available:

#### Method A: React Component (recommended)

```tsx
npm install @bernstein/feedback

import { FeedbackProvider, FeedbackButton, FeedbackDialog, FeedbackToast } from "@bernstein/feedback";
import { autoAdapter } from "@bernstein/feedback/adapters";
import "@bernstein/feedback/styles.css";

function App() {
  return (
    <FeedbackProvider config={{
      projectId: "my-app",
      adapter: autoAdapter({
        localServerUrl: "https://feedback-server.onrender.com",
      }),
    }}>
      <YourApp />
      <FeedbackButton />
      <FeedbackDialog />
      <FeedbackToast />
    </FeedbackProvider>
  );
}
```

#### Method B: Script Tag (no React needed)

```html
<script
  src="https://cdn.bernstein.ai/widget.js"
  data-project-id="my-app"
  data-adapter-id="local">
</script>
```

#### Method C: Direct API (any language)

```bash
curl -X POST https://feedback-server.onrender.com/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"project_id":"my-app","type":"feedback","title":"Great feature!"}'
```

### 3.5 End User Submits Feedback

```
User clicks "Feedback" button
    -> FeedbackDialog opens (3 tabs: Feedback / Feature Request / Bug Report)
    -> User fills: title, description, category, severity
    -> Background auto-capture:
        - Current URL, viewport, user agent
        - Console errors (last 10)
        - Network failures (last 5)
        - Click/navigation breadcrumbs (last 20)
    -> Optional: screenshot, element highlight, email
    -> Auto-redaction: emails, tokens, SSNs, API keys stripped
    -> Submit
    -> adapter.submit(event) called
    -> Supabase adapter: INSERT directly into feedback table
    -> HTTP adapter: POST /api/feedback with project_id
    -> Success toast shown to user
```

### 3.6 Admin Reviews Feedback

```
Admin opens Admin Portal -> /feedback page
    -> Project dropdown filter (shows all projects for admin)
    -> Type filter (Feedback / Bug / Feature)
    -> Table displays: type, title, project, severity, screenshots, time
    -> Click any row -> Detail page
        - Full description
        - Console errors captured
        - Network errors (endpoint, status, duration)
        - User breadcrumbs (click/navigation timeline)
        - Browser context (user agent, viewport, language)
        - Screenshots (downloadable)
        - Highlighted element info
    -> /stats page
        - Total feedback count
        - Breakdown by type (bar chart)
        - Breakdown by severity (bar chart)
        - Filterable by project
```

---

## 4. Database Schema

### 4.1 `user_roles` Table

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Auto-generated |
| user_id | UUID (FK -> auth.users) | Supabase auth user ID |
| email | TEXT | User's email |
| role | TEXT | "admin" or "user" |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last role change |

First user auto-assigned `admin` via trigger. Everyone else gets `user`.

### 4.2 `projects` Table

| Column | Type | Purpose |
|--------|------|---------|
| id | TEXT (PK) | Project identifier (e.g., "my-app") |
| name | TEXT | Display name |
| owner_id | UUID (FK -> auth.users) | Admin who created it |
| owner_email | TEXT | Owner's email |
| plan | TEXT | "free" or "pro" |
| config | JSONB | Widget configuration (theme, limits, etc.) |
| api_key | TEXT | Auto-generated API key |
| created_at | TIMESTAMPTZ | Creation timestamp |

### 4.3 `project_members` Table

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Auto-generated |
| project_id | TEXT (FK -> projects) | Which project |
| user_id | UUID (FK -> auth.users) | Which user |
| email | TEXT | Member's email |
| role | TEXT | "owner", "member", or "viewer" |
| created_at | TIMESTAMPTZ | When added |

### 4.4 `feedback` Table

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Auto-generated feedback ID |
| project_id | TEXT | Links to projects.id |
| type | TEXT | "feedback", "bug_report", or "feature_request" |
| title | TEXT | User-provided title |
| description | TEXT | User-provided description |
| category | TEXT | Bug/improvement/feature/question/other |
| severity | TEXT | low/medium/high/critical |
| impact | TEXT | blocks_me/annoying/minor |
| email | TEXT | Optional user email |
| url | TEXT | Page URL where feedback was submitted |
| route | TEXT | Frontend route |
| screen_id | TEXT | Stable screen identifier |
| page_name | TEXT | Human-readable page name |
| context | JSONB | Full captured context blob |
| metadata | JSONB | Custom key-value metadata |
| screenshots | JSONB | Array of base64 screenshots or URLs |
| highlighted_element | JSONB | Element the user highlighted |
| user_id | TEXT | Optional user identifier |
| tenant_id | TEXT | Optional tenant/org identifier |
| role | TEXT | Optional user role |
| bernstein_run_id | UUID | Session/deployment correlation ID |
| created_at | TIMESTAMPTZ | Submission timestamp |

### 4.5 `feedback_context` Table

Separated heavy technical data for performance:

| Column | Type | Purpose |
|--------|------|---------|
| feedback_id | UUID (FK) | Links to feedback.id |
| viewport | JSONB | Screen dimensions |
| user_agent | TEXT | Browser user agent |
| console_errors | JSONB | Array of captured console errors |
| network_errors | JSONB | Array of failed network requests |
| breadcrumbs | JSONB | Array of user actions |

---

## 5. API Endpoints

### User Roles API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/role` | Register/login user, auto-assign role (first = admin) |
| GET | `/api/auth/users` | List all users with roles |
| PATCH | `/api/auth/users/:user_id` | Update user role (promote/demote) |

### Projects API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects` | Create a new project |
| GET | `/api/projects` | List projects (filter: `?owner_email=`) |
| GET | `/api/projects/:id` | Get single project |
| PATCH | `/api/projects/:id` | Update project (name, plan, config) |
| DELETE | `/api/projects/:id` | Delete project |

### Project Members API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:id/members` | List members of a project |
| POST | `/api/projects/:id/members` | Add member (by email) |
| DELETE | `/api/projects/:id/members/:user_id` | Remove member |

### Feedback API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/feedback` | Submit feedback |
| GET | `/api/feedback` | List feedback (filters: `project_id`, `type`, `severity`, `limit`, `offset`) |
| GET | `/api/feedback/:id` | Get single feedback with full context |
| GET | `/api/feedback/stats/summary` | Aggregated stats (filter: `?project_id=`) |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Database health check |

---

## 6. Adapter System

The feedback widget uses a pluggable adapter pattern to decide where data is sent:

| Adapter | Use Case | Data Destination |
|---------|----------|-----------------|
| `autoAdapter()` | Default - auto-switches | Supabase if keys exist, else Node server |
| `httpAdapter()` | Custom REST API | Any HTTP endpoint |
| `supabaseAdapter()` | Direct to Supabase | Supabase cloud DB |
| `consoleAdapter()` | Development/testing | Browser console only |
| `localStorageAdapter()` | Offline/demo | Browser localStorage |
| `webhookAdapter()` | Team notifications | Slack, Discord, Microsoft Teams |

### Admin Panel Adapter Selection

The admin Settings page lets you choose the adapter:
- **Local** (default) -> sends to Node server via httpAdapter
- **Supabase** -> sends directly to Supabase via supabaseAdapter
- **Console** -> logs to browser console (testing only)

---

## 7. Authentication & Authorization

### Dynamic Role System (Database-Driven)

Roles are stored in the `user_roles` table, not hardcoded in `.env`.

```
User signs up (Supabase Auth)
    -> Trigger: handle_new_user()
    -> First user -> role = 'admin'
    -> Every other user -> role = 'user'
    -> Admin can promote/demote via /admin/users page
```

### Login Methods

| Method | How |
|--------|-----|
| Email/Password | Sign up + confirm email (or disable confirmation in Supabase) |
| Google OAuth | Enable in Supabase Dashboard > Auth > Providers |
| GitHub OAuth | Enable in Supabase Dashboard > Auth > Providers |
| Local (no Supabase) | Password from VITE_ADMIN_PASSWORD env var |

### User Roles

| Role | Determined by | Access |
|------|--------------|--------|
| Admin | `user_roles.role = 'admin'` | All projects, Admin Portal, Users page, Developer Override |
| User (owner) | Created the project | Own projects + feedback |
| User (member) | Added to project via project_members | Member projects + feedback |

### Row Level Security (RLS)

Supabase RLS policies enforce access at the database level:

| Table | Admin | Owner | Member | Public |
|-------|-------|-------|--------|--------|
| user_roles | Read all, update all | Read own | Read own | - |
| projects | Read/update/delete all | CRUD own | Read member projects | - |
| project_members | Manage all | Manage own projects | Read own membership | - |
| feedback | Read all | Read own project feedback | Read member project feedback | Insert (submit) |

Helper functions (SECURITY DEFINER to avoid circular RLS):
- `is_admin()` -> checks if current user has admin role
- `is_project_owner(project_id)` -> checks if current user owns the project
- `is_project_member(project_id)` -> checks if current user is a member
- `user_project_ids()` -> returns all project IDs user can access

### Feedback Submission

- No authentication required (public submission)
- Project ID stored with feedback
- RLS controls who can read feedback

---

## 8. Plan System (Free vs Pro)

| Feature | Free | Pro |
|---------|------|-----|
| Feedback submission | Yes | Yes |
| All adapters | Yes | Yes |
| Custom theme color | No (amber only) | Yes |
| Hide branding | No | Yes |
| Custom diagnostic limits | No (defaults) | Yes |
| Custom toast duration | No | Yes |

Plan is set per project in the `projects` table. Admin can upgrade/downgrade from Admin Portal.

---

## 9. Privacy & Security

### Auto-Captured (always safe)

- Page URL (redacted query params)
- Viewport dimensions, language, user agent
- Console error messages (no stack traces with user data)
- Network error metadata only (endpoint, status code, duration - no request/response bodies)
- User click/navigation breadcrumbs (element type + text, no form values)

### Never Captured

- Form input values or keystrokes
- Request/response bodies
- Cookies or session tokens
- localStorage or sessionStorage contents

### Auto-Redacted Before Submission

- Email addresses
- Phone numbers
- Credit card numbers
- API keys and tokens
- Social Security Numbers
- Custom patterns via `redact` config option

### User Consent Toggles

Users see toggles in the feedback dialog to opt in/out of:
- Technical details (console errors, network errors)
- Recent steps (breadcrumbs)
- Email sharing

---

## 10. Deployment Strategy

### Development (Local with PostgreSQL + Supabase Auth)

```bash
# One-time: Setup local PostgreSQL database
# Requires PostgreSQL installed (psql in PATH or use full path)
psql -U postgres -c "CREATE DATABASE feedback_db"
psql -U postgres -d feedback_db -f server/init.sql

# Terminal 1: Start Node server (connects to local PostgreSQL)
cd server && npm run dev              # http://localhost:3000

# Terminal 2: Start admin dashboard (connects to Supabase for auth)
cd apps/admin && npm run dev          # http://localhost:5174

# Terminal 3: Start widget dev
cd packages/feedback && npm run dev   # http://localhost:5173
```

Note: `server/init.sql` auto-enables the `pgcrypto` extension for `gen_random_bytes()`.
If psql is not in PATH on Windows: `"C:/Program Files/PostgreSQL/17/bin/psql" -U postgres ...`

### Dual Backend Support

The admin panel supports **two backend modes** that work identically:

| Feature | Supabase Direct | Node Server (Local) |
|---------|----------------|-------------------|
| Auth | Supabase Auth (OAuth/email) | Supabase Auth (same) |
| Role check | Queries `user_roles` via Supabase | Queries `user_roles` via `/api/auth/role` |
| Project CRUD | Direct DB with RLS | REST API `/api/projects` |
| Member management | Direct DB with RLS | REST API `/api/projects/:id/members` |
| Feedback storage | Direct DB insert | REST API `/api/feedback` |
| Access control | Supabase RLS policies | Server-side `user_id` filtering |

**Switching between modes:** Settings page > Storage Adapter > Local / Supabase / Console.

Both paths use the same `owner_id` and `user_id` fields. The Node server schema (`server/init.sql`) is aligned with the Supabase schema (`examples/supabase-setup.sql`).

### Production

| Service | Platform | Config |
|---------|----------|--------|
| Node Server | Render Web Service | Build: `npm install && npm run build`, Start: `npm start` |
| PostgreSQL | Render PostgreSQL / Supabase | Connection via DB_HOST env var |
| Admin Dashboard | Vercel / Render Static | Build: `npm run build`, Output: `dist/` |
| Widget CDN | npm registry / CDN | `npm install @bernstein/feedback` |

### Environment Variables

**Server (.env)**
```
DB_HOST=127.0.0.1                     # Local PostgreSQL (or db.xxx.supabase.co for cloud)
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-password
DB_NAME=feedback_db                    # Local DB name (or 'postgres' for Supabase)
PORT=3000
```

**Admin App (.env)**
```
VITE_SUPABASE_URL=https://xxx.supabase.co     # Required for Supabase auth + direct mode
VITE_SUPABASE_ANON_KEY=eyJhb...               # Required for Supabase auth + direct mode
VITE_API_URL=http://localhost:3000             # Node server URL (used by 'Local' adapter)
VITE_ADMIN_PASSWORD=admin                      # For local auth mode only (no Supabase)
```

---

## 11. Widget Features

- **Three feedback modes** - Feedback, Feature Request, Bug Report with tabbed UI
- **Automatic context capture** - URL, viewport, console errors, network failures, breadcrumbs
- **Element highlighting** - users click any element to attach it to their report
- **Screenshot capture** - html-to-image with inline preview
- **Privacy-safe by default** - no request bodies, form values, or keystrokes
- **Auto-redaction** - emails, phone numbers, credit cards, API keys, tokens, SSNs
- **Consent toggles** - users choose what to include
- **Dark mode** - class-based with CSS custom properties
- **CSS isolation** - all Tailwind classes prefixed with `bf-` to avoid conflicts
- **Themeable** - override colors via CSS variables
- **Error boundary** - FeedbackErrorBoundary wraps widget to prevent host app crashes

---

## 12. File Structure

```
lib-bernstein-feedback/
+-- packages/feedback/          # NPM package (@bernstein/feedback)
|   +-- src/
|   |   +-- adapters/           # http, supabase, webhook, auto, console, localStorage
|   |   +-- components/         # FeedbackDialog, FeedbackButton, FeedbackToast, etc.
|   |   +-- hooks/              # useFeedbackConfig, useSubscription
|   |   +-- utils/              # redact.ts, dom.ts
|   |   +-- context.tsx         # FeedbackProvider + useFeedback hook
|   |   +-- schemas.ts          # Zod schemas + TypeScript types
|   |   +-- embed.tsx           # Script tag auto-initialization
|   |   +-- index.ts            # Public exports
|   +-- dist/                   # Built output (ESM, CJS, CSS)
|
+-- apps/admin/                 # Admin Dashboard
|   +-- src/
|       +-- auth/               # AuthGateway, LoginPage, LocalLoginPage, Dashboard
|       +-- pages/              # FeedbackList, FeedbackDetail, Stats, Demo, Settings, UserManagement
|       +-- hooks/              # useAuth, useFeedbackConfig, useSubscription
|       +-- components/         # GlassCard, LayoutWrapper
|       +-- lib/                # supabaseClient, feedbackApi
|
+-- server/                     # Node.js API Server
|   +-- src/
|   |   +-- index.ts            # Express routes (auth, projects, members, feedback CRUD)
|   |   +-- db.ts               # PostgreSQL connection with retry + in-memory fallback
|   +-- init.sql                # Database schema (user_roles, projects, project_members, feedback)
|
+-- examples/
|   +-- supabase-setup.sql          # Full Supabase schema with RLS policies
|   +-- migration-user-roles.sql    # Migration: add user_roles + dynamic admin
|   +-- migration-project-members.sql # Migration: add project_members + access control
|
+-- docs/
    +-- app-flow-strategy.md    # This document
    +-- configuration.md        # FeedbackProvider config options
    +-- adapters.md             # Adapter usage guide
    +-- theming.md              # CSS variables and dark mode
```

---

## 13. Integration Checklist for Consumer Apps

1. Get **Project ID** and **Server URL** from admin
2. Install: `npm install @bernstein/feedback`
3. Import styles: `import "@bernstein/feedback/styles.css"`
4. Wrap app with `<FeedbackProvider config={{ projectId, adapter }}>`
5. Add `<FeedbackButton />` for the floating trigger
6. Add `<FeedbackDialog />` for the modal
7. Add `<FeedbackToast />` for success/error notifications
8. Optionally configure: `appVersion`, `userId`, `env`, `screenId`
9. Test with `consoleAdapter()` first, then switch to `autoAdapter()`
10. Deploy with production server URL in `autoAdapter({ localServerUrl })`

---

## 14. SQL Setup Order

### Fresh Install (Supabase)

Run `examples/supabase-setup.sql` in Supabase SQL Editor (split into 4 parts if needed).

### Existing Database Migrations

1. `examples/migration-user-roles.sql` - Adds dynamic admin system
2. `examples/migration-project-members.sql` - Adds team member access

### Node Server (Local PostgreSQL)

Run `server/init.sql` to create all tables.
