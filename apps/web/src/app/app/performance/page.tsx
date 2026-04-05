"use client";

import { useState } from "react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Target,
  Plus,
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Users,
  Star,
  BarChart3,
  ChevronRight,
  Circle,
  XCircle,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";

// ── Helpers ────────────────────────────────────────────────────────────────

const REVIEW_STATUS_CFG: Record<string, { label: string; color: string }> = {
  draft:           { label: "Draft",           color: "text-muted-foreground bg-muted" },
  self_review:     { label: "Self Review",      color: "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40" },
  peer_review:     { label: "Peer Review",      color: "text-indigo-700 bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-900/40" },
  manager_review:  { label: "Manager Review",   color: "text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-900/40" },
  calibration:     { label: "Calibration",      color: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40" },
  completed:       { label: "Completed",        color: "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40" },
};

const GOAL_STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: "Draft",     color: "text-muted-foreground bg-muted",                                                          icon: Circle       },
  active:    { label: "Active",    color: "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40",                        icon: TrendingUp   },
  at_risk:   { label: "At Risk",   color: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40",                    icon: AlertTriangle },
  completed: { label: "Completed", color: "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40",                    icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "text-muted-foreground bg-muted",                                                          icon: XCircle      },
};

const CYCLE_STATUS_CFG: Record<string, { label: string; color: string }> = {
  draft:       { label: "Draft",       color: "text-muted-foreground bg-muted" },
  active:      { label: "Active",      color: "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40" },
  calibration: { label: "Calibration", color: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40" },
  completed:   { label: "Completed",   color: "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40" },
};

const TABS = [
  { key: "cycles",     label: "Review Cycles" },
  { key: "my-reviews", label: "My Reviews" },
  { key: "goals",      label: "Goals & OKRs" },
  { key: "team",       label: "Team Overview" },
];

function ProgressBar({ value, color = "bg-primary" }: { value: number; color?: string }) {
  return (
    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const { canAccess } = useRBAC();
  if (!canAccess("hr")) return <AccessDenied />;
  return <PerformanceContent />;
}

function PerformanceContent() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") ?? "cycles";
  const [tab, setTab] = useState(defaultTab);
  const [search, setSearch] = useState("");
  const [showCreateCycle, setShowCreateCycle] = useState(false);
  const [showCreateGoal, setShowCreateGoal] = useState(false);

  const cycles = trpc.performance.listCycles.useQuery({});
  const myReviews = trpc.performance.myReviews.useQuery(undefined, { enabled: tab === "my-reviews" });
  const myGoals = trpc.performance.myGoals.useQuery({}, { enabled: tab === "goals" });
  const teamGoals = trpc.performance.listGoals.useQuery({}, { enabled: tab === "team" });
  const summary = trpc.performance.summary.useQuery();

  const updateCycle = trpc.performance.updateCycle.useMutation({
    onSuccess: () => { toast.success("Cycle updated"); cycles.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateGoal = trpc.performance.updateGoal.useMutation({
    onSuccess: () => { toast.success("Goal updated"); myGoals.refetch(); teamGoals.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteGoal = trpc.performance.deleteGoal.useMutation({
    onSuccess: () => { toast.success("Goal deleted"); myGoals.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Summary stats
  const activeCycles = (cycles.data ?? []).filter((c: any) => c.status === "active").length;
  const goalStats = Object.fromEntries((summary.data?.goalStats ?? []).map((s: any) => [s.status, s.count]));
  const activeGoals = goalStats["active"] ?? 0;
  const atRiskGoals = goalStats["at_risk"] ?? 0;
  const completedGoals = goalStats["completed"] ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-card">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Performance Management</h1>
        </div>
        <div className="flex items-center gap-2">
          {tab === "cycles" && (
            <button
              onClick={() => setShowCreateCycle(true)}
              className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
            >
              <Plus className="h-3 w-3" /> New Cycle
            </button>
          )}
          {tab === "goals" && (
            <button
              onClick={() => setShowCreateGoal(true)}
              className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
            >
              <Plus className="h-3 w-3" /> Add Goal
            </button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        {[
          { label: "Active Cycles",   value: activeCycles,   color: "text-green-600"  },
          { label: "Active Goals",    value: activeGoals,    color: "text-blue-600"   },
          { label: "Goals at Risk",   value: atRiskGoals,    color: "text-amber-600"  },
          { label: "Goals Completed", value: completedGoals, color: "text-violet-600" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
              tab === t.key ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1 rounded border border-border bg-background text-xs focus:outline-none focus:border-primary w-40"
            />
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {/* ── Review Cycles ──────────────────────────────────── */}
        {tab === "cycles" && (
          <div>
            {cycles.isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (cycles.data ?? []).length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No review cycles yet"
                description="Create your first performance review cycle to kick off the performance management process."
                primaryAction={{ label: "New Review Cycle", onClick: () => setShowCreateCycle(true) }}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(cycles.data ?? []).filter((c: any) => !search || c.name.toLowerCase().includes(search.toLowerCase())).map((cycle: any) => {
                  const cfg = CYCLE_STATUS_CFG[cycle.status] ?? CYCLE_STATUS_CFG.draft!;
                  return (
                    <div key={cycle.id} className="rounded-lg border border-border bg-card p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-sm text-foreground">{cycle.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 capitalize">{cycle.type?.replace("_", " ")} review</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      {cycle.startDate && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(cycle.startDate).toLocaleDateString("en-IN")} →{" "}
                          {cycle.endDate ? new Date(cycle.endDate).toLocaleDateString("en-IN") : "TBD"}
                        </p>
                      )}
                      {cycle.status === "draft" && (
                        <button
                          onClick={() => updateCycle.mutate({ id: cycle.id, status: "active" })}
                          disabled={updateCycle.isPending}
                          className="mt-3 w-full py-1 rounded border border-primary text-primary text-xs hover:bg-primary/5 disabled:opacity-50"
                        >
                          Activate Cycle
                        </button>
                      )}
                      {cycle.status === "active" && (
                        <button
                          onClick={() => updateCycle.mutate({ id: cycle.id, status: "completed" })}
                          disabled={updateCycle.isPending}
                          className="mt-3 w-full py-1 rounded border border-muted text-muted-foreground text-xs hover:bg-muted disabled:opacity-50"
                        >
                          Mark Completed
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── My Reviews ─────────────────────────────────────── */}
        {tab === "my-reviews" && (
          <div>
            {myReviews.isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (myReviews.data ?? []).length === 0 ? (
              <EmptyState
                icon={Star}
                title="No reviews yet"
                description="Performance reviews will appear here once a review cycle is active and reviews have been assigned to you."
              />
            ) : (
              <div className="space-y-2">
                {(myReviews.data ?? []).filter((r: any) => !search || r.reviewerRole?.includes(search)).map((review: any) => {
                  const cfg = REVIEW_STATUS_CFG[review.status] ?? REVIEW_STATUS_CFG.draft!;
                  return (
                    <div key={review.id} className="flex items-center gap-3 rounded border border-border bg-card p-3 hover:shadow-sm transition-shadow">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground capitalize">{review.reviewerRole?.replace("_", " ")} Review</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {review.selfRating ? `Self-rated: ${review.selfRating}/5` : "Not yet self-rated"}
                          {review.overallRating ? ` · Manager: ${review.overallRating}/5` : ""}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${cfg.color}`}>{cfg.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Goals & OKRs ───────────────────────────────────── */}
        {tab === "goals" && (
          <div>
            {myGoals.isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (myGoals.data ?? []).length === 0 ? (
              <EmptyState
                icon={Target}
                title="No goals set"
                description="Add your first goal or OKR to track your progress and align with team objectives."
                primaryAction={{ label: "Add Goal", onClick: () => setShowCreateGoal(true) }}
              />
            ) : (
              <div className="space-y-2">
                {(myGoals.data ?? []).filter((g: any) => !search || g.title.toLowerCase().includes(search.toLowerCase())).map((goal: any) => {
                  const cfg = GOAL_STATUS_CFG[goal.status] ?? GOAL_STATUS_CFG.draft!;
                  const Icon = cfg.icon;
                  return (
                    <div key={goal.id} className="rounded border border-border bg-card p-3 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{goal.title}</p>
                            {goal.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{goal.description}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3 shrink-0">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.color}`}>{cfg.label}</span>
                          <button
                            onClick={() => deleteGoal.mutate({ id: goal.id })}
                            className="text-xs text-muted-foreground hover:text-red-600 transition-colors"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <ProgressBar
                            value={goal.progress ?? 0}
                            color={goal.status === "at_risk" ? "bg-amber-500" : goal.status === "completed" ? "bg-green-500" : "bg-primary"}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{goal.progress ?? 0}%</span>
                        {goal.status !== "completed" && goal.status !== "cancelled" && (
                          <button
                            onClick={() => {
                              const p = window.prompt("Update progress (0-100):", String(goal.progress ?? 0));
                              if (p !== null) {
                                const n = parseInt(p, 10);
                                if (!isNaN(n)) updateGoal.mutate({ id: goal.id, progress: Math.min(100, Math.max(0, n)), status: n >= 100 ? "completed" : goal.status });
                              }
                            }}
                            className="text-xs text-primary hover:underline shrink-0"
                          >
                            Update
                          </button>
                        )}
                      </div>
                      {goal.dueDate && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Due: {new Date(goal.dueDate).toLocaleDateString("en-IN")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Team Overview ──────────────────────────────────── */}
        {tab === "team" && (
          <div>
            {teamGoals.isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (teamGoals.data ?? []).length === 0 ? (
              <EmptyState
                icon={Users}
                title="No team goals yet"
                description="Team and organisation-level OKRs will appear here once goals have been created with 'Team' or 'Org' scope."
              />
            ) : (
              <div className="space-y-2">
                {(teamGoals.data ?? []).filter((g: any) => !search || g.title.toLowerCase().includes(search.toLowerCase())).map((goal: any) => {
                  const cfg = GOAL_STATUS_CFG[goal.status] ?? GOAL_STATUS_CFG.draft!;
                  const Icon = cfg.icon;
                  return (
                    <div key={goal.id} className="rounded border border-border bg-card p-3">
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{goal.title}</p>
                            <span className="text-xs text-muted-foreground capitalize">({goal.goalType})</span>
                          </div>
                          <ProgressBar value={goal.progress ?? 0} />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{goal.progress ?? 0}%</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${cfg.color}`}>{cfg.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Cycle dialog */}
      {showCreateCycle && (
        <CreateCycleDialog
          onClose={() => setShowCreateCycle(false)}
          onCreated={() => { setShowCreateCycle(false); cycles.refetch(); }}
        />
      )}

      {/* Create Goal dialog */}
      {showCreateGoal && (
        <CreateGoalDialog
          onClose={() => setShowCreateGoal(false)}
          onCreated={() => { setShowCreateGoal(false); myGoals.refetch(); }}
        />
      )}
    </div>
  );
}

// ── Create Cycle Dialog ────────────────────────────────────────────────────
function CreateCycleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("annual");

  const create = trpc.performance.createCycle.useMutation({
    onSuccess: () => { toast.success("Review cycle created"); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm p-5">
        <h2 className="text-sm font-semibold mb-4">New Review Cycle</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Cycle Name *</label>
            <input
              type="text"
              placeholder="e.g. FY2026 Annual Review"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Cycle Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
            >
              <option value="annual">Annual</option>
              <option value="mid_year">Mid-Year</option>
              <option value="quarterly">Quarterly</option>
              <option value="probation">Probation</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded border border-border text-xs hover:bg-muted">Cancel</button>
          <button
            onClick={() => {
              if (!name.trim()) { toast.error("Name is required"); return; }
              create.mutate({ name: name.trim(), type: type as any });
            }}
            disabled={create.isPending}
            className="px-3 py-1.5 rounded bg-primary text-white text-xs hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
          >
            {create.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create Goal Dialog ─────────────────────────────────────────────────────
function CreateGoalDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalType, setGoalType] = useState("individual");

  const create = trpc.performance.createGoal.useMutation({
    onSuccess: () => { toast.success("Goal created"); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm p-5">
        <h2 className="text-sm font-semibold mb-4">Add Goal / OKR</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Goal Title *</label>
            <input
              type="text"
              placeholder="e.g. Reduce average ticket resolution time by 20%"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Type</label>
            <select
              value={goalType}
              onChange={(e) => setGoalType(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
            >
              <option value="individual">Individual</option>
              <option value="team">Team</option>
              <option value="org">Organisation</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded border border-border text-xs hover:bg-muted">Cancel</button>
          <button
            onClick={() => {
              if (!title.trim()) { toast.error("Title is required"); return; }
              create.mutate({ title: title.trim(), description: description.trim() || undefined, goalType: goalType as any });
            }}
            disabled={create.isPending}
            className="px-3 py-1.5 rounded bg-primary text-white text-xs hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
          >
            {create.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Create Goal
          </button>
        </div>
      </div>
    </div>
  );
}
