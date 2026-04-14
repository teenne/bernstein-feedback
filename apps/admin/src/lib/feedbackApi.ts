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

export async function fetchFeedbackList(filters: { type?: string; project_id?: string; status?: string; limit?: number }) {
    if (useSupabaseDirectly) {
        let query = supabase!
            .from('feedback')
            .select('id, project_id, type, title, description, category, severity, impact, email, screen_id, page_name, user_id, tenant_id, screenshots, status, resolved_at, created_at')
            .order('created_at', { ascending: false })
            .limit(filters.limit || 100);

        if (filters.type) query = query.eq('type', filters.type);
        if (filters.project_id) query = query.eq('project_id', filters.project_id);
        if (filters.status) query = query.eq('status', filters.status);

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data || [];
    }

    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.project_id) params.set('project_id', filters.project_id);
    if (filters.status) params.set('status', filters.status);
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

export async function fetchProjects(ownerEmail?: string) {
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

export async function fetchProjectUsage(projectId: string) {
    // Supabase-first: query tables directly when configured
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

    // Node server fallback
    try {
        const json = await apiFetch(`${API_URL}/api/projects/${encodeURIComponent(projectId)}/usage`);
        return json.data;
    } catch {
        // Neither available — return defaults
        return { plan: 'free', tickets_used: 0, tickets_limit: 50, percentage_used: 0, month: new Date().toISOString().slice(0, 7), history: [] };
    }
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

export async function fetchUserProjectIds(): Promise<string[]> {
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
}
