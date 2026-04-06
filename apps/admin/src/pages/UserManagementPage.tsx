import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { GlassCard } from '../components/GlassCard';
import { LayoutWrapper } from '../components/LayoutWrapper';
import { useAuth } from '../hooks/useAuth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const useSupabaseDirectly = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY && supabase);

interface UserRole {
    id: string;
    user_id: string;
    email: string;
    role: 'admin' | 'user';
    created_at: string;
    updated_at: string;
}

export default function UserManagementPage() {
    const [users, setUsers] = useState<UserRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
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
                const res = await fetch(`${API_URL}/api/auth/users`);
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

    const handleToggleRole = async (user: UserRole) => {
        const newRole = user.role === 'admin' ? 'user' : 'admin';

        // Prevent last admin from demoting themselves
        if (newRole === 'user' && user.user_id === userId) {
            const adminCount = users.filter(u => u.role === 'admin').length;
            if (adminCount <= 1) {
                alert('Cannot demote: you are the last admin.');
                return;
            }
        }

        if (!confirm(`Change ${user.email} from "${user.role}" to "${newRole}"?`)) return;

        setUpdating(user.user_id);
        try {
            if (useSupabaseDirectly) {
                const { error } = await supabase!
                    .from('user_roles')
                    .update({ role: newRole, updated_at: new Date().toISOString() })
                    .eq('user_id', user.user_id);
                if (error) { alert('Error: ' + error.message); return; }
            } else {
                const res = await fetch(`${API_URL}/api/auth/users/${user.user_id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
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
                                const isLastAdmin = user.role === 'admin' && adminCount <= 1 && isSelf;

                                return (
                                    <div
                                        key={user.id}
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
                                            title={isLastAdmin ? 'Cannot demote: last admin' : `Click to make ${user.role === 'admin' ? 'user' : 'admin'}`}
                                            className={`
                                                px-3 py-1 rounded-full text-[11px] font-bold tracking-tight border transition-all
                                                ${updating === user.user_id ? 'opacity-50 cursor-wait' : ''}
                                                ${isLastAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}
                                                ${user.role === 'admin'
                                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20'
                                                    : 'bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20'
                                                }
                                            `}
                                        >
                                            {updating === user.user_id ? '...' : user.role.toUpperCase()}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </GlassCard>
            </div>
        </LayoutWrapper>
    );
}
