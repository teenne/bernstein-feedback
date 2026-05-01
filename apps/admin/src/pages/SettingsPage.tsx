import { useState, useEffect } from "react";
import { FeedbackConfigState } from "../hooks/useFeedbackConfig";
import { GlassCard } from "../components/GlassCard";
import { LayoutWrapper } from "../components/LayoutWrapper";
import {
  fetchProjectUsage,
  fetchProjectAiKey,
  saveProjectAiKey,
  deleteProjectAiKey,
  fetchProjectAgentWebhook,
  saveProjectRepoUrl,
  fetchProjectGitToken,
  saveProjectGitToken,
  deleteProjectGitToken,
  fetchProjectAgentApiKey,
  rotateProjectAgentApiKey,
  type AiKeyMetadata,
} from "../lib/feedbackApi";
import { API_URL } from "../lib/config";
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
  /** When true, skips LayoutWrapper — use when embedding inside another layout (e.g. Dashboard) */
  embedded?: boolean;
}

const defaultColors = [
  { name: "Bernstein", value: "#f59e0b" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Emerald", value: "#10b981" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Slate", value: "#64748b" },
];

// ── Small shared helpers ─────────────────────────────────────────────────────

function SectionLabel({
  icon,
  title,
  description,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-center flex-shrink-0 text-gray-500 dark:text-gray-400">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
            {title}
          </h3>
          {description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
      {badge}
    </div>
  );
}

function ProLockNote({ className = "" }: { className?: string }) {
  return (
    <p
      className={`text-xs text-amber-500/80 flex items-center gap-1 ${className}`}
    >
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
  );
}

// ── Section icons ─────────────────────────────────────────────────────────────

const BillingIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <line x1="2" y1="10" x2="22" y2="10" />
  </svg>
);

const WidgetIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const SparklesIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
    <path d="M19 13L19.75 15.25L22 16L19.75 16.75L19 19L18.25 16.75L16 16L18.25 15.25L19 13Z" />
    <path d="M5 3L5.5 4.5L7 5L5.5 5.5L5 7L4.5 5.5L3 5L4.5 4.5L5 3Z" />
  </svg>
);

const CodeIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

// ── Main page ─────────────────────────────────────────────────────────────────

