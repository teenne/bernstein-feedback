import { useState, useEffect, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FeedbackProvider,
  FeedbackButton,
  FeedbackDialog,
  FeedbackToast,
  FeedbackErrorBoundary,
  posthogSessionProvider,
} from "akk-feedback";
import "akk-feedback/styles.css";

import { useFeedbackConfig } from "./hooks/useFeedbackConfig";
import { useAuth } from "./hooks/useAuth";
import { useFeedbackAdapter } from "./hooks/useFeedbackAdapter";
import { useProjectLoader } from "./hooks/useProjectLoader";
import { useAuthFlash } from "./hooks/useAuthFlash";
import { supabase } from "./lib/supabaseClient";
import { SESSION_KEYS } from "./lib/config";
import { initPostHog, identifyPostHog, resetPostHog } from "./lib/posthog";
import { Header } from "./components/Header";
import { AuthToast } from "./components/AuthToast";
import { AppRoutes } from "./routes/AppRoutes";

const posthogInstance = initPostHog();

// Auth screens — lazy loaded, shown before the main app mounts
const AuthGateway = lazy(() => import("./auth/AuthGateway"));
const LocalLoginPage = lazy(() => import("./auth/LocalLoginPage"));
const PlanSelectionPage = lazy(() => import("./auth/PlanSelectionPage"));

const hasSupabase = !!(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

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

  const auth = useAuth();
  const [flash, setFlash] = useAuthFlash(auth.isLoggedIn, localAuthed);
  const {
    activeProjectId,
    setActiveProjectId,
    userProjectIds,
    showPlanSelection,
    setShowPlanSelection,
    projectsLoaded,
  } = useProjectLoader(auth);
  const {
    config,
    rawConfig,
    isPro,
    loading,
    updateSetting,
    saveSettings,
    hasUnsavedChanges,
  } = useFeedbackConfig(activeProjectId);
  const feedbackAdapter = useFeedbackAdapter(rawConfig, auth.accessToken);

  const navigate = useNavigate();
  const location = useLocation();
  const isAdminPortal = location.pathname === "/admin";
  const isAuthenticated = hasSupabase ? auth.isLoggedIn : localAuthed;

  // Sync PostHog identity with current auth user (hook — must be before any return)
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

  // All hooks are above this line. Early returns are safe from here on.

  // While auth session is being resolved (async Supabase getSession / local
  // /api/auth/me call), show a full-page spinner so the auth gate never
  // briefly appears to an already-logged-in user on hard refresh.
  if (auth.loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="h-10 w-10 border-2 border-amber-500 rounded-full border-t-transparent animate-spin" />
      </div>
    );
  }

  const handlePlanSelected = (planId: string) => {
    sessionStorage.setItem(SESSION_KEYS.SELECTED_PLAN, planId);
    setShowPlanSelection(false);
    navigate("/admin");
  };

  const handleSignOut = async () => {
    sessionStorage.removeItem(SESSION_KEYS.AUTH);
    sessionStorage.removeItem(SESSION_KEYS.LOCAL_USER);
    sessionStorage.removeItem(SESSION_KEYS.TOKEN);
    window.dispatchEvent(new Event("local-auth-change"));
    setLocalAuthed(false);
    if (hasSupabase) await supabase?.auth.signOut();
    navigate("/", { replace: true });
  };

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

  if (showPlanSelection && projectsLoaded) {
    return (
      <FeedbackErrorBoundary>
        <AuthToast
          message={flash?.message || ""}
          kind={flash?.kind || "success"}
          onDismiss={() => setFlash(null)}
        />
        <Suspense fallback={<PageLoader />}>
          <PlanSelectionPage onSelect={handlePlanSelected} />
        </Suspense>
      </FeedbackErrorBoundary>
    );
  }

  return (
    <FeedbackErrorBoundary>
      <AuthToast
        message={flash?.message || ""}
        kind={flash?.kind || "success"}
        onDismiss={() => setFlash(null)}
      />
      <FeedbackProvider
        config={{
          ...config,
          projectId: activeProjectId,
          adapter: feedbackAdapter,
          userId: auth.userId || undefined,
          userEmail: auth.email || undefined,
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
          <main className="flex-1 overflow-auto">
            <AppRoutes
              rawConfig={rawConfig}
              isPro={isPro}
              loading={loading}
              updateSetting={updateSetting}
              saveSettings={() => saveSettings(activeProjectId)}
              hasUnsavedChanges={hasUnsavedChanges}
              isAdmin={auth.isAdmin}
              activeProjectId={activeProjectId}
              onProjectSelect={setActiveProjectId}
              onSignOut={handleSignOut}
            />
          </main>
          <FeedbackButton position="bottom-right" />
          <FeedbackDialog />
          <FeedbackToast />
        </div>
      </FeedbackProvider>
    </FeedbackErrorBoundary>
  );
}
