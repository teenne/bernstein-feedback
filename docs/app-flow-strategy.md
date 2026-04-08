# Bernstein Feedback System - Architecture & Flow Document

## 1. System Overview

Bernstein Feedback is a complete feedback collection system with three parts:

| Component | Tech Stack | Port | Purpose |
|-----------|-----------|------|---------|
| **Feedback Widget** | React 18 + TypeScript + Tailwind | - | Drop-in UI component for any React app |
| **Admin Dashboard** | React + Vite + React Router | 5173/5174 | Manage projects, users, view feedback, analytics |
| **Node Server** | Express + PostgreSQL + Zod + JWT | 3000 | REST API with authentication, role-based access |

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
              httpAdapter          supabaseAdapter
              (default)            (direct to DB)
                    |                   |
                    v                   v
            +--------------+    +--------------+
            | Node Server  |    | Supabase     |
            | :3000        |    | (cloud)      |
            | Express + JWT|    | Direct DB    |
            +--------------+    +--------------+
                   |                   |
            +------+-------------------+
            |       PostgreSQL         |
            |  (local / Render /       |
            |   Supabase)              |
            +--------------------------+
                   ^
                   |
            +--------------+
            | Admin Portal |
            | :5173        |
            | Dashboard    |
            +--------------+
```

---

## 3. Dual Backend Support

The system works identically with **either** backend. The frontend auto-switches based on environment variables.

| Feature | Supabase Mode | Node Server Mode |
|---------|--------------|------------------|
| **Auth** | Supabase OAuth (Google/GitHub/Email) | Email + password with JWT tokens |
| **Signup** | Supabase Auth UI | Sign Up form → `POST /api/auth/register` |
| **Login** | Supabase Auth UI | Sign In form → `POST /api/auth/login` |
| **Role check** | Query `user_roles` via Supabase client | JWT payload contains role |
| **Project CRUD** | Direct DB with RLS | REST API `/api/projects` with `requireAuth` |
| **Member management** | Direct DB with RLS | REST API `/api/projects/:id/members` |
| **Feedback submission** | Supabase adapter (direct insert) | HTTP adapter → `POST /api/feedback` (no auth) |
| **Feedback reading** | Supabase RLS scopes by user | JWT middleware + role-based SQL filtering |
| **Access control** | Supabase RLS policies | Server-side `requireAuth` + `requireAdmin` middleware |

**How the frontend switches:**
```ts
// If both are set → Supabase mode
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhb...

// If empty/missing → Node server mode
VITE_API_URL=http://localhost:3000
```

---

## 4. Complete User Flows

### 4.1 First Time Setup (Node Server)

```
1. Setup PostgreSQL database
2. Run: cd server && npx ts-node src/migrate.ts  (creates all tables)
3. Start server: npm run dev
4. Start admin: cd apps/admin && npm run dev
5. First user signs up → automatically becomes ADMIN
6. Default project "feedback-admin" auto-created for first admin
```

### 4.2 First Time Setup (Supabase)

```
1. Run supabase-setup.sql in Supabase SQL Editor
2. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
3. First user signs up via OAuth
4. Trigger auto-creates user_roles row (first = admin)
```

### 4.3 Admin Creates a Project

```
Admin logs into Admin Portal
    → Click "Admin Portal" tab
    → Click "+ New Project"
    → Modal: Project ID (required), Display Name (optional)
    → Node server: POST /api/projects (with JWT auth)
    → Supabase: INSERT into projects with owner_id
    → Project appears in header dropdown + project list
    → Admin can configure settings, add team members
```

### 4.4 Auto-Created Projects

Projects are created automatically in two scenarios:

**Scenario A: First Admin Signup**
```
First admin signs up → no projects exist
    → System auto-creates project "feedback-admin"
    → Assigned to admin as owner
    → Appears in header dropdown immediately
```

**Scenario B: Feedback from Unknown Project**
```
External app sends: POST /api/feedback { project_id: "new-app", ... }
    → Server checks: project "new-app" exists?
    → No → Server auto-creates project "new-app"
    → Feedback saved under that project
    → Project visible in admin dashboard
