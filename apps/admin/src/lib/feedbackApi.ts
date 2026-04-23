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

/**
 * Collapse clustered feedback down to one row per cluster.
 *
 * The list view is a triage surface: showing three identical "Login broken"
 * rows is exactly the noise clustering is meant to kill. So we keep the
 * most-recent row in each cluster (which already carries the right
 * submission_count via the FK join) and drop the rest. Rows without a
 * cluster_id (singletons / unclustered) are passed through unchanged.
 *
 * Input must already be sorted by created_at DESC — that's why the caller
 * uses `.order('created_at', { ascending: false })`. The first row seen
 * for a cluster wins, giving us "latest submission represents the cluster".
 */
function dedupeClusteredRows<T extends { id: string; cluster_id?: string | null }>(rows: T[]): T[] {
    const seenClusters = new Set<string>();
    const out: T[] = [];
    for (const row of rows) {
        if (row.cluster_id) {
            if (seenClusters.has(row.cluster_id)) continue;
            seenClusters.add(row.cluster_id);
        }
        out.push(row);
    }
    return out;
}

export async function fetchFeedbackList(filters: { type?: string; project_id?: string; status?: string; priority?: string; limit?: number }) {
    if (useSupabaseDirectly) {
        let query = supabase!
            .from('feedback')
            // Tier 2: pull cluster.submission_count via the FK join so the
            // list can show a "× N" badge next to rows that are part of a cluster.
            // FK name is explicit because PostgREST sees two relationships between
            // feedback and clusters (cluster_id → clusters.id, and clusters.canonical_feedback_id
            // → feedback.id) and can't auto-pick without PGRST201.
            //
            // We intentionally fetch more rows than the caller asked for (×3 with a
            // floor of 60) so that after cluster dedupe we still return ~limit items.
            // Client-side dedupe is a stopgap; a proper fix is a SQL VIEW that
            // surfaces one row per cluster, but that requires schema work.
            .select('id, project_id, type, title, description, category, severity, impact, email, screen_id, page_name, user_id, tenant_id, screenshots, status, resolved_at, labels, priority, cluster_id, clusters!feedback_cluster_id_fkey(submission_count), created_at')
            .order('created_at', { ascending: false })
            .limit(Math.max((filters.limit || 100) * 3, 60));

        if (filters.type) query = query.eq('type', filters.type);
        if (filters.project_id) query = query.eq('project_id', filters.project_id);
        if (filters.status) query = query.eq('status', filters.status);
        if (filters.priority) query = query.eq('priority', filters.priority);

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        // Flatten the joined cluster row → `cluster_submission_count` scalar,
        // so the UI doesn't need to know about the nested shape.
        const flattened = (data || []).map((row: any) => ({
            ...row,
            cluster_submission_count: row.clusters?.submission_count ?? null,
        }));
        return dedupeClusteredRows(flattened).slice(0, filters.limit || 100);
    }

    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.project_id) params.set('project_id', filters.project_id);
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    // Same over-fetch rationale as the Supabase path — the Node server
    // returns raw feedback rows and we dedupe client-side.
    params.set('limit', String(Math.max((filters.limit || 100) * 3, 60)));

    const json = await apiFetch(`${API_URL}/api/feedback?${params}`);
    return dedupeClusteredRows(json.data || []).slice(0, filters.limit || 100);
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

/**
 * Proposed fix attached to a cluster by an agent via the Agent API.
 * Populated by POST /api/v1/agent/:projectId/clusters/:id/propose-fix.
 */
export interface ProposedFix {
    summary: string;
    diff: string;
    files?: string[];
    confidence?: number | null;
    proposed_by?: string;
    proposed_at?: string;
}

export interface ClusterDetail {
    id: string;
    project_id: string;
    feedback_type: string;
    title: string;
    submission_count: number;
    first_seen_at: string;
    last_seen_at: string;
    resolved_at: string | null;
    priority_score: string | number;
    is_auto_resolvable: boolean;
    proposed_fix: ProposedFix | null;
    canonical_feedback_id: string | null;
}

export async function fetchClusterDetail(clusterId: string): Promise<ClusterDetail | null> {
    if (useSupabaseDirectly) {
        const { data, error } = await supabase!
            .from('clusters')
            .select('id, project_id, feedback_type, title, submission_count, first_seen_at, last_seen_at, resolved_at, priority_score, is_auto_resolvable, proposed_fix, canonical_feedback_id')
            .eq('id', clusterId)
            .single();
        if (error) return null;
        return data as ClusterDetail;
    }
    try {
        const json = await apiFetch(`${API_URL}/api/feedback/clusters/${encodeURIComponent(clusterId)}`);
        return json.data as ClusterDetail;
    } catch {
        return null;
    }
}