export function SettingsPage({
  config,
  updateSetting,
  saveSettings,
  hasUnsavedChanges,
  isPro,
  loading,
  isAdmin = false,
  activeProjectId,
  embedded = false,
}: SettingsPageProps) {
  const [usage, setUsage] = useState<{
    plan: string;
    tickets_used: number;
    tickets_limit: number;
    percentage_used: number;
    month: string;
    history: any[];
  } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [hexInput, setHexInput] = useState(config.themeColor ?? "#f59e0b");
  const { lastReportId } = useFeedback();

  // Keep hex text field in sync when color changes externally (swatch, picker)
  useEffect(() => {
    setHexInput(config.themeColor ?? "#f59e0b");
  }, [config.themeColor]);

  useEffect(() => {
    if (!activeProjectId) return;
    fetchProjectUsage(activeProjectId)
      .then(setUsage)
      .catch(() => {});
  }, [activeProjectId, lastReportId]);

  const Wrapper = embedded
    ? ({ children }: { children: React.ReactNode }) => <>{children}</>
    : LayoutWrapper;

  if (!activeProjectId) {
    return (
      <Wrapper>
        <div className="w-full flex flex-col items-center justify-center py-20">
          <div className="h-16 w-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            No Project Selected
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
            Create a project in the Admin Portal first, then configure its
            settings here.
          </p>
        </div>
      </Wrapper>
    );
  }

  const usagePct = usage?.percentage_used ?? 0;

  return (
    <Wrapper>
      <div className="w-full pb-12">
        {/* ── Page Header — hidden when embedded (Dashboard already shows project context) ── */}
        {!embedded && (
          <div className="flex justify-between items-start mb-10">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                Settings
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Configure your project's widget, integrations, and AI features.
              </p>
            </div>
          </div>
        )}

        {/* Unsaved changes banner — always visible */}
        {hasUnsavedChanges && (
          <div
            className={`flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 rounded-xl animate-in slide-in-from-top-2 fade-in duration-300 ${embedded ? "mb-6" : "mb-10 -mt-4"}`}
          >
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                Unsaved changes
              </span>
            </div>
            <button
              onClick={saveSettings}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg shadow transition-all active:scale-95"
            >
              Save
            </button>
          </div>
        )}

        <div className="space-y-10">
          {/* ══ Plan & Billing ══ */}
          <section>
            <SectionLabel
              icon={<BillingIcon />}
              title="Plan & Billing"
              description="Subscription status and monthly ticket usage"
            />
            <div className="grid md:grid-cols-2 gap-4">
              {/* Subscription Status */}
              <GlassCard className="border-l-4 border-l-amber-500 relative overflow-hidden">
                <div className="flex justify-between items-start relative z-10">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      Subscription
                    </p>
                    {loading ? (
                      <span className="text-sm text-gray-400 animate-pulse">
                        Checking…
                      </span>
                    ) : isPro ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Pro Plan Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-200 dark:bg-white/5 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-white/10">
                        Free Tier
                      </span>
                    )}
                    <p className="mt-4 text-xs font-mono text-gray-400 dark:text-gray-500 truncate">
                      ID:{" "}
                      <span className="text-gray-600 dark:text-gray-300">
                        {activeProjectId}
                      </span>
                    </p>
                  </div>
                  {!isPro && !loading && (
                    <button
                      onClick={() => setShowUpgradeModal(true)}
                      className="ml-3 flex-shrink-0 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-amber-900/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
                    >
                      Upgrade
                    </button>
                  )}
                </div>
                {isPro && (
                  <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                )}
              </GlassCard>

              {/* Plan Usage */}
              {usage ? (
                <GlassCard className="border-l-4 border-l-blue-500">
                  <div className="flex justify-between items-start mb-5">
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                        Monthly Usage
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {usage.month}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg tabular-nums ${
                        usagePct >= 90
                          ? "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                          : usagePct >= 70
                            ? "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                            : "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                      }`}
                    >
                      {usagePct}%
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
                      {usage.tickets_used}
                    </span>
                    <span className="text-sm text-gray-400 dark:text-gray-500">
                      / {usage.tickets_limit} tickets
                    </span>
                  </div>
                  <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        usagePct >= 90
                          ? "bg-red-500"
                          : usagePct >= 70
                            ? "bg-amber-500"
                            : "bg-blue-500"
                      }`}
                      style={{ width: `${Math.min(usagePct, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-end mt-2.5">
                    {usagePct >= 80 && !isPro && (
                      <button
                        onClick={() => setShowUpgradeModal(true)}
                        className="text-xs text-amber-600 dark:text-amber-400 font-semibold hover:underline"
                      >
                        Upgrade for more →
                      </button>
                    )}
                    {usagePct >= 100 && (
                      <span className="text-xs text-red-500 font-semibold">
                        Limit reached — submissions paused
                      </span>
                    )}
                  </div>
                </GlassCard>
              ) : (
                <GlassCard className="border-l-4 border-l-gray-200 dark:border-l-gray-700">
                  <div className="flex items-center justify-center h-28">
                    <span className="text-sm text-gray-400 animate-pulse">
                      Loading usage…
                    </span>
                  </div>
                </GlassCard>
              )}
            </div>
          </section>

          {/* ══ Widget Configuration ══ */}
          <section>
            <SectionLabel
              icon={<WidgetIcon />}
              title="Widget Configuration"
              description="Data storage adapter, appearance, and diagnostics settings"
            />
            <div className="space-y-4">
              {/* Storage Adapter */}
              <GlassCard
                title="Storage Adapter"
                description="Choose where feedback data is stored."
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 dark:bg-black/20 rounded-lg">
                    {(["local", "supabase", "console"] as const).map((id) => (
                      <button
                        key={id}
                        onClick={() => updateSetting("adapterId", id)}
                        className={`px-3 py-2 text-sm font-medium rounded-md transition-all ${
                          config.adapterId === id
                            ? "bg-white dark:bg-amber-500 text-gray-900 dark:text-white shadow-sm"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                        }`}
                      >
                        {id.charAt(0).toUpperCase() + id.slice(1)}
                      </button>
                    ))}
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
                        Ensure your Supabase project has the{" "}
                        <code className="font-mono">feedback</code> table
                        created. Check the Admin Portal for SQL snippets.
                      </div>
                    </div>
                  )}
                  {config.adapterId === "local" && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Feedback is saved to your server's local database.
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

              {/* Appearance + Diagnostics side by side */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* Appearance */}
                <GlassCard title="Appearance">
                  <div className="space-y-5">
                    <div>
                      <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        Theme Mode
                      </h5>
                      <div className="bg-gray-100 dark:bg-black/20 p-1 rounded-lg inline-flex">
                        <button
                          onClick={() => updateSetting("darkMode", false)}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                            !config.darkMode
                              ? "bg-white text-gray-900 shadow-sm dark:bg-amber-500 dark:text-white"
                              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                          }`}
                        >
                          Light
                        </button>
                        <button
                          onClick={() => updateSetting("darkMode", true)}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                            config.darkMode
                              ? "bg-white text-gray-900 shadow-sm dark:bg-amber-500 dark:text-white"
                              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                          }`}
                        >
                          Dark
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        Theme Color
                      </label>
                      <div className="flex flex-wrap gap-2.5 mb-3">
                        {defaultColors.map((color) => (
                          <button
                            key={color.value}
                            onClick={() =>
                              updateSetting("themeColor", color.value)
                            }
                            disabled={!isPro}
                            className={`w-7 h-7 rounded-full border-2 transition-all ${
                              config.themeColor === color.value
                                ? "border-gray-900 dark:border-white scale-110 ring-2 ring-black/20 dark:ring-white/20"
                                : "border-transparent hover:scale-105"
                            } ${!isPro ? "opacity-30 cursor-not-allowed" : ""}`}
                            style={{ backgroundColor: color.value }}
                            title={!isPro ? "Pro Feature" : color.name}
                          />
                        ))}
                        <div className="relative group">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 border-dashed border-2 border-gray-400 dark:border-gray-500 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity">
                            <span className="text-gray-600 dark:text-gray-300 text-xs leading-none">
                              +
                            </span>
                          </div>
                          <input
                            type="color"
                            value={config.themeColor}
                            onChange={(e) => updateSetting("themeColor", e.target.value)}
                            disabled={!isPro}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full disabled:cursor-not-allowed"
                          />
                        </div>
                      </div>
                      {/* Hex text input */}
                      <div className="flex items-center gap-2 mt-2">
                        <div
                          className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 flex-shrink-0"
                          style={{ backgroundColor: config.themeColor }}
                        />
                        <input
                          type="text"
                          value={hexInput}
                          disabled={!isPro}
                          placeholder="#f59e0b"
                          maxLength={7}
                          onChange={(e) => {
                            let val = e.target.value;
                            if (val && !val.startsWith("#")) val = "#" + val;
                            setHexInput(val);
                            if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                              updateSetting("themeColor", val.toLowerCase());
                            }
                          }}
                          onBlur={() => {
                            if (!/^#[0-9a-fA-F]{6}$/.test(hexInput)) {
                              setHexInput(config.themeColor ?? "#f59e0b");
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          className="w-24 px-2 py-1 text-xs font-mono rounded-md border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                      </div>
                      {!isPro && <ProLockNote className="mt-2" />}
                    </div>

                    <div className="pt-4 border-t border-gray-200 dark:border-white/10">
                      <Toggle
                        label="Show Branding"
                        description="Display 'Powered by Bernstein'"
                        checked={config.showBranding ?? true}
                        onChange={(checked) =>
                          updateSetting("showBranding", checked)
                        }
                        disabled={!isPro}
                      />
                      {!isPro && <ProLockNote className="mt-2" />}
                    </div>
                  </div>
                </GlassCard>

                {/* Diagnostics */}
                <GlassCard title="Diagnostics Limits">
                  <div className="space-y-4">
                    <InputGroup
                      label="Max Console Errors"
                      type="number"
                      value={config.maxConsoleErrors ?? 10}
                      onChange={(e: any) =>
                        updateSetting(
                          "maxConsoleErrors",
                          parseInt(e.target.value),
                        )
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
                        updateSetting(
                          "maxNetworkErrors",
                          parseInt(e.target.value),
                        )
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
                        updateSetting(
                          "maxBreadcrumbs",
                          parseInt(e.target.value),
                        )
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
                    {!isPro && <ProLockNote />}
                  </div>
                </GlassCard>
              </div>
            </div>
          </section>

          {/* ══ AI & Automation ══ */}
          <section>
            <SectionLabel
              icon={<SparklesIcon />}
              title="AI & Automation"
              description="AI-powered ticket clustering and automatic fix generation"
              badge={
                !isPro ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full shadow-sm shadow-amber-500/20">
                    PRO
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Active
                  </span>
                )
              }
            />

            {isPro && activeProjectId ? (
              <div className="space-y-4">
                <AiClusteringKeyCard projectId={activeProjectId} />
                <AgentApiKeyCard projectId={activeProjectId} />
                <AgentConfigCard projectId={activeProjectId} />
                <PostHogIntegrationCard projectId={activeProjectId} />
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden">
                {/* Blurred teaser */}
                <div
                  className="space-y-4 pointer-events-none select-none"
                  style={{ filter: "blur(3px)", opacity: 0.45 }}
                >
                  <div className="rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-6">
                    <div className="h-4 bg-gray-200 dark:bg-white/10 rounded-full w-52 mb-4" />
                    <div className="h-3 bg-gray-100 dark:bg-white/5 rounded-full w-full mb-2" />
                    <div className="h-3 bg-gray-100 dark:bg-white/5 rounded-full w-3/4 mb-2" />
                    <div className="h-8 bg-gray-100 dark:bg-white/5 rounded-lg w-full mt-4" />
                  </div>
                  <div className="rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-6">
                    <div className="h-4 bg-gray-200 dark:bg-white/10 rounded-full w-44 mb-4" />
                    <div className="h-3 bg-gray-100 dark:bg-white/5 rounded-full w-full mb-2" />
                    <div className="h-8 bg-gray-100 dark:bg-white/5 rounded-lg w-full mt-4" />
                    <div className="h-8 bg-gray-100 dark:bg-white/5 rounded-lg w-full mt-3" />
                  </div>
                </div>
                {/* Lock overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-white/40 dark:bg-gray-950/60 backdrop-blur-[2px]">
                  <div className="text-center bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 p-8 max-w-sm mx-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
                      <svg
                        width="22"
                        height="22"
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
                    <h4 className="text-base font-bold text-gray-900 dark:text-white mb-1.5">
                      Pro Feature
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
                      Upgrade to Pro to unlock AI ticket clustering and
                      automatic fix generation with GPT-4o.
                    </p>
                    <button
                      onClick={() => setShowUpgradeModal(true)}
                      className="w-full px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-amber-900/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
                    >
                      Upgrade to Pro
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ══ Developer (Admin only) ══ */}
          {isAdmin && (
            <section className="opacity-60 hover:opacity-100 transition-opacity duration-300">
              <SectionLabel
                icon={<CodeIcon />}
                title="Developer"
                description="Admin-only tools for testing and development"
              />
              <GlassCard title="Developer Override">
                <Toggle
                  label="Force Pro Mode"
                  description="Temporarily enable Pro features for testing or demo purposes."
                  checked={
                    localStorage.getItem("bernstein_demo_pro") === "true"
                  }
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
            </section>
          )}
        </div>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
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
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-5 shadow-xl shadow-amber-500/30">
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
                Upgrade to Pro
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                Unlock higher ticket limits, multiple projects, AI clustering,
                automatic fix generation, and more.
              </p>
              <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4 mb-6 text-left space-y-2.5">
                {[
                  "5,000 tickets / month",
                  "Up to 10 projects",
                  "AI ticket clustering",
                  "Automatic fix generation (GPT-4o)",
                  "PostHog session replay",
                ].map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-emerald-500 flex-shrink-0"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {feat}
                  </div>
                ))}
              </div>
              <a
                href={`mailto:support@bernstein.ai?subject=Upgrade to Pro&body=Hi, I'd like to upgrade project: ${activeProjectId}`}
                className="block w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all text-center hover:-translate-y-0.5 active:translate-y-0"
              >
                Contact Us to Upgrade
              </a>
              <p className="text-xs text-gray-400 mt-3">
                We'll get back to you within 24 hours.
              </p>
            </div>
          </div>
        </div>
      )}
    </Wrapper>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AgentApiKeyCard({ projectId }: { projectId: string }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchProjectAgentApiKey(projectId);
      setApiKey(data.api_key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load key");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const onCopy = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onRotate = async () => {
    if (!confirm("Rotate the Agent API key? Any CI runner or external agent using the current key will stop working until updated.")) return;
    setRotating(true);
    setError(null);
    try {
      const data = await rotateProjectAgentApiKey(projectId);
      setApiKey(data.api_key);
      setRevealed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rotation failed");
    } finally {
      setRotating(false);
    }
  };

  const masked = apiKey ? `${apiKey.slice(0, 8)}${"•".repeat(20)}${apiKey.slice(-4)}` : "";

  return (
    <GlassCard title="Agent API Key">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Pass this key as <code className="text-xs bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded font-mono">X-API-Key</code> when calling the Agent API endpoints. Store it in your CI secrets — never commit it to source control.
        </p>

        {loading ? (
          <p className="text-sm text-gray-400 animate-pulse">Loading…</p>
        ) : error ? (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 font-mono text-sm text-gray-800 dark:text-gray-200 overflow-hidden">
              <span className="truncate">{revealed && apiKey ? apiKey : masked}</span>
            </div>
            <button
              type="button"
              onClick={() => setRevealed(v => !v)}
              className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 rounded-lg transition-colors"
            >
              {revealed ? "Hide" : "Show"}
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 rounded-lg transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Used by external agents (Claude Code, Codex, CI runners) to read the backlog and propose fixes.
          </p>
          <button
            type="button"
            onClick={onRotate}
            disabled={rotating || loading}
            className="ml-4 flex-shrink-0 text-xs text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50"
          >
            {rotating ? "Rotating…" : "Rotate key"}
          </button>
        </div>
      </div>
    </GlassCard>
  );
}

function AiClusteringKeyCard({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<AiKeyMetadata | null>(null);
  const [byokConfigured, setByokConfigured] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchProjectAiKey(projectId);
      setMeta(res.data);
      setByokConfigured(res.byok_configured);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load key status",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const onSave = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const saved = await saveProjectAiKey(projectId, apiKey);
      setMeta(saved);
      setApiKey("");
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onRemove = async () => {
    if (
      !confirm(
        "Remove the AI clustering key for this project? Clustering will fall back to the global key, or stop if none is configured.",
      )
    )
      return;
    setError(null);
    setSubmitting(true);
    try {
      await deleteProjectAiKey(projectId);
      setMeta(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassCard title="AI Clustering Key (BYOK)">
      {loading ? (
        <p className="text-sm text-gray-400 animate-pulse">Loading…</p>
      ) : !byokConfigured ? (
        <div className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg p-3 border border-amber-200 dark:border-amber-500/30">
          BYOK is not yet enabled on this server. Set{" "}
          <code className="text-xs bg-white/50 dark:bg-white/10 px-1 rounded font-mono">
            AI_KEY_ENCRYPTION_SECRET
          </code>{" "}
          in{" "}
          <code className="text-xs bg-white/50 dark:bg-white/10 px-1 rounded font-mono">
            server/.env
          </code>{" "}
          and restart. Clustering will use the global{" "}
          <code className="text-xs bg-white/50 dark:bg-white/10 px-1 rounded font-mono">
            OPENAI_API_KEY
          </code>{" "}
          until then.
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Paste an OpenAI API key to have this project's clustering charged to
            your own account. Keys are encrypted at rest and never leave the
            server.
          </p>

          {meta ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  Key configured
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
                  {meta.key_hint} · updated{" "}
                  {new Date(meta.updated_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={onRemove}
                disabled={submitting}
                className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 ml-4"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                No key set — falls back to the server's global key, if
                configured.
              </span>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
              {meta ? "Replace key" : "Set key"}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-proj-..."
                autoComplete="off"
                spellCheck={false}
                className="flex-1 px-3 py-2 text-sm font-mono rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
              />
              <button
                type="button"
                onClick={onSave}
                disabled={submitting || apiKey.trim().length < 16}
                className="px-4 py-2 text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-lg shadow disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? "Saving…" : "Save"}
              </button>
            </div>
            {justSaved && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5">
                Saved. New embeddings will use this key on the next worker poll.
              </p>
            )}
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">
                {error}
              </p>
            )}
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500">
            Get a key at{" "}
            <span className="font-mono">platform.openai.com/api-keys</span>. The
            worker calls{" "}
            <span className="font-mono">text-embedding-3-small</span> (~$0.02
            per 1M tokens).
          </p>
        </div>
      )}
    </GlassCard>
  );
}

type GitPlatform = "github" | "gitlab" | "bitbucket" | "azure" | "unknown";

function detectPlatform(url: string): GitPlatform {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "github.com") return "github";
    if (host === "gitlab.com" || host.includes("gitlab")) return "gitlab";
    if (host === "bitbucket.org") return "bitbucket";
    if (host === "dev.azure.com" || host.endsWith(".visualstudio.com"))
      return "azure";
  } catch {
    /* ignore */
  }
  return "unknown";
}

const PLATFORM_META: Record<
  GitPlatform,
  {
    label: string;
    color: string;
    tokenLabel: string;
    tokenHint: string;
    tokenPlaceholder: string;
  }
> = {
  github: {
    label: "GitHub",
    color: "bg-gray-800 text-white",
    tokenLabel: "Personal Access Token (Fine-grained)",
    tokenHint:
      "github.com → Settings → Developer settings → Fine-grained tokens → Contents: Read-only",
    tokenPlaceholder: "github_pat_...",
  },
  gitlab: {
    label: "GitLab",
    color: "bg-orange-600 text-white",
    tokenLabel: "Personal Access Token",
    tokenHint:
      "gitlab.com → User Settings → Access Tokens → read_repository scope",
    tokenPlaceholder: "glpat-...",
  },
  bitbucket: {
    label: "Bitbucket",
    color: "bg-blue-600 text-white",
    tokenLabel: "App Password (user:apppassword)",
    tokenHint:
      "bitbucket.org → Settings → App passwords → Repositories: Read. Enter as username:apppassword",
    tokenPlaceholder: "myusername:ATBB...",
  },
  azure: {
    label: "Azure DevOps",
    color: "bg-blue-700 text-white",
    tokenLabel: "Personal Access Token",
    tokenHint:
      "dev.azure.com → User settings → Personal access tokens → Code: Read",
    tokenPlaceholder: "PAT token...",
  },
  unknown: {
    label: "Git",
    color: "bg-gray-500 text-white",
    tokenLabel: "Access Token",
    tokenHint: "Provide an access token for private repo cloning",
    tokenPlaceholder: "token...",
  },
};

function AgentConfigCard({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [currentRepoUrl, setCurrentRepoUrl] = useState<string | null>(null);
  const [tokenMeta, setTokenMeta] = useState<{
    token_hint: string;
    updated_at: string;
  } | null>(null);
  const [draftRepoUrl, setDraftRepoUrl] = useState("");
  const [draftToken, setDraftToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const platform = detectPlatform(draftRepoUrl || currentRepoUrl || "");
  const meta = PLATFORM_META[platform];

  const load = async () => {
    setLoading(true);
    try {
      const [webhookRes, tokenRes] = await Promise.all([
        fetchProjectAgentWebhook(projectId),
        fetchProjectGitToken(projectId),
      ]);
      setCurrentRepoUrl(webhookRes.repo_url);
      setDraftRepoUrl(webhookRes.repo_url ?? "");
      setTokenMeta(tokenRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const onSave = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const saves: Promise<any>[] = [];
      if (draftRepoUrl.trim() !== (currentRepoUrl ?? "")) {
        saves.push(saveProjectRepoUrl(projectId, draftRepoUrl.trim()));
      }
      if (draftToken.trim().length >= 10) {
        saves.push(
          saveProjectGitToken(projectId, draftToken.trim()).then(setTokenMeta),
        );
      }
      await Promise.all(saves);
      setCurrentRepoUrl(draftRepoUrl.trim() || null);
      setDraftToken("");
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onRemoveToken = async () => {
    if (
      !confirm(
        "Remove the access token? The agent worker will skip private repo cloning for this project.",
      )
    )
      return;
    try {
      await deleteProjectGitToken(projectId);
      setTokenMeta(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  };

  const isDirty =
    draftRepoUrl.trim() !== (currentRepoUrl ?? "") ||
    draftToken.trim().length >= 10;

  return (
    <GlassCard title="Agent Configuration">
      {loading ? (
        <p className="text-sm text-gray-400 animate-pulse">Loading…</p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The agent worker clones your repo, locates the bug, and generates a
            fix diff automatically every 5 minutes — no webhook setup required.
          </p>

          {/* Repo URL */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Repository URL
              </label>
              {draftRepoUrl && platform !== "unknown" && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.color}`}
                >
                  {meta.label}
                </span>
              )}
            </div>
            <input
              type="url"
              value={draftRepoUrl}
              onChange={(e) => setDraftRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo.git  or  https://bitbucket.org/workspace/repo.git"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Supports GitHub, GitLab, Bitbucket, Azure DevOps, and self-hosted
              git.
            </p>
          </div>

          {/* Access Token */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {meta.tokenLabel}{" "}
                <span className="normal-case font-normal">
                  (private repos only)
                </span>
              </label>
              {tokenMeta && (
                <button
                  type="button"
                  onClick={onRemoveToken}
                  className="text-xs text-red-500 dark:text-red-400 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>

            {tokenMeta && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-emerald-500 flex-shrink-0"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                  {tokenMeta.token_hint}
                </span>
                <span className="text-xs text-gray-400">
                  · saved {new Date(tokenMeta.updated_at).toLocaleDateString()}
                </span>
              </div>
            )}

            <input
              type="password"
              value={draftToken}
              onChange={(e) => setDraftToken(e.target.value)}
              placeholder={
                tokenMeta
                  ? `Replace: ${meta.tokenPlaceholder}`
                  : meta.tokenPlaceholder
              }
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {meta.tokenHint}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={submitting || !isDirty}
              className="px-4 py-2 text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-lg shadow disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? "Saving…" : "Save"}
            </button>
            {justSaved && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                Saved — agent picks up changes on next poll.
              </span>
            )}
            {error && (
              <span className="text-xs text-red-600 dark:text-red-400">
                {error}
              </span>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function PostHogIntegrationCard({ projectId: _projectId }: { projectId: string }) {
  const [copied, setCopied] = useState(false);
  const webhookUrl = `${API_URL}/api/v1/integrations/posthog/error`;

  const onCopy = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <GlassCard title="PostHog Integration">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Automatically create bug-report tickets from PostHog error events. In
          PostHog go to{" "}
          <strong>Data Pipelines → Destinations → New destination → Webhook</strong>,
          filter on <code className="font-mono text-xs bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded">$exception</code>{" "}
          events, and point it at the URL below.
        </p>

        {/* Webhook URL */}
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">
            Webhook URL
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 font-mono text-xs text-gray-800 dark:text-gray-200 overflow-hidden min-w-0">
              <span className="truncate">{webhookUrl}</span>
            </div>
            <button
              type="button"
              onClick={onCopy}
              className="shrink-0 px-3 py-2 text-sm font-medium bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 rounded-lg transition-colors text-gray-700 dark:text-gray-200"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Auth callout */}
        <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">
            Auth header required
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Add header{" "}
            <code className="font-mono bg-amber-100 dark:bg-amber-500/20 px-1 rounded">X-API-Key</code>{" "}
            and set its value to the <strong>Agent API Key</strong> shown above.
          </p>
        </div>

        {/* Dedup + signing note */}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Errors dedup automatically — one ticket per user per exception type per day.
          For production, set{" "}
          <code className="font-mono">POSTHOG_WEBHOOK_SECRET</code> on the server
          and the same value as the <strong>Signing secret</strong> in PostHog to
          verify request authenticity.
        </p>
      </div>
    </GlassCard>
  );
}

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
          <span className="text-xs text-gray-500 dark:text-gray-400 block mt-0.5 max-w-[220px]">
            {description}
          </span>
        )}
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
          checked ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-700"
        } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
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
