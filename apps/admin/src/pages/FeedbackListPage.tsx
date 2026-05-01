import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchFeedbackList,
  fetchUserProjectIds,
  fetchProjects,
  bulkPatchFeedback,
  deleteFeedbackItem,
  fetchSubscriptions,
  subscribeToProject,
  unsubscribeFromProject,
} from "../lib/feedbackApi";
import { useAuth } from "../hooks/useAuth";
import { LayoutWrapper } from "../components/LayoutWrapper";
import { GlassCard } from "../components/GlassCard";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorMessage } from "../components/ErrorMessage";
import { STATUS_CONFIG, TYPE_CONFIG, SEVERITY_CONFIG } from "../lib/constants";
import type { FeedbackItem } from "../lib/types";

type SortBy = "newest_first" | "oldest_first" | "priority" | "submitted_by";
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100];

export function FeedbackListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userProjects, setUserProjects] = useState<string[]>([]);
  // Bulk-action state — row selection by id
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Subscription state — set of subscribed project IDs
  const [subscriptions, setSubscriptions] = useState<Set<string>>(new Set());
  // Delete confirm state — id of the row awaiting confirmation (two-step UX)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // Debounced search input — the query string is the source of truth so
  // back/forward and deep links work; the local input reflects typing.
  const [searchDraft, setSearchDraft] = useState(searchParams.get("q") || "");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const typeFilter = searchParams.get("type") || "";
  const projectFilter = searchParams.get("project_id") || "";
  const statusFilter = searchParams.get("status") || "";
  const priorityFilter = searchParams.get("priority") || "";
  const qFilter = searchParams.get("q") || "";
  const sortBy = (searchParams.get("sort_by") as SortBy) || "newest_first";
  const pageSize = parseInt(searchParams.get("page_size") || "10", 10);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  const { isAdmin } = useAuth();

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [projectIds, result] = await Promise.all([
        isAdmin
          ? fetchProjects().then((p: any[]) => p.map((x: any) => x.id))
          : fetchUserProjectIds(),
        fetchFeedbackList({
          type: typeFilter || undefined,
          project_id: projectFilter || undefined,
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          q: qFilter || undefined,
          sort_by: sortBy,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
      ]);

      setItems(result.data);
      setTotal(result.total);
      // Clear selection when data reloads — ids may have shifted
      setSelected(new Set());

      const all = new Set<string>(projectIds);
      for (const d of result.data as FeedbackItem[]) {
        if (d.project_id) all.add(d.project_id);
      }
      setUserProjects([...all]);
    } catch (err: any) {
      setError(err.message || "Failed to load feedback");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [
    typeFilter,
    projectFilter,
    statusFilter,
    priorityFilter,
    qFilter,
    sortBy,
    pageSize,
    page,
  ]);

  // Load subscriptions once on mount
  useEffect(() => {
    fetchSubscriptions()
      .then((ids) => setSubscriptions(new Set(ids)))
      .catch(() => {});
  }, []);

  const toggleSubscription = async (projectId: string) => {
    const isSubscribed = subscriptions.has(projectId);
    setSubscriptions((prev) => {
      const next = new Set(prev);
      if (isSubscribed) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
    try {
      if (isSubscribed) await unsubscribeFromProject(projectId);
      else await subscribeToProject(projectId);
    } catch {
      // revert on failure
      setSubscriptions((prev) => {
        const next = new Set(prev);
        if (isSubscribed) next.add(projectId);
        else next.delete(projectId);
        return next;
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFeedbackItem(id);
      setPendingDelete(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Delete failed");
      setPendingDelete(null);
    }
  };

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    // Any filter/sort change resets to page 1 — current page offset
    // might not exist in the new result set.
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  };

  // Debounce the search input → URL query param by 300ms so we don't
  // hammer the server on every keystroke.
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (searchDraft !== qFilter) setFilter("q", searchDraft);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchDraft]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const runBulk = async (patch: Parameters<typeof bulkPatchFeedback>[1]) => {
    if (selected.size === 0 || bulkBusy) return;
    const ids = [...selected];
    setBulkBusy(true);
    try {
      await bulkPatchFeedback(ids, patch);
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Bulk update failed");
    }
    setBulkBusy(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <LayoutWrapper>
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              Feedback
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {total} item{total !== 1 ? "s" : ""}{" "}
              {qFilter ? "matched" : "collected"}
            </p>
          </div>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white/80 dark:bg-white/5 backdrop-blur-md border border-gray-200 dark:border-white/10 rounded-xl hover:bg-white dark:hover:bg-white/10 transition-all shadow-sm"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
              />
            </svg>
            Refresh
          </button>
        </div>

        {/* Search + filters row */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative w-64">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="search"
              placeholder="Search title or description…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-xl bg-white/80 dark:bg-white/5 backdrop-blur-md text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setFilter("type", e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-xl bg-white/80 dark:bg-white/5 backdrop-blur-md text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
          >
            <option value="">All Types</option>
            <option value="feedback">Feedback</option>
            <option value="bug_report">Bug Report</option>
            <option value="feature_request">Feature Request</option>
          </select>
          <div className="flex items-center gap-1">
            <select
              value={projectFilter}
              onChange={(e) => setFilter("project_id", e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-xl bg-white/80 dark:bg-white/5 backdrop-blur-md text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
            >
              <option value="">All Projects</option>
              {userProjects.map((pid) => (
                <option key={pid} value={pid}>
                  {pid}
                </option>
              ))}
            </select>
            {/* Subscription bell — only visible when a specific project is selected */}
            {projectFilter && (
              <button
                onClick={() => toggleSubscription(projectFilter)}
                title={
                  subscriptions.has(projectFilter)
                    ? "Unsubscribe from notifications for this project"
                    : "Subscribe to notifications for this project"
                }
                className={`p-2 rounded-xl border transition-colors ${
                  subscriptions.has(projectFilter)
                    ? "bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/40 text-amber-600 dark:text-amber-400"
                    : "bg-white/80 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-400 hover:text-amber-500"
                }`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill={subscriptions.has(projectFilter) ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setFilter("status", e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-xl bg-white/80 dark:bg-white/5 backdrop-blur-md text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setFilter("priority", e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-xl bg-white/80 dark:bg-white/5 backdrop-blur-md text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
          >
            <option value="">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setFilter("sort_by", e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-xl bg-white/80 dark:bg-white/5 backdrop-blur-md text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
            title="Sort order"
          >
            <option value="newest_first">Newest first</option>
            <option value="oldest_first">Oldest first</option>
            <option value="priority">By priority</option>
            <option value="submitted_by">By submitted by</option>
          </select>
        </div>

        {/* Bulk actions toolbar — appears when rows are selected */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl">
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {selected.size} selected
            </span>
            <div className="h-4 w-px bg-amber-300/60" />
            <button
              onClick={() => runBulk({ status: "in_progress" })}
              disabled={bulkBusy}
              className="px-3 py-1 text-xs font-medium rounded-lg bg-white dark:bg-white/10 border border-amber-200 dark:border-amber-500/30 text-gray-700 dark:text-gray-200 hover:bg-amber-100 disabled:opacity-50"
            >
              Mark in progress
            </button>
            <button
              onClick={() => runBulk({ status: "resolved" })}
              disabled={bulkBusy}
              className="px-3 py-1 text-xs font-medium rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
            >
              Resolve
            </button>
            <select
              onChange={(e) => {
                if (!e.target.value) return;
                const v =
                  e.target.value === "clear" ? null : (e.target.value as any);
                runBulk({ priority: v });
                e.target.value = "";
              }}
              disabled={bulkBusy}
              className="px-2 py-1 text-xs rounded-lg bg-white dark:bg-white/10 border border-amber-200 dark:border-amber-500/30 text-gray-700 dark:text-gray-200 disabled:opacity-50"
              defaultValue=""
            >
              <option value="" disabled>
                Set priority…
              </option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="clear">Clear</option>
            </select>
            <button
              onClick={() => setSelected(new Set())}
              className="ml-auto text-xs text-amber-700 dark:text-amber-300 hover:underline"
            >
              Clear selection
            </button>
          </div>
        )}

        {error && <ErrorMessage message={error} />}
        {loading && <LoadingSpinner message="Loading feedback..." />}

        {/* Empty State */}
        {!loading && items.length === 0 && !error && (
          <GlassCard className="!py-16">
            <div className="flex flex-col items-center justify-center text-center">
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
                    d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                No feedback yet
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                Feedback will appear here once users start submitting through
                the widget.
              </p>
            </div>
          </GlassCard>
        )}

        {/* Feedback Table */}
        {!loading && items.length > 0 && (
          <GlassCard className="!p-0 overflow-hidden flex flex-col">
            <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 22rem)' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-gray-900">
                  <th className="text-left pl-5 pr-2 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={
                        items.length > 0 && selected.size === items.length
                      }
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            selected.size > 0 && selected.size < items.length;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Select all rows on this page"
                      className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                    />
                  </th>
                  <th
                    className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider w-8"
                    title="Priority"
                  />
                  <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                    Title
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                    Submitted By
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                    Project
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-5 py-3 w-10" title="Delete (test messages only)" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const typeConfig = TYPE_CONFIG[item.type] || {
                    label: item.type,
                    color: "bg-gray-100 text-gray-600",
                    darkColor: "",
                    icon: "",
                  };
                  const sevConfig = item.severity
                    ? SEVERITY_CONFIG[item.severity]
                    : null;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => navigate(`/feedback/${item.id}`)}
                      className={`border-b border-gray-100 dark:border-white/5 last:border-0 cursor-pointer transition-colors ${
                        selected.has(item.id)
                          ? "bg-amber-50/80 dark:bg-amber-500/10"
                          : "hover:bg-amber-50/50 dark:hover:bg-amber-500/5"
                      }`}
                    >
                      <td
                        className="pl-5 pr-2 py-3.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          aria-label={`Select ${item.title}`}
                          className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                        />
                      </td>
                      {/* Priority dot — silent when unset so the column is a subtle signal.
                                                 Color matches the PRIORITY_OPTIONS map on the detail page. */}
                      <td
                        className="pl-5 pr-2 py-3.5"
                        title={
                          item.priority
                            ? `Priority: ${item.priority}`
                            : "No priority set"
                        }
                      >
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${
                            item.priority === "urgent"
                              ? "bg-red-500"
                              : item.priority === "high"
                                ? "bg-amber-500"
                                : item.priority === "medium"
                                  ? "bg-blue-500"
                                  : item.priority === "low"
                                    ? "bg-gray-400"
                                    : "bg-transparent border border-gray-200 dark:border-white/10"
                          }`}
                        />
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${typeConfig.color} ${typeConfig.darkColor}`}
                        >
                          {typeConfig.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {item.title}
                          </p>
                          {/* Tier 2: cluster-count badge. Shown when the item belongs
                                                         to a cluster of ≥2 submissions (the worker groups duplicates). */}
                          {(item.cluster_submission_count ?? 0) > 1 && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
                              title={`Grouped with ${item.cluster_submission_count! - 1} similar ${item.cluster_submission_count! - 1 === 1 ? "report" : "reports"}`}
                            >
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                              >
                                <circle cx="8" cy="8" r="3" />
                                <circle cx="16" cy="16" r="3" />
                                <path d="M10 10l4 4" />
                              </svg>
                              ×{item.cluster_submission_count}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5 truncate max-w-md">
                            {item.description}
                          </p>
                        )}
                        {(item.labels?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {item.labels!.slice(0, 5).map((label) => (
                              <span
                                key={label}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400"
                              >
                                {label}
                              </span>
                            ))}
                            {item.labels!.length > 5 && (
                              <span className="text-[10px] text-gray-400">
                                +{item.labels!.length - 5}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {item.email ? (
                          <span className="text-xs text-gray-600 dark:text-gray-300">
                            {item.email}
                          </span>
                        ) : item.user_id ? (
                          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                            {item.user_id.slice(0, 12)}...
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">
                            Anonymous
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {(() => {
                          const sc =
                            STATUS_CONFIG[item.status || "open"] ||
                            STATUS_CONFIG.open;
                          return (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${sc.color} ${sc.darkColor}`}
                            >
                              {sc.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded">
                          {item.project_id}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap">
                        {timeAgo(item.created_at)}
                      </td>
                      <td
                        className="px-3 py-3.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isAdmin && item.title?.toLowerCase().includes("test") && (
                          pendingDelete === item.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(item.id)}
                                className="px-2 py-0.5 text-[10px] font-medium rounded bg-red-500 text-white hover:bg-red-600"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setPendingDelete(null)}
                                className="px-2 py-0.5 text-[10px] font-medium rounded bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setPendingDelete(item.id)}
                              title="Delete test message"
                              className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            {/* Pagination footer — always visible when there are
                            items. Shows the range, page size selector, and
                            prev/next. Page state is URL-driven so back/forward
                            + deep links work. */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-white/[0.02] text-sm text-gray-600 dark:text-gray-400">
              <div>
                Showing{" "}
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}
                </span>{" "}
                of{" "}
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {total}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => setFilter("page_size", e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-200 dark:border-white/10 rounded-lg bg-white/80 dark:bg-white/5 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    setFilter("page", String(Math.max(1, page - 1)))
                  }
                  disabled={page <= 1}
                  className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Prev
                </button>
                <span className="text-xs px-1">
                  Page{" "}
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {page}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {totalPages}
                  </span>
                </span>
                <button
                  onClick={() =>
                    setFilter("page", String(Math.min(totalPages, page + 1)))
                  }
                  disabled={page >= totalPages}
                  className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          </GlassCard>
        )}
      </div>
    </LayoutWrapper>
  );
}

function parseScreenshots(screenshots: string | string[] | null): string[] {
  if (!screenshots) return [];
  if (Array.isArray(screenshots)) return screenshots;
  try {
    const parsed = JSON.parse(screenshots);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
