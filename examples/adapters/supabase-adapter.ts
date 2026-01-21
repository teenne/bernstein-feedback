/**
 * Supabase Adapter for @bernstein/feedback
 *
 * Setup:
 * 1. npm install @supabase/supabase-js
 * 2. Create a 'feedback' table in Supabase with the schema below
 * 3. Set your SUPABASE_URL and SUPABASE_ANON_KEY
 *
 * SQL to create table:
 * ```sql
 * create table feedback (
 *   id uuid default gen_random_uuid() primary key,
 *   project_id text not null,
 *   type text not null,
 *   title text not null,
 *   description text,
 *   category text,
 *   impact text,
 *   email text,
 *   context jsonb,
 *   screenshot text,
 *   highlighted_element jsonb,
 *   user_id text,
 *   tenant_id text,
 *   created_at timestamptz default now()
 * );
 *
 * -- Optional: Enable RLS
 * alter table feedback enable row level security;
 *
 * -- Policy: Allow inserts from authenticated or anon users
 * create policy "Allow feedback inserts" on feedback
 *   for insert with check (true);
 * ```
 */

import { createClient } from '@supabase/supabase-js'
import type { FeedbackAdapter, FeedbackEvent } from '@bernstein/feedback'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-anon-key'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export function supabaseAdapter(): FeedbackAdapter {
  return {
    async send(event: FeedbackEvent) {
      const { data, error } = await supabase
        .from('feedback')
        .insert({
          project_id: event.projectId,
          type: event.type,
          title: event.form.title,
          description: event.form.description,
          category: event.form.category,
          impact: event.form.impact,
          email: event.form.email,
          context: event.context,
          screenshot: event.screenshot,
          highlighted_element: event.highlightedElement,
          user_id: event.context?.userId,
          tenant_id: event.context?.tenantId,
          created_at: event.timestamp,
        })
        .select('id')
        .single()

      if (error) {
        console.error('Supabase feedback error:', error)
        throw new Error(error.message)
      }

      return { id: data.id }
    },
  }
}

// Usage:
// import { supabaseAdapter } from './adapters/supabase-adapter'
//
// <FeedbackProvider config={{ adapter: supabaseAdapter(), ... }}>
