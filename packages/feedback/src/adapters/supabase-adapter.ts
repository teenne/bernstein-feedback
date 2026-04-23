import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FeedbackAdapter, FeedbackEvent } from '../schemas';

// Module-level cache so repeated supabaseAdapter() calls (e.g. from a React
// useMemo whose deps change as config loads) reuse the same underlying client.
// Creating a fresh client per call would register a new GoTrueClient under the
// same storageKey and trigger the "Multiple GoTrueClient instances" warning.
//
// The cache key intentionally excludes accessToken — token rotation (login,
// logout, hourly refresh) updates the existing client in place via the
// `accessToken` getter supabase-js polls before each REST call, plus
// `realtime.setAuth()` for the websocket. Keying on the token instead would
// spawn a new GoTrueClient on every refresh and re-trigger the warning.
const clientCache = new Map<string, SupabaseClient>();
const tokenRegistry = new Map<string, string | undefined>();

function getCachedClient(
    supabaseUrl: string,
    supabaseKey: string,
    accessToken?: string,
): SupabaseClient {
    const cacheKey = `${supabaseUrl}::${supabaseKey}`;
    const prevToken = tokenRegistry.get(cacheKey);
    tokenRegistry.set(cacheKey, accessToken);

    let client = clientCache.get(cacheKey);
    if (!client) {
        // Use a unique storageKey so this client doesn't collide with a host
        // app's Supabase client (which would also trigger the GoTrue warning).
        client = createClient(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
                storageKey: 'bernstein-feedback-adapter-auth',
            },
            // supabase-js calls this before each REST request, so updating
            // tokenRegistry above is enough to propagate a rotated token.
            accessToken: async () => tokenRegistry.get(cacheKey) ?? null,
        } as any);
        clientCache.set(cacheKey, client);
    }

    // Realtime auth is *not* read via the accessToken getter — it's captured
    // at channel-join time. Call setAuth so subsequent subscriptions (and
    // already-joined channels via rejoin) carry the current identity.
    if (accessToken !== prevToken) {
        try {
            client.realtime.setAuth(accessToken ?? null);
        } catch { /* older supabase-js versions: ignore */ }
    }
    return client;
}

