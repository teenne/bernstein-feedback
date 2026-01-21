/**
 * SQLite Adapter for @bernstein/feedback
 *
 * For local/desktop apps using Electron, Tauri, or Node.js backends.
 *
 * Setup:
 * 1. npm install better-sqlite3
 * 2. For Electron/Tauri: expose this via IPC to the renderer
 *
 * Note: This adapter is designed for Node.js/backend contexts.
 * For browser apps, you'll need to send feedback to a backend API
 * that uses this adapter.
 */

import Database from 'better-sqlite3'
import type { FeedbackAdapter, FeedbackEvent } from '@bernstein/feedback'

interface SqliteAdapterOptions {
  /** Path to the SQLite database file */
  dbPath: string
  /** Table name (default: 'feedback') */
  tableName?: string
}

export function sqliteAdapter(options: SqliteAdapterOptions): FeedbackAdapter {
  const { dbPath, tableName = 'feedback' } = options
  const db = new Database(dbPath)

  // Create table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      impact TEXT,
      email TEXT,
      context TEXT,
      screenshot TEXT,
      highlighted_element TEXT,
      user_id TEXT,
      tenant_id TEXT,
      created_at TEXT NOT NULL
    )
  `)

  const insertStmt = db.prepare(`
    INSERT INTO ${tableName} (
      id, project_id, type, title, description, category, impact, email,
      context, screenshot, highlighted_element, user_id, tenant_id, created_at
    ) VALUES (
      @id, @project_id, @type, @title, @description, @category, @impact, @email,
      @context, @screenshot, @highlighted_element, @user_id, @tenant_id, @created_at
    )
  `)

  return {
    async send(event: FeedbackEvent) {
      const id = crypto.randomUUID()

      insertStmt.run({
        id,
        project_id: event.projectId,
        type: event.type,
        title: event.form.title,
        description: event.form.description || null,
        category: event.form.category || null,
        impact: event.form.impact || null,
        email: event.form.email || null,
        context: JSON.stringify(event.context),
        screenshot: event.screenshot || null,
        highlighted_element: event.highlightedElement
          ? JSON.stringify(event.highlightedElement)
          : null,
        user_id: event.context?.userId || null,
        tenant_id: event.context?.tenantId || null,
        created_at: event.timestamp,
      })

      return { id }
    },
  }
}

// For Electron apps - expose via preload script:
//
// // preload.ts
// import { contextBridge, ipcRenderer } from 'electron'
//
// contextBridge.exposeInMainWorld('feedbackApi', {
//   send: (event) => ipcRenderer.invoke('feedback:send', event),
// })
//
// // main.ts
// import { ipcMain } from 'electron'
// import { sqliteAdapter } from './adapters/sqlite-adapter'
//
// const adapter = sqliteAdapter({ dbPath: './feedback.db' })
//
// ipcMain.handle('feedback:send', async (_, event) => {
//   return adapter.send(event)
// })
//
// // renderer - create a bridge adapter
// function electronBridgeAdapter(): FeedbackAdapter {
//   return {
//     async send(event) {
//       return window.feedbackApi.send(event)
//     },
//   }
// }
