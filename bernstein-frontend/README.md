# @bernstein/feedback

[![npm version](https://img.shields.io/npm/v/@bernstein/feedback.svg)](https://www.npmjs.com/package/@bernstein/feedback)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18+-61dafb.svg)](https://reactjs.org/)

A drop-in feedback widget for React applications that captures user feedback with automatic context collection. Part of the [Bernstein](https://github.com/teenne/bernstein) observability ecosystem.

---

## Commercialization Architecture (ADR)

### 1. Persistent Configuration Strategy
**Decision:** We use a client-side `useFeedbackConfig` hook persisted via `localStorage` to manage the "Freemium" state (Adapter ID, Credentials, Theme).
**Context:**
- The widget must be usable without a backend (Free Tier).
- The "Pro" upgrade (Supabase) happens client-side by injecting a generic `SupabaseAdapter`.
- `localStorage` ensures settings survive reload without requiring a dedicated auth service for the widget itself.

### 2. Dependency Injection for Adapters
**Decision:** The `<FeedbackProvider>` accepts an `adapter` prop at runtime rather than hardcoding imports.
**Consequences:**
- **Flexibility:** We can hot-swap between `ConsoleAdapter` (Dev), `LocalStorageAdapter` (Offline), and `SupabaseAdapter` (Cloud) instantly.
- **Testing:** Integration tests can inject a mock adapter without mocking network requests directly.
- **Security:** Secrets (like Supabase keys) are injected into the adapter instance, not hardcoded in the bundle.

### 3. Security & Validation
**Decision:** We enforce a "Trust but Verify" model.
- **Frontend:** Code strips sensitive data (redaction) before transmission.
- **Backend (Supabase):** RLS policies (`INSERT` only for public) ensure that even if a key is exposed, malicious actors cannot read other users' feedback.

---

## ⚡ 5-Minute Quickstart

Add a fully functional feedback widget to your app in under 5 minutes. No backend required to test!

### 1. Install

```bash
npm install @bernstein/feedback
```

### 2. Drop it in

Add this to your root component (e.g., `App.tsx` or `layout.tsx`):

```tsx
import { FeedbackProvider, FeedbackDialog, FeedbackButton } from "@bernstein/feedback";
import { consoleAdapter } from "@bernstein/feedback/adapters";
import "@bernstein/feedback/styles.css";

function App() {
  return (
    <FeedbackProvider
      config={{
        projectId: "test-project",
        // The console adapter logs feedback to your browser console
        // Perfect for testing without an API key!
        adapter: consoleAdapter(), 
      }}
    >
      <YourApp />
      
      {/* The floating trigger button */}
      <FeedbackButton />
      
      {/* The feedback modal/dialog */}
      <FeedbackDialog />
    </FeedbackProvider>
  );
}
```

### 3. Test it!

**Click the "Feedback" button** -> **Select "Feedback"** -> **Type "Hello World"** -> **Submit**.
Check your browser console to see the captured data!

---

## Integration Guide

To add Bernstein Feedback to your production website or app:

1.  **Wrap your application root** with `FeedbackProvider`.
2.  **Add `FeedbackDialog`** adjacent to your app content (it handles the modal overlay).
3.  **Add a Trigger**:
    *   Use `<FeedbackButton />` for the default floating button.
    *   Use `const { openFeedback } = useFeedback()` to trigger it from your own buttons/menus.
4.  **Configure a Real Adapter**: Switch from `consoleAdapter` to `httpAdapter` or `supabaseAdapter` for production.

---

## Features

- **Three feedback modes** — Feedback, Feature Request, Bug Report
- **User-friendly bug triage** — "How bad is it?" with Blocks me / Annoying / Minor
- **Automatic context capture** — URL, viewport, console errors, network errors, user breadcrumbs
- **Screenshot capture** — High-res, viewport-locked capture (Retina quality)
- **Highlight mode** — Let users click to highlight a specific element
- **Consent toggles** — "We'll include" section with clear opt-in/opt-out
- **Privacy-safe by default** — No request/response bodies, no form values, no keystrokes
- **Auto-redaction** — Emails, phone numbers, credit cards, API keys automatically redacted
- **Themeable** — CSS custom properties with automatic dark mode support

---

## Configuration

### Required

| Prop | Type | Description |
|------|------|-------------|
| `projectId` | `string` | Project identifier |
| `adapter` | `FeedbackAdapter` | Backend adapter |

### Screen Identity

| Prop | Type | Description |
|------|------|-------------|
| `screenId` | `string` | Stable screen ID (e.g., `'checkout'`) |
| `pageName` | `string` | Human-readable page name |

### Build Identity

| Prop | Type | Description |
|------|------|-------------|
| `appVersion` | `string` | App version |
| `env` | `'production' \| 'staging' \| 'development'` | Environment |

---

## Adapters

### HTTP Adapter (Webhooks / Custom Backend)

```tsx
import { httpAdapter } from "@bernstein/feedback/adapters";

const adapter = httpAdapter({
  endpoint: "https://api.yourcompany.com/feedback",
  headers: { "Authorization": "Bearer token" },
});
```

### Supabase Adapter (Direct to Database)

```tsx
import { supabaseAdapter } from "@bernstein/feedback/adapters";

const adapter = supabaseAdapter({
  supabaseUrl: process.env.VITE_SUPABASE_URL,
  supabaseKey: process.env.VITE_SUPABASE_ANON_KEY,
  table: "feedback", // Default
});
```

---

## Theming & Dark Mode

The widget uses CSS variables and automatically respects `[data-theme="dark"]` on the `<html>` element.

```css
:root {
  --feedback-primary: #3b82f6;
  --feedback-bg: #ffffff;
  --feedback-text: #111827;
}

[data-theme='dark'] {
  --feedback-bg: #1f2937;
  --feedback-text: #f3f4f6;
}
```

See `docs/theming.md` for full customization details.

---

## License

Apache 2.0
