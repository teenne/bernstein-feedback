# Bernstein Feedback — Deployment Proposal

## Overview

This document outlines the architecture and deployment plan for the Bernstein Feedback system. The goal is to provide a centralized feedback collection and management platform that any client application can integrate with minimal setup.

---

## Architecture

The system consists of three components:

```
+------------------+       +------------------+       +------------------+
|  Client Apps     |       |  Feedback Server |       |  Admin Panel     |
|  (React/Web)     | ----> |  (Express API)   | <---- |  (React SPA)     |
|                  |       |                  |       |                  |
|  Installs npm    |       |  Receives &      |       |  View, filter,   |
|  package         |       |  stores feedback |       |  manage feedback |
+------------------+       +--------+---------+       +------------------+
                                    |
                           +--------v---------+
                           |  PostgreSQL DB    |
                           |  (Render Managed) |
                           +------------------+
```

### 1. npm Package (`@bernstein/feedback`)
- Already published on npm
- Drop-in React widget — floating button + modal dialog
- Supports feedback, feature requests, and bug reports
- Automatically captures browser context (console errors, network failures, user navigation steps)
- Privacy-first: no request bodies or keystrokes captured, auto-redacts sensitive data (emails, tokens, API keys)
- Screenshot capture with element highlighting
- User consent toggles for all captured data

### 2. Feedback Server (Express API)
- Hosted on **Render** as a web service
- Receives feedback submissions via REST API (`POST /api/feedback`)
- Stores all data in a managed **PostgreSQL** database on Render
- Provides endpoints for listing, filtering, and retrieving feedback
- Health check endpoint for uptime monitoring
- Each feedback entry is tagged with a `project_id` to identify which application it came from

### 3. Admin Panel (React SPA)
- Hosted on **Render** as a static site
- Dashboard to view and manage feedback from **all projects** in one place
- Filter by project, type (feedback / bug / feature request), severity
- View full details including captured context, screenshots, breadcrumbs
- Statistics and analytics page
- Password-protected access

---

## How It Works

### For developers integrating into their app:

```bash
npm install @bernstein/feedback
```

```jsx
import { FeedbackProvider, FeedbackButton, FeedbackDialog } from '@bernstein/feedback';
import { httpAdapter } from '@bernstein/feedback/adapters';
import '@bernstein/feedback/styles.css';

<FeedbackProvider config={{
  projectId: 'your-project-name',
  adapter: httpAdapter({ endpoint: 'https://feedback-server.onrender.com/api/feedback' }),
}}>
  <App />
  <FeedbackButton />
  <FeedbackDialog />
</FeedbackProvider>
```

That's it. The widget appears as a floating button. Users click it, fill in feedback, and it gets sent to the central server with full context automatically attached.

### For the team reviewing feedback:

1. Open the Admin Panel URL
2. Login with configured credentials
3. View all feedback across projects
4. Filter by project, type, severity
5. Click into any item to see full details — title, description, screenshots, console errors, network failures, user steps leading up to the report

---

## Data Captured Per Feedback Submission

| Category | What's Captured | Privacy Note |
|----------|----------------|--------------|
| User Input | Title, description, category, severity, impact | User provides voluntarily |
| Screenshots | Page screenshot at time of report | Opt-in, user controls via toggle |
| Console Errors | Last 10 browser console errors | Toggleable via consent |
| Network Failures | Failed request metadata (endpoint path, status code, duration) | No request/response bodies |
| User Steps | Last 20 clicks and navigations (breadcrumbs) | Toggleable via consent |
| Browser Context | Viewport size, user agent, language, current URL | Toggleable via consent |
| Identity | Project ID, screen ID, page name | No PII unless explicitly configured |

All sensitive data (emails, phone numbers, API keys, tokens) is **auto-redacted** before submission.

---

## Hosting & Infrastructure

| Component | Platform | Tier | Details |
|-----------|----------|------|---------|
| Feedback Server | Render Web Service | Free / Starter | Express.js API |
| PostgreSQL Database | Render Managed DB | Free / Starter | Persistent storage |
| Admin Panel | Render Static Site | Free | React SPA |

All three services are defined in a single `render.yaml` blueprint file, enabling one-click deployment from the repository.

---

## Deployment Steps (Post-Approval)

1. Connect the repository to Render via Blueprint
2. Render automatically provisions the database, server, and admin panel
3. Configure environment variables (API URL, admin credentials, allowed origins)
4. Run database migration (one-time setup to create the feedback table)
5. Verify: submit a test feedback from any integrated app, confirm it appears in the admin panel

---

## Security Considerations

- Admin panel is password-protected
- Server CORS is restricted to configured origins only
- Database connections use SSL in production
- No PII is captured by default — identity fields are optional
- Auto-redaction strips sensitive patterns from user-submitted text
- Screenshots are opt-in with user consent toggle

---

## Client Apps Using the Feedback Widget

| Project | Render Service | Integration |
|---------|---------------|-------------|
| Meraki | `meraki-frontend` (Static, Global) | `npm install @bernstein/feedback` → sends to `feedback-server` |
| BAS Core | `bas-core-react` (Static, Global) | `npm install @bernstein/feedback` → sends to `feedback-server` |

Both projects send feedback to the same central server. Each submission is tagged with its `project_id` (e.g., `"meraki"`, `"bas-core"`), so the admin panel can filter and view feedback per project or across all projects.

---

## Cost Estimate (Render)

| Service | Free Tier | Starter Tier |
|---------|-----------|-------------|
| Web Service (Server) | 750 hours/month, spins down after 15min inactivity | $7/month (always on) |
| PostgreSQL | 1 GB storage, 90-day retention | $7/month (persistent) |
| Static Site (Admin) | 100 GB bandwidth/month | Free |

The free tier is suitable for initial deployment and testing. For production use with consistent uptime, the Starter tier ($14/month total) keeps the server always available and the database persistent.

---

## Next Steps

Upon approval of this approach:
1. Commit and push deployment configuration to the repository
2. Set up Render Blueprint deployment
3. Configure environment variables
4. Run initial database migration
5. Test end-to-end flow with a sample project integration
