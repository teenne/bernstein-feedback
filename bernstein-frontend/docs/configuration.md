# Configuration

## FeedbackProvider Config

The `FeedbackProvider` accepts a `config` prop with the following options:

### Required

| Prop | Type | Description |
|------|------|-------------|
| `projectId` | `string` | Unique identifier for your project |
| `adapter` | `FeedbackAdapter` | Adapter for handling feedback submission |

### Screen Identity

Update these as the user navigates to enable grouping and filtering.

| Prop | Type | Description |
|------|------|-------------|
| `screenId` | `string` | Stable screen identifier (e.g., `'checkout'`, `'user-settings'`) |
| `pageName` | `string` | Human-readable page/view name |

### Build Identity

Set these once at app initialization.

| Prop | Type | Description |
|------|------|-------------|
| `appVersion` | `string` | App version (e.g., `'2.1.0'`) |
| `buildSha` | `string` | Git commit SHA or build identifier |
| `componentVersion` | `string` | Component version if deployed independently |
| `env` | `'production' \| 'staging' \| 'development' \| 'test'` | Environment |

### User Identity

Minimal user info - no PII unless user consents.

| Prop | Type | Description |
|------|------|-------------|
| `userId` | `string` | Internal user ID |
| `tenantId` | `string` | Tenant or organization ID (multi-tenant apps) |
| `role` | `string` | User role (e.g., `'admin'`, `'member'`) |

### Integration

| Prop | Type | Description |
|------|------|-------------|
| `bernsteinRunId` | `string` | Bernstein integration run ID |
| `metadata` | `Record<string, unknown>` | Custom metadata included with every event |

### Feature Flags

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `enableScreenshot` | `boolean` | `true` | Enable screenshot capture |

### Capture Limits

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `maxConsoleErrors` | `number` | `10` | Max console errors to capture |
| `maxNetworkErrors` | `number` | `5` | Max network errors to capture |
| `maxBreadcrumbs` | `number` | `20` | Max breadcrumbs to capture |

### Privacy

| Prop | Type | Description |
|------|------|-------------|
| `redact` | `RegExp[]` | Patterns to redact from captured URLs |

## Example Configuration

```tsx
import { FeedbackProvider, FeedbackButton, FeedbackDialog } from '@bernstein/feedback'
import { httpAdapter } from '@bernstein/feedback/adapters'
import '@bernstein/feedback/styles.css'

function App() {
  return (
    <FeedbackProvider
      config={{
        // Required
        projectId: 'my-app',
        adapter: httpAdapter({
          endpoint: 'https://api.example.com/feedback',
          headers: { Authorization: 'Bearer token' }
        }),

        // Screen identity (update on navigation)
        screenId: 'dashboard',
        pageName: 'Dashboard',

        // Build identity (set once)
        appVersion: '2.1.0',
        buildSha: 'abc123def',
        env: 'production',

        // User identity (minimal)
        userId: currentUser?.id,
        tenantId: currentUser?.orgId,
        role: currentUser?.role,

        // Privacy
        redact: [/token=([^&]+)/g, /password=([^&]+)/g],
      }}
    >
      <YourApp />
      <FeedbackButton />
      <FeedbackDialog />
    </FeedbackProvider>
  )
}
```

## Updating Screen Identity

Update `screenId` and `pageName` when users navigate:

```tsx
// With React Router
function AppRoutes() {
  const location = useLocation();

  // Derive screenId from route
  const screenId = location.pathname.split('/')[1] || 'home';

  return (
    <FeedbackProvider
      config={{
        ...baseConfig,
        screenId,
        pageName: getPageName(location.pathname),
      }}
    >
      <Routes>...</Routes>
    </FeedbackProvider>
  );
}
```

## Redaction

The `redact` prop accepts an array of RegExp patterns. Any URL captured (in network errors or breadcrumbs) will have matching patterns replaced with `[REDACTED]`.

Additionally, user-provided text (title, description) is automatically scanned for:
- Email addresses
- Phone numbers
- Credit card numbers
- Social Security Numbers
- API keys and tokens
- AWS keys
- Passwords in common formats

These are automatically redacted before submission.

### Common URL Patterns to Redact

```tsx
redact: [
  /token=([^&]+)/g,
  /password=([^&]+)/g,
  /session=([^&]+)/g,
  /api_key=([^&]+)/g,
]
```
