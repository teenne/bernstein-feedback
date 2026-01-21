import React from 'react'
import ReactDOM from 'react-dom/client'
import { FeedbackProvider, FeedbackButton, FeedbackDialog, FeedbackToast } from '../src'
import { consoleAdapter, localStorageAdapter } from '../src/adapters'
import { supabaseAdapter, isSupabaseConfigured } from './supabase-adapter'
import '../src/styles.css'
import './styles.css'

type AdapterType = 'console' | 'localStorage' | 'supabase'

function App() {
  const [adapter, setAdapter] = React.useState<AdapterType>(
    isSupabaseConfigured ? 'supabase' : 'console'
  )

  const getAdapter = () => {
    switch (adapter) {
      case 'supabase':
        return supabaseAdapter()
      case 'localStorage':
        return localStorageAdapter({ key: 'feedback-demo' })
      default:
        return consoleAdapter()
    }
  }

  return (
    <FeedbackProvider
      config={{
        projectId: 'demo-project',
        adapter: getAdapter(),

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
              Console
            </button>
            <button
              className={adapter === 'localStorage' ? 'active' : ''}
              onClick={() => setAdapter('localStorage')}
            >
              LocalStorage
            </button>
            <button
              className={adapter === 'supabase' ? 'active' : ''}
              onClick={() => setAdapter('supabase')}
              disabled={!isSupabaseConfigured}
              title={!isSupabaseConfigured ? 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env' : ''}
            >
              Supabase {!isSupabaseConfigured && '(not configured)'}
            </button>
          </div>
          <p className="hint">
            {adapter === 'console' && 'Feedback will be logged to the browser console.'}
            {adapter === 'localStorage' && 'Feedback will be saved to localStorage (key: feedback-demo).'}
            {adapter === 'supabase' && 'Feedback will be saved to your Supabase database.'}
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
            <li>Submit and check the {adapter === 'console' ? 'console' : adapter === 'localStorage' ? 'localStorage' : 'Supabase dashboard'} for the captured data</li>
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

        {!isSupabaseConfigured && (
          <section className="setup-hint">
            <h2>Supabase Setup</h2>
            <p>To enable Supabase integration:</p>
            <ol>
              <li>Create a <code>.env</code> file in the <code>example/</code> folder</li>
              <li>Add your Supabase credentials:
                <pre>
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
                </pre>
              </li>
              <li>Run the SQL from <code>examples/supabase-setup.sql</code> in your Supabase SQL Editor</li>
              <li>Restart the dev server</li>
            </ol>
          </section>
        )}
      </div>

      <FeedbackButton />
      <FeedbackDialog />
      <FeedbackToast />
    </FeedbackProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
