import { supabase } from './supabaseClient';
import { API_URL, useSupabaseDirectly, apiFetch, SESSION_KEYS } from './config';

// Re-export for existing consumers
export { useSupabaseDirectly };

// Helper: get current user ID for Node server path
async function getCurrentUserId(): Promise<string | null> {
    if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.user?.id || null;
    }
    const stored = sessionStorage.getItem(SESSION_KEYS.LOCAL_USER);
    if (stored) {
        try {
            return JSON.parse(stored).user_id || null;
        } catch {}
    }
    return null;
}

export async function fetchFeedbackList(filters: { type?: string; project_id?: string; status?: string; priority?: string; limit?: number }) {
    if (useSupabaseDirectly) {
        let query = supabase!
            .from('feedback')
            .select('id, project_id, type, title, description, category, severity, impact, email, screen_id, page_name, user_id, tenant_id, screenshots, status, resolved_at, labels, priority, created_at')
            .order('created_at', { ascending: false })
            .limit(filters.limit || 100);

        if (filters.type) query = query.eq('type', filters.type);
        if (filters.project_id) query = query.eq('project_id', filters.project_id);
        if (filters.status) query = query.eq('status', filters.status);
        if (filters.priority) query = query.eq('priority', filters.priority);

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data || [];
    }

    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.project_id) params.set('project_id', filters.project_id);
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    params.set('limit', String(filters.limit || 100));

    const json = await apiFetch(`${API_URL}/api/feedback?${params}`);
    return json.data;
}

export async function fetchFeedbackById(id: string) {
    if (useSupabaseDirectly) {
        const { data, error } = await supabase!
            .from('feedback')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return data;
    }

    const json = await apiFetch(`${API_URL}/api/feedback/${id}`);
    const data = json.data;
    // Parse JSON strings from Node server
    if (typeof data.context === 'string') data.context = JSON.parse(data.context);
    if (typeof data.screenshots === 'string') data.screenshots = JSON.parse(data.screenshots);
    if (typeof data.metadata === 'string') data.metadata = JSON.parse(data.metadata);
    if (typeof data.highlighted_element === 'string') data.highlighted_element = JSON.parse(data.highlighted_element);
    return data;
}

export async function fetchFeedbackStats(project_id?: string) {
    if (useSupabaseDirectly) {
        let baseQuery = supabase!.from('feedback');

        // Total
        let totalQ = baseQuery.select('*', { count: 'exact', head: true });
        if (project_id) totalQ = totalQ.eq('project_id', project_id);
        const { count: total } = await totalQ;

        // By type
        let typeQ = baseQuery.select('type');
        if (project_id) typeQ = typeQ.eq('project_id', project_id);
        const { data: typeData } = await typeQ;

        const by_type: Record<string, number> = {};
        (typeData || []).forEach((r: any) => {
            by_type[r.type] = (by_type[r.type] || 0) + 1;
        });

        // By severity
        let sevQ = baseQuery.select('severity');
        if (project_id) sevQ = sevQ.eq('project_id', project_id);
        const { data: sevData } = await sevQ;

        const by_severity: Record<string, number> = {};
        (sevData || []).forEach((r: any) => {
            if (r.severity) by_severity[r.severity] = (by_severity[r.severity] || 0) + 1;
        });

        return { total: total || 0, by_type, by_severity };
    }

    const params = project_id ? `?project_id=${project_id}` : '';
    const json = await apiFetch(`${API_URL}/api/feedback/stats/summary${params}`);
    return json.data;
}

// Module-level in-flight cache. App.tsx, FeedbackListPage, and StatsPage
// all call fetchProjects() during their initial mount — without dedupe,
// that's 3 identical requests fired within the same tick (6 in StrictMode).
// Collapsing them into a single shared promise is safe because the result
// is idempotent for a given ownerEmail.
const fetchProjectsInFlight = new Map<string, Promise<any>>();

export async function fetchProjects(ownerEmail?: string) {
    const cacheKey = ownerEmail || '__all__';
    const existing = fetchProjectsInFlight.get(cacheKey);
    if (existing) return existing;

    const promise = (async () => {
        try {
            if (useSupabaseDirectly) {
                const { data, error } = await supabase!
                    .from('projects')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (error) throw new Error(error.message);
                return data || [];
            }

            const params = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
            const json = await apiFetch(`${API_URL}/api/projects${params}`);
            return json.data;
        } finally {
            fetchProjectsInFlight.delete(cacheKey);
        }
    })();

    fetchProjectsInFlight.set(cacheKey, promise);
    return promise;
}

export async function createProject(project: { id: string; name: string; owner_id: string; owner_email: string }) {
    if (useSupabaseDirectly) {
        const { data, error } = await supabase!
            .from('projects')
            .insert(project)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    }

    const json = await apiFetch(`${API_URL}/api/projects`, {
        method: 'POST',
        body: JSON.stringify(project),
    });
    return json.data;
}

