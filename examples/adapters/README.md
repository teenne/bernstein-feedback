# Adapter Examples

Example adapters for sending feedback to various backends.

## Available Adapters

| Adapter | File | Use Case |
|---------|------|----------|
| **Supabase** | `supabase-adapter.ts` | Serverless PostgreSQL with auth |
| **Firebase** | `firebase-adapter.ts` | Firestore document database |
| **Custom API** | `custom-api-adapter.ts` | Any REST API endpoint |
| **SQLite** | `sqlite-adapter.ts` | Local/desktop apps (Electron, Tauri) |
| **PostgreSQL** | `postgresql-adapter.ts` | Self-hosted PostgreSQL |

## Quick Start

1. Copy the adapter file you need to your project
2. Install the required dependencies (see comments in each file)
3. Configure your connection settings
4. Pass the adapter to `FeedbackProvider`

```tsx
import { FeedbackProvider } from '@bernstein/feedback'
import { supabaseAdapter } from './adapters/supabase-adapter'

function App() {
  return (
    <FeedbackProvider
      config={{
        projectId: 'my-app',
        adapter: supabaseAdapter(),
      }}
    >
      {/* your app */}
    </FeedbackProvider>
  )
}
```

## Creating a Custom Adapter

All adapters implement the `FeedbackAdapter` interface:

```ts
interface FeedbackAdapter {
  send(event: FeedbackEvent): Promise<{ id: string }>
}
```

The `FeedbackEvent` contains:

```ts
interface FeedbackEvent {
  projectId: string
  type: 'feedback' | 'bug_report' | 'feature_request'
  timestamp: string
  form: {
    title: string
    description?: string
    category?: string
    impact?: 'blocks_me' | 'annoying' | 'minor'
    email?: string
  }
  context: {
    url: string
    userAgent: string
    viewport: { width: number; height: number }
    screenId?: string
    pageName?: string
    userId?: string
    tenantId?: string
    appVersion?: string
    buildSha?: string
    env?: string
    consoleErrors: Array<{ message: string; timestamp: string }>
    networkErrors: Array<{ url: string; status: number; duration: number }>
    breadcrumbs: Array<{ type: string; target: string; timestamp: string }>
  }
  screenshot?: string  // base64 data URL
  highlightedElement?: {
    selector: string
    boundingBox: { x: number; y: number; width: number; height: number }
    tagName: string
    text?: string
  }
}
```

## Dependencies

| Adapter | Package |
|---------|---------|
| Supabase | `@supabase/supabase-js` |
| Firebase | `firebase` |
| Custom API | None (uses fetch) |
| SQLite | `better-sqlite3` |
| PostgreSQL | `pg` |
