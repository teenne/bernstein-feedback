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

**Session Providers** (`src/sessionProviders/`):
- Generic `SessionProvider` interface: `getSessionId()`, `getUserProperties()`, `getReplayUrl(sessionId)`
- `posthogSessionProvider(posthog)` — first-class PostHog impl; reads session ID, person properties, and replay URL
- `logrocketSessionProvider(LogRocket)` — LogRocket reference impl
- `fullstorySessionProvider(FS)` — FullStory reference impl (supports v1 `window.FS` and v2 `@fullstory/browser`)
- All providers are defensive (try/catch, return null) so a broken SDK never blocks ticket submission
- Pass via `config.sessionProvider` on `FeedbackProvider`; omit entirely if not using analytics

**Proactive Triggers** (`src/hooks/`):
- `useRageClickDetector` — 4+ clicks on same element within 1.5s → prompts user
- `useErrorBurstDetector` — 3+ `console.error` calls within 10s → prompts user
- `useAbandonedFlowDetector` — 30+ chars typed then navigated away → prompts user
- `usePostHogProactiveTriggers` — subscribes to PostHog `$rageclick` + `$exception` events directly (alternative to native detectors when PostHog is already on the page)
- All three native detectors are integrated into `context.tsx`; one prompt per session (sessionStorage gate)
- Enable via `config.proactive.enabled + rageClick/errorBurst/abandonedFlow` flags

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
- **Session analytics**: `sessionProvider` — optional; wires PostHog/LogRocket/FullStory session replay into every ticket
- **Proactive**: `proactive.enabled`, `proactive.rageClick`, `proactive.errorBurst`, `proactive.abandonedFlow`

## Admin App (`apps/admin/`)

### `useFeedbackConfig` hook (`src/hooks/useFeedbackConfig.ts`)

Manages per-project widget config with localStorage + server persistence.

**Critical pattern — `configRef` for stale-closure safety:**
- `configRef = useRef(config)` shadows the React state synchronously.
- `updateSetting` updates `configRef.current` **before** calling `setConfig` (not inside the updater). React's `setConfig` updater runs during reconciliation, not synchronously — so if you update the ref inside the updater and call `saveSettings()` in the same tick, the ref still holds the old value.
- `saveSettings` reads `configRef.current` instead of the closed-over `config`, ensuring it always saves the latest value even when called immediately after `updateSetting()`.
- `fetchManagedConfig` and the project-switch `useEffect` also write `configRef.current` to keep it in sync.

```ts
// CORRECT — ref updated before setConfig is scheduled
const next = { ...configRef.current, [key]: value };
configRef.current = next;
setConfig(next);

// WRONG — updater runs during reconciliation, not synchronously
setConfig(prev => {
    const next = { ...prev, [key]: value };
    configRef.current = next; // too late if saveSettings() runs in same tick
    return next;
});
```

### Settings Page — Theme Color (`src/pages/SettingsPage.tsx`)

Theme color UI has three entry points that all feed into `updateSetting("themeColor", value)`:
1. **Preset swatches** — click to apply directly.
2. **Native color picker** — `<input type="color">` controlled with `value={config.themeColor}` and `onChange`.
3. **Hex text input** — local `hexInput` state; applies on valid 6-digit hex, reverts to `config.themeColor` on blur if invalid. Synced to `config.themeColor` via `useEffect` so swatch/picker changes update the field.

## Documentation

Additional documentation is in `docs/`:
- `configuration.md` - FeedbackProvider props and options
- `adapters.md` - Adapter usage and custom adapters
- `theming.md` - CSS variables and dark mode

Scoped CLAUDE.md files:
- `packages/feedback/CLAUDE.md` - widget internals
- `server/CLAUDE.md` - plan gating, billing seam, cluster worker, BYOK keys, agent API, PostHog inbound integration, ownership model. **Read this before touching plan logic, clustering, BYOK, billing, or integrations.**

Deep-dive docs:
- `docs/ai-clustering-setup.md` - credentials checklist, BYOK setup, deployment matrix, smoke test, failure modes.

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
