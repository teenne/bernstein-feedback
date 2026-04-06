import { useState, useEffect, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { SettingsPage } from '../pages/SettingsPage';
import { useFeedbackConfig } from '../hooks/useFeedbackConfig';
import { useAuth } from '../hooks/useAuth';
import { ConfirmDialog } from '../components/ConfirmDialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const useSupabaseDirectly = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY && supabase);

interface DashboardProps {
    session: Session;
    onProjectSelect?: (projectId: string) => void;
}

interface Project {
    id: string;
    name: string;
    owner_id: string;
    owner_email: string;
    plan: 'free' | 'pro';
    config?: any;
    created_at: string;
}

export default function Dashboard({ session, onProjectSelect }: DashboardProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, _setSelectedProjectId] = useState<string | null>(null);
    const setSelectedProjectId = (id: string | null) => {
        _setSelectedProjectId(id);
        if (id && onProjectSelect) onProjectSelect(id);
    };
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createForm, setCreateForm] = useState({ id: '', name: '', description: '' });
    const [createError, setCreateError] = useState('');
    const [creating, setCreating] = useState(false);
    const [members, setMembers] = useState<{ id: string; user_id: string; email: string; role: string; created_at: string }[]>([]);
    const [memberEmail, setMemberEmail] = useState('');
    const [addingMember, setAddingMember] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; variant: 'danger' | 'warning' | 'default'; confirmLabel: string; onConfirm: () => void } | null>(null);

    const { isAdmin } = useAuth();

    const {
        rawConfig,
        updateSetting,
        saveSettings,
        hasUnsavedChanges,
        isPro,
        loading: configLoading,
        fetchManagedConfig
    } = useFeedbackConfig(selectedProjectId || 'demo-app');

    const userEmail = session.user.email || '';
    const userId = session.user.id;

    const handleSignOut = async () => {
        await supabase?.auth.signOut();
    };

    const fetchProjects = async () => {
        setLoading(true);
        try {
            if (useSupabaseDirectly) {
                // RLS handles access: admins see all, users see only own projects
                let query = supabase!.from('projects').select('*').order('created_at', { ascending: false });
                if (!isAdmin) {
                    query = query.eq('owner_id', userId);
                }
                const { data, error } = await query;
                if (error) throw error;
                setProjects(data || []);
            } else {
                // Node server: admin sees all, users see owned + member projects
                const params = isAdmin ? '' : `?user_id=${encodeURIComponent(userId)}`;
                const res = await fetch(`${API_URL}/api/projects${params}`);
                const json = await res.json();
                if (json.success) setProjects(json.data || []);
            }
        } catch (err) {
            console.error('Error fetching projects:', err);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (userEmail) fetchProjects();
    }, [userEmail, isAdmin]);

    useEffect(() => {
        if (selectedProjectId) {
            fetchManagedConfig(selectedProjectId);
            fetchMembers(selectedProjectId);
        } else {
            setMembers([]);
        }
    }, [selectedProjectId, fetchManagedConfig]);

    const fetchMembers = async (projectId: string) => {
        try {
            if (useSupabaseDirectly) {
                const { data, error } = await supabase!
                    .from('project_members')
                    .select('*')
                    .eq('project_id', projectId)
                    .order('created_at', { ascending: true });
                if (!error) setMembers(data || []);
            } else {
                const res = await fetch(`${API_URL}/api/projects/${projectId}/members`);
                const json = await res.json();
                if (json.success) setMembers(json.data || []);
            }
        } catch (err) {
            console.error('Error fetching members:', err);
        }
    };

    const handleAddMember = async () => {
        if (!selectedProjectId || !memberEmail.trim()) return;
        setAddingMember(true);
        try {
            if (useSupabaseDirectly) {
                // Look up user_id from user_roles by email
                const { data: userRow } = await supabase!
                    .from('user_roles')
                    .select('user_id')
                    .eq('email', memberEmail.trim().toLowerCase())
                    .maybeSingle();

                if (!userRow) {
                    alert(`No user found with email: ${memberEmail.trim()}`);
                    setAddingMember(false);
                    return;
                }

                const { error } = await supabase!.from('project_members').upsert({
                    project_id: selectedProjectId,
                    user_id: userRow.user_id,
                    email: memberEmail.trim().toLowerCase(),
                    role: 'member',
                }, { onConflict: 'project_id,user_id' });

                if (error) alert('Error: ' + error.message);
                else { setMemberEmail(''); fetchMembers(selectedProjectId); }
            } else {
                const res = await fetch(`${API_URL}/api/projects/${selectedProjectId}/members`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: memberEmail.trim().toLowerCase() }),
                });
                const json = await res.json();
                if (!json.success) alert('Error: ' + json.error);
                else { setMemberEmail(''); fetchMembers(selectedProjectId); }
            }
        } catch { alert('Failed to connect to server'); }
        setAddingMember(false);
    };

    const handleRemoveMember = (memberId: string, memberUserId: string) => {
        if (!selectedProjectId) return;
        setConfirmDialog({
            title: 'Remove Member',
            message: 'Are you sure you want to remove this member from the project?',
            variant: 'warning',
            confirmLabel: 'Remove',
            onConfirm: () => doRemoveMember(selectedProjectId!, memberUserId),
        });
    };

    const doRemoveMember = async (projectId: string, memberUserId: string) => {
        setConfirmDialog(null);
        try {
            if (useSupabaseDirectly) {
                await supabase!.from('project_members').delete()
                    .eq('project_id', projectId)
                    .eq('user_id', memberUserId);
            } else {
                await fetch(`${API_URL}/api/projects/${projectId}/members/${memberUserId}`, { method: 'DELETE' });
            }
            fetchMembers(projectId);
        } catch { alert('Failed to connect to server'); }
    };

    const openCreateModal = () => {
        setCreateForm({ id: '', name: '', description: '' });
        setCreateError('');
        setShowCreateModal(true);
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        const id = createForm.id.trim().toLowerCase().replace(/\s+/g, '-');
        if (!id) { setCreateError('Project ID is required'); return; }
        if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id) && id.length > 1) {
            setCreateError('ID must use lowercase letters, numbers, and hyphens only');
            return;
        }

        setCreating(true);
        setCreateError('');
        try {
            if (useSupabaseDirectly) {
                const { error } = await supabase!.from('projects').insert({
                    id,
                    name: createForm.name.trim() || id,
                    owner_id: userId,
                    owner_email: userEmail,
                });
                if (error) {
                    setCreateError(error.code === '23505' ? 'Project ID already exists' : error.message);
                } else {
                    setShowCreateModal(false);
                    fetchProjects();
                    setSelectedProjectId(id);
                }
            } else {
                const res = await fetch(`${API_URL}/api/projects`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, name: createForm.name.trim() || id, owner_id: userId, owner_email: userEmail }),
                });
                const json = await res.json();
                if (!json.success) {
                    setCreateError(json.error || 'Failed to create project');
                } else {
                    setShowCreateModal(false);
                    fetchProjects();
                    setSelectedProjectId(id);
                }
            }
        } catch {
            setCreateError('Failed to connect to server');
        }
        setCreating(false);
    };

    const handleUpdatePlan = async (projectId: string, plan: 'free' | 'pro') => {
        try {
            if (useSupabaseDirectly) {
                const { error } = await supabase!.from('projects').update({ plan }).eq('id', projectId);
                if (error) alert('Error: ' + error.message);
                else fetchProjects();
            } else {
                const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ plan }),
                });
                const json = await res.json();
                if (json.success) fetchProjects();
                else alert('Error: ' + json.error);
            }
        } catch { alert('Failed to connect to server'); }
    };

    const handleDeleteProject = (projectId: string) => {
        setConfirmDialog({
            title: 'Delete Project',
            message: `Delete "${projectId}"? All feedback for this project will remain in the database.`,
            variant: 'danger',
            confirmLabel: 'Delete',
            onConfirm: () => doDeleteProject(projectId),
        });
    };

    const doDeleteProject = async (projectId: string) => {
        setConfirmDialog(null);
        try {
            if (useSupabaseDirectly) {
                const { error } = await supabase!.from('projects').delete().eq('id', projectId);
                if (error) { alert('Error: ' + error.message); return; }
                if (selectedProjectId === projectId) setSelectedProjectId(null);
                fetchProjects();
            } else {
                const res = await fetch(`${API_URL}/api/projects/${projectId}`, { method: 'DELETE' });
                const json = await res.json();
                if (json.success) {
                    if (selectedProjectId === projectId) setSelectedProjectId(null);
                    fetchProjects();
                } else {
                    alert('Error: ' + json.error);
                }
            }
        } catch { alert('Failed to connect to server'); }
    };

    return (
        <div className="flex h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans border-t border-gray-200 dark:border-gray-800">
            {/* Sidebar */}
            <aside className="w-64 border-r border-gray-200 dark:border-white/10 flex flex-col bg-white dark:bg-gray-900">
                <nav className="flex-1 p-4 space-y-1">
                    <button
                        onClick={() => setSelectedProjectId(null)}
                        className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg mb-2 w-full transition-colors ${!selectedProjectId ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-500' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-layout-dashboard w-4 h-4"><rect width="7" height="9" x="3" y="3" /><rect width="7" height="5" x="14" y="3" /><rect width="7" height="9" x="14" y="12" /><rect width="7" height="5" x="3" y="16" /></svg>
                        All Projects
                    </button>

                    <div className="pt-4 pb-2 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Your Projects</div>
                    {projects.map((p: Project) => (
                        <button
                            key={p.id}
                            onClick={() => setSelectedProjectId(p.id)}
                            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg w-full transition-colors ${selectedProjectId === p.id ? 'bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'}`}
                        >
                            <span className={`w-2 h-2 rounded-full ${p.plan === 'pro' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                            {p.id}
                        </button>
                    ))}

                    <div className="pt-6">
                        <a href="/feedback" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors w-full text-left">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-left w-4 h-4"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                            Back to Home
                        </a>
                    </div>
                </nav>

                <div className="p-4 border-t border-gray-200 dark:border-white/10">
                    <button
                        onClick={handleSignOut}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-log-out w-4 h-4"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 border-b border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900 flex items-center justify-between px-8">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                        {selectedProjectId ? `Managing: ${selectedProjectId}` : 'Dashboard'}
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-right">
                            <p className="text-gray-900 dark:text-white font-medium">Welcome back</p>
                            <p className="text-gray-500 dark:text-gray-400 text-xs">{userEmail}</p>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950">
                    {loading ? (
                        <div className="flex justify-center p-10">
                            <div className="h-8 w-8 border-2 border-amber-500 rounded-full border-t-transparent animate-spin"></div>
                        </div>
                    ) : selectedProjectId ? (
                        <div className="p-8">
                            {/* Embed Code */}
                            <div className="mb-6 bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-indigo-400">Embed Tag</p>
                                    <code className="text-[10px] text-gray-400 font-mono">
                                        &lt;script src="..." data-project-id="{selectedProjectId}"&gt;&lt;/script&gt;
                                    </code>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(`<script src="https://cdn.bernstein.ai/widget.js" data-project-id="${selectedProjectId}"></script>`);
                                            alert('Copied to clipboard!');
                                        }}
                                        className="text-xs bg-indigo-500 text-white px-3 py-1 rounded"
                                    >
                                        Copy Embed
                                    </button>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(selectedProjectId);
                                            alert('Project ID copied!');
                                        }}
                                        className="text-xs bg-gray-500 text-white px-3 py-1 rounded"
                                    >
                                        Copy ID
                                    </button>
                                </div>
                            </div>

                            {/* Members */}
                            <div className="mb-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Team Members</h3>

                                {/* Add member */}
                                <div className="flex gap-2 mb-4">
                                    <input
                                        type="email"
                                        value={memberEmail}
                                        onChange={(e) => setMemberEmail(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
                                        placeholder="Enter email to add member..."
                                        className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                                    />
                                    <button
                                        onClick={handleAddMember}
                                        disabled={addingMember || !memberEmail.trim()}
                                        className="px-3 py-1.5 text-sm font-medium bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                                    >
                                        {addingMember ? '...' : 'Add'}
                                    </button>
                                </div>

                                {/* Member list */}
                                {members.length === 0 ? (
                                    <p className="text-xs text-gray-400">No members yet. Add team members by email.</p>
                                ) : (
                                    <div className="divide-y divide-gray-100 dark:divide-white/5">
                                        {members.map((m) => (
                                            <div key={m.id} className="flex items-center justify-between py-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-7 w-7 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                                                        <span className="text-xs font-bold text-gray-400">{m.email.charAt(0).toUpperCase()}</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-gray-900 dark:text-white">{m.email}</p>
                                                        <p className="text-[10px] text-gray-400">{m.role}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveMember(m.id, m.user_id)}
                                                    className="text-[10px] text-red-400 hover:text-red-500 font-bold uppercase transition-colors"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Delete button */}
                            <div className="mb-6 flex justify-end">
                                <button
                                    onClick={() => handleDeleteProject(selectedProjectId)}
                                    className="text-xs text-red-500 hover:text-red-600 transition-colors"
                                >
                                    Delete Project
                                </button>
                            </div>

                            <SettingsPage
                                config={rawConfig}
                                isPro={isPro}
                                loading={configLoading}
                                updateSetting={updateSetting}
                                saveSettings={() => saveSettings(selectedProjectId)}
                                hasUnsavedChanges={hasUnsavedChanges}
                                activeProjectId={selectedProjectId || undefined}
                            />
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="m-8 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl h-96 flex flex-col items-center justify-center text-center p-8 bg-white/50 dark:bg-white/5">
                            <div className="h-16 w-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-folder-plus w-8 h-8 text-gray-400"><path d="M12 10v6" /><path d="M9 13h6" /><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Your Projects</h3>
                            <p className="text-sm text-gray-500 mb-4">Create a project to start collecting feedback</p>
                            <button
                                onClick={openCreateModal}
                                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-amber-500/20"
                            >
                                Create First Project
                            </button>
                        </div>
                    ) : (
                        <div className="p-8 space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold">All Projects</h3>
                                <button
                                    onClick={openCreateModal}
                                    className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                >
                                    + New Project
                                </button>
                            </div>

                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {projects.map((project: Project) => (
                                    <div
                                        key={project.id}
                                        onClick={() => setSelectedProjectId(project.id)}
                                        className="group bg-white dark:bg-gray-900 cursor-pointer p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-amber-500/50 transition-all hover:shadow-xl hover:shadow-amber-500/5"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="h-10 w-10 bg-gray-100 dark:bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-amber-500/10 transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-gray-400 group-hover:text-amber-500 transition-colors"><path d="M12 10v6" /><path d="M9 13h6" /><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight border ${project.plan === 'pro' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}>
                                                {project.plan.toUpperCase()}
                                            </span>
                                        </div>
                                        <h4 className="font-bold text-lg mb-1">{project.id}</h4>
                                        <p className="text-xs text-gray-500 mb-6">Click to manage widget settings</p>

                                        <div className="flex gap-2 pt-4 border-t border-gray-50 dark:border-white/5">
                                            {project.plan === 'free' ? (
                                                <button onClick={(e) => { e.stopPropagation(); handleUpdatePlan(project.id, 'pro'); }} className="text-[10px] font-bold text-amber-500 uppercase">Upgrade</button>
                                            ) : (
                                                <button onClick={(e) => { e.stopPropagation(); handleUpdatePlan(project.id, 'free'); }} className="text-[10px] font-bold text-gray-500 uppercase">Manage Plan</button>
                                            )}
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id); }} className="text-[10px] font-bold text-red-400 uppercase ml-auto">Delete</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Confirm Dialog */}
            <ConfirmDialog
                open={!!confirmDialog}
                title={confirmDialog?.title || ''}
                message={confirmDialog?.message || ''}
                variant={confirmDialog?.variant || 'default'}
                confirmLabel={confirmDialog?.confirmLabel || 'Confirm'}
                onConfirm={() => confirmDialog?.onConfirm()}
                onCancel={() => setConfirmDialog(null)}
            />

            {/* Create Project Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
                    <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Create New Project</h3>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleCreateProject} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Project ID <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={createForm.id}
                                    onChange={(e) => setCreateForm(f => ({ ...f, id: e.target.value }))}
                                    placeholder="e.g. my-app, backend-site"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                                    autoFocus
                                />
                                <p className="text-[11px] text-gray-400 mt-1">Lowercase letters, numbers, and hyphens only</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Display Name
                                </label>
                                <input
                                    type="text"
                                    value={createForm.name}
                                    onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="My Application (defaults to Project ID)"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Owner
                                </label>
                                <input
                                    type="text"
                                    value={userEmail}
                                    disabled
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-sm cursor-not-allowed"
                                />
                            </div>

                            {createError && (
                                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm px-3 py-2 rounded-lg">
                                    {createError}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating || !createForm.id.trim()}
                                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-lg shadow-amber-500/20"
                                >
                                    {creating ? 'Creating...' : 'Create Project'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
