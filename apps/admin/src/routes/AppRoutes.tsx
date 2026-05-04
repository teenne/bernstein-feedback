import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import type { FeedbackConfigState } from "../hooks/useFeedbackConfig";

// Page lazy imports
const FeedbackListPage = lazy(() =>
  import("../pages/FeedbackListPage").then((m) => ({
    default: m.FeedbackListPage,
  })),
);
const FeedbackDetailPage = lazy(() =>
  import("../pages/FeedbackDetailPage").then((m) => ({
    default: m.FeedbackDetailPage,
  })),
);
const StatsPage = lazy(() =>
  import("../pages/StatsPage").then((m) => ({ default: m.StatsPage })),
);
const DemoPage = lazy(() =>
  import("../pages/DemoPage").then((m) => ({ default: m.DemoApp })),
);
const SettingsPage = lazy(() =>
  import("../pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const UserManagementPage = lazy(() => import("../pages/UserManagementPage"));
const AuthGateway = lazy(() => import("../auth/AuthGateway"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 border-2 border-amber-500 rounded-full border-t-transparent animate-spin" />
    </div>
  );
}

interface AppRoutesProps {
  rawConfig: FeedbackConfigState;
  isPro: boolean;
  loading: boolean;
  updateSetting: <K extends keyof FeedbackConfigState>(
    key: K,
    value: FeedbackConfigState[K],
  ) => void;
  saveSettings: () => void;
  hasUnsavedChanges: boolean;
  isAdmin: boolean;
  activeProjectId: string;
  onProjectSelect: (id: string) => void;
  onSignOut: () => void;
}

export function AppRoutes({
  rawConfig,
  isPro,
  loading,
  updateSetting,
  saveSettings,
  hasUnsavedChanges,
  isAdmin,
  activeProjectId,
  onProjectSelect,
  onSignOut,
}: AppRoutesProps) {
  return (
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
              saveSettings={saveSettings}
              hasUnsavedChanges={hasUnsavedChanges}
              isAdmin={isAdmin}
              activeProjectId={activeProjectId}
            />
          }
        />
        {isAdmin && (
          <Route
            path="/admin"
            element={<AuthGateway onProjectSelect={onProjectSelect} onSignOut={onSignOut} />}
          />
        )}
        {isAdmin && (
          <Route path="/users" element={<UserManagementPage />} />
        )}
        <Route path="*" element={<Navigate to="/feedback" replace />} />
      </Routes>
    </Suspense>
  );
}
