import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { API_URL, useSupabaseDirectly, getAuthHeaders } from '../lib/config';
import { GlassCard } from '../components/GlassCard';
import { LayoutWrapper } from '../components/LayoutWrapper';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../lib/types';

type SortField = 'email' | 'role' | 'created_at';
type SortDir = 'asc' | 'desc';

const AVATAR_COLORS = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-rose-500', 'bg-orange-500', 'bg-cyan-500',
    'bg-pink-500', 'bg-teal-500',
];

function avatarColor(email: string) {
    let hash = 0;
    for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) & 0xffffffff;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function relativeTime(iso: string) {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (d === 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 30) return `${d}d ago`;
    const m = Math.floor(d / 30);
    if (m < 12) return `${m}mo ago`;
    return `${Math.floor(m / 12)}y ago`;
}

function SkeletonRow() {
    return (
        <div className="flex items-center justify-between py-4 animate-pulse">
            <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-white/10" />
                <div className="space-y-1.5">
                    <div className="h-3.5 w-44 rounded bg-gray-200 dark:bg-white/10" />
                    <div className="h-2.5 w-24 rounded bg-gray-100 dark:bg-white/5" />
                </div>
            </div>
            <div className="h-7 w-20 rounded-full bg-gray-200 dark:bg-white/10" />
        </div>
    );
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
    if (sortField !== field) return (
        <svg className="w-3 h-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
    );
    return sortDir === 'asc' ? (
        <svg className="w-3 h-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
    ) : (
        <svg className="w-3 h-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
    );
}

