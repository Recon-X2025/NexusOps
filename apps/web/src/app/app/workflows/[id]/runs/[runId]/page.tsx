"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, Loader2, CheckCircle2, XCircle, Clock, Pause,
  SkipForward, Play, ArrowLeft, Zap, GitBranch, UserCheck,
  Bell, Edit3, Globe, AlertTriangle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "waiting";
type RunStatus  = "running" | "completed" | "failed" | "cancelled" | "waiting";

interface StepRun {
  id: string;
  nodeId: string;
  nodeType: string;
  status: StepStatus;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  attemptCount: number;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  durationMs?: number | null;
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  status: RunStatus;
  triggerData?: Record<string, unknown> | null;
  error?: string | null;
  startedAt: Date | string;
  completedAt?: Date | string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NODE_ICON: Record<string, React.ReactNode> = {
  TRIGGER:      <Zap       className="h-4 w-4" />,
  CONDITION:    <GitBranch className="h-4 w-4" />,
  ASSIGN:       <UserCheck className="h-4 w-4" />,
  NOTIFY:       <Bell      className="h-4 w-4" />,
  UPDATE_FIELD: <Edit3     className="h-4 w-4" />,
  WAIT:         <Clock     className="h-4 w-4" />,
  WEBHOOK:      <Globe     className="h-4 w-4" />,
};

function nodeIcon(type: string) {
  return NODE_ICON[type.toUpperCase()] ?? <Zap className="h-4 w-4" />;
}

function StatusBadge({ status }: { status: StepStatus | RunStatus }) {
  const cfg: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    pending:   { label: "Pending",   icon: <Clock        className="h-3.5 w-3.5" />, cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    running:   { label: "Running",   icon: <Play         className="h-3.5 w-3.5 animate-pulse" />, cls: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
    completed: { label: "Completed", icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
    failed:    { label: "Failed",    icon: <XCircle      className="h-3.5 w-3.5" />, cls: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
    skipped:   { label: "Skipped",   icon: <SkipForward  className="h-3.5 w-3.5" />, cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
    waiting:   { label: "Waiting",   icon: <Pause        className="h-3.5 w-3.5" />, cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
    cancelled: { label: "Cancelled", icon: <XCircle      className="h-3.5 w-3.5" />, cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  };
  const c = (cfg[status] ?? cfg["pending"])!;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", c.cls)}>
      {c.icon}{c.label}
    </span>
  );
}

function formatDuration(ms?: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTs(ts?: Date | string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function JsonBlock({ data }: { data: Record<string, unknown> | null | undefined }) {
  if (!data || Object.keys(data).length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({ step, index }: { step: StepRun; index: number }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        step.status === "running" && "border-blue-300 dark:border-blue-700",
        step.status === "failed" && "border-red-300 dark:border-red-700",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-white",
            step.status === "completed" ? "bg-emerald-600" :
            step.status === "failed"    ? "bg-red-500" :
            step.status === "running"   ? "bg-blue-600" :
            step.status === "skipped"   ? "bg-slate-400" :
            step.status === "waiting"   ? "bg-yellow-500" : "bg-slate-400",
          )}>
            {nodeIcon(step.nodeType)}
          </div>
          <div>
            <p className="text-sm font-semibold">
              Step {index + 1} — {step.nodeType.replace(/_/g, " ")}
            </p>
            <p className="text-xs text-muted-foreground font-mono">{step.nodeId}</p>
          </div>
        </div>
        <StatusBadge status={step.status} />
      </div>

      {/* Timing */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Started</p>
          <p className="font-medium">{formatTs(step.startedAt)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Completed</p>
          <p className="font-medium">{formatTs(step.completedAt)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Duration</p>
          <p className="font-medium">{formatDuration(step.durationMs)}</p>
        </div>
      </div>

      {step.attemptCount > 1 && (
        <p className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
          ⚠ {step.attemptCount} attempts
        </p>
      )}

      {/* Error */}
      {step.error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950 p-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 font-mono break-all">{step.error}</p>
        </div>
      )}

      {/* Input / Output */}
      {(step.input || step.output) && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {step.input && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Input</p>
              <JsonBlock data={step.input} />
            </div>
          )}
          {step.output && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Output</p>
              <JsonBlock data={step.output} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkflowRunPage() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const { can } = useRBAC();

  const { data, isLoading, error } = trpc.workflows.runs.get.useQuery(
    { id: runId },
    { enabled: can("approvals", "read") },
  );

  const { data: workflowData } = trpc.workflows.get.useQuery(
    { id },
    { enabled: can("approvals", "read") },
  );

  if (!can("approvals", "read")) return <AccessDenied module="Workflows" />;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Run not found or access denied.</p>
        <Link
          href={`/app/workflows/${id}`}
          className="text-sm text-indigo-600 hover:underline"
        >
          ← Back to workflow
        </Link>
      </div>
    );
  }

  const run: WorkflowRun = data.run as WorkflowRun;
  const steps: StepRun[] = (data.steps ?? []) as StepRun[];
  const wf = workflowData?.workflow;

  const totalMs = run.completedAt
    ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
    : null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb nav */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/app/workflows" className="hover:text-foreground">Workflows</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {wf ? (
          <Link href={`/app/workflows/${id}`} className="hover:text-foreground">{wf.name}</Link>
        ) : (
          <Link href={`/app/workflows/${id}`} className="hover:text-foreground">Workflow</Link>
        )}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Run</span>
      </div>

      {/* Run header */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">Workflow Run</h1>
              <StatusBadge status={run.status} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground font-mono">{run.id}</p>
          </div>
          <Link
            href={`/app/workflows/${id}`}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to workflow
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Started</p>
            <p className="text-sm font-medium">{formatTs(run.startedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-sm font-medium">{formatTs(run.completedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total duration</p>
            <p className="text-sm font-medium">{formatDuration(totalMs)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Steps</p>
            <p className="text-sm font-medium">{steps.length}</p>
          </div>
        </div>

        {run.error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950 p-3">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Run failed</p>
              <p className="text-xs text-red-600 dark:text-red-400 font-mono mt-0.5">{run.error}</p>
            </div>
          </div>
        )}

        {run.triggerData && Object.keys(run.triggerData).length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Trigger data</p>
            <JsonBlock data={run.triggerData} />
          </div>
        )}
      </div>

      {/* Step timeline */}
      <div>
        <h2 className="text-base font-semibold mb-3">Step Timeline</h2>
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-12">
            <Clock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No step data recorded for this run.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {steps.map((step, i) => (
              <StepCard key={step.id} step={step} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
