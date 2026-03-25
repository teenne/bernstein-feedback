import { createClient } from '@supabase/supabase-js';
import type { FeedbackAdapter, FeedbackEvent } from '../schemas';

export interface SupabaseAdapterOptions {
    supabaseUrl: string;
    supabaseKey: string;
    /** Table name (default: 'feedback') */
    table?: string;
    /** Timeout in ms (default: 10000) */
    timeout?: number;
}

/**
 * "The Pro Tier" - Optimized Supabase Adapter.
 * 
 * Features:
 * 1. Multiple Screenshot Uploads to Supabase Storage.
 * 2. Optimized Schema Support (Splits feedback from heavy technical context).
 * 3. Automatic Base64-to-Blob conversion for storage efficiency.
 * 
 * @param options Configuration for the Supabase project and table.
 * @returns A FeedbackAdapter compatible with the FeedbackProvider.
 */
export function supabaseAdapter(options: SupabaseAdapterOptions): FeedbackAdapter {
    const { supabaseUrl, supabaseKey, table = 'feedback' } = options;

    if (!supabaseUrl || !supabaseKey) {
        console.error('SupabaseAdapter: Missing credentials.');
        return {
            submit: async () => ({ success: false, error: 'Misconfigured adapter.' }),
        };
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
    });

    /**
     * Uploads multiple base64 screenshots to Supabase Storage and returns URLs.
     */
    const uploadScreenshots = async (feedbackId: string, screenshots: string[]): Promise<string[]> => {
        const urls: string[] = [];
        
        for (let i = 0; i < screenshots.length; i++) {
            const base64 = screenshots[i];
            const fileName = `${feedbackId}/${i}.png`;
            
            // Convert to Blob for efficient storage
            const parts = base64.split(',');
            const mime = parts[0].match(/:(.*?);/)?.[1];
            const bstr = atob(parts[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) u8arr[n] = bstr.charCodeAt(n);
            const blob = new Blob([u8arr], { type: mime });

            const { data, error } = await supabase.storage
                .from('feedback-attachments')
                .upload(fileName, blob, { 
                    contentType: mime,
                   upsert: true 
                });

            if (!error && data) {
                const { data: urlData } = supabase.storage
                    .from('feedback-attachments')
                    .getPublicUrl(fileName);
                urls.push(urlData.publicUrl);
            }
        }
        return urls;
    };

    return {
        async submit(event: FeedbackEvent) {
            try {
                // 1. Prepare Core Feedback payload
                const feedbackId = crypto.randomUUID();
                
                const feedbackPayload = {
                    id: feedbackId,
                    project_id: event.project_id,
                    type: event.type,
                    timestamp: event.timestamp || new Date().toISOString(),
                    title: event.title,
                    description: event.description,
                    category: event.category,
                    impact: event.impact,
                    severity: event.severity,
                    email: event.email,
                    url: event.context.url,
                    route: event.context.route,
                    screen_id: event.context.screenId,
                    page_name: event.context.pageName,
                    highlighted_element: event.highlighted_element,
                    user_id: event.user_id,
                    tenant_id: event.tenant_id,
                    role: event.role,
                    metadata: event.metadata,
                };

                // 2. Prepare Technical Context payload (Heavy Data)
                const contextPayload = {
                    feedback_id: feedbackId,
                    viewport: event.context.viewport,
                    user_agent: event.context.userAgent,
                    language: event.context.language,
                    env: event.context.env,
                    app_version: event.context.appVersion,
                    build_sha: event.context.buildSha,
                    console_errors: event.context.consoleErrors,
                    network_errors: event.context.networkErrors,
                    breadcrumbs: event.context.breadcrumbs,
                    timestamp: event.context.timestamp,
                };

                // 3. Handle Artifacts (Screenshots)
                let screenshotUrls: string[] = [];
                if (event.screenshots && event.screenshots.length > 0) {
                    screenshotUrls = await uploadScreenshots(feedbackId, event.screenshots);
                }

                // 4. Batch the database inserts
                // We perform the feedback insert first, then the context.
                const { error: feedbackError } = await supabase
                    .from(table)
                    .insert({ 
                        ...feedbackPayload, 
                        screenshots: screenshotUrls 
                    });

                if (feedbackError) throw feedbackError;

                const { error: contextError } = await supabase
                    .from('feedback_context')
                    .insert(contextPayload);

                if (contextError) {
                    console.warn('Feedback inserted but context failed:', contextError.message);
                }

                return { success: true, id: feedbackId };

            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Unknown error during Supabase submission';
                console.error('SupabaseAdapter: Critical error', message);
                return { success: false, error: message };
            }
        },
    };
}
