import { createClient } from '@supabase/supabase-js'
import type { FeedbackAdapter, FeedbackEvent } from '../src'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null

export function supabaseAdapter(): FeedbackAdapter {
  if (!supabase) {
    console.warn('Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env')
    return {
      async submit() {
        return { success: false, error: 'Supabase not configured' }
      }
    }
  }

  return {
    async submit(event: FeedbackEvent) {
      console.log('Submitting to Supabase...', { event })

      const insertData = {
        project_id: event.project_id,
        type: event.type,
        title: event.title,
        description: event.description,
        category: event.category,
        impact: event.impact,
        email: event.email,
        context: event.context,
        screenshot: event.screenshot,
        highlighted_element: event.highlighted_element,
        user_id: event.user_id,
        tenant_id: event.tenant_id,
      }

      console.log('Insert data:', insertData)

      const { data, error } = await supabase
        .from('feedback')
        .insert(insertData)
        .select('id')
        .single()

      console.log('Supabase response:', { data, error })

      if (error) {
        console.error('Supabase feedback error:', error)
        return { success: false, error: error.message }
      }

      return { success: true, id: data.id }
    },
  }
}

export const isSupabaseConfigured = !!supabase
