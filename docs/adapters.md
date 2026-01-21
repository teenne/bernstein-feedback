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

An adapter is a function that receives a `FeedbackEvent` and returns a `Promise<void>`:

```tsx
import type { FeedbackAdapter, FeedbackEvent } from '@bernstein/feedback'

const customAdapter: FeedbackAdapter = async (event: FeedbackEvent) => {
  // Send to your custom backend
  await myAnalyticsService.track('feedback', event)
}
```
