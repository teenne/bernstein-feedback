import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { API_URL, useSupabaseDirectly, getAuthHeaders } from '../lib/config';
import { GlassCard } from '../components/GlassCard';
import { LayoutWrapper } from '../components/LayoutWrapper';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../lib/types';

export default function UserManagementPage() {
    const [users, setUsers] = useState<UserRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{ user: UserRole; newRole: string } | null>(null);
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
        } catch (err) {
            console.error('Error fetching users:', err);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    // Main admin is the first registered user (sorted by created_at ASC from server)
    const mainAdminId = users.length > 0 ? users[0].user_id : null;

    const handleToggleRole = (user: UserRole) => {
        // Block changing main admin's role
        if (user.user_id === mainAdminId && user.role === 'admin') {
            alert('Cannot change the main admin role. This is the account owner.');
            return;
        }

        const newRole = user.role === 'admin' ? 'user' : 'admin';

        // Block demoting ANY admin if they're the last one
        if (newRole === 'user' && user.role === 'admin') {
            const currentAdminCount = users.filter(u => u.role === 'admin').length;
            if (currentAdminCount <= 1) {
                alert('Cannot remove the last admin. Promote another user to admin first.');
                return;
            }
        }

        setConfirmDialog({ user, newRole });
    };

    const doToggleRole = async () => {
        if (!confirmDialog) return;
        const { user, newRole } = confirmDialog;
        setConfirmDialog(null);
        setUpdating(user.user_id);
        try {
            // Double-check last admin protection before any update
            if (newRole === 'user' && user.role === 'admin') {
                const currentAdmins = users.filter(u => u.role === 'admin').length;
                if (currentAdmins <= 1) {
                    alert('Cannot remove the last admin. Promote another user to admin first.');
                    setUpdating(null);
                    return;
                }
            }

            if (useSupabaseDirectly) {
                // Supabase: verify admin count from DB before updating
                const { count } = await supabase!
                    .from('user_roles')
                    .select('*', { count: 'exact', head: true })
                    .eq('role', 'admin');

                if (newRole === 'user' && user.role === 'admin' && (count ?? 0) <= 1) {
                    alert('Cannot remove the last admin. Promote another user to admin first.');
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

    const adminCount = users.filter(u => u.role === 'admin').length;
    const userCount = users.filter(u => u.role === 'user').length;

    return (
        <LayoutWrapper>
            <div className="max-w-4xl mx-auto space-y-8 pb-10">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage roles and permissions for your team</p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{users.length}</p>
                        <p className="text-xs text-gray-500 mt-1">Total Users</p>
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
                        <p className="text-2xl font-bold text-amber-500">{adminCount}</p>
                        <p className="text-xs text-gray-500 mt-1">Admins</p>
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
                        <p className="text-2xl font-bold text-blue-500">{userCount}</p>
                        <p className="text-xs text-gray-500 mt-1">Users</p>
                    </div>
                </div>

                <GlassCard title="All Users" description="Click the role badge to toggle between admin and user">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="h-8 w-8 border-2 border-amber-500 rounded-full border-t-transparent animate-spin" />
                        </div>
                    ) : users.length === 0 ? (
                        <p className="text-sm text-gray-500 py-8 text-center">No users found</p>
                    ) : (
                        <div className="divide-y divide-gray-100 dark:divide-white/5">
                            {users.map((user) => {
                                const isSelf = user.user_id === userId;
                                const isMainAdmin = user.user_id === mainAdminId;
                                const isLastAdmin = (user.role === 'admin' && adminCount <= 1) || isMainAdmin;

                                return (
                                    <div
                                        key={user.user_id}
                                        className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-9 w-9 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
                                                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">
                                                    {user.email.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                    {user.email}
                                                    {isSelf && <span className="ml-2 text-[10px] text-gray-400">(you)</span>}
                                                </p>
                                                <p className="text-[11px] text-gray-400">
                                                    Joined {new Date(user.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleToggleRole(user)}
                                            disabled={updating === user.user_id || isLastAdmin}
                                            title={isMainAdmin ? 'Account owner — cannot change role' : isLastAdmin ? 'Cannot demote: last admin' : `Click to make ${user.role === 'admin' ? 'user' : 'admin'}`}
                                            className={`
                                                px-3 py-1 rounded-full text-[11px] font-bold tracking-tight border transition-all
                                                ${updating === user.user_id ? 'opacity-50 cursor-wait' : ''}
                                                ${isLastAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}
                                                ${isMainAdmin
                                                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                                    : user.role === 'admin'
                                                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20'
                                                        : 'bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20'
                                                }
                                            `}
                                        >
                                            {updating === user.user_id ? '...' : isMainAdmin ? 'OWNER' : user.role.toUpperCase()}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </GlassCard>
            </div>
            <ConfirmDialog
                open={!!confirmDialog}
                title="Change Role"
                message={confirmDialog ? `Change ${confirmDialog.user.email} from "${confirmDialog.user.role}" to "${confirmDialog.newRole}"?` : ''}
                variant="warning"
                confirmLabel="Change Role"
                onConfirm={doToggleRole}
                onCancel={() => setConfirmDialog(null)}
            />
        </LayoutWrapper>
    );
}
