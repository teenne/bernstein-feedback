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
- Structured event format that integrates with your existing tools
- Privacy-safe defaults that respect user data
- Drop-in component that works with any React app

---

## Features

- **Two feedback modes** — General feedback for suggestions, bug reports for issues
- **Automatic context capture** — URL, viewport, console errors, network errors, user breadcrumbs
- **Privacy-safe by default** — No request/response bodies, no form values, no keystrokes
- **Configurable redaction** — Remove sensitive data with regex patterns before sending
- **Backend-agnostic** — HTTP adapter for any endpoint, localStorage for development
- **Themeable** — CSS custom properties with automatic dark mode support
- **Lightweight** — ~50KB gzipped, tree-shakeable, minimal dependencies
- **TypeScript-first** — Full type definitions and Zod schemas included

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
        adapter: httpAdapter({ endpoint: "/api/feedback" }),
        projectId: "my-app",
      }}
    >
      <YourApp />
      <FeedbackDialog />
      <FeedbackButton position="bottom-right" />
    </FeedbackProvider>
  );
}
```

---

## Configuration

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| adapter | FeedbackAdapter | Yes | — | Backend adapter for submitting feedback |
| projectId | string | Yes | — | Project identifier included in events |
| redact | RegExp[] | No | [] | Patterns to redact from captured URLs |
| appVersion | string | No | — | App version to include in context |
| userId | string | No | — | User ID to include in events |
| enableScreenshot | boolean | No | true | Enable screenshot capture |
| maxConsoleErrors | number | No | 10 | Max console errors to capture |
| maxNetworkErrors | number | No | 5 | Max network errors to capture |
| maxBreadcrumbs | number | No | 20 | Max breadcrumbs to capture |

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

### Programmatic Control

```tsx
const { openFeedback, openBugReport } = useFeedback();

openBugReport({ title: "Error occurred", severity: "high" });
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

const adapter = localStorageAdapter({ logToConsole: true });
adapter.exportEvents();
```

### Console Adapter (Testing)

```tsx
import { consoleAdapter } from "@bernstein/feedback/adapters";
```

---

## Context Capture

Automatically captures:
- URL and viewport
- Console errors (last 10)
- Network errors (last 5)
- User breadcrumbs - clicks and navigation (last 20)

### Custom Breadcrumbs

```tsx
const { addBreadcrumb } = useFeedback();
addBreadcrumb({ type: "custom", target: "checkout-started" });
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

---

## Event Schema

```typescript
interface FeedbackEvent {
  type: "feedback" | "bug_report";
  project_id: string;
  timestamp: string;
  title: string;
  description: string;
  category?: "bug" | "improvement" | "feature" | "question" | "other";
  severity?: "low" | "medium" | "high" | "critical";
  context: CapturedContext;
  screenshot?: string;
  user_id?: string;
}
```

---

## Privacy & Security

**Not captured by default:** Request/response bodies, form values, keystrokes, cookies.

**Redaction:**
```tsx
redact: [/token=[^&]+/gi, /password/gi]
```

---

## Bernstein Ecosystem

| Package | Description |
|---------|-------------|
| [bernstein](https://github.com/teenne/bernstein) | Documentation and architecture |
| [bernstein-sdk](https://github.com/teenne/bernstein-sdk) | Core SDK for event tracking |
| **bernstein-feedback** | UI feedback widget (this package) |
| [bernstein-backend](https://github.com/teenne/bernstein-backend) | Backend for storage |

---

## License

Apache 2.0
