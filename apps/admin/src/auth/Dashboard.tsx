import { useState, useEffect, useRef } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import {
  API_URL,
  useSupabaseDirectly,
  getAuthHeaders,
  SESSION_KEYS,
} from "../lib/config";
import { SettingsPage } from "../pages/SettingsPage";
import { useFeedbackConfig } from "../hooks/useFeedbackConfig";
import { useAuth } from "../hooks/useAuth";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { Project, UserRole } from "../lib/types";

interface DashboardProps {
  session?: Session | null;
  onProjectSelect?: (projectId: string) => void;
  onSignOut?: () => void;
}

export default function Dashboard({
  session,
  onProjectSelect,
  onSignOut,
}: DashboardProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, _setSelectedProjectId] = useState<string | null>(
    null,
  );
  const setSelectedProjectId = (id: string | null) => {
    _setSelectedProjectId(id);
    if (id && onProjectSelect) onProjectSelect(id);
  };
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  // When the user clicks "Upgrade" on a specific project card, we remember
  // which project they want to upgrade so the modal can reference it and
  // the demo-activate button knows what to flip. Null when the modal is
  // opened generically (e.g. via a project-limit block).
  const [pendingUpgradeProjectId, setPendingUpgradeProjectId] = useState<
    string | null
  >(null);
  const [createForm, setCreateForm] = useState({
    id: "",
    name: "",
    description: "",
  });
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [members, setMembers] = useState<
    {
      id: string;
      user_id: string;
      email: string;
      role: string;
      created_at: string;
    }[]
  >([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState("");
  const [allUsers, setAllUsers] = useState<UserRole[]>([]);
  const [inputFocused, setInputFocused] = useState(false);
  const addMemberRef = useRef<HTMLDivElement>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    variant: "danger" | "warning" | "default";
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const [embedTab, setEmbedTab] = useState<"script" | "react">("script");
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const auth = useAuth();
  const { isAdmin } = auth;

  const {
    rawConfig,
    updateSetting,
    saveSettings,
    hasUnsavedChanges,
    isPro,
    loading: configLoading,
    fetchManagedConfig,
  } = useFeedbackConfig(selectedProjectId || "demo-app");

  // Support both Supabase session and local auth
  const userEmail = session?.user?.email || auth.email || "";
  const userId = session?.user?.id || auth.userId || "";


  const fetchProjects = async () => {
    setLoading(true);
    try {
      if (useSupabaseDirectly) {
        // RLS handles access: admins see all, users see only own projects
        let query = supabase!
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false });
        if (!isAdmin) {
          query = query.eq("owner_id", userId);
        }
        const { data, error } = await query;
        if (error) throw error;
        setProjects(data || []);
      } else {
        // Node server: admin sees all, users see owned + member projects
        const params = isAdmin ? "" : `?user_id=${encodeURIComponent(userId)}`;
        const res = await fetch(`${API_URL}/api/projects${params}`, {
          headers: getAuthHeaders(),
        });
        const json = await res.json();
        if (json.success) setProjects(json.data || []);
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
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

  // Fetch all registered users once so admin can pick from a list when adding members
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        if (useSupabaseDirectly) {
          const { data } = await supabase!
            .from("user_roles")
            .select("id, user_id, email, role, created_at, updated_at")
            .order("email", { ascending: true });
          setAllUsers((data as UserRole[]) || []);
        } else {
          const res = await fetch(`${API_URL}/api/auth/users`, { headers: getAuthHeaders() });
          const json = await res.json();
          if (json.success) setAllUsers(json.data || []);
        }
      } catch {}
    })();
  }, [isAdmin]);

  // Close dropdown on click outside the add-member container
  useEffect(() => {
    if (!inputFocused) return;
    const handler = (e: MouseEvent) => {
      if (!addMemberRef.current?.contains(e.target as Node)) {
        setInputFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [inputFocused]);

  const fetchMembers = async (projectId: string) => {
    try {
      if (useSupabaseDirectly) {
        const { data, error } = await supabase!
          .from("project_members")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true });
        if (!error) setMembers(data || []);
      } else {
        const res = await fetch(
          `${API_URL}/api/projects/${projectId}/members`,
          { headers: getAuthHeaders() },
        );
        const json = await res.json();
        if (json.success) setMembers(json.data || []);
      }
    } catch (err) {
      console.error("Error fetching members:", err);
    }
  };

  const handleAddMember = async (emailOverride?: string) => {
    const email = (emailOverride ?? memberEmail).trim().toLowerCase();
    if (!selectedProjectId || !email) return;
    setAddingMember(true);
    setAddMemberError("");
    setInputFocused(false);
    try {
      if (useSupabaseDirectly) {
        const { data: userRow } = await supabase!
          .from("user_roles")
          .select("user_id")
          .eq("email", email)
          .maybeSingle();

        if (!userRow) {
          setAddMemberError(`No user found with email: ${email}`);
          setAddingMember(false);
          return;
        }

        const { error } = await supabase!.from("project_members").upsert(
          { project_id: selectedProjectId, user_id: userRow.user_id, email, role: "member" },
          { onConflict: "project_id,user_id" },
        );

        if (error) setAddMemberError(error.message);
        else {
          setMemberEmail("");
          fetchMembers(selectedProjectId);
        }
      } else {
        const res = await fetch(
          `${API_URL}/api/projects/${selectedProjectId}/members`,
          {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ email }),
          },
        );
        const json = await res.json();
        if (!json.success) setAddMemberError(json.error || "Failed to add member");
        else {
          setMemberEmail("");
          fetchMembers(selectedProjectId);
        }
      }
    } catch {
      setAddMemberError("Failed to connect to server");
    }
    setAddingMember(false);
  };

  const handleRemoveMember = (
    memberId: string,
    memberUserId: string,
    memberRole?: string,
  ) => {
    if (!selectedProjectId) return;
    // Guard: owners can't be removed from a project. The UI already
    // hides the button for owners, but this catches any programmatic
    // call (stale state, double-click, etc.) before it hits the DB.
    if (memberRole === "owner") {
      setConfirmDialog({
        title: "Cannot Remove Owner",
        message:
          "The project owner cannot be removed. Transfer ownership first.",
        variant: "warning",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog(null),
      });
      return;
    }
    setConfirmDialog({
      title: "Remove Member",
      message: "Are you sure you want to remove this member from the project?",
      variant: "warning",
      confirmLabel: "Remove",
      onConfirm: () => doRemoveMember(selectedProjectId!, memberUserId),
    });
  };

  const doRemoveMember = async (projectId: string, memberUserId: string) => {
    setConfirmDialog(null);
    try {
      if (useSupabaseDirectly) {
        await supabase!
          .from("project_members")
          .delete()
          .eq("project_id", projectId)
          .eq("user_id", memberUserId);
      } else {
        await fetch(
          `${API_URL}/api/projects/${projectId}/members/${memberUserId}`,
          { method: "DELETE", headers: getAuthHeaders() },
        );
      }
      fetchMembers(projectId);
    } catch {
      alert("Failed to connect to server");
    }
  };

  const openCreateModal = () => {
    setCreateForm({ id: "", name: "", description: "" });
    setCreateError("");
    setShowCreateModal(true);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = createForm.id.trim().toLowerCase().replace(/\s+/g, "-");
    if (!id) {
      setCreateError("Project ID is required");
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id) && id.length > 1) {
      setCreateError(
        "ID must use lowercase letters, numbers, and hyphens only",
      );
      return;
    }

    // Pick up the plan the user chose on the onboarding plan-selection
    // screen (stored in sessionStorage by App.tsx handlePlanSelected).
    // Falls back to 'free' if the user skipped onboarding or navigated
    // directly to /admin. Cleared after the first successful create so
    // subsequent projects don't inherit the onboarding choice.
    const pendingPlan = (sessionStorage.getItem(SESSION_KEYS.SELECTED_PLAN) ??
      "free") as "free" | "paid";

    setCreating(true);
    setCreateError("");
    try {
      if (useSupabaseDirectly) {
        const { error } = await supabase!.from("projects").insert({
          id,
          name: createForm.name.trim() || id,
          owner_id: userId,
          owner_email: userEmail,
          plan: pendingPlan,
          plan_id: pendingPlan,
        });
        if (error) {
          setCreateError(
            error.code === "23505"
              ? "Project ID already exists"
              : error.message,
          );
        } else {
          sessionStorage.removeItem(SESSION_KEYS.SELECTED_PLAN);
          setShowCreateModal(false);
          fetchProjects();
          setSelectedProjectId(id);
        }
      } else {
        const res = await fetch(`${API_URL}/api/projects`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            id,
            name: createForm.name.trim() || id,
            owner_id: userId,
            owner_email: userEmail,
            plan_id: pendingPlan,
          }),
        });
        const json = await res.json();
        if (!json.success) {
          if (
            json.error?.includes("Upgrade") ||
            json.error?.includes("plan allows")
          ) {
            setShowCreateModal(false);
            setShowUpgradeModal(true);
          } else {
            setCreateError(json.error || "Failed to create project");
          }
        } else {
          sessionStorage.removeItem(SESSION_KEYS.SELECTED_PLAN);
          setShowCreateModal(false);
          fetchProjects();
          setSelectedProjectId(id);
        }
      }
    } catch {
      setCreateError("Failed to connect to server");
    }
    setCreating(false);
  };

  // Plan IDs in the DB are 'free' and 'paid' (see projects_plan_check
  // constraint + seeded rows in the plans table). We update BOTH
  // `plan` (legacy text column) and `plan_id` (FK to plans.id) so the
  // plan-limit lookup — which joins on plan_id — actually picks up the
  // new tier. Updating only `plan` did nothing functionally.
  const handleUpdatePlan = async (projectId: string, plan: "free" | "paid") => {
    try {
      if (useSupabaseDirectly) {
        const { error } = await supabase!
          .from("projects")
          .update({ plan, plan_id: plan })
          .eq("id", projectId);
        if (error) alert("Error: " + error.message);
        else fetchProjects();
      } else {
        const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({ plan, plan_id: plan }),
        });
        const json = await res.json();
        if (json.success) fetchProjects();
        else alert("Error: " + json.error);
      }
    } catch {
      alert("Failed to connect to server");
    }
  };

  const handleDeleteProject = (projectId: string) => {
    setConfirmDialog({
      title: "Delete Project",
      message: `Delete "${projectId}"? All feedback for this project will remain in the database.`,
      variant: "danger",
      confirmLabel: "Delete",
      onConfirm: () => doDeleteProject(projectId),
    });
  };

  const doDeleteProject = async (projectId: string) => {
    setConfirmDialog(null);
    try {
      if (useSupabaseDirectly) {
        const { error } = await supabase!
          .from("projects")
          .delete()
          .eq("id", projectId);
        if (error) {
          alert("Error: " + error.message);
          return;
        }
        if (selectedProjectId === projectId) setSelectedProjectId(null);
        fetchProjects();
      } else {
        const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
          method: "DELETE",
          headers: getAuthHeaders(),
        });
        const json = await res.json();
        if (json.success) {
          if (selectedProjectId === projectId) setSelectedProjectId(null);
          fetchProjects();
        } else {
          alert("Error: " + json.error);
        }
      }
    } catch {
      alert("Failed to connect to server");
    }
  };

  // Registered users not yet in this project, filtered by search text
  const memberEmailSet = new Set(members.map((m) => m.email.toLowerCase()));
  const suggestedUsers = allUsers.filter((u) => {
    if (memberEmailSet.has(u.email.toLowerCase())) return false;
    if (!memberEmail.trim()) return true;
    return u.email.toLowerCase().includes(memberEmail.toLowerCase().trim());
  });
  const showMemberDropdown = inputFocused && suggestedUsers.length > 0;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans border-t border-gray-200 dark:border-gray-800">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 dark:border-white/10 flex flex-col bg-white dark:bg-gray-900">
        <nav className="flex-1 p-4 space-y-1">
          <button
            onClick={() => setSelectedProjectId(null)}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg mb-2 w-full transition-colors ${!selectedProjectId ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-500" : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-layout-dashboard w-4 h-4"
            >
              <rect width="7" height="9" x="3" y="3" />
              <rect width="7" height="5" x="14" y="3" />
              <rect width="7" height="9" x="14" y="12" />
              <rect width="7" height="5" x="3" y="16" />
            </svg>
            All Projects
          </button>

          <div className="pt-4 pb-2 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            Your Projects
          </div>
          {projects.map((p: Project) => (
            <button
              key={p.id}
              onClick={() => setSelectedProjectId(p.id)}
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg w-full transition-colors ${selectedProjectId === p.id ? "bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white" : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"}`}
            >
              <span
                className={`w-2 h-2 rounded-full ${p.plan === "paid" ? "bg-emerald-500" : "bg-blue-500"}`}
              />
              {p.id}
            </button>
          ))}

          <div className="pt-6">
            <a
              href="/feedback"
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors w-full text-left"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-arrow-left w-4 h-4"
              >
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
              Back to Home
            </a>
          </div>
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-white/10">
          <button
            onClick={onSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-log-out w-4 h-4"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900 flex items-center justify-between px-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
            {selectedProjectId ? `Managing: ${selectedProjectId}` : "Dashboard"}
          </h2>
          <div className="flex items-center gap-4">
            <div className="text-sm text-right">
              <p className="text-gray-900 dark:text-white font-medium">
                Welcome back
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-xs">
                {userEmail}
              </p>
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
              {(() => {
                const color = rawConfig.themeColor || "#f59e0b";
                const scriptTag = `<script src="https://cdn.bernstein.ai/widget.js" data-project-id="${selectedProjectId}" data-theme-color="${color}"></script>`;
                const reactSnippet = `import { FeedbackProvider, FeedbackButton, FeedbackDialog } from 'akk-feedback';
import { autoAdapter } from 'akk-feedback/adapters';
import 'akk-feedback/styles.css';

function App() {
  return (
    <FeedbackProvider
      config={{
        projectId: '${selectedProjectId}',
        themeColor: '${color}',
        adapter: autoAdapter({
          supabaseUrl: 'YOUR_SUPABASE_URL',
          supabaseKey: 'YOUR_SUPABASE_ANON_KEY',
        }),
      }}
    >
      <YourApp />
      <FeedbackButton />
      <FeedbackDialog />
    </FeedbackProvider>
  );
}`;
                return (
                  <div className="mb-6 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
                    {/* Tab bar */}
                    <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-4">
                      <div className="flex">
                        <button
                          onClick={() => setEmbedTab("script")}
                          className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${embedTab === "script" ? "border-indigo-500 text-indigo-600 dark:text-indigo-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
                        >
                          Script Tag
                        </button>
                        <button
                          onClick={() => setEmbedTab("react")}
                          className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${embedTab === "react" ? "border-indigo-500 text-indigo-600 dark:text-indigo-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
                        >
                          React Package
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                          {selectedProjectId}
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(selectedProjectId, "pid")
                          }
                          className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${copied === "pid" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"}`}
                        >
                          {copied === "pid" ? "✓ Copied" : "Copy ID"}
                        </button>
                      </div>
                    </div>

                    {/* Script tab */}
                    {embedTab === "script" && (
                      <div className="p-4">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
                          Drop this before{" "}
                          <code className="font-mono">&lt;/body&gt;</code> in
                          any HTML page — no build step needed.
                        </p>
                        <pre className="text-[11px] font-mono text-gray-200 bg-gray-900 dark:bg-gray-950 p-3 rounded-lg overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                          {`<script
  src="https://cdn.bernstein.ai/widget.js"
  data-project-id="${selectedProjectId}"
  data-theme-color="${color}">
</script>`}
                        </pre>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => copyToClipboard(scriptTag, "script")}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${copied === "script" ? "bg-emerald-500 text-white" : "bg-indigo-500 hover:bg-indigo-600 text-white"}`}
                          >
                            {copied === "script" ? "✓ Copied!" : "Copy Tag"}
                          </button>
                          <span className="text-[11px] text-gray-400">
                            Auto-mounts the widget · no config needed
                          </span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-2 text-[11px] text-gray-500">
                          <span>
                            <code className="font-mono text-gray-400">
                              data-dark-mode
                            </code>{" "}
                            — enable dark theme
                          </span>
                          <span>
                            <code className="font-mono text-gray-400">
                              data-adapter-id="console"
                            </code>{" "}
                            — dev mode
                          </span>
                        </div>
                      </div>
                    )}

                    {/* React tab */}
                    {embedTab === "react" && (
                      <div className="p-4 space-y-4">
                        {/* Step 1 */}
                        <div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5 font-medium">
                            1 — Install
                          </p>
                          <div className="flex items-center gap-2 bg-gray-900 dark:bg-gray-950 px-3 py-2 rounded-lg">
                            <code className="text-[11px] font-mono text-gray-200 flex-1">
                              npm install akk-feedback
                            </code>
                            <button
                              onClick={() =>
                                copyToClipboard(
                                  "npm install akk-feedback",
                                  "npm",
                                )
                              }
                              className={`text-[10px] px-2 py-0.5 rounded font-medium flex-shrink-0 transition-colors ${copied === "npm" ? "text-emerald-400" : "text-gray-500 hover:text-gray-200"}`}
                            >
                              {copied === "npm" ? "✓" : "Copy"}
                            </button>
                          </div>
                        </div>

                        {/* Step 2 */}
                        <div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5 font-medium">
                            2 — Wrap your app
                          </p>
                          <div className="relative">
                            <pre className="text-[11px] font-mono text-gray-200 bg-gray-900 dark:bg-gray-950 p-3 rounded-lg overflow-x-auto leading-relaxed">
                              {reactSnippet}
                            </pre>
                            <button
                              onClick={() =>
                                copyToClipboard(reactSnippet, "react")
                              }
                              className={`absolute top-2 right-2 text-[10px] px-2 py-1 rounded font-medium transition-all ${copied === "react" ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                            >
                              {copied === "react" ? "✓ Copied" : "Copy"}
                            </button>
                          </div>
                        </div>

                        {/* Hint */}
                        <p className="text-[11px] text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-800">
                          Replace{" "}
                          <code className="font-mono">YOUR_SUPABASE_URL</code>{" "}
                          and{" "}
                          <code className="font-mono">
                            YOUR_SUPABASE_ANON_KEY
                          </code>{" "}
                          with your Supabase credentials. The{" "}
                          <code className="font-mono">projectId</code> is
                          already filled in.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Members */}
              <div className="mb-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">
                  Team Members
                </h3>

                {/* Add member — search input + registered-user dropdown */}
                <div ref={addMemberRef} className="relative mb-2">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={memberEmail}
                      onChange={(e) => { setMemberEmail(e.target.value); setAddMemberError(""); }}
                      onClick={() => setInputFocused(true)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
                      placeholder="Search or type email to add..."
                      className={`flex-1 px-3 py-1.5 text-sm rounded-lg border ${addMemberError ? "border-red-400 dark:border-red-500" : "border-gray-300 dark:border-gray-600"} bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none`}
                    />
                    <button
                      onClick={() => handleAddMember()}
                      disabled={addingMember || !memberEmail.trim()}
                      className="px-3 py-1.5 text-sm font-medium bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      {addingMember ? "..." : "Add"}
                    </button>
                  </div>
                  {showMemberDropdown && (
                    <div className="absolute z-30 top-full left-0 right-[52px] mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                      {suggestedUsers.map((u) => (
                        <button
                          key={u.user_id}
                          onClick={() => handleAddMember(u.email)}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                        >
                          <div className="h-7 w-7 shrink-0 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                              {u.email.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 dark:text-white truncate">{u.email}</p>
                            <p className="text-[10px] text-gray-400 uppercase">{u.role}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {addMemberError && (
                  <div className="mb-4 flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm px-3 py-2 rounded-lg">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" x2="12" y1="8" y2="12" />
                      <line x1="12" x2="12.01" y1="16" y2="16" />
                    </svg>
                    {addMemberError}
                  </div>
                )}

                {/* Member list */}
                {members.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    No members yet. Add team members by email.
                  </p>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-white/5">
                    {members.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between py-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                            <span className="text-xs font-bold text-gray-400">
                              {m.email.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm text-gray-900 dark:text-white">
                              {m.email}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {m.role}
                            </p>
                          </div>
                        </div>
                        {m.role === "owner" ? (
                          // Owners can't be removed — they created the project.
                          // To reassign ownership, transfer first (not yet in UI).
                          <span className="text-[10px] text-gray-400 font-bold uppercase">
                            Owner
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              handleRemoveMember(m.id, m.user_id, m.role)
                            }
                            className="text-[10px] text-red-400 hover:text-red-500 font-bold uppercase transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-2 pt-6 border-t border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-2 mb-6">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-gray-400"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Project Settings
                  </h3>
                </div>
                <SettingsPage
                  config={rawConfig}
                  isPro={isPro}
                  loading={configLoading}
                  updateSetting={updateSetting}
                  saveSettings={() => saveSettings(selectedProjectId)}
                  hasUnsavedChanges={hasUnsavedChanges}
                  activeProjectId={selectedProjectId || undefined}
                  isAdmin={isAdmin}
                  embedded
                />
              </div>
            </div>
          ) : projects.length === 0 ? (
            <div className="m-8 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl h-96 flex flex-col items-center justify-center text-center p-8 bg-white/50 dark:bg-white/5">
              <div className="h-16 w-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-folder-plus w-8 h-8 text-gray-400"
                >
                  <path d="M12 10v6" />
                  <path d="M9 13h6" />
                  <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                Your Projects
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Create a project to start collecting feedback
              </p>
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
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-5 h-5 text-gray-400 group-hover:text-amber-500 transition-colors"
                        >
                          <path d="M12 10v6" />
                          <path d="M9 13h6" />
                          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                        </svg>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight border ${project.plan === "pro" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-blue-500/10 text-blue-500 border-blue-500/20"}`}
                      >
                        {project.plan.toUpperCase()}
                      </span>
                    </div>
                    <h4 className="font-bold text-lg mb-1">{project.id}</h4>
                    <p className="text-xs text-gray-500 mb-6">
                      Click to manage widget settings
                    </p>

                    <div className="flex gap-2 pt-4 border-t border-gray-50 dark:border-white/5">
                      {project.plan === "free" ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Don't flip the plan directly — route through the
                            // purchase modal so users are asked to pay first.
                            setPendingUpgradeProjectId(project.id);
                            setShowUpgradeModal(true);
                          }}
                          className="text-[10px] font-bold text-amber-500 uppercase"
                        >
                          Upgrade
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdatePlan(project.id, "free");
                          }}
                          className="text-[10px] font-bold text-gray-500 uppercase"
                        >
                          Manage Plan
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(project.id);
                        }}
                        className="text-[10px] font-bold text-red-400 uppercase ml-auto"
                      >
                        Delete
                      </button>
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
        title={confirmDialog?.title || ""}
        message={confirmDialog?.message || ""}
        variant={confirmDialog?.variant || "default"}
        confirmLabel={confirmDialog?.confirmLabel || "Confirm"}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Create New Project
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
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
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, id: e.target.value }))
                  }
                  placeholder="e.g. my-app, backend-site"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                  autoFocus
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Lowercase letters, numbers, and hyphens only
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, name: e.target.value }))
                  }
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
                  {creating ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upgrade Plan Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowUpgradeModal(false);
              setPendingUpgradeProjectId(null);
            }}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
            <button
              onClick={() => {
                setShowUpgradeModal(false);
                setPendingUpgradeProjectId(null);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div className="text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-4">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {pendingUpgradeProjectId
                  ? "Purchase Paid plan"
                  : "Project limit reached"}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {pendingUpgradeProjectId ? (
                  <>
                    Upgrading{" "}
                    <strong className="text-gray-800 dark:text-gray-200">
                      {pendingUpgradeProjectId}
                    </strong>{" "}
                    to the Paid plan. Contact us to complete purchase — your
                    project switches to Paid limits as soon as payment is
                    confirmed.
                  </>
                ) : (
                  <>
                    Your current plan allows 1 project. Upgrade to create more
                    projects with higher ticket limits.
                  </>
                )}
              </p>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-6 text-left space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-emerald-500">&#10003;</span> Unlimited
                  projects
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-emerald-500">&#10003;</span> Unlimited
                  tickets / month
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-emerald-500">&#10003;</span> AI
                  clustering, PostHog, API access
                </div>
              </div>
              <a
                href={`mailto:support@bernstein.ai?subject=Upgrade%20Plan&body=${encodeURIComponent(
                  pendingUpgradeProjectId
                    ? `Hi, I'd like to upgrade project "${pendingUpgradeProjectId}" to the Paid plan.`
                    : `Hi, I'd like to upgrade my plan to create more projects.`,
                )}`}
                className="block w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-sm font-bold rounded-lg shadow-lg transition-all text-center"
              >
                Contact Sales to Purchase
              </a>
              <p className="text-xs text-gray-400 mt-3">
                We'll get back to you within 24 hours.
              </p>

              {pendingUpgradeProjectId && (
                <button
                  onClick={async () => {
                    const pid = pendingUpgradeProjectId;
                    setShowUpgradeModal(false);
                    setPendingUpgradeProjectId(null);
                    if (pid) await handleUpdatePlan(pid, "paid");
                  }}
                  className="mt-4 text-[11px] text-gray-400 hover:text-amber-500 underline underline-offset-2"
                >
                  Simulate purchase (demo) — activate Paid for{" "}
                  {pendingUpgradeProjectId}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