export interface SupabaseAdapterOptions {
    supabaseUrl: string;
    supabaseKey: string;
    /** Table name (default: 'feedback') */
    table?: string;
    /** Timeout in ms (default: 10000) */
    timeout?: number;
    /**
     * Optional Supabase-compatible JWT to use as the client's access token.
     *
     * Supply this when your host app's users are NOT in Supabase Auth but
     * you still want strict per-user RLS. The JWT must be signed with the
     * project's `SUPABASE_JWT_SECRET` and should include at minimum:
     *   { sub: <user-id>, role: 'authenticated', aud: 'authenticated', exp }
     * RLS policies on the database can then read `auth.jwt() ->> 'sub'` to
     * identify the user without ever calling Supabase Auth.
     *
     * If omitted, the adapter uses the anon key alone — which means RLS
     * policies depending on `auth.uid()` / `auth.jwt()` will see no user.
     * Safe for dev only; use a custom JWT in production.
     */
    accessToken?: string;
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
export interface SupabaseAdapterWithPlan extends FeedbackAdapter {
    getPlanStatus(projectId: string): Promise<{
        can_submit: boolean;
        tickets_used: number;
        tickets_limit: number;
        plan: string;
        message?: string;
    }>;
    getNotifications(projectId: string, userId: string): Promise<{
        data: any[];
        unread_count: number;
    }>;
    markNotificationRead(id: string): Promise<void>;
    markAllNotificationsRead(projectId: string, userId: string): Promise<void>;
    /**
     * Subscribe to realtime notification changes for a given project + user.
     * The callback is invoked whenever a notification row is inserted, updated, or deleted.
     * Returns an unsubscribe function.
     */
    subscribeToNotifications(
        projectId: string,
        userId: string,
        onChange: () => void,
    ): () => void;
}

export function supabaseAdapter(options: SupabaseAdapterOptions): SupabaseAdapterWithPlan {
    const { supabaseUrl, supabaseKey, table = 'feedback', accessToken } = options;

    if (!supabaseUrl || !supabaseKey) {
        console.error('SupabaseAdapter: Missing credentials.');
        return {
            submit: async () => ({ success: false, error: 'Misconfigured adapter.' }),
            getPlanStatus: async () => ({ can_submit: true, tickets_used: 0, tickets_limit: 50, plan: 'free' }),
            getNotifications: async () => ({ data: [], unread_count: 0 }),
            markNotificationRead: async () => {},
            markAllNotificationsRead: async () => {},
            subscribeToNotifications: () => () => {},
        };
    }

    const supabase = getCachedClient(supabaseUrl, supabaseKey, accessToken);

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

    /**
     * Check plan usage limit and increment count.
     * Returns { allowed: true } if under limit, or { allowed: false, message, used, limit } if over.
     */
    const checkAndIncrementUsage = async (projectId: string): Promise<{
        allowed: boolean;
        message?: string;
        tickets_used?: number;
        tickets_limit?: number;
    }> => {
        try {
            // Get project + plan limits (try plans table first, fall back to plan_limits JSONB)
            // Use the public RPC so anon callers can read plan info without
            // tripping RLS on the projects table (which only owners/members/admins
            // can read directly). The function returns only plan columns — no
            // sensitive owner data.
            const { data: project } = await supabase
                .rpc('get_project_plan', { p_project_id: projectId })
                .maybeSingle<{ plan: string; plan_id: string; plan_limits: Record<string, number> | null }>();

            if (!project) {
                return { allowed: true };
            }

            let maxTickets = 50;
            const planId = project.plan_id || project.plan;
            if (planId) {
                const { data: planData } = await supabase
                    .from('plans')
                    .select('max_tickets_per_month')
                    .eq('id', planId)
                    .maybeSingle();
                if (planData?.max_tickets_per_month != null) {
                    maxTickets = planData.max_tickets_per_month;
                }
            }
            // Fallback to JSONB
            if (maxTickets === 50 && project.plan_limits) {
                const planLimits = project.plan_limits as Record<string, number>;
                maxTickets = planLimits.max_tickets_per_month ?? 50;
            }

            // Atomically increment this month's usage via the RPC. Passing
            // p_max_tickets makes the RPC cap the counter at the limit — the
            // INSERT/UPDATE is skipped once current_count >= max, so we can
            // never show "51 / 50" in the dashboard. Unlimited plans (max = -1)
            // pass through unchanged. The RPC also serialises concurrent
            // submits so we never hit 23505 on (project_id, month).
            const month = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
            const { data: newCount, error: rpcErr } = await supabase
                .rpc('increment_project_usage', {
                    p_project_id: projectId,
                    p_month: month,
                    p_max_tickets: maxTickets,
                });

            if (rpcErr || newCount == null) {
                console.warn('[Bernstein] Usage increment failed:', rpcErr?.message);
                return { allowed: true };
            }

            // The RPC returns -1 as a sentinel for "blocked — already at cap".
            // Any non-negative return means the increment happened and is
            // within the limit.
            if ((newCount as number) === -1) {
                return {
                    allowed: false,
                    message: 'Monthly feedback limit reached. Upgrade your plan to continue collecting feedback.',
                    tickets_used: maxTickets,
                    tickets_limit: maxTickets,
                };
            }

            return { allowed: true, tickets_used: newCount as number, tickets_limit: maxTickets };
        } catch (err) {
            // Fail-safe: if usage check fails, allow the submission
            console.warn('[Bernstein] Usage check error:', err instanceof Error ? err.message : err);
            return { allowed: true };
        }
    };

    return {
        /** Query plan status for a project (used by context polling) */
        async getPlanStatus(projectId: string) {
            try {
                const { data: project } = await supabase
                    .rpc('get_project_plan', { p_project_id: projectId })
                    .maybeSingle<{ plan: string; plan_id: string; plan_limits: Record<string, number> | null }>();

                if (!project) {
                    return { can_submit: true, tickets_used: 0, tickets_limit: 50, plan: 'free' };
                }

                // Read limits from plans table, fall back to plan_limits JSONB
                let maxTickets = 50;
                const planId = project.plan_id || project.plan;
                if (planId) {
                    const { data: planData } = await supabase
                        .from('plans')
                        .select('max_tickets_per_month')
                        .eq('id', planId)
                        .maybeSingle();
                    if (planData?.max_tickets_per_month != null) {
                        maxTickets = planData.max_tickets_per_month;
                    }
                }
                if (maxTickets === 50 && project.plan_limits) {
                    const planLimits = project.plan_limits as Record<string, number>;
                    maxTickets = planLimits.max_tickets_per_month ?? 50;
                }

                const month = new Date().toISOString().slice(0, 7);

                // Read current month's usage via the public RPC. A direct
                // SELECT on project_usage is blocked by RLS for anon callers
                // (admin/owner/member only), which would silently return 0
                // tickets used even when the project is at its monthly limit.
                const { data: usageCount } = await supabase
                    .rpc('get_project_usage', {
                        p_project_id: projectId,
                        p_month: month,
                    });

                const ticketsUsed = (usageCount as number) ?? 0;
                const canSubmit = ticketsUsed < maxTickets;

                return {
                    can_submit: canSubmit,
                    tickets_used: ticketsUsed,
                    tickets_limit: maxTickets,
                    plan: project.plan || 'free',
                    ...(!canSubmit ? { message: 'Monthly feedback limit reached. Upgrade your plan to continue collecting feedback.' } : {}),
                };
            } catch {
                // Fail-safe
                return { can_submit: true, tickets_used: 0, tickets_limit: 50, plan: 'free' };
            }
        },

        async submit(event: FeedbackEvent) {
            try {
                // Check project exists via the public RPC — a direct SELECT on
                // projects would be blocked by RLS for anon callers even when
                // the project exists (widget has no user session on third-party
                // host sites).
                const { data: projectExists } = await supabase
                    .rpc('get_project_plan', { p_project_id: event.project_id })
                    .maybeSingle();

                if (!projectExists) {
                    return {
                        success: false,
                        error: 'Project not found. Please create the project in the admin dashboard first.',
                    };
                }

                // Check plan usage limit before inserting
                const usageCheck = await checkAndIncrementUsage(event.project_id);
                if (!usageCheck.allowed) {
                    return {
                        success: false,
                        error: 'limit_reached',
                    };
                }

                // 1. Prepare Core Feedback payload
                const feedbackId = crypto.randomUUID();
                
                const feedbackPayload: Record<string, unknown> = {
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
                    // Session provider fields (Tier 1). Only include keys
                    // that are actually set so the DB sees NULL for missing
                    // fields (rather than JSON 'undefined' errors).
                    ...(event.session_id ? { session_id: event.session_id } : {}),
                    ...(event.session_provider ? { session_provider: event.session_provider } : {}),
                    ...(event.session_replay_url ? { session_replay_url: event.session_replay_url } : {}),
                    ...(event.user_properties ? { user_properties: event.user_properties } : {}),
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

        async getNotifications(projectId: string, userId: string) {
            try {
                // When projectId is empty, the admin app is asking for every
                // notification this user can see (cross-project bell).
                // RLS on `notifications` already scopes by user_id /
                // user_project_ids() / is_admin() — so omitting the project
                // filter gives exactly the right set.
                const base = supabase
                    .from('notifications')
                    .select('id, project_id, feedback_id, type, title, message, read, created_at')
                    .eq('user_id', userId);
                const filtered = projectId ? base.eq('project_id', projectId) : base;

                const { data, error } = await filtered
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error) return { data: [], unread_count: 0 };

                const unreadCount = (data || []).filter((n: any) => !n.read).length;
                return { data: data || [], unread_count: unreadCount };
            } catch {
                return { data: [], unread_count: 0 };
            }
        },

        async markNotificationRead(id: string) {
            try {
                await supabase
                    .from('notifications')
                    .update({ read: true })
                    .eq('id', id);
            } catch { /* ignore */ }
        },

        async markAllNotificationsRead(projectId: string, userId: string) {
            try {
                const base = supabase
                    .from('notifications')
                    .update({ read: true })
                    .eq('user_id', userId)
                    .eq('read', false);
                await (projectId ? base.eq('project_id', projectId) : base);
            } catch { /* ignore */ }
        },

        subscribeToNotifications(projectId: string, userId: string, onChange: () => void) {
            // Use a unique channel name per (scope, user) so multiple subscribers don't collide.
            // `all` is the sentinel for cross-project admin subscriptions.
            const channelName = `bernstein-notifications:${projectId || 'all'}:${userId}`;
            try {
                const channel = supabase
                    .channel(channelName)
                    .on(
                        'postgres_changes' as any,
                        {
                            event: '*',
                            schema: 'public',
                            table: 'notifications',
                            filter: `user_id=eq.${userId}`,
                        },
                        (payload: any) => {
                            // When projectId is empty (admin 'all' scope), every
                            // user_id match is relevant. Otherwise filter client-side
                            // to the selected project — Realtime only lets us filter
                            // on one column at the server.
                            if (!projectId) {
                                onChange();
                                return;
                            }
                            const row = payload?.new ?? payload?.old;
                            if (!row || row.project_id === projectId) {
                                onChange();
                            }
                        },
                    )
                    .subscribe();

                return () => {
                    try {
                        supabase.removeChannel(channel);
                    } catch { /* ignore */ }
                };
            } catch {
                // Realtime unavailable — return a no-op so the caller can fall back to polling.
                return () => {};
            }
        },
    };
}
