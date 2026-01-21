import React from 'react'
import ReactDOM from 'react-dom/client'
import { FeedbackProvider, FeedbackButton, FeedbackDialog } from '../src'
import { consoleAdapter, localStorageAdapter } from '../src/adapters'
import '../src/styles.css'
import './styles.css'

function App() {
  const [adapter, setAdapter] = React.useState<'console' | 'localStorage'>('console')

  const activeAdapter = adapter === 'console'
    ? consoleAdapter()
    : localStorageAdapter({ key: 'feedback-demo' })

  return (
    <FeedbackProvider
      config={{
        projectId: 'demo-project',
        adapter: activeAdapter,

        // Screen identity
        screenId: 'demo-home',
        pageName: 'Demo Page',

        // Build identity
        appVersion: '1.0.0',
        buildSha: 'abc123',
        env: 'development',

        metadata: { customField: 'example' },
      }}
    >
      <div className="demo-container">
        <h1>Feedback Component Demo</h1>

        <section>
          <h2>Adapter Selection</h2>
          <div className="button-group">
            <button
              className={adapter === 'console' ? 'active' : ''}
              onClick={() => setAdapter('console')}
            >
              Console Adapter
            </button>
            <button
              className={adapter === 'localStorage' ? 'active' : ''}
              onClick={() => setAdapter('localStorage')}
            >
              LocalStorage Adapter
            </button>
          </div>
          <p className="hint">
            {adapter === 'console'
              ? 'Feedback will be logged to the browser console.'
              : 'Feedback will be saved to localStorage (key: feedback-demo).'}
          </p>
        </section>

        <section>
          <h2>Test Context Capture</h2>
          <div className="button-group">
            <button onClick={() => console.error('Test error message')}>
              Trigger Console Error
            </button>
            <button onClick={() => {
              fetch('/api/nonexistent').catch(() => {})
            }}>
              Trigger Network Error
            </button>
            <button onClick={() => {
              throw new Error('Uncaught test error')
            }}>
              Throw Uncaught Error
            </button>
          </div>
          <p className="hint">
            These buttons simulate errors that get captured in the feedback context.
          </p>
        </section>

        <section>
          <h2>Instructions</h2>
          <ol>
            <li>Click the feedback button in the bottom-right corner</li>
            <li>Fill out the feedback form or bug report</li>
            <li>Submit and check the console/localStorage for the captured data</li>
          </ol>
        </section>

        {adapter === 'localStorage' && (
          <section>
            <h2>LocalStorage Data</h2>
            <button onClick={() => {
              const data = localStorage.getItem('feedback-demo')
              if (data) {
                const blob = new Blob([data], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'feedback-export.json'
                a.click()
                URL.revokeObjectURL(url)
              } else {
                alert('No feedback data in localStorage yet.')
              }
            }}>
              Export Feedback Data
            </button>
            <button onClick={() => {
              localStorage.removeItem('feedback-demo')
              alert('Cleared feedback data from localStorage.')
            }}>
              Clear Feedback Data
            </button>
          </section>
        )}
      </div>

      <FeedbackButton />
      <FeedbackDialog />
    </FeedbackProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
