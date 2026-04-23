// Database table types — matches init.sql column definitions
// Gives type safety on query() results instead of using `any`

export interface UserRole {
    id: string;
    user_id: string;
    email: string;
    password_hash: string | null;
    role: 'admin' | 'user';
    created_at: string;
    updated_at: string;
}

export interface Plan {
    id: string;
    name: string;
    description: string | null;
    price_monthly: number;
    max_projects: number;
    max_tickets_per_month: number;
    features: Record<string, unknown>;
    is_active: boolean;
    display_order: number;
    created_at: string;
    updated_at: string;
}

export interface Project {
    id: string;
    name: string | null;
    owner_id: string | null;
    owner_email: string | null;
    plan: string;
    plan_id: string | null;
    plan_limits: Record<string, unknown>;
    config: Record<string, unknown>;
    api_key: string;
    created_at: string;
}

export interface ProjectMember {
    id: string;
    project_id: string;
    user_id: string;
    email: string;
    role: 'owner' | 'member' | 'viewer';
    created_at: string;
}

export interface Feedback {
    id: string;
    project_id: string;
    type: 'feedback' | 'bug_report' | 'feature_request';
    timestamp: string;
    event_id: string | null;
    title: string;
    description: string | null;
    category: string | null;
    severity: string | null;
    impact: 'blocks_me' | 'annoying' | 'minor' | null;
    email: string | null;
    url: string | null;
    route: string | null;
    screen_id: string | null;
    page_name: string | null;
    context: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    screenshots: string[];
    highlighted_element: Record<string, unknown> | null;
    user_id: string | null;
    tenant_id: string | null;
    role: string | null;
    bernstein_run_id: string | null;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    resolved_at: string | null;
    resolved_by: string | null;
    resolution_note: string | null;
    agent_notes: Array<{ at: string; author: string; note: string }>;
    created_at: string;
}

export interface FeedbackContext {
    id: string;
    feedback_id: string;
    viewport: Record<string, unknown> | null;
    user_agent: string | null;
    language: string | null;
    env: string | null;
    app_version: string | null;
    build_sha: string | null;
    console_errors: unknown[] | null;
    network_errors: unknown[] | null;
    breadcrumbs: unknown[] | null;
    timestamp: string | null;
    created_at: string;
}

export interface ProjectUsage {
    id: string;
    project_id: string;
    month: string;
    ticket_count: number;
    created_at: string;
    updated_at: string;
}

export interface Notification {
    id: string;
    project_id: string;
    feedback_id: string;
    user_id: string | null;
    type: 'status_change' | 'resolved';
    title: string;
    message: string | null;
    read: boolean;
    created_at: string;
}
