/**
 * PostgreSQL Adapter for @bernstein/feedback
 *
 * For server-side applications or when you have a backend API.
 *
 * Setup:
 * 1. npm install pg
 * 2. Create the feedback table using the SQL below
 * 3. Set your DATABASE_URL or connection config
 *
 * SQL to create table:
 * ```sql
 * CREATE TABLE feedback (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   project_id TEXT NOT NULL,
 *   type TEXT NOT NULL,
 *   title TEXT NOT NULL,
 *   description TEXT,
 *   category TEXT,
 *   impact TEXT,
 *   email TEXT,
 *   context JSONB,
 *   screenshot TEXT,
 *   highlighted_element JSONB,
 *   user_id TEXT,
 *   tenant_id TEXT,
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *
 *   -- Optional indexes for common queries
 *   CONSTRAINT feedback_type_check CHECK (type IN ('feedback', 'bug_report', 'feature_request'))
 * );
 *
 * CREATE INDEX idx_feedback_project ON feedback(project_id);
 * CREATE INDEX idx_feedback_type ON feedback(type);
 * CREATE INDEX idx_feedback_created ON feedback(created_at DESC);
 * CREATE INDEX idx_feedback_user ON feedback(user_id) WHERE user_id IS NOT NULL;
 * ```
 */

import { Pool } from 'pg'
import type { FeedbackAdapter, FeedbackEvent } from '@bernstein/feedback'

interface PostgresAdapterOptions {
  /** PostgreSQL connection string */
  connectionString?: string
  /** Or individual connection options */
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  /** Table name (default: 'feedback') */
  tableName?: string
  /** Connection pool size (default: 10) */
  poolSize?: number
}

export function postgresqlAdapter(options: PostgresAdapterOptions): FeedbackAdapter {
  const { tableName = 'feedback', poolSize = 10, ...connectionOptions } = options

  const pool = new Pool({
    connectionString: connectionOptions.connectionString,
    host: connectionOptions.host,
    port: connectionOptions.port,
    database: connectionOptions.database,
    user: connectionOptions.user,
    password: connectionOptions.password,
    max: poolSize,
  })

  return {
    async send(event: FeedbackEvent) {
      const query = `
        INSERT INTO ${tableName} (
          project_id, type, title, description, category, impact, email,
          context, screenshot, highlighted_element, user_id, tenant_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `

      const values = [
        event.projectId,
        event.type,
        event.form.title,
        event.form.description || null,
        event.form.category || null,
        event.form.impact || null,
        event.form.email || null,
        JSON.stringify(event.context),
        event.screenshot || null,
        event.highlightedElement ? JSON.stringify(event.highlightedElement) : null,
        event.context?.userId || null,
        event.context?.tenantId || null,
        event.timestamp,
      ]

      const result = await pool.query(query, values)
      return { id: result.rows[0].id }
    },
  }
}

// Express.js API route example:
//
// import express from 'express'
// import { postgresqlAdapter } from './adapters/postgresql-adapter'
//
// const app = express()
// app.use(express.json({ limit: '10mb' })) // For screenshots
//
// const adapter = postgresqlAdapter({
//   connectionString: process.env.DATABASE_URL,
// })
//
// app.post('/api/feedback', async (req, res) => {
//   try {
//     const result = await adapter.send(req.body)
//     res.json(result)
//   } catch (error) {
//     console.error('Feedback error:', error)
//     res.status(500).json({ error: 'Failed to save feedback' })
//   }
// })

// Next.js API route example (app router):
//
// // app/api/feedback/route.ts
// import { postgresqlAdapter } from '@/lib/adapters/postgresql-adapter'
//
// const adapter = postgresqlAdapter({
//   connectionString: process.env.DATABASE_URL,
// })
//
// export async function POST(request: Request) {
//   const event = await request.json()
//   const result = await adapter.send(event)
//   return Response.json(result)
// }
