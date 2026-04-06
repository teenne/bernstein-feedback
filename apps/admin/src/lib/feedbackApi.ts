import { supabase } from './supabaseClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const hasSupabase = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// Use Supabase directly if configured, otherwise fall back to Node server
export const useSupabaseDirectly = hasSupabase && !!supabase;

// Helper: get current user ID for Node server path
async function getCurrentUserId(): Promise<string | null> {
    if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.user?.id || null;
    }
    return null;
}

export async function fetchFeedbackList(filters: { type?: string; project_id?: string; limit?: number }) {
    if (useSupabaseDirectly) {
        let query = supabase!
            .from('feedback')
            .select('id, project_id, type, title, description, category, severity, impact, email, screen_id, page_name, user_id, tenant_id, screenshots, created_at')
            .order('created_at', { ascending: false })
            .limit(filters.limit || 100);

        if (filters.type) query = query.eq('type', filters.type);
        if (filters.project_id) query = query.eq('project_id', filters.project_id);

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data || [];
    }

    // Fallback: Node server
    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.project_id) params.set('project_id', filters.project_id);
    params.set('limit', String(filters.limit || 100));

    const res = await fetch(`${API_URL}/api/feedback?${params}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
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

    const res = await fetch(`${API_URL}/api/feedback/${id}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
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
    const res = await fetch(`${API_URL}/api/feedback/stats/summary${params}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
}

export async function fetchProjects(ownerEmail?: string) {
    if (useSupabaseDirectly) {
        // RLS handles access: admins see all projects, users see only their own
        const { data, error } = await supabase!
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return data || [];
    }

    const params = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
    const res = await fetch(`${API_URL}/api/projects${params}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
}

export async function fetchUserProjectIds(): Promise<string[]> {
    if (useSupabaseDirectly) {
        // RLS returns only projects the current user can access
        const { data } = await supabase!
            .from('projects')
            .select('id');
        return (data || []).map((p: any) => p.id);
    }

    // Node server fallback: use user_id to get owned + member projects
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const res = await fetch(`${API_URL}/api/projects?user_id=${encodeURIComponent(userId)}`);
    const json = await res.json();
    if (!json.success) return [];
    return (json.data || []).map((p: any) => p.id);
}