export async function updateFeedbackStatus(id: string, status: string, resolutionNote?: string) {
    if (useSupabaseDirectly) {
        const updates: any = { status };
        if (status === 'resolved' || status === 'closed') {
            updates.resolved_at = new Date().toISOString();
            // Persist the note on the feedback row so the `on_feedback_resolved`
            // Postgres trigger can read it and include it in the notification
            // message. This keeps the trigger as the single source of truth
            // for notification creation — no duplicate client-side insert.
            if (resolutionNote !== undefined) {
                updates.resolution_note = resolutionNote;
            }
        } else {
            updates.resolved_at = null;
            updates.resolved_by = null;
            updates.resolution_note = null;
        }
        if (resolutionNote !== undefined) updates.resolution_note = resolutionNote;

        const { data, error } = await supabase!
            .from('feedback')
            .update(updates)
            .eq('id', id)
            .select('id, project_id, title, status, user_id, resolved_at')
            .single();

        if (error) throw new Error(error.message);

        // NOTE: The resolve notification is NOT inserted here — it's
        // produced by the Postgres trigger `on_feedback_resolved` which
        // fires on status transitions into 'resolved'/'closed'. A previous
        // version of this file inserted the notification client-side too,
        // which caused every resolve to create TWO identical notifications.

        return data;
    }

    const json = await apiFetch(`${API_URL}/api/feedback/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, resolution_note: resolutionNote }),
    });
    return json.data;
}

/**
 * Update triage fields on a feedback row (labels, priority).
 * Both arguments are optional — pass only the ones you want to change.
 * `priority: null` explicitly clears the priority.
 * (P3) Matches /api/feedback/:id/triage on the server.
 */
export async function updateFeedbackTriage(
    id: string,
    patch: { labels?: string[]; priority?: 'low' | 'medium' | 'high' | 'urgent' | null },
) {
    if (useSupabaseDirectly) {
        const updates: Record<string, unknown> = {};
        if (patch.labels !== undefined) updates.labels = patch.labels;
        if (patch.priority !== undefined) updates.priority = patch.priority;
        if (Object.keys(updates).length === 0) return null;

        const { data, error } = await supabase!
            .from('feedback')
            .update(updates)
            .eq('id', id)
            .select('id, labels, priority')
            .single();
        if (error) throw new Error(error.message);
        return data;
    }

    const json = await apiFetch(`${API_URL}/api/feedback/${id}/triage`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
    });
    return json.data;
}

export interface LoopHealthData {
    project_id: string | null;
    metrics: {
        avg_resolution_hours: number | null;
        pct_closed_14d: number | null;
        return_rate: number | null;
    };
    status: {
        avg_resolution: 'green' | 'amber' | 'red' | 'unknown';
        pct_closed_14d: 'green' | 'amber' | 'red' | 'unknown';
        return_rate: 'green' | 'amber' | 'red' | 'unknown';
        overall: 'green' | 'amber' | 'red' | 'unknown';
    };
    counts: {
        total_30d: number;
        resolved_30d: number;
        unique_submitters_90d: number;
        returning_submitters_90d: number;
    };
}

const fetchLoopHealthInFlight = new Map<string, Promise<LoopHealthData>>();

/**
 * (P4) Fetch feedback loop health metrics for a project (or global if projectId is null).
 * Supabase path calls the SQL function directly via rpc(); Node path hits the endpoint.
 */
export async function fetchLoopHealth(projectId: string | null): Promise<LoopHealthData> {
    const cacheKey = projectId || '__global__';
    const existing = fetchLoopHealthInFlight.get(cacheKey);
    if (existing) return existing;

    const promise = (async (): Promise<LoopHealthData> => {
        try {
            return await fetchLoopHealthImpl(projectId);
        } finally {
            fetchLoopHealthInFlight.delete(cacheKey);
        }
    })();

    fetchLoopHealthInFlight.set(cacheKey, promise);
    return promise;
}

async function fetchLoopHealthImpl(projectId: string | null): Promise<LoopHealthData> {
    if (useSupabaseDirectly) {
        const { data, error } = await supabase!.rpc('feedback_loop_health', {
            p_project_id: projectId,
        });
        if (error) throw new Error(error.message);
        const row = (data && data[0]) || {};
        const avgHours = row.avg_resolution_hours != null ? Number(row.avg_resolution_hours) : null;
        const pctClosed = row.pct_closed_14d != null ? Number(row.pct_closed_14d) : null;
        const returnRate = row.return_rate != null ? Number(row.return_rate) : null;

        // Same traffic-light logic as the Node route. Kept in sync here
        // so the Supabase path has identical semantics.
        const statusFor = (v: number | null, good: number, warn: number, higherIsBetter: boolean):
            'green' | 'amber' | 'red' | 'unknown' => {
            if (v == null) return 'unknown';
            return higherIsBetter
                ? (v >= good ? 'green' : v >= warn ? 'amber' : 'red')
                : (v <= good ? 'green' : v <= warn ? 'amber' : 'red');
        };
        const avgHoursStatus = statusFor(avgHours, 48, 168, false);
        const pctClosedStatus = statusFor(pctClosed, 80, 50, true);
        const returnRateStatus = statusFor(returnRate, 40, 15, true);
        const rank = (s: string) => ({ unknown: -1, green: 0, amber: 1, red: 2 }[s] ?? -1);
        const overall = [avgHoursStatus, pctClosedStatus, returnRateStatus].reduce(
            (worst, s) => (rank(s) > rank(worst) ? s : worst),
            'green' as 'green' | 'amber' | 'red' | 'unknown',
        );

        return {
            project_id: projectId,
            metrics: {
                avg_resolution_hours: avgHours,
                pct_closed_14d: pctClosed,
                return_rate: returnRate,
            },
            status: {
                avg_resolution: avgHoursStatus,
                pct_closed_14d: pctClosedStatus,
                return_rate: returnRateStatus,
                overall,
            },
            counts: {
                total_30d: Number(row.total_30d || 0),
                resolved_30d: Number(row.resolved_30d || 0),
                unique_submitters_90d: Number(row.unique_submitters_90d || 0),
                returning_submitters_90d: Number(row.returning_submitters_90d || 0),
            },
        };
    }

    const params = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    const json = await apiFetch(`${API_URL}/api/feedback/stats/loop-health${params}`);
    return json.data;
}

const fetchProjectUsageInFlight = new Map<string, Promise<any>>();

export async function fetchProjectUsage(projectId: string) {
    const existing = fetchProjectUsageInFlight.get(projectId);
    if (existing) return existing;

    const promise = (async () => {
        try {
            if (useSupabaseDirectly) {
                const month = new Date().toISOString().slice(0, 7);
                const { data: project } = await supabase!
                    .from('projects')
                    .select('plan, plan_limits')
                    .eq('id', projectId)
                    .single();

                const { data: usage } = await supabase!
                    .from('project_usage')
                    .select('month, ticket_count')
                    .eq('project_id', projectId)
                    .order('month', { ascending: false })
                    .limit(6);

                const planLimits = (project?.plan_limits as Record<string, number> | null) || { max_tickets_per_month: 50 };
                const currentUsage = (usage || []).find((u: any) => u.month === month);
                const ticketsUsed = currentUsage?.ticket_count || 0;
                const maxTickets = planLimits.max_tickets_per_month ?? 50;

                return {
                    plan: project?.plan || 'free',
                    tickets_used: ticketsUsed,
                    tickets_limit: maxTickets,
                    percentage_used: maxTickets > 0 ? Math.round((ticketsUsed / maxTickets) * 100) : 0,
                    month,
                    history: usage || [],
                };
            }

            try {
                const json = await apiFetch(`${API_URL}/api/projects/${encodeURIComponent(projectId)}/usage`);
                return json.data;
            } catch {
                return { plan: 'free', tickets_used: 0, tickets_limit: 50, percentage_used: 0, month: new Date().toISOString().slice(0, 7), history: [] };
            }
        } finally {
            fetchProjectUsageInFlight.delete(projectId);
        }
    })();

    fetchProjectUsageInFlight.set(projectId, promise);
    return promise;
}

export async function fetchPlans() {
    // Try Node server
    try {
        const json = await apiFetch(`${API_URL}/api/plans`);
        return json.data;
    } catch {
        // Supabase fallback
    }

    if (useSupabaseDirectly) {
        const { data, error } = await supabase!
            .from('plans')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });
        if (error) throw new Error(error.message);
        return data || [];
    }

    return [];
}

let fetchUserProjectIdsInFlight: Promise<string[]> | null = null;

export async function fetchUserProjectIds(): Promise<string[]> {
    if (fetchUserProjectIdsInFlight) return fetchUserProjectIdsInFlight;

    fetchUserProjectIdsInFlight = (async () => {
        try {
            if (useSupabaseDirectly) {
                const { data } = await supabase!
                    .from('projects')
                    .select('id');
                return (data || []).map((p: any) => p.id);
            }

            const userId = await getCurrentUserId();
            if (!userId) return [];

            try {
                const json = await apiFetch(`${API_URL}/api/projects?user_id=${encodeURIComponent(userId)}`);
                return (json.data || []).map((p: any) => p.id);
            } catch {
                return [];
            }
        } finally {
            fetchUserProjectIdsInFlight = null;
        }
    })();

    return fetchUserProjectIdsInFlight;
}
