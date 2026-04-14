import { useState, useEffect } from "react";
import { API_URL } from "../lib/config";
import { FEATURE_LABELS } from "../lib/constants";
import type { Plan } from "../lib/types";

interface PlanSelectionPageProps {
  onSelect: (planId: string) => void;
}

function formatPrice(cents: number): string {
  if (cents === 0) return "$0";
  return `$${(cents / 100).toFixed(0)}`;
}

function formatLimit(value: number): string {
  if (value === -1) return "Unlimited";
  return value.toLocaleString();
}

export default function PlanSelectionPage({ onSelect }: PlanSelectionPageProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<string>("free");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // When the user picks a paid tier and clicks Continue, we don't flip
  // their account to Paid immediately — we show a purchase modal asking
  // them to contact sales first (matches the Dashboard upgrade flow).
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/plans`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setPlans(json.data);
          }
        }
      } catch {
        // Fallback: show hardcoded plans if server unavailable
        setPlans([
          { id: "free", name: "Free", description: "For individuals and small projects. No expiry.", price_monthly: 0, max_projects: 1, max_tickets_per_month: 50, features: { ai_clustering: false, posthog: false, api_access: false, self_hosted: false }, display_order: 1 },
          { id: "paid", name: "Paid", description: "For teams. Multiple projects, higher volume, advanced features.", price_monthly: 0, max_projects: -1, max_tickets_per_month: -1, features: { ai_clustering: true, posthog: true, api_access: true, self_hosted: false }, display_order: 2 },
        ]);
      }
      setLoading(false);
    })();
  }, []);

  const handleContinue = () => {
    // Free → proceed straight to project creation.
    // Paid → open the purchase modal first; onSelect is only called if
    // the user completes (or simulates) a purchase.
    if (selected === 'paid') {
      setShowPurchaseModal(true);
      return;
    }
    setSubmitting(true);
    onSelect(selected);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="h-10 w-10 border-2 border-amber-500 rounded-full border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 mb-10 text-center">
        <h2 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
          Choose your plan
        </h2>
        <p className="text-gray-500 mt-2 text-base">
          Start free, upgrade when you're ready. No credit card required.
        </p>
      </div>

      {/* Plan Cards */}
      <div className="relative z-10 flex flex-col md:flex-row gap-6 w-full max-w-4xl">
        {plans.map((plan) => {
          const isPopular = plan.id === "paid";
          const isSelected = selected === plan.id;
          const enabledFeatures = Object.entries(plan.features).filter(([, v]) => v);
          const disabledFeatures = Object.entries(plan.features).filter(([, v]) => !v);

          return (
            <button
              key={plan.id}
              onClick={() => setSelected(plan.id)}
              className={`flex-1 text-left rounded-2xl border-2 p-6 transition-all ${
                isSelected
                  ? isPopular
                    ? "border-amber-500 bg-amber-50/50 dark:bg-amber-500/5 shadow-xl shadow-amber-500/10"
                    : "border-gray-900 dark:border-white bg-white dark:bg-white/5 shadow-xl"
                  : "border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-white/5 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <span className={`text-lg font-bold ${
                  isPopular ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-white"
                }`}>
                  {plan.name}
                </span>
                <div className="flex items-center gap-2">
                  {isPopular && (
                    <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-white rounded-full">
                      Popular
                    </span>
                  )}
                  {isSelected && (
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      isPopular ? "bg-amber-500" : "bg-gray-900 dark:bg-white"
                    }`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>

              {/* Price */}
              <div className="mb-4">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                  {formatPrice(plan.price_monthly)}
                </span>
                <span className="text-sm text-gray-500 ml-1">
                  {plan.price_monthly === 0 ? "forever" : "/ month"}
                </span>
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{plan.description}</p>

              {/* Limits */}
              <ul className="space-y-2.5">
                <li className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" className="shrink-0 mt-0.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {formatLimit(plan.max_projects)} project{plan.max_projects !== 1 ? "s" : ""}
                </li>
                <li className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" className="shrink-0 mt-0.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {formatLimit(plan.max_tickets_per_month)} tickets / month
                </li>

                {/* Enabled features */}
                {enabledFeatures.map(([key]) => (
                  <li key={key} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" className="shrink-0 mt-0.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {FEATURE_LABELS[key] || key}
                  </li>
                ))}

                {/* Disabled features */}
                {disabledFeatures.map(([key]) => (
                  <li key={key} className="flex items-start gap-2 text-sm text-gray-400">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2.5" className="shrink-0 mt-0.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    {FEATURE_LABELS[key] || key}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* Continue Button */}
      <div className="relative z-10 mt-8 w-full max-w-4xl">
        <button
          onClick={handleContinue}
          disabled={submitting}
          className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98] text-base"
        >
          {submitting
            ? "Setting up..."
            : selected === "free"
              ? "Continue with Free"
              : `Continue with ${plans.find(p => p.id === selected)?.name || selected}`
          }
        </button>
        <p className="text-xs text-gray-400 text-center mt-3">
          You can change your plan anytime from Settings.
        </p>
      </div>

      {/* Purchase modal — shown only when the user picks a Paid tier
          and clicks Continue. Until they complete (or simulate) a
          purchase, they stay on the plan page. Closing the modal
          returns them to the plan cards. */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowPurchaseModal(false)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
            <button
              onClick={() => setShowPurchaseModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Close"
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
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Purchase Paid plan
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Contact our team to complete purchase. Your account switches
                to the Paid tier as soon as payment is confirmed — until then
                you'll start on the Free plan.
              </p>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-6 text-left space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-emerald-500">&#10003;</span> Unlimited projects
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-emerald-500">&#10003;</span> Unlimited tickets / month
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-emerald-500">&#10003;</span> AI clustering, PostHog, API access
                </div>
              </div>
              <a
                href="mailto:support@bernstein.ai?subject=Upgrade%20to%20Paid%20plan&body=Hi%2C%20I%27d%20like%20to%20purchase%20the%20Paid%20plan%20for%20my%20new%20account."
                className="block w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-sm font-bold rounded-lg shadow-lg transition-all text-center"
              >
                Contact Sales to Purchase
              </a>
              <p className="text-xs text-gray-400 mt-3">We'll get back to you within 24 hours.</p>

              {/* Two escape hatches so the modal isn't a dead end */}
              <div className="mt-5 flex items-center justify-center gap-4 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    // Start on Free — they can upgrade later from the dashboard
                    setShowPurchaseModal(false);
                    setSelected('free');
                    setSubmitting(true);
                    onSelect('free');
                  }}
                  className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 underline underline-offset-2"
                >
                  Start on Free, upgrade later
                </button>
                <span className="text-gray-300 dark:text-gray-700">·</span>
                <button
                  type="button"
                  onClick={() => {
                    // Demo: simulate a successful purchase. In production
                    // this path is replaced by the billing provider's callback.
                    setShowPurchaseModal(false);
                    setSubmitting(true);
                    onSelect('paid');
                  }}
                  className="text-gray-400 hover:text-amber-500 underline underline-offset-2"
                >
                  Simulate purchase (demo)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
