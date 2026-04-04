"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { toast } from "sonner";
import {
  Bug, ChevronRight, AlertTriangle, Loader2, MessageSquare,
  GitBranch, BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATE_CONFIG: Record<string, { label: string; color: string }> = {
  new:                 { label: "New",           color: "text-muted-foreground bg-muted" },
  in_progress:         { label: "In Progress",   color: "text-blue-700 bg-blue-100" },
  root_cause_analysis: { label: "RCA",           color: "text-orange-700 bg-orange-100" },
  known_error:         { label: "Known Error",   color: "text-red-700 bg-red-100" },
  change_raised:       { label: "Change Raised", color: "text-indigo-700 bg-indigo-100" },
  resolved:            { label: "Resolved",      color: "text-green-700 bg-green-100" },
  closed:              { label: "Closed",        color: "text-muted-foreground bg-muted" },
};
const PRIORITY_BAR: Record<string, string> = {
  "1_critical": "bg-red-600", "2_high": "bg-orange-500",
  "3_moderate": "bg-yellow-500", "4_low": "bg-green-500",
  critical: "bg-red-600", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-green-500",
};

export default function ProblemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useRBAC();
  const [comment, setComment] = useState("");

  const addNote = trpc.changes.addProblemNote.useMutation({
    onSuccess: () => { setComment(""); toast.success("Update posted"); refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  const { data: allProblems, isLoading, refetch } = trpc.changes.listProblems.useQuery(
    { limit: 200 },
    { enabled: can("problems", "read") }
  );

  const updateStatus = trpc.changes.updateProblem.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  if (!can("problems", "read")) return <AccessDenied module="Problem Management" />;

  if (isLoading) return (
    <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading problem record…
    </div>
  );

  const problem = (allProblems as any[])?.find((p: any) => p.id === id);

  if (!problem) return (
    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
      <AlertTriangle className="h-8 w-8 opacity-40" />
      <p className="text-sm">Problem not found.</p>
      <Link href="/app/problems" className="text-xs text-primary hover:underline">← Back to Problems</Link>
    </div>
  );

  const stateInfo = STATE_CONFIG[problem.status ?? "new"] ?? { label: problem.status, color: "bg-muted text-muted-foreground" };
  const TRANSITIONS: Record<string, string[]> = {
    new:                 ["in_progress"],
    in_progress:         ["root_cause_analysis", "resolved"],
    root_cause_analysis: ["known_error", "change_raised", "resolved"],
    known_error:         ["change_raised", "resolved"],
    change_raised:       ["resolved"],
    resolved:            ["closed"],
    closed:              [],
  };
  const nextStates = TRANSITIONS[problem.status ?? "new"] ?? [];
  const isClosed = problem.status === "closed";

  return (
    <div className="flex flex-col gap-3 max-w-5xl">
      <nav className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
        <Link href="/app/problems" className="hover:text-primary">Problem Management</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-medium text-muted-foreground">{problem.number ?? id.slice(0, 8)}</span>
      </nav>

      {/* Title bar */}
      <div className="flex items-start justify-between gap-4 bg-card border border-border rounded px-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-orange-100 text-orange-700 flex-shrink-0 mt-0.5">
            <Bug className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">{problem.title ?? "Problem Record"}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={cn("text-[10px] font-medium rounded-full px-2 py-0.5", stateInfo.color)}>{stateInfo.label}</span>
              <div className="flex items-center gap-1">
                <div className={cn("h-2 w-2 rounded-full", PRIORITY_BAR[problem.priority ?? "low"])} />
                <span className="text-[10px] text-muted-foreground capitalize">{problem.priority?.replace(/_/g, " ") ?? "Low"}</span>
              </div>
            </div>
          </div>
        </div>
        <PermissionGate module="problems" action="write">
          <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
            {nextStates.map((s) => (
              <button key={s}
                onClick={() => updateStatus.mutate({ id, status: s } as any)}
                disabled={updateStatus.isPending}
                className="rounded border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent transition capitalize">
                {STATE_CONFIG[s]?.label ?? s}
              </button>
            ))}
          </div>
        </PermissionGate>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 flex flex-col gap-3">
          {/* Description */}
          <div className="bg-card border border-border rounded p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h2>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{problem.description || "No description."}</p>
          </div>

          {/* RCA */}
          {problem.rootCause && (
            <div className="bg-card border border-border rounded p-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Root Cause Analysis</h2>
              <p className="text-sm text-foreground/80 whitespace-pre-line">{problem.rootCause}</p>
            </div>
          )}

          {/* Workaround */}
          {problem.workaround && (
            <div className="bg-amber-50 border border-amber-200 rounded p-4">
              <h2 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> Known Workaround
              </h2>
              <p className="text-sm text-amber-900 whitespace-pre-line">{problem.workaround}</p>
            </div>
          )}

          {/* Comment */}
          <PermissionGate module="problems" action="write">
            <div className={`bg-card border border-border rounded p-4 flex flex-col gap-2 ${isClosed ? "opacity-60" : ""}`}>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                Add Update
                {isClosed && <span className="normal-case font-normal text-muted-foreground/60">(disabled — problem is closed)</span>}
              </h2>
              <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
                disabled={isClosed}
                placeholder={isClosed ? "This problem is closed — updates are disabled." : "RCA update, workaround note, or status comment…"}
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none disabled:bg-muted/30 disabled:cursor-not-allowed" />
              <button
                onClick={() => { if (!comment.trim()) return; addNote.mutate({ problemId: problem.id, note: comment.trim() }); }}
                disabled={isClosed || addNote.isPending || !comment.trim()}
                className="flex items-center gap-1.5 self-start rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {addNote.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                Post Update
              </button>
            </div>
          </PermissionGate>
        </div>

        {/* Details panel */}
        <div className="bg-card border border-border rounded p-3 flex flex-col gap-2 text-xs h-fit">
          <h2 className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Details</h2>
          {[
            { label: "Category",   value: problem.category ?? "—" },
            { label: "Created",    value: problem.createdAt ? new Date(problem.createdAt).toLocaleDateString() : "—" },
            { label: "Updated",    value: problem.updatedAt ? new Date(problem.updatedAt).toLocaleDateString() : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-foreground/90">{String(value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