```

### 4.5 Admin Assigns Team Members

```
Admin selects project in Admin Portal
    → "Members" section shows
    → Enter user email → Click "Add"
    → Looks up user_id from user_roles table
    → Inserts into project_members table
    → Member can now see the project + its feedback
```

### 4.6 Developer Integrates Widget

#### Method A: React Component (recommended)

```tsx
import { FeedbackProvider, FeedbackButton, FeedbackDialog, FeedbackToast } from "akk-feedback";
import { httpAdapter } from "akk-feedback/adapters";
import "akk-feedback/styles.css";

function App() {
  return (
    <FeedbackProvider config={{
      projectId: "my-app",
      adapter: httpAdapter({
        endpoint: "https://feedback-server.onrender.com/api/feedback",
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

#### Method B: Direct API (any language)

```bash
curl -X POST https://feedback-server.onrender.com/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"project_id":"my-app","type":"feedback","title":"Great feature!"}'
```

No authentication required for submitting feedback.

### 4.7 End User Submits Feedback

```
User clicks "Feedback" button
    → FeedbackDialog opens (3 tabs: Feedback / Feature Request / Bug Report)
    → User fills: title, description, category, severity
    → Background auto-capture:
        - Current URL, viewport, user agent
        - Console errors (last 10)
        - Network failures (last 5)
        - Click/navigation breadcrumbs (last 20)
    → Optional: screenshot, element highlight, email
    → Auto-redaction: emails, tokens, SSNs, API keys stripped
    → Client validates: project_id not empty
    → Submit → adapter.submit(event)
    → HTTP adapter: POST /api/feedback (no auth, project auto-created if missing)
    → Supabase adapter: INSERT directly into feedback table
    → Success toast shown to user
```

### 4.8 Admin Reviews Feedback

```
Admin opens Admin Portal → /feedback page
    → Project dropdown filter (shows ALL projects including auto-created ones)
    → Type filter (Feedback / Bug / Feature)
    → Table displays: type, title, project, severity, screenshots, time
    → Click any row → Detail page:
        - Full description
        - Console errors captured
        - Network errors (endpoint, status, duration)
        - User breadcrumbs (click/navigation timeline)
        - Browser context (user agent, viewport, language)
        - Screenshots (downloadable)
        - Highlighted element info
    → /stats page:
        - Total feedback count
        - Breakdown by type (bar chart)
        - Breakdown by severity (bar chart)
        - Filterable by project
```

---

## 5. Authentication & Authorization

### 5.1 Node Server Auth (JWT)

```
Register: POST /api/auth/register { email, password }
    → Validates email uniqueness, password min 6 chars
    → bcrypt hash → stored in user_roles.password_hash
    → First user = admin, rest = user
    → Returns JWT token (7-day expiry)

Login: POST /api/auth/login { email, password }
    → bcrypt compare → returns JWT token

All protected API calls:
    → Header: Authorization: Bearer <token>
    → requireAuth middleware verifies JWT
    → Admin-only routes also check requireAdmin
```

### 5.2 Supabase Auth (OAuth)

```
User signs up via Supabase Auth UI (Google / GitHub / Email)
    → Supabase handles session
    → Frontend checks user_roles table for role
    → First user = admin, rest = user
    → Supabase RLS enforces access at DB level
```

### 5.3 Role-Based Access

| Role | How Assigned | Access |
|------|-------------|--------|
| Admin | First user to register (auto) or promoted by admin | All projects, all feedback, Admin Portal, User Management |
| User (owner) | Created the project | Own projects + their feedback |
| User (member) | Added to project via Admin Portal | Member projects + their feedback |
| User (no project) | Just registered | Empty dashboard until assigned to a project |

### 5.4 API Route Protection (Node Server)

| Route | Auth | Role | Description |
|-------|------|------|-------------|
| `POST /api/auth/register` | Public | - | Create account |
| `POST /api/auth/login` | Public | - | Login, get JWT |
| `GET /api/auth/me` | JWT | Any | Verify token |
| `GET /api/auth/users` | JWT | Admin | List all users |
| `PATCH /api/auth/users/:id` | JWT | Admin | Change user role |
| `POST /api/feedback` | Public | - | Submit feedback (widgets) |
| `GET /api/feedback` | JWT | Scoped | Admin=all, User=assigned projects |
| `GET /api/feedback/:id` | JWT | Scoped | Admin=any, User=own project only |
| `GET /api/feedback/stats/summary` | JWT | Scoped | Admin=all, User=assigned projects |
| `GET /api/projects` | JWT | Scoped | Admin=all, User=owned+member |
| `POST /api/projects` | JWT | Any | Create project |
| `PATCH /api/projects/:id` | JWT | Any | Update project |
| `DELETE /api/projects/:id` | JWT | Any | Delete project |
| `GET /api/projects/:id/members` | JWT | Any | List members |
| `POST /api/projects/:id/members` | JWT | Any | Add member |
| `DELETE /api/projects/:id/members/:uid` | JWT | Any | Remove member |
| `GET /health` | Public | - | Health check |

---

## 6. Database Schema

### 6.1 `user_roles` Table

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Auto-generated |
| user_id | TEXT (UNIQUE) | User identifier (Supabase auth ID or generated) |
| email | TEXT (UNIQUE) | User's email |
| password_hash | TEXT (nullable) | bcrypt hash (NULL for OAuth users) |
| role | TEXT | "admin" or "user" |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last role change |

### 6.2 `projects` Table

| Column | Type | Purpose |
|--------|------|---------|
| id | TEXT (PK) | Project identifier (e.g., "my-app") |
| name | TEXT | Display name |
| owner_id | TEXT | User who created it |
| owner_email | TEXT | Owner's email |
| plan | TEXT | "free" or "pro" |
| config | JSONB | Widget configuration (theme, limits) |
| api_key | TEXT | Auto-generated API key |
| created_at | TIMESTAMPTZ | Creation timestamp |

### 6.3 `project_members` Table

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Auto-generated |
| project_id | TEXT (FK → projects) | Which project |
| user_id | TEXT | Which user |
| email | TEXT | Member's email |
| role | TEXT | "owner", "member", or "viewer" |
| created_at | TIMESTAMPTZ | When added |
| UNIQUE | (project_id, user_id) | Prevents duplicate membership |

### 6.4 `feedback` Table

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Auto-generated feedback ID |
| project_id | TEXT | Links to project (auto-created if missing) |
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

### 6.5 `feedback_context` Table

Separated heavy technical data for performance:

| Column | Type | Purpose |
|--------|------|---------|
| feedback_id | UUID (FK) | Links to feedback.id |
| viewport | JSONB | Screen dimensions |
| user_agent | TEXT | Browser user agent |
| console_errors | JSONB | Captured console errors |
| network_errors | JSONB | Failed network requests |
| breadcrumbs | JSONB | User actions timeline |

---

## 7. Adapter System

| Adapter | Use Case | Data Destination |
|---------|----------|-----------------|
| `httpAdapter()` | Default for Node server | Any REST endpoint |
| `supabaseAdapter()` | Direct to Supabase (Pro) | Supabase cloud DB |
| `autoAdapter()` | Auto-detects backend | Supabase if configured, else HTTP |
| `consoleAdapter()` | Development/testing | Browser console only |
| `localStorageAdapter()` | Offline/demo | Browser localStorage |
| `webhookAdapter()` | Team notifications | Slack, Discord, Microsoft Teams |

### Admin Panel Adapter Selection

Settings page lets you choose:
- **Local** (default) → sends to Node server via httpAdapter
- **Supabase** → sends directly to Supabase via supabaseAdapter
- **Console** → logs to browser console (testing only)

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

Plan is set per project in the `projects` table. Admin can change from Admin Portal.

---

## 9. Privacy & Security

### Auto-Captured (always safe)
- Page URL (redacted query params)
- Viewport dimensions, language, user agent
- Console error messages
- Network error metadata only (endpoint, status, duration — no bodies)
- Click/navigation breadcrumbs (element type + text, no form values)

### Never Captured
- Form input values or keystrokes
- Request/response bodies
- Cookies or session tokens
- localStorage or sessionStorage contents

### Auto-Redacted Before Submission
- Email addresses, phone numbers, credit card numbers
- API keys and tokens, Social Security Numbers
- Custom patterns via `redact` config option

### User Consent Toggles
Users see toggles in the feedback dialog to opt in/out of:
- Technical details (console errors, network errors)
- Recent steps (breadcrumbs)
- Email sharing

---

## 10. Deployment

### Environment Variables

**Server (`server/.env`)**
```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=your-secret-key-change-in-production
PORT=3000
ALLOWED_ORIGINS=https://feedback-admin.onrender.com
```

**Admin App (`apps/admin/.env`)**

For Node server mode:
```
VITE_API_URL=https://feedback-server.onrender.com
```

For Supabase mode:
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhb...
VITE_API_URL=https://feedback-server.onrender.com
```

### Render Deployment

| Service | Type | Build Command | Start Command |
|---------|------|--------------|---------------|
| feedback-server | Web Service | `npm install --include=dev && npm run build` | `npm start` |
| feedback-admin | Static Site | `npm install && npm run build` | - (serves `dist/`) |
| feedback-db | PostgreSQL | - | - |

After deploy, run migration in server shell:
```bash
node dist/migrate.js
```

---

## 11. File Structure

```
lib-bernstein-feedback/
├── packages/feedback/          # NPM package (akk-feedback)
│   └── src/
│       ├── adapters/           # http, supabase, webhook, auto, console, localStorage
│       ├── components/         # FeedbackDialog, FeedbackButton, FeedbackToast
│       ├── hooks/              # useFeedbackConfig, useSubscription
│       ├── utils/              # redact.ts
│       ├── context.tsx         # FeedbackProvider + useFeedback hook
│       ├── schemas.ts          # Zod schemas + TypeScript types
│       └── index.ts            # Public exports
│
├── apps/admin/                 # Admin Dashboard
│   └── src/
│       ├── auth/               # AuthGateway, LoginPage, LocalLoginPage, Dashboard
│       ├── pages/              # FeedbackList, FeedbackDetail, Stats, Demo, Settings, UserManagement
│       ├── hooks/              # useAuth, useFeedbackConfig, useSubscription
│       ├── components/         # GlassCard, LayoutWrapper, ConfirmDialog
│       └── lib/                # supabaseClient, feedbackApi
│
├── server/                     # Node.js API Server
│   └── src/
│       ├── index.ts            # Express routes + JWT auth + role middleware
│       ├── db.ts               # PostgreSQL connection with retry + in-memory fallback
│       └── migrate.ts          # Database migration runner
│   └── init.sql                # Full database schema
│
├── docs/
│   ├── app-flow-strategy.md    # This document
│   ├── product-testing-guide.md # Client testing guide
│   ├── configuration.md        # FeedbackProvider config options
│   ├── adapters.md             # Adapter usage guide
│   └── theming.md              # CSS variables and dark mode
│
└── render.yaml                 # Render deployment blueprint
```

---

## 12. Integration Checklist for Consumer Apps

1. Get **Project ID** and **Server URL** from admin
2. Install: `npm install akk-feedback`
3. Import styles: `import "akk-feedback/styles.css"`
4. Wrap app with `<FeedbackProvider config={{ projectId, adapter }}>`
5. Add `<FeedbackButton />` for the floating trigger
6. Add `<FeedbackDialog />` for the modal
7. Add `<FeedbackToast />` for success/error notifications
8. Optionally configure: `appVersion`, `userId`, `env`, `screenId`
9. Test with `consoleAdapter()` first, then switch to `httpAdapter()`
10. Deploy with production server URL

**Note:** If the project_id doesn't exist on the server, it will be **auto-created** on the first feedback submission.
