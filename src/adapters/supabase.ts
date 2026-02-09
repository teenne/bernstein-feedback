import type { FeedbackAdapter, FeedbackEvent } from '../schemas';

export interface SupabaseAdapterOptions {
    /** Supabase project URL */
    supabaseUrl: string;
    /** Supabase anon key */
    supabaseKey: string;
    /** Table name (default: 'feedback') */
    table?: string;
    /** Transform the event before inserting */
    transform?: (event: FeedbackEvent) => Record<string, unknown>;
}

/**
 * Supabase adapter for storing feedback directly in a Supabase table.
 * 
 * @example
 * ```tsx
 * import { supabaseAdapter } from '@bernstein/feedback/adapters';
 * 
 * const adapter = supabaseAdapter({
 *   supabaseUrl: 'https://your-project.supabase.co',
 *   supabaseKey: 'your-anon-key',
 *   table: 'feedback'
 * });
 * ```
 */
export function supabaseAdapter(options: SupabaseAdapterOptions): FeedbackAdapter {
    const { supabaseUrl, supabaseKey, table = 'feedback', transform } = options;

    if (!supabaseUrl || !supabaseKey) {
        console.warn('Supabase adapter: supabaseUrl and supabaseKey are required');
        return {
            async submit() {
                return { success: false, error: 'Supabase not configured' };
            },
        };
    }

    return {
        async submit(event: FeedbackEvent) {
            try {
                const insertData = transform
                    ? transform(event)
                    : {
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
                        metadata: event.metadata,
                    };

                const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        apikey: supabaseKey,
                        Authorization: `Bearer ${supabaseKey}`,
                        Prefer: 'return=representation',
                    },
                    body: JSON.stringify(insertData),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    return {
                        success: false,
                        error: errorData.message || `Supabase error: ${response.status}`,
                    };
                }

                const data = await response.json();
                const record = Array.isArray(data) ? data[0] : data;

                return {
                    success: true,
                    id: record?.id?.toString(),
                };
            } catch (err) {
                return {
                    success: false,
                    error: err instanceof Error ? err.message : 'Supabase insert failed',
                };
            }
        },
    };
}