export async function approveClusterFix(clusterId: string): Promise<{ closed_count: number }> {
    if (useSupabaseDirectly) {
        // Supabase mode: resolve every member row; fan-out guard in the
        // trigger dedups the notifications.
        const { data: cluster } = await supabase!
            .from('clusters')
            .select('proposed_fix')
            .eq('id', clusterId)
            .single();
        const fix = (cluster as any)?.proposed_fix;
        if (!fix) throw new Error('No proposed_fix on this cluster. Ask the agent to submit one first.');
        const note = fix.summary ? `Auto-fix: ${fix.summary}` : 'Auto-fix approved';
        const { data, error } = await supabase!
            .from('feedback')
            .update({
                status: 'resolved',
                resolved_at: new Date().toISOString(),
                resolution_note: note,
            })
            .eq('cluster_id', clusterId)
            .not('status', 'in', '("resolved","closed")')
            .select('id');
        if (error) throw new Error(error.message);
        return { closed_count: data?.length ?? 0 };
    }
    const json = await apiFetch(`${API_URL}/api/feedback/clusters/${encodeURIComponent(clusterId)}/approve-fix`, {
        method: 'POST',
    });
    if (!json.success) throw new Error(json.error || 'Approve failed');
    return { closed_count: json.closed_count ?? 0 };
}

/**
 * (Tier 2) Fetch the other feedback rows in the same cluster as a given
 * feedback id — for the "Also reported by" panel on the detail page.
 * Returns `[]` if the feedback has no cluster or no siblings.
 */
export async function fetchClusterSiblings(feedbackId: string): Promise<Array<{
    id: string;
    title: string;
    email: string | null;
    user_id: string | null;
    created_at: string;
    status: string | null;
}>> {
    if (useSupabaseDirectly) {
        // Find the cluster_id for this feedback, then fetch all siblings.
        const { data: self, error: e1 } = await supabase!
            .from('feedback')
            .select('cluster_id')
            .eq('id', feedbackId)
            .single();
        if (e1 || !self?.cluster_id) return [];
        const { data, error } = await supabase!
            .from('feedback')
            .select('id, title, email, user_id, created_at, status')
            .eq('cluster_id', self.cluster_id)
            .neq('id', feedbackId)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw new Error(error.message);
        return data || [];
    }
    const json = await apiFetch(`${API_URL}/api/feedback/${feedbackId}/cluster-siblings`);
    return json.data || [];
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

// ──────────────────────────────────────────────────────────────
// BYOK AI keys (paid-plan, owner-only)
// ──────────────────────────────────────────────────────────────
// These always go through the Node server — Supabase-direct mode has
// no place to decrypt safely, and the admin UI only ever displays
// metadata (provider + last-4 hint).

export interface AiKeyMetadata {
    project_id: string;
    provider: 'openai';
    key_hint: string;
    updated_at: string;
}

export interface AiKeyStatus {
    data: AiKeyMetadata | null;
    byok_configured: boolean;
}

export async function fetchProjectAiKey(projectId: string): Promise<AiKeyStatus> {
    const json = await apiFetch(`${API_URL}/api/projects/${encodeURIComponent(projectId)}/ai-key`);
    return { data: json.data ?? null, byok_configured: json.byok_configured ?? false };
}

export async function saveProjectAiKey(projectId: string, apiKey: string) {
    const json = await apiFetch(`${API_URL}/api/projects/${encodeURIComponent(projectId)}/ai-key`, {
        method: 'PUT',
        body: JSON.stringify({ provider: 'openai', api_key: apiKey }),
    });
    if (!json.success) throw new Error(json.error || 'Failed to save key');
    return json.data as AiKeyMetadata;
}

export async function deleteProjectAiKey(projectId: string) {
    const json = await apiFetch(`${API_URL}/api/projects/${encodeURIComponent(projectId)}/ai-key`, {
        method: 'DELETE',
    });
    if (!json.success) throw new Error(json.error || 'Failed to remove key');
}

/**
 * Self-serve plan upgrade. Routes through POST /api/projects/:id/upgrade,
 * which in turn checks BILLING_PROVIDER on the server and either flips the
 * plan immediately (default) or returns 501 awaiting a real checkout flow.
 *
 * In Supabase-direct mode there's no server-side billing seam, so we flip
 * the row directly — same behavior the admin Dashboard has always used.
 */
export async function updateProjectPlan(projectId: string, planId: string) {
    if (useSupabaseDirectly) {
        const { error } = await supabase!
            .from('projects')
            .update({ plan: planId, plan_id: planId })
            .eq('id', projectId);
        if (error) throw new Error(error.message);
        return true;
    }
    const json = await apiFetch(`${API_URL}/api/projects/${encodeURIComponent(projectId)}/upgrade`, {
        method: 'POST',
        body: JSON.stringify({ plan_id: planId }),
    });
    if (!json.success) throw new Error(json.error || 'Plan update failed');
    return true;
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
