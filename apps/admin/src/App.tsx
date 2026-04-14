import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  FeedbackProvider,
  FeedbackButton,
  FeedbackDialog,
  FeedbackToast,
  FeedbackErrorBoundary,
  posthogSessionProvider,
} from "akk-feedback";
import {
  supabaseAdapter,
  consoleAdapter,
  httpAdapter,
} from "akk-feedback/adapters";
import "akk-feedback/styles.css";

import { useFeedbackConfig } from "./hooks/useFeedbackConfig";
import { useAuth } from "./hooks/useAuth";
import { supabase } from "./lib/supabaseClient";
import { SESSION_KEYS } from "./lib/config";
import { initPostHog, identifyPostHog, resetPostHog } from "./lib/posthog";
import { Header } from "./components/Header";

// Kick off PostHog at module load so it's ready before any component
// mounts. Returns null when VITE_POSTHOG_KEY isn't set — App then
// drops the sessionProvider so FeedbackProvider works without it.
const posthogInstance = initPostHog();
import {
  fetchUserProjectIds,
  fetchProjects,
  createProject,
} from "./lib/feedbackApi";

// Lazy loaded pages
const FeedbackListPage = lazy(() =>
  import("./pages/FeedbackListPage").then((m) => ({
    default: m.FeedbackListPage,
  })),
);
const FeedbackDetailPage = lazy(() =>
  import("./pages/FeedbackDetailPage").then((m) => ({
    default: m.FeedbackDetailPage,
  })),
);
const StatsPage = lazy(() =>
  import("./pages/StatsPage").then((m) => ({ default: m.StatsPage })),
);
const DemoPage = lazy(() =>
  import("./pages/DemoPage").then((m) => ({ default: m.DemoApp })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

// Lazy loaded auth
const AuthGateway = lazy(() => import("./auth/AuthGateway"));
const LocalLoginPage = lazy(() => import("./auth/LocalLoginPage"));
const PlanSelectionPage = lazy(() => import("./auth/PlanSelectionPage"));
const UserManagementPage = lazy(() => import("./pages/UserManagementPage"));

const hasSupabase = !!(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Loading spinner
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 border-2 border-amber-500 rounded-full border-t-transparent animate-spin" />
    </div>
  );
}

export default function App() {
  const [localAuthed, setLocalAuthed] = useState(
    () => sessionStorage.getItem(SESSION_KEYS.AUTH) === "true",
  );
  const [activeProjectId, setActiveProjectId] = useState<string>("");
  const [userProjectIds, setUserProjectIds] = useState<string[]>([]);
  const [showPlanSelection, setShowPlanSelection] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const auth = useAuth();
  const {
    config,
    rawConfig,
    isPro,
    loading,
    updateSetting,
    saveSettings,
    hasUnsavedChanges,
  } = useFeedbackConfig(activeProjectId);

  // Load user's accessible projects — show plan selection if none exist (new user)
  // Sync PostHog identity with the current auth user so person
  // properties (email, plan/role if we have them) show up on every
  // submitted ticket. Resets on logout so no identity is retained
  // between sessions. Safe no-op when PostHog isn't initialized.
  useEffect(() => {
    if (auth.isLoggedIn && auth.userId) {
      identifyPostHog(auth.userId, {
        email: auth.email ?? undefined,
        is_admin: auth.isAdmin,
      });
    } else {
      resetPostHog();
    }
  }, [auth.isLoggedIn, auth.userId, auth.email, auth.isAdmin]);

  useEffect(() => {
    if (!auth.isLoggedIn) return;
    (async () => {
      try {
        const ids = auth.isAdmin
          ? (await fetchProjects()).map((p: any) => p.id)
          : await fetchUserProjectIds();
        if (ids.length > 0) {
          setUserProjectIds(ids);
          if (!activeProjectId) setActiveProjectId(ids[0]);
          setShowPlanSelection(false);
        } else if (auth.isAdmin) {
          // Admin with no projects (first registration) — show plan selection
          setShowPlanSelection(true);
        } else {
          // Regular user with no projects — wait to be assigned
          setShowPlanSelection(false);
        }
      } catch {}
      setProjectsLoaded(true);
    })();
  }, [auth.isLoggedIn, auth.isAdmin, auth.userId, auth.email]);

  // Handle plan selection — just save the chosen plan, don't create project
  // Developer creates project manually from Admin Portal
  const [selectedPlan, setSelectedPlan] = useState<string>("free");

  const navigate = useNavigate();

  const handlePlanSelected = (planId: string) => {
    setSelectedPlan(planId);
    sessionStorage.setItem(SESSION_KEYS.SELECTED_PLAN, planId);
    setShowPlanSelection(false);
    // Land the user on the Admin Portal so they can create their first
    // project immediately — matches the signup → create flow expected
    // from both Free and Paid paths.
    navigate('/admin');
  };

  // Build adapter based on raw settings
  // Auto-use Supabase adapter when Supabase env vars are configured
  const feedbackAdapter = useMemo(() => {
    const supabaseUrl =
      rawConfig.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey =
      rawConfig.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY;
    const apiUrl = (
      import.meta.env.VITE_API_URL || "http://localhost:3000"
    ).replace(/\/$/, "");
    // Derive the WebSocket URL from the HTTP URL.
    // http://host:port → ws://host:port/api/notifications/ws
    // https://host     → wss://host/api/notifications/ws
    // When passed to httpAdapter, this enables realtime push of new
    // notifications via the Node server — the hook skips its 30-second
    // polling fallback and refetches on every WebSocket message instead.
    const wsEndpoint = apiUrl.replace(/^http/, "ws") + "/api/notifications/ws";

    switch (rawConfig.adapterId) {
      case "supabase":
        if (supabaseUrl && supabaseKey) {
          return supabaseAdapter({ supabaseUrl, supabaseKey });
        }
        return httpAdapter({ endpoint: `${apiUrl}/api/feedback`, wsEndpoint });
      case "console":
        return consoleAdapter();
      case "local":
      default:
        // Auto-use Supabase when keys are available, even if adapterId is 'local'
        if (supabaseUrl && supabaseKey) {
          return supabaseAdapter({ supabaseUrl, supabaseKey });
        }
        return httpAdapter({ endpoint: `${apiUrl}/api/feedback`, wsEndpoint });
    }
  }, [rawConfig.adapterId, rawConfig.supabaseUrl, rawConfig.supabaseKey]);

  // Hooks must be called before any early return
  const location = useLocation();
  const isAdminPortal = location.pathname === "/admin";

  // Auth gate
  const isAuthenticated = hasSupabase ? auth.isLoggedIn : localAuthed;

  if (!isAuthenticated) {
    return (
      <FeedbackErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          {hasSupabase ? (
            <AuthGateway />
          ) : (
            <LocalLoginPage onLogin={() => setLocalAuthed(true)} />
          )}
        </Suspense>
      </FeedbackErrorBoundary>
    );
  }

  // Plan selection gate — show after registration when no projects exist
  if (showPlanSelection && projectsLoaded) {
    return (
      <FeedbackErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <PlanSelectionPage onSelect={handlePlanSelected} />
        </Suspense>
      </FeedbackErrorBoundary>
    );
  }

  // Nav items
  const navItems = [
    { to: "/feedback", label: "Feedback" },
    { to: "/stats", label: "Stats" },
    { to: "/demo", label: "Demo" },
    { to: "/settings", label: "Settings" },
    ...(auth.isAdmin
      ? [
          { to: "/admin", label: "Admin Portal" },
          { to: "/users", label: "Users" },
        ]
      : []),
  ];

  const handleSignOut = () => {
    sessionStorage.removeItem(SESSION_KEYS.AUTH);
    sessionStorage.removeItem(SESSION_KEYS.LOCAL_USER);
    sessionStorage.removeItem(SESSION_KEYS.TOKEN);
    window.dispatchEvent(new Event("local-auth-change"));
    setLocalAuthed(false);
    if (hasSupabase) {
      supabase?.auth.signOut();
    }
  };

  return (
    <FeedbackErrorBoundary>
      <FeedbackProvider
        config={{
          ...config,
          projectId: activeProjectId,
          adapter: feedbackAdapter,
          userId: auth.userId || undefined,
          userEmail: auth.email || undefined,
          // Only attach the session provider when PostHog actually
          // initialized (VITE_POSTHOG_KEY was set). Otherwise stay unset
          // so the feedback flow doesn't try to read null values.
          sessionProvider: posthogInstance
            ? posthogSessionProvider(posthogInstance)
            : undefined,
        }}
      >
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans">
          <Header
            navItems={navItems}
            projectIds={userProjectIds}
            activeProjectId={activeProjectId}
            onProjectChange={setActiveProjectId}
            showProjectDropdown={!isAdminPortal}
            isAdmin={auth.isAdmin}
            email={auth.email}
            onSignOut={handleSignOut}
          />

          {/* Routes — lazy loaded with Suspense */}
          <main className="flex-1 overflow-auto">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/feedback" element={<FeedbackListPage />} />
                <Route path="/feedback/:id" element={<FeedbackDetailPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/demo" element={<DemoPage />} />
                <Route
                  path="/settings"
                  element={
                    <SettingsPage
                      config={rawConfig}
                      isPro={isPro}
                      loading={loading}
                      updateSetting={updateSetting}
                      saveSettings={() => saveSettings(activeProjectId)}
                      hasUnsavedChanges={hasUnsavedChanges}
                      isAdmin={auth.isAdmin}
                      activeProjectId={activeProjectId}
                    />
                  }
                />
                {auth.isAdmin && (
                  <Route
                    path="/admin"
                    element={
                      <AuthGateway onProjectSelect={setActiveProjectId} />
                    }
                  />
                )}
                {auth.isAdmin && (
                  <Route path="/users" element={<UserManagementPage />} />
                )}
                <Route path="*" element={<Navigate to="/feedback" replace />} />
              </Routes>
            </Suspense>
          </main>

          <FeedbackButton position="bottom-right" />
          <FeedbackDialog />
          <FeedbackToast />
        </div>
      </FeedbackProvider>
    </FeedbackErrorBoundary>
  );
}
