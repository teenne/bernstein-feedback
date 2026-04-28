// Shared interfaces used across pages

export interface Project {
    id: string;
    name: string;
    owner_id: string;
    owner_email: string;
    plan: 'free' | 'pro' | string;
    config?: any;
    created_at: string;
}

export type FeedbackPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface FeedbackItem {
    id: string;
    project_id: string;
    type: string;
    title: string;
    description: string;
    severity: string | null;
    impact: string | null;
    email: string | null;
    screen_id: string | null;
    user_id: string | null;
    screenshots: string | string[] | null;
    status: string | null;
    resolved_at: string | null;
    // Triage fields (P3)
    labels?: string[] | null;
    priority?: FeedbackPriority | null;
    // Cluster membership (Tier 2)
    cluster_id?: string | null;
    /** Populated by the list endpoint via JOIN for badge rendering */
    cluster_submission_count?: number | null;
    created_at: string;
}

export interface FeedbackDetail extends FeedbackItem {
    category: string | null;
    context: any;
    highlighted_element: any;
    metadata: any;
    tenant_id: string | null;
    role: string | null;
    page_name: string | null;
    resolved_by: string | null;
    resolution_note: string | null;
    // Session provider fields (Tier 1)
    session_id?: string | null;
    session_provider?: string | null;
    session_replay_url?: string | null;
    user_properties?: Record<string, unknown> | null;
    // Agent investigation notes (appended via Agent API)
    agent_notes?: Array<{ at: string; author: string; note: string }> | null;
}

export interface Stats {
    total: number;
    by_type: Record<string, number>;
    by_severity: Record<string, number>;
}

export interface UsageData {
    plan: string;
    tickets_used: number;
    tickets_limit: number;
    percentage_used: number;
    month: string;
    history?: { month: string; ticket_count: number }[];
}

export interface UserRole {
    id: string;
    user_id: string;
    email: string;
    role: 'admin' | 'user';
    created_at: string;
    updated_at: string;
}

export interface Plan {
    id: string;
    name: string;
    description: string;
    price_monthly: number;
    max_projects: number;
    max_tickets_per_month: number;
    features: Record<string, boolean>;
    display_order: number;
}

export interface ProjectMember {
    id: string;
    user_id: string;
    email: string;
    role: string;
    created_at: string;
}
