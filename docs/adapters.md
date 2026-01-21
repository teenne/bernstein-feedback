# Adapters

Adapters control how feedback events are sent or stored. Import adapters from `@bernstein/feedback/adapters`.

## httpAdapter

Sends feedback to a REST endpoint.

```tsx
import { httpAdapter } from '@bernstein/feedback/adapters'

const adapter = httpAdapter({
  endpoint: 'https://api.example.com/feedback',
  headers: {
    Authorization: 'Bearer your-token',
    'X-Custom-Header': 'value'
  },
  timeout: 10000, // milliseconds
  transform: (event) => ({
    ...event,
    customField: 'value'
  })
})
```

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `endpoint` | `string` | Yes | URL to POST feedback events |
| `headers` | `Record<string, string>` | No | Custom headers for requests |
| `timeout` | `number` | No | Request timeout in ms (default: 5000) |
| `transform` | `(event) => object` | No | Transform event before sending |

## batchHttpAdapter

Queues events and sends them in batches. Useful for high-traffic apps or offline-first scenarios.

```tsx
import { batchHttpAdapter } from '@bernstein/feedback/adapters'

const adapter = batchHttpAdapter({
  endpoint: 'https://api.example.com/feedback/batch',
  headers: { Authorization: 'Bearer token' },
  batchSize: 10,
  flushInterval: 30000 // 30 seconds
})
```

### Options

All `httpAdapter` options plus:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `batchSize` | `number` | 10 | Max events per batch |
| `flushInterval` | `number` | 30000 | Auto-flush interval in ms |

## localStorageAdapter

Stores feedback in browser localStorage. Useful for development or offline scenarios.

```tsx
import { localStorageAdapter } from '@bernstein/feedback/adapters'

const adapter = localStorageAdapter({
  key: 'my-app-feedback', // localStorage key
  maxEvents: 100 // max events to store
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `key` | `string` | `'feedback-events'` | localStorage key |
| `maxEvents` | `number` | 100 | Max events to retain |

## consoleAdapter

Logs feedback to the browser console. Useful for development and testing.

```tsx
import { consoleAdapter } from '@bernstein/feedback/adapters'

const adapter = consoleAdapter()
```

No configuration options.

## Creating a Custom Adapter

An adapter implements the `FeedbackAdapter` interface:

```tsx
import type { FeedbackAdapter, FeedbackEvent } from '@bernstein/feedback'

interface AdapterResult {
  success: boolean;
  id?: string;      // Feedback reference ID
  error?: string;   // Error message if failed
}

const customAdapter = (): FeedbackAdapter => ({
  async submit(event: FeedbackEvent): Promise<AdapterResult> {
    try {
      const response = await myBackend.saveFeedback(event);
      return { success: true, id: response.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
});
```

---

## Recommended Adapters (Coming Soon)

These adapters are planned for future releases based on portfolio analysis:

### Tier 1 - High Value

| Adapter | Purpose | Status |
|---------|---------|--------|
| `webhookAdapter` | Send to Slack, Discord, Teams | Planned |
| `supabaseAdapter` | Direct Supabase table insert | Planned |
| `bernsteinBackendAdapter` | Native bernstein-backend integration | Planned |

### Tier 2 - Medium Value

| Adapter | Purpose | Status |
|---------|---------|--------|
| `indexedDBAdapter` | Large offline storage (50MB+) | Planned |
| `emailAdapter` | Send via SMTP or email services | Planned |

### Contributing

Want to contribute an adapter? See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

The adapter interface is simple - implement a single `submit()` method that:
1. Accepts a `FeedbackEvent`
2. Returns `{ success: true, id?: string }` on success
3. Returns `{ success: false, error: string }` on failure
4. Never throws unhandled exceptions
