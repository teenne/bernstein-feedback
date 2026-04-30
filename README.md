# akk-feedback

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18+-61dafb.svg)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

A drop-in feedback widget for React applications with automatic context capture, privacy-safe redaction, and a built-in admin dashboard.

---

## Project Structure

This monorepo is divided into four main parts:

### 1. [packages/feedback](./packages/feedback)

The core feedback widget and SDK.

- `src/` — Library source code (React + Tailwind + Radix UI).
- `src/adapters/` — Pluggable backends (HTTP, Supabase, Webhook, localStorage, console, auto-switching).
- `src/components/` — FeedbackDialog, FeedbackButton, FeedbackToast, ConsentToggle.
- `src/utils/` — Privacy redaction and DOM utilities.
- `dist/` — Compiled output (ESM, CJS, TypeScript declarations, bundled CSS).

### 2. [apps/admin](./apps/admin)

The admin dashboard for managing feedback.

- `src/pages/` — Feedback list, detail view, stats, demo playground, settings.
- `src/auth/` — Authentication (Supabase or local password).
- `src/hooks/` — Configuration, subscription, and auth hooks.
- `e2e/` — End-to-end tests (Playwright).

### 4. [server](./server)

Node.js REST API backend (Express + PostgreSQL).

- `src/index.ts` — API server entry point and route definitions.
- `src/db.ts` — PostgreSQL connection and query helpers.
- `init.sql` — Database schema auto-setup.

---

## Quick Start

### 1. Install the widget

```bash
npm install akk-feedback
```

### 2. Add to your React app

```tsx
import {
  FeedbackProvider,
  FeedbackButton,
  FeedbackDialog,
  FeedbackToast,
} from "akk-feedback";
import { consoleAdapter } from "akk-feedback/adapters";
import "akk-feedback/styles.css";

function App() {
  return (
    <FeedbackProvider
      config={{
        projectId: "my-app",
        adapter: consoleAdapter(), // logs to console — no backend needed
      }}
    >
      <YourApp />
      <FeedbackButton />
      <FeedbackDialog />
      <FeedbackToast />
    </FeedbackProvider>
  );
}
```

### 3. Try it

Click the floating **Feedback** button, type a message, and submit. Check your browser console to see the captured payload.

### 4. Connect a backend (optional)

When you're ready to persist feedback, swap the adapter:

```tsx
import { httpAdapter } from "akk-feedback/adapters";

const adapter = httpAdapter({
  endpoint: "https://your-api.com/api/feedback",
  headers: { Authorization: "Bearer your-token" },
});
```

See [packages/feedback/README.md](./packages/feedback/README.md) for all available adapters.

## Backend (SQL / Supabase)

### Option A: Supabase (managed)

1. Create a [Supabase](https://supabase.com) project
2. Run the setup script from [`examples/supabase-setup.sql`](./examples/supabase-setup.sql) in the SQL editor
3. Use the Supabase adapter:

```tsx
import { autoAdapter } from "akk-feedback/adapters";

const adapter = autoAdapter({
  supabaseUrl: "https://your-project.supabase.co",
  supabaseKey: "your-anon-key",
});
```

### Option B: Self-hosted PostgreSQL

1. Start PostgreSQL:

   ```bash
   cd server && docker compose up -d
   ```

2. Start the API server:

   ```bash
   cd server && npm install && npm run dev    # Node on :3000
   ```

3. Point the adapter:

   ```tsx
   import { httpAdapter } from "akk-feedback/adapters";

   const adapter = httpAdapter({
     endpoint: "http://localhost:3000/api/feedback",
   });
   ```

The database schema is created automatically by [`server/init.sql`](./server/init.sql).

---

## Admin Dashboard

A built-in web app for reviewing submitted feedback. See [apps/admin/](./apps/admin/) for setup details.

```bash
cd apps/admin && npm install && npm run dev   # http://localhost:5174
```

---

## Key Features

- **Three feedback modes** — Feedback, Feature Request, Bug Report with tabbed UI
- **Automatic context capture** — URL, viewport, console errors, network failures, user click/navigation breadcrumbs
- **Element highlighting** — users click any element on the page to attach it to their report
- **Screenshot upload** — file upload with inline thumbnail preview
- **Privacy-safe by default** — no request/response bodies, no form values, no keystrokes captured
- **Auto-redaction** — emails, phone numbers, credit cards, API keys, tokens, SSNs stripped before submission
- **Consent toggles** — users choose what to include (technical details, recent steps, email)
- **Dark mode** — class-based with CSS custom properties
- **CSS isolation** — all Tailwind classes prefixed with `bf-` to avoid host app conflicts
- **Themeable** — override colors via `--feedback-primary`, `--feedback-bg`, etc.

---

## License

Apache 2.0