export default function UserManagementPage() {
    const [users, setUsers] = useState<UserRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{ user: UserRole; newRole: string } | null>(null);
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState<SortField>('created_at');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 10;
    const { userId } = useAuth();

    const fetchUsers = async () => {
        setLoading(true);
        try {
            if (useSupabaseDirectly) {
                const { data, error } = await supabase!
                    .from('user_roles')
                    .select('*')
                    .order('created_at', { ascending: true });
                if (error) throw error;
                setUsers(data || []);
            } else {
                const res = await fetch(`${API_URL}/api/auth/users`, { headers: getAuthHeaders() });
                const json = await res.json();
                if (json.success) setUsers(json.data || []);
            }
            setLastRefresh(new Date());
        } catch (err) {
            console.error('Error fetching users:', err);
        }
        setLoading(false);
    };

    useEffect(() => { fetchUsers(); }, []);

    // First registered user (sorted created_at ASC) is the account owner
    const mainAdminId = users.length > 0 ? users[0].user_id : null;
    const adminCount = users.filter(u => u.role === 'admin').length;
    const userCount = users.filter(u => u.role === 'user').length;

    const filtered = useMemo(() => {
        let list = users;
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(u => u.email.toLowerCase().includes(q));
        }
        return [...list].sort((a, b) => {
            const va = a[sortField] as string;
            const vb = b[sortField] as string;
            return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        });
    }, [users, search, sortField, sortDir]);

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const handleSort = (field: SortField) => {
        setPage(0);
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const handleSearch = (q: string) => { setSearch(q); setPage(0); };

    const handleToggleRole = (user: UserRole) => {
        if (user.user_id === mainAdminId && user.role === 'admin') {
            alert('Cannot change the account owner role.');
            return;
        }
        const newRole = user.role === 'admin' ? 'user' : 'admin';
        if (newRole === 'user' && adminCount <= 1) {
            alert('Cannot demote the last admin. Promote another user first.');
            return;
        }
        setConfirmDialog({ user, newRole });
    };

    const doToggleRole = async () => {
        if (!confirmDialog) return;
        const { user, newRole } = confirmDialog;
        setConfirmDialog(null);
        setUpdating(user.user_id);
        try {
            if (newRole === 'user' && user.role === 'admin' && adminCount <= 1) {
                alert('Cannot demote the last admin.');
                setUpdating(null);
                return;
            }
            if (useSupabaseDirectly) {
                const { count } = await supabase!
                    .from('user_roles')
                    .select('*', { count: 'exact', head: true })
                    .eq('role', 'admin');
                if (newRole === 'user' && (count ?? 0) <= 1) {
                    alert('Cannot demote the last admin.');
                    setUpdating(null);
                    return;
                }
                const { error } = await supabase!
                    .from('user_roles')
                    .update({ role: newRole, updated_at: new Date().toISOString() })
                    .eq('user_id', user.user_id);
                if (error) { alert('Error: ' + error.message); return; }
            } else {
                const res = await fetch(`${API_URL}/api/auth/users/${user.user_id}`, {
                    method: 'PATCH',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ role: newRole }),
                });
                const json = await res.json();
                if (!json.success) { alert('Error: ' + json.error); return; }
            }
            fetchUsers();
        } catch {
            alert('Failed to connect to server');
        }
        setUpdating(null);
    };

    return (
        <LayoutWrapper>
            <div className="max-w-4xl mx-auto space-y-6 pb-10">

                {/* Page header */}
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Manage roles and permissions for your team
                        </p>
                    </div>
                    <button
                        onClick={fetchUsers}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-white/10 rounded-xl hover:border-gray-300 dark:hover:border-white/20 transition-all disabled:opacity-50"
                    >
                        <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                    </button>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{users.length}</p>
                            <p className="text-xs text-gray-500">Total Users</p>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-amber-500">{adminCount}</p>
                            <p className="text-xs text-gray-500">Admins</p>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-blue-500">{userCount}</p>
                            <p className="text-xs text-gray-500">Members</p>
                        </div>
                    </div>
                </div>

                {/* User list card */}
                <GlassCard>
                    {/* Search + sort toolbar */}
                    <div className="flex items-center gap-3 mb-5">
                        <div className="relative flex-1">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Search by email..."
                                value={search}
                                onChange={e => handleSearch(e.target.value)}
                                className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all"
                            />
                            {search && (
                                <button
                                    onClick={() => handleSearch('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>

                            )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-[11px] text-gray-400 mr-0.5">Sort:</span>
                            {(['email', 'role', 'created_at'] as SortField[]).map(f => (
                                <button
                                    key={f}
                                    onClick={() => handleSort(f)}
                                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                                        sortField === f
                                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                            : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'
                                    }`}
                                >
                                    {f === 'email' ? 'Email' : f === 'role' ? 'Role' : 'Joined'}
                                    <SortIcon field={f} sortField={sortField} sortDir={sortDir} />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Column sub-header */}
                    {!loading && filtered.length > 0 && (
                        <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-gray-100 dark:border-white/5">
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                                {search
                                    ? `${filtered.length} of ${users.length} users`
                                    : `${users.length} user${users.length !== 1 ? 's' : ''}`}
                            </p>
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Role</p>
                        </div>
                    )}

                    {/* Content */}
                    {loading ? (
                        <div className="divide-y divide-gray-100 dark:divide-white/5">
                            {[1, 2, 3, 4].map(i => <SkeletonRow key={i} />)}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-4">
                                <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {search ? 'No users match your search' : 'No users found'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                {search ? 'Try a different email address' : 'Users will appear here once they sign up'}
                            </p>
                            {search && (
                                <button
                                    onClick={() => handleSearch('')}
                                    className="mt-3 text-xs text-amber-500 hover:text-amber-600 font-medium transition-colors"
                                >
                                    Clear search
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-white/5">
                            {paginated.map((user) => {
                                const isSelf = user.user_id === userId;
                                const isMainAdmin = user.user_id === mainAdminId;
                                const isLastAdmin = isMainAdmin || (user.role === 'admin' && adminCount <= 1);
                                const isUpdating = updating === user.user_id;
                                const color = avatarColor(user.email);

                                return (
                                    <div
                                        key={user.user_id}
                                        className="flex items-center justify-between py-3.5 first:pt-1 last:pb-0 group"
                                    >
                                        {/* Left: avatar + info */}
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
                                                <span className="text-sm font-bold text-white">
                                                    {user.email.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                        {user.email}
                                                    </p>
                                                    {isSelf && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/5 text-gray-400 font-medium flex-shrink-0">
                                                            you
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-gray-400 mt-0.5">
                                                    Joined {relativeTime(user.created_at)}
                                                    {' · '}
                                                    {new Date(user.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Right: role badge + action */}
                                        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                                            <span className={`
                                                px-2.5 py-1 rounded-full text-[11px] font-bold tracking-tight border
                                                ${isMainAdmin
                                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                                    : user.role === 'admin'
                                                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                        : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                                }
                                            `}>
                                                {isMainAdmin ? 'OWNER' : user.role.toUpperCase()}
                                            </span>

                                            {!isLastAdmin && (
                                                <button
                                                    onClick={() => handleToggleRole(user)}
                                                    disabled={isUpdating}
                                                    title={user.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                                                    className={`
                                                        opacity-0 group-hover:opacity-100 focus:opacity-100
                                                        px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all
                                                        ${isUpdating
                                                            ? 'opacity-50 cursor-wait'
                                                            : user.role === 'admin'
                                                                ? 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 dark:hover:border-red-500/30'
                                                                : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 dark:hover:border-amber-500/30'
                                                        }
                                                    `}
                                                >
                                                    {isUpdating ? '...' : user.role === 'admin' ? 'Demote' : 'Make Admin'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Footer: pagination + meta */}
                    {!loading && users.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-white/5 flex items-center justify-between gap-4">
                            <p className="text-[11px] text-gray-400 flex-shrink-0">
                                Updated {lastRefresh.toLocaleTimeString()}
                            </p>

                            {totalPages > 1 && (
                                <div className="flex items-center gap-1">
                                    {/* First */}
                                    <button
                                        onClick={() => setPage(0)}
                                        disabled={page === 0}
                                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        title="First page"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                                        </svg>
                                    </button>
                                    {/* Prev */}
                                    <button
                                        onClick={() => setPage(p => Math.max(0, p - 1))}
                                        disabled={page === 0}
                                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        title="Previous page"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>

                                    {/* Page numbers */}
                                    <div className="flex items-center gap-0.5">
                                        {Array.from({ length: totalPages }, (_, i) => {
                                            const show = i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1;
                                            const showDot = !show && (i === 1 || i === totalPages - 2);
                                            if (showDot) return (
                                                <span key={i} className="text-[11px] text-gray-300 dark:text-gray-600 px-0.5">…</span>
                                            );
                                            if (!show) return null;
                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => setPage(i)}
                                                    className={`h-7 min-w-[28px] px-1 rounded-lg text-[11px] font-medium transition-all ${
                                                        i === page
                                                            ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                                                            : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
                                                    }`}
                                                >
                                                    {i + 1}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Next */}
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                        disabled={page === totalPages - 1}
                                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        title="Next page"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                    {/* Last */}
                                    <button
                                        onClick={() => setPage(totalPages - 1)}
                                        disabled={page === totalPages - 1}
                                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                        title="Last page"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                            )}

                            <p className="text-[11px] text-gray-400 flex-shrink-0">
                                {filtered.length > PAGE_SIZE
                                    ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`
                                    : `${filtered.length} user${filtered.length !== 1 ? 's' : ''}`
                                }
                            </p>
                        </div>
                    )}
                </GlassCard>
            </div>

            <ConfirmDialog
                open={!!confirmDialog}
                title={confirmDialog?.newRole === 'admin' ? 'Promote to Admin' : 'Demote to Member'}
                message={
                    confirmDialog
                        ? `Change ${confirmDialog.user.email} from "${confirmDialog.user.role}" to "${confirmDialog.newRole}"?`
                        : ''
                }
                variant={confirmDialog?.newRole === 'admin' ? 'warning' : 'danger'}
                confirmLabel={confirmDialog?.newRole === 'admin' ? 'Promote' : 'Demote'}
                onConfirm={doToggleRole}
                onCancel={() => setConfirmDialog(null)}
            />
        </LayoutWrapper>
    );
}
