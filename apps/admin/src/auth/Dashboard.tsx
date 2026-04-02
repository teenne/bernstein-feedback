import { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { SettingsPage } from '../pages/SettingsPage';
import { useFeedbackConfig } from '../hooks/useFeedbackConfig';

interface DashboardProps {
    session: Session;
}

interface Project {
    id: string;
    created_at: string;
    owner_id: string;
    plan: 'free' | 'pro';
    config?: any;
}

export default function Dashboard({ session }: DashboardProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

    // Using the shared config hook but in "managed" mode
    const { 
        rawConfig, 
        updateSetting, 
        saveSettings, 
        hasUnsavedChanges, 
        isPro, 
        loading: configLoading,
        fetchManagedConfig 
    } = useFeedbackConfig(selectedProjectId || 'demo-app');

    const handleSignOut = async () => {
        await supabase?.auth.signOut();
    };

    const fetchProjects = async () => {
        if (!supabase) { setLoading(false); return; }
        setLoading(true);
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('owner_id', session.user.id);

        if (error) {
            console.error('Error fetching projects:', error);
        } else {
            setProjects((data as any) || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (session?.user?.id) {
            fetchProjects();
        }
    }, [session.user.id]);

    useEffect(() => {
        if (selectedProjectId) {
            fetchManagedConfig(selectedProjectId);
        }
    }, [selectedProjectId, fetchManagedConfig]);

    const handleCreateProject = async () => {
        const id = prompt('Enter a Project ID (e.g. backend-site):');
        if (!id) return;
        
        if (!supabase) return;
        const { error } = await supabase
            .from('projects')
            .insert([{ owner_id: session.user.id, plan: 'free', id } as any]);

        if (error) {
            alert('Error creating project: ' + error.message);
        } else {
            fetchProjects();
        }
    };

    const handleUpgrade = async (projectId: string) => {
        if (!supabase) return;
        const { error } = await supabase
            .from('projects')
            .update({ plan: 'pro' } as any)
            .eq('id', projectId);

        if (error) {
            alert('Error upgrading: ' + error.message);
        } else {
            fetchProjects();
        }
    };

    const handleDowngrade = async (projectId: string) => {
        if (!supabase) return;
        const { error } = await supabase
            .from('projects')
            .update({ plan: 'free' } as any)
            .eq('id', projectId);

        if (error) {
            alert('Error downgrading: ' + error.message);
        } else {
            fetchProjects();
        }
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
                        <button onClick={() => window.location.reload()} className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors w-full text-left">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-left w-4 h-4"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                            Back to Home
                        </button>
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
                            <p className="text-gray-500 dark:text-gray-400 text-xs">{session.user.email}</p>
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
                           <div className="mb-6 bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl flex items-center justify-between">
                               <div>
                                   <p className="text-sm font-bold text-indigo-400">Embed Tag</p>
                                   <code className="text-[10px] text-gray-400 font-mono">
                                       &lt;script src="..." data-project-id="{selectedProjectId}"&gt;&lt;/script&gt;
                                   </code>
                               </div>
                               <button 
                                   onClick={() => {
                                       navigator.clipboard.writeText(`<script src="https://cdn.bernstein.ai/widget.js" data-project-id="${selectedProjectId}"></script>`);
                                       alert('Copied to clipboard!');
                                   }}
                                   className="text-xs bg-indigo-500 text-white px-3 py-1 rounded"
                               >
                                   Copy Code
                               </button>
                           </div>

                           <SettingsPage 
                                config={rawConfig}
                                isPro={isPro}
                                loading={configLoading}
                                updateSetting={updateSetting}
                                saveSettings={() => saveSettings(selectedProjectId)}
                                hasUnsavedChanges={hasUnsavedChanges}
                           />
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="m-8 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl h-96 flex flex-col items-center justify-center text-center p-8 bg-white/50 dark:bg-white/5">
                            <div className="h-16 w-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-folder-plus w-8 h-8 text-gray-400"><path d="M12 10v6" /><path d="M9 13h6" /><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Your Projects</h3>
                            <button
                                onClick={handleCreateProject}
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
                                    onClick={handleCreateProject}
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
                                                <button onClick={(e) => { e.stopPropagation(); handleUpgrade(project.id); }} className="text-[10px] font-bold text-amber-500 uppercase">Upgrade</button>
                                             ) : (
                                                <button onClick={(e) => { e.stopPropagation(); handleDowngrade(project.id); }} className="text-[10px] font-bold text-gray-500 uppercase">Manage Plan</button>
                                             )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
