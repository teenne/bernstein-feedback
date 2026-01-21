# @bernstein/feedback

[![npm version](https://img.shields.io/npm/v/@bernstein/feedback.svg)](https://www.npmjs.com/package/@bernstein/feedback)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18+-61dafb.svg)](https://reactjs.org/)

A drop-in feedback widget for React applications that captures user feedback with automatic context collection. Part of the [Bernstein](https://github.com/teenne/bernstein) observability ecosystem.

---

## Why @bernstein/feedback?

Getting useful feedback from users is hard. When someone reports "it doesn't work," you're left guessing what they saw, what they clicked, and what went wrong. This widget solves that by automatically capturing the context needed to understand and reproduce issues.

**The problem:**
- Users can't describe technical issues accurately
- Screenshots miss the sequence of events that led to a bug
- Console errors and network failures are invisible to users
- Feedback goes to email/Slack where it gets lost

**The solution:**
- Automatic capture of console errors, failed network requests, and user actions
- User-friendly impact selection ("Blocks me" / "Annoying" / "Minor")
- Consent-based context sharing with clear "We'll include" toggles
- Privacy-safe defaults with automatic secret redaction

---

## Features

- **Three feedback modes** — Feedback, Feature Request, Bug Report
- **User-friendly bug triage** — "How bad is it?" with Blocks me / Annoying / Minor
- **Automatic context capture** — URL, viewport, console errors, network errors, user breadcrumbs
- **Screenshot capture** — One-click screenshot with html2canvas
- **Highlight mode** — Let users click to highlight a specific element
- **Consent toggles** — "We'll include" section with clear opt-in/opt-out
- **Privacy-safe by default** — No request/response bodies, no form values, no keystrokes
- **Auto-redaction** — Emails, phone numbers, credit cards, API keys automatically redacted
- **Screen identity** — Track which screen/view feedback came from
- **Backend-agnostic** — HTTP adapter for any endpoint, localStorage for development
- **Themeable** — CSS custom properties with automatic dark mode support

---

## Installation

```bash
npm install @bernstein/feedback
```

### Peer Dependencies

React 18 or later is required.

---

## Quick Start

```tsx
import { FeedbackProvider, FeedbackButton, FeedbackDialog } from "@bernstein/feedback";
import { httpAdapter } from "@bernstein/feedback/adapters";
import "@bernstein/feedback/styles.css";

function App() {
  return (
    <FeedbackProvider
      config={{
        projectId: "my-app",
        adapter: httpAdapter({ endpoint: "/api/feedback" }),

        // Screen identity (update on navigation)
        screenId: "dashboard",
        pageName: "Dashboard",

        // Build identity
        appVersion: "2.1.0",
        env: "production",

        // User identity (minimal)
        userId: currentUser?.id,
        tenantId: currentUser?.orgId,
      }}
    >
      <YourApp />
      <FeedbackButton />
      <FeedbackDialog />
    </FeedbackProvider>
  );
}
```

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
| `buildSha` | `string` | Git commit SHA |
| `env` | `'production' \| 'staging' \| 'development' \| 'test'` | Environment |

### User Identity

| Prop | Type | Description |
|------|------|-------------|
| `userId` | `string` | Internal user ID |
| `tenantId` | `string` | Tenant/org ID |
| `role` | `string` | User role |

### Privacy & Limits

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `redact` | `RegExp[]` | `[]` | URL patterns to redact |
| `enableScreenshot` | `boolean` | `true` | Enable screenshot capture |
| `maxConsoleErrors` | `number` | `10` | Max console errors |
| `maxNetworkErrors` | `number` | `5` | Max network errors |
| `maxBreadcrumbs` | `number` | `20` | Max breadcrumbs |

See [docs/configuration.md](docs/configuration.md) for full details.

---

## Components

### FeedbackButton

```tsx
<FeedbackButton position="bottom-right" label="Feedback" />
```

### FeedbackIconButton

```tsx
<FeedbackIconButton position="bottom-right" />
```

---

## Programmatic API

```tsx
const {
  openFeedback,     // Open in feedback mode
  openBugReport,    // Open in bug report mode
  reportBug,        // Quick API with prefilled text
  addBreadcrumb,    // Track custom breadcrumb
  lastReportId,     // ID of last submitted report
} = useFeedback();

// Quick bug report
reportBug({ title: "Error occurred", description: "Details..." });

// Custom breadcrumb
addBreadcrumb({ type: "custom", target: "checkout-started" });

// Show confirmation
if (lastReportId) {
  console.log(`Thanks! Report ID: ${lastReportId}`);
}
```

---

## Adapters

### HTTP Adapter

```tsx
import { httpAdapter } from "@bernstein/feedback/adapters";

httpAdapter({
  endpoint: "https://api.example.com/feedback",
  headers: { "X-API-Key": "key" },
  timeout: 10000,
});
```

### LocalStorage Adapter (Development)

```tsx
import { localStorageAdapter } from "@bernstein/feedback/adapters";

localStorageAdapter({ key: "feedback-dev" });
```

### Console Adapter (Testing)

```tsx
import { consoleAdapter } from "@bernstein/feedback/adapters";
```

---

## Event Schema

```typescript
interface FeedbackEvent {
  type: "feedback" | "bug_report" | "feature_request";
  project_id: string;
  timestamp: string;

  // User input
  title: string;
  description: string;
  impact?: "blocks_me" | "annoying" | "minor";

  // Context (based on consent toggles)
  context: {
    url: string;
    route?: string;
    screenId?: string;
    pageName?: string;
    appVersion?: string;
    buildSha?: string;
    env?: "production" | "staging" | "development" | "test";
    viewport: { width: number; height: number };
    userAgent?: string;
    consoleErrors: ConsoleError[];
    networkErrors: NetworkError[];
    breadcrumbs: Breadcrumb[];
  };

  // Optional
  screenshot?: string; // Base64
  highlighted_element?: {
    selector: string;
    bounding_box: { x: number; y: number; width: number; height: number };
    tag_name: string;
    text?: string;
  };

  // Identity
  user_id?: string;
  tenant_id?: string;
  role?: string;
}
```

---

## Privacy & Security

### What's NOT captured

- Request/response bodies
- Form values
- Keystrokes
- Cookies
- Full DOM HTML

### What IS captured (with consent)

- Network errors: endpoint path, status, duration, request ID (no bodies)
- Console errors: message and stack trace
- Breadcrumbs: click targets, navigation events

### Automatic Redaction

User-provided text is automatically scanned and redacted for:
- Email addresses → `[EMAIL]`
- Phone numbers → `[PHONE]`
- Credit card numbers → `[CARD]`
- SSNs → `[SSN]`
- API keys/tokens → `[API_KEY]`, `[TOKEN]`
- AWS keys → `[AWS_KEY]`
- Passwords → `[REDACTED]`

### URL Redaction

```tsx
redact: [/token=[^&]+/gi, /password/gi]
```

---

## Theming

```css
:root {
  --feedback-primary: #3b82f6;
  --feedback-bg: #ffffff;
  --feedback-text: #111827;
}
```

Dark mode: `<html data-theme="dark">`

See [docs/theming.md](docs/theming.md) for details.

---

## License

Apache 2.0
