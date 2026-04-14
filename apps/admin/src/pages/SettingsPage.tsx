import { useState, useEffect } from "react";
import { FeedbackConfigState } from "../hooks/useFeedbackConfig";
import { GlassCard } from "../components/GlassCard";
import { LayoutWrapper } from "../components/LayoutWrapper";
import { fetchProjectUsage } from "../lib/feedbackApi";
import { useFeedback } from "akk-feedback";

interface SettingsPageProps {
  config: FeedbackConfigState;
  updateSetting: <K extends keyof FeedbackConfigState>(
    key: K,
    value: FeedbackConfigState[K],
  ) => void;
  saveSettings: () => void;
  hasUnsavedChanges: boolean;
  isPro: boolean;
  loading: boolean;
  isAdmin?: boolean;
  activeProjectId?: string;
}

const defaultColors = [
  { name: "Bernstein", value: "#f59e0b" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Emerald", value: "#10b981" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Slate", value: "#64748b" },
];

export function SettingsPage({
  config,
  updateSetting,
  saveSettings,
  hasUnsavedChanges,
  isPro,
  loading,
  isAdmin = false,
  activeProjectId,
}: SettingsPageProps) {
  const [usage, setUsage] = useState<{ plan: string; tickets_used: number; tickets_limit: number; percentage_used: number; month: string; history: any[] } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const { lastReportId } = useFeedback();

  useEffect(() => {
    if (!activeProjectId) return;
    fetchProjectUsage(activeProjectId).then(setUsage).catch(() => {});
  }, [activeProjectId, lastReportId]);

  if (!activeProjectId) {
    return (
      <LayoutWrapper>
        <div className="max-w-4xl mx-auto flex flex-col items-center justify-center py-20">
          <div className="h-16 w-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">No Project Selected</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
            Create a project in the Admin Portal first, then configure its settings here.
          </p>
        </div>
      </LayoutWrapper>
    );
  }

  return (
    <LayoutWrapper>
      <div className="max-w-4xl mx-auto space-y-8 pb-10">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              Configuration
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Manage widget behavior and appearance.
            </p>
          </div>

          {hasUnsavedChanges && (
            <div className="flex items-center gap-4 bg-amber-500/10 border border-amber-500/20 dark:bg-amber-500/10 dark:border-amber-500/20 px-4 py-2 rounded-lg animate-in slide-in-from-right-5 fade-in duration-300">
              <span className="text-sm text-amber-700 dark:text-amber-200 font-medium">
                Unsaved changes
              </span>
              <button
                onClick={saveSettings}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-md shadow-lg transition-all active:scale-95"
              >
                Save Changes
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Settings Column */}
          <div className="md:col-span-2 space-y-6">
            {/* Subscription Status Card */}
            <GlassCard className="border-l-4 border-l-amber-500 relative overflow-hidden">
              <div className="flex justify-between items-start z-10 relative">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Subscription Status
                  </h3>
                  <div className="mt-2 flex items-center gap-2">
                    {loading ? (
                      <span className="text-gray-400 animate-pulse">
                        Checking...
                      </span>
                    ) : isPro ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Pro Plan Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-700/50 text-gray-300 border border-gray-600">
                        Free Tier
                      </span>
                    )}
                  </div>
                  <div className="mt-4 text-xs font-mono text-gray-500">
                    Project ID:{" "}
                    <span className="text-gray-300">{activeProjectId}</span>
                  </div>
                </div>

                {!isPro && !loading && (
                  <button
                    onClick={() => setShowUpgradeModal(true)}
                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-amber-900/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
                  >
                    Upgrade to Pro
                  </button>
                )}
              </div>

              {/* Background decoration for Pro */}
              {isPro && (
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              )}
            </GlassCard>

            {/* Plan Usage Card */}
            {usage && (
              <GlassCard className="border-l-4 border-l-blue-500">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Plan Usage</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{usage.month}</p>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                    usage.plan === 'pro'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400'
                  }`}>
                    {usage.tickets_limit} tickets/month
                  </span>
                </div>
                <div className="flex items-end gap-3 mb-3">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">{usage.tickets_used}</span>
                  <span className="text-sm text-gray-400 dark:text-gray-500 mb-1">/ {usage.tickets_limit}</span>
                </div>
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      usage.percentage_used >= 90
                        ? 'bg-red-500'
                        : usage.percentage_used >= 70
                          ? 'bg-amber-500'
                          : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(usage.percentage_used, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-xs text-gray-400">{usage.percentage_used}% used</span>
                  {usage.percentage_used >= 80 && !isPro && (
                    <button className="text-xs text-amber-600 dark:text-amber-400 font-semibold hover:underline">
                      Upgrade plan
                    </button>
                  )}
                  {usage.percentage_used >= 100 && (
                    <span className="text-xs text-red-500 font-semibold">Limit reached — submissions paused</span>
                  )}
                </div>
              </GlassCard>
            )}

            {/* Adapter Settings */}
            <GlassCard
              title="Storage Adapter"
              description="Choose where feedback data is stored."
            >
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 dark:bg-black/20 rounded-lg">
                  {(["local", "supabase", "console"] as const).map((id) => {
                    const isLocked = false; // All adapters available for testing
                    return (
                      <button
                        key={id}
                        onClick={() =>
                          !isLocked && updateSetting("adapterId", id)
                        }
                        disabled={isLocked}
                        className={`
                                                    px-3 py-2 text-sm font-medium rounded-md transition-all relative
                                                    ${
                                                      config.adapterId === id
                                                        ? "bg-white dark:bg-amber-500 text-gray-900 dark:text-white shadow-sm"
                                                        : isLocked
                                                          ? "opacity-50 cursor-not-allowed text-gray-400 dark:text-gray-600"
                                                          : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                                                    }
                                                `}
                      >
                        {id.charAt(0).toUpperCase() + id.slice(1)}
                      </button>
                    );
                  })}
                </div>

                {config.adapterId === "supabase" && (
                  <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-white/10 animate-in slide-in-from-top-2 fade-in duration-300">
                    <InputGroup
                      label="Supabase URL"
                      placeholder="https://your-project.supabase.co"
                      value={config.supabaseUrl}
                      onChange={(e: any) =>
                        updateSetting("supabaseUrl", e.target.value)
                      }
                    />
                    <InputGroup
                      label="Supabase Anon Key"
                      type="password"
                      placeholder="public-anon-key"
                      value={config.supabaseKey}
                      onChange={(e: any) =>
                        updateSetting("supabaseKey", e.target.value)
                      }
                    />
                    <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 p-3 rounded-lg border border-amber-200 dark:border-amber-500/20">
                      <span className="font-semibold block mb-1">
                        Important:
                      </span>
                      Ensure your Supabase project has the <code>feedback</code>{" "}
                      table created. Check the Admin Portal for SQL snippets.
                    </div>
                  </div>
                )}

                {config.adapterId === "local" && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Feedback is saved to your server local database.
                  </p>
                )}

                {config.adapterId === "console" && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Feedback is logged to the browser console. No data is
                    persisted.
                  </p>
                )}
              </div>
            </GlassCard>
          </div>

          {/* Sidebar Settings */}
          <div className="space-y-6">
            {/* Appearance */}
            <GlassCard title="Appearance">
              <div className="space-y-6">
                <div>
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Theme Mode
                  </h5>
                  <div className="bg-gray-200 dark:bg-black/20 p-1 rounded-lg inline-flex">
                    <button
                      onClick={() => updateSetting("darkMode", false)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${!config.darkMode ? "bg-white text-gray-900 shadow-sm dark:bg-amber-500 dark:text-white dark:shadow-lg" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
                    >
                      Light
                    </button>
                    <button
                      onClick={() => updateSetting("darkMode", true)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${config.darkMode ? "bg-white text-gray-900 shadow-sm dark:bg-amber-500 dark:text-white dark:shadow-lg" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
                    >
                      Dark
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Theme Color
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {defaultColors.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => updateSetting("themeColor", color.value)}
                        disabled={!isPro}
                        className={`
                                                    w-8 h-8 rounded-full border-2 transition-all 
                                                    ${
                                                      config.themeColor ===
                                                      color.value
                                                        ? "border-gray-900 dark:border-white scale-110 ring-2 ring-black/20 dark:ring-white/20"
                                                        : "border-transparent hover:scale-105"
                                                    }
                                                    ${!isPro ? "opacity-30 cursor-not-allowed" : ""}
                                                `}
                        style={{ backgroundColor: color.value }}
                        title={!isPro ? "Pro Feature" : color.name}
                      />
                    ))}

                    {/* Custom Color Picker */}
                    <div className="relative group">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 border-dashed border-gray-600 border-2 hover:border-gray-500 flex items-center justify-center cursor-pointer">
                        <span className="text-gray-400 text-xs">+</span>
                      </div>
                      <input
                        type="color"
                        value={config.themeColor}
                        onChange={(e) =>
                          updateSetting("themeColor", e.target.value)
                        }
                        disabled={!isPro}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                  {!isPro && (
                    <p className="text-xs text-amber-500/80 mt-2 flex items-center gap-1">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                      Pro feature
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-white/10">
                  <Toggle
                    label="Show Branding"
                    description="Display 'Powered by Bernstein'"
                    checked={config.showBranding ?? true}
                    onChange={(checked) =>
                      updateSetting("showBranding", checked)
                    }
                    disabled={!isPro}
                  />
                  {!isPro && (
                    <p className="text-xs text-amber-500/80 mt-2 flex items-center gap-1">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                      Pro users can hide branding
                    </p>
                  )}
                </div>
              </div>
            </GlassCard>

            {/* 
                            Diagnostics Limits:
                            Controls how much debug data (logs, network errors, breadcrumbs) is collected.
                            Limiting this is crucial for performance (to avoid slowing down the browser) 
                            and to keep the feedback payload size manageable.
                        */}
            <GlassCard title="Diagnostics Limits">
              <div className="grid gap-4">
                <InputGroup
                  label="Max Console Errors"
                  type="number"
                  value={config.maxConsoleErrors ?? 10}
                  onChange={(e: any) =>
                    updateSetting("maxConsoleErrors", parseInt(e.target.value))
                  }
                  min={0}
                  max={50}
                  disabled={!isPro}
                />
                <InputGroup
                  label="Max Network Errors"
                  type="number"
                  value={config.maxNetworkErrors ?? 5}
                  onChange={(e: any) =>
                    updateSetting("maxNetworkErrors", parseInt(e.target.value))
                  }
                  min={0}
                  max={20}
                  disabled={!isPro}
                />
                <InputGroup
                  label="Max Breadcrumbs"
                  type="number"
                  value={config.maxBreadcrumbs ?? 20}
                  onChange={(e: any) =>
                    updateSetting("maxBreadcrumbs", parseInt(e.target.value))
                  }
                  min={0}
                  max={50}
                  disabled={!isPro}
                />
                <InputGroup
                  label="Toast Duration (ms)"
                  type="number"
                  value={config.toastDuration ?? 5000}
                  onChange={(e: any) =>
                    updateSetting("toastDuration", parseInt(e.target.value))
                  }
                  min={0}
                  step={100}
                  disabled={!isPro}
                />
                {!isPro && (
                  <p className="text-xs text-amber-500/80 mt-2 flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                    Pro feature
                  </p>
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
      {/* Developer Tools / Demo Mode — Admin only */}
      {isAdmin && (
        <div className="mt-12 pt-6 border-t border-gray-200 dark:border-white/10 opacity-75 hover:opacity-100 transition-opacity">
          <GlassCard title="Developer Override">
            <Toggle
              label="Force Pro Mode"
              description="Temporarily enable Pro features for testing/demo purposes."
              checked={localStorage.getItem("bernstein_demo_pro") === "true"}
              onChange={(checked) => {
                if (checked) {
                  localStorage.setItem("bernstein_demo_pro", "true");
                } else {
                  localStorage.removeItem("bernstein_demo_pro");
                }
                window.location.reload();
              }}
            />
          </GlassCard>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div className="text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Upgrade to Pro</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Unlock higher ticket limits, multiple projects, AI clustering, PostHog integration, and more.
              </p>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-6 text-left space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-emerald-500">&#10003;</span> 5,000 tickets/month
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-emerald-500">&#10003;</span> Up to 10 projects
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-emerald-500">&#10003;</span> AI ticket clustering
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-emerald-500">&#10003;</span> PostHog session replay
                </div>
              </div>
              <a
                href="mailto:support@bernstein.ai?subject=Upgrade to Pro&body=Hi, I'd like to upgrade project: ${activeProjectId}"
                className="block w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-sm font-bold rounded-lg shadow-lg transition-all text-center"
              >
                Contact Us to Upgrade
              </a>
              <p className="text-xs text-gray-400 mt-3">We'll get back to you within 24 hours.</p>
            </div>
          </div>
        </div>
      )}
    </LayoutWrapper>
  );
}

// Sub-components for cleaner JSX

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (c: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between ${disabled ? "opacity-50" : ""}`}
    >
      <div>
        <span className="text-sm font-medium text-gray-900 dark:text-gray-200 block">
          {label}
        </span>
        {description && (
          <span className="text-xs text-gray-500 dark:text-gray-400 block mt-0.5 max-w-[200px]">
            {description}
          </span>
        )}
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50 
                    ${checked ? "bg-amber-500" : "bg-gray-700"}
                    ${disabled ? "cursor-not-allowed" : "cursor-pointer"}
                `}
      >
        <span
          className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${checked ? "translate-x-6" : "translate-x-1"}
                `}
        />
      </button>
    </div>
  );
}

function InputGroup({ label, type = "text", value, onChange, ...props }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-transparent focus:border-amber-500/50 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all placeholder-gray-400 dark:placeholder-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        {...props}
      />
    </div>
  );
}
