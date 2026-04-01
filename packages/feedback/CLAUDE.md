# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

@bernstein/feedback is a drop-in feedback widget for React 18+ applications. It provides a floating button and modal dialog for users to submit feedback, feature requests, or bug reports with automatic capture of console errors, network failures, and user interactions.

## Common Commands

```bash
npm run dev        # Start Vite dev server (runs example app)
npm run build      # TypeScript compilation + Vite build (ESM/CJS bundles)
npm run lint       # ESLint for TypeScript/TSX files
npm run typecheck  # Type check without emitting
npm run preview    # Preview production build locally
```

Publishing automatically runs build via `prepublishOnly` hook.

## Testing the Component

Run `npm run dev` to start the example app. The example app (`example/`) demonstrates:
- Switching between console and localStorage adapters
- Triggering test errors to verify context capture
- Screenshot and highlight mode
- Consent toggles for privacy control

Note: May need `npx vite example --host 127.0.0.1` on Windows due to IPv6 binding.

## Architecture

### Core Pattern: Context + Adapters

**State Management** (`src/context.tsx`):
- `FeedbackProvider` wraps the app and manages all state
- `useFeedback()` hook exposes dialog controls, form submission, and context capture
- Automatically intercepts `window.fetch` and `console.error` to capture failures
- Tracks user clicks and navigation as breadcrumbs
- Auto-redacts secrets (emails, phone numbers, API keys, tokens) from text

**Adapter Pattern** (`src/adapters/`):
- Adapters handle where feedback is sent (HTTP endpoint, localStorage, console)
- `httpAdapter` - REST endpoint with auth headers and custom transforms
- `batchHttpAdapter` - Queues events for batch sending (offline-first)
- `localStorageAdapter` - Development/testing adapter
- `consoleAdapter` - Logs to console for testing

**Component Layer** (`src/components/`):
- `FeedbackDialog` - Modal with tabs for Feedback / Feature / Bug
- `FeedbackButton` / `FeedbackIconButton` - Floating trigger buttons

**Schema Validation** (`src/schemas.ts`):
- All types defined with Zod for runtime validation
- TypeScript types inferred from Zod schemas

### Key APIs

```tsx
const {
  openFeedback,      // Open dialog in feedback mode
  openBugReport,     // Open dialog in bug report mode
  reportBug,         // Quick API: reportBug({ title, description })
  addBreadcrumb,     // Track custom breadcrumb
  captureContext,    // Get current context snapshot
  lastReportId,      // ID of last submitted report
} = useFeedback();
```

### Build Output Structure

```
dist/
├── index.js / index.cjs      # Main exports (ESM/CJS)
├── index.d.ts                # Type definitions
├── adapters/index.js/.cjs    # Adapter exports
└── styles.css                # Bundled Tailwind styles
```

### Package Exports

Main package exports components, hooks, schemas, and types from `src/index.ts`.
Adapters are a separate entry point: `@bernstein/feedback/adapters`.
Styles must be imported: `@bernstein/feedback/styles.css`.

## Technical Notes

- **CSS Prefixing**: All Tailwind classes use `bf-` prefix to avoid conflicts with host apps
- **Path Alias**: `@/*` maps to `src/*` in both Vite and TypeScript configs
- **Accessibility**: Uses Radix UI primitives for ARIA-compliant components
- **Privacy**: No request bodies, form data, or keystrokes captured; network errors store only metadata (endpoint, status, duration); auto-redaction of secrets in user text
- **Screenshot**: Uses html2canvas; dialog is hidden during capture

## Config Structure

Key config groups:
- **Screen identity**: `screenId`, `pageName` (update on navigation)
- **Build identity**: `appVersion`, `buildSha`, `componentVersion`, `env`
- **User identity**: `userId`, `tenantId`, `role` (minimal, no PII)
- **Privacy**: `redact` patterns, `enableScreenshot`
- **Limits**: `maxConsoleErrors`, `maxNetworkErrors`, `maxBreadcrumbs`

## Documentation

Additional documentation is in `docs/`:
- `configuration.md` - FeedbackProvider props and options
- `adapters.md` - Adapter usage and custom adapters
- `theming.md` - CSS variables and dark mode

## Recommended Plugins

Install these Claude Code plugins for optimal development experience:

```bash
# oh-my-claudecode - Multi-agent orchestration (27 agents, 28 skills)
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/plugin install oh-my-claudecode
/oh-my-claudecode:omc-setup

# frontend-design - Production-grade UI/UX (official Anthropic plugin)
/plugin marketplace add anthropics/claude-code
/plugin install frontend-design@claude-code-plugins
```
