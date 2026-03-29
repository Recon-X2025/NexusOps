"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { toast } from "sonner";
import {
  ChevronRight, RefreshCw, GitBranch, Clock, User, Calendar, AlertTriangle,
  CheckCircle2, MessageSquare, FileText, Loader2, Edit2, XCircle, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATE_CONFIG: Record<string, { label: string; color: string }> = {
  draft:          { label: "Draft",        color: "text-muted-foreground bg-muted" },
  submitted:      { label: "Submitted",    color: "text-blue-700 bg-blue-100" },
  cab_approval:   { label: "CAB Review",   color: "text-yellow-700 bg-yellow-100" },
  approved:       { label: "Approved",     color: "text-green-700 bg-green-100" },
  scheduled:      { label: "Scheduled",    color: "text-indigo-700 bg-indigo-100" },
  implementation: { label: "In Progress",  color: "text-orange-700 bg-orange-100" },
  complete:       { label: "Complete",     color: "text-green-700 bg-green-100" },
  failed:         { label: "Failed",       color: "text-red-700 bg-red-100" },
  cancelled:      { label: "Cancelled",    color: "text-muted-foreground bg-muted" },
};

const RISK_COLORS: Record<string, string> = {
  critical: "text-red-700 bg-red-100",
  high:     "text-orange-700 bg-orange-100",
  medium:   "text-yellow-700 bg-yellow-100",
  low:      "text-green-700 bg-green-100",
};

export default function ChangeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useRBAC();
  const [comment, setComment] = useState("");

  const { data: change, isLoading, refetch } = trpc.changes.get.useQuery(
    { id },
    { enabled: can("changes", "read") }
  );

  const updateState = trpc.changes.update.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  if (!can("changes", "read")) return <AccessDenied module="Change Management" />;

  if (isLoading) return (
    <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading change…
    </div>
  );

  if (!change) return (
    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
      <AlertTriangle className="h-8 w-8 opacity-40" />
      <p className="text-sm">Change not found.</p>
      <Link href="/app/changes" className="text-xs text-primary hover:underline">← Back to Changes</Link>
    </div>
  );

  const stateInfo = STATE_CONFIG[change.status ?? "draft"] ?? { label: change.status, color: "bg-muted text-muted-foreground" };

  const TRANSITIONS: Record<string, string[]> = {
    draft:          ["submitted", "cancelled"],
    submitted:      ["cab_approval", "draft", "cancelled"],
    cab_approval:   ["approved", "draft", "cancelled"],
    approved:       ["scheduled", "cancelled"],
    scheduled:      ["implementation", "cancelled"],
    implementation: ["complete", "failed"],
    complete:       [],
    failed:         ["draft"],
    cancelled:      [],
  };
  const nextStates = TRANSITIONS[change.status ?? "draft"] ?? [];

  const addComment = trpc.changes.addComment.useMutation({
    onSuccess: () => { setComment(""); toast.success("Comment added"); refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  function handleComment() {
    if (!comment.trim()) return;
    addComment.mutate({ changeId: id, body: comment.trim() });
  }

  return (
    <div className="flex flex-col gap-3 max-w-5xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
        <Link href="/app/changes" className="hover:text-primary">Change Management</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-medium text-muted-foreground">{(change as any).number ?? id.slice(0, 8)}</span>
      </nav>

      {/* Title bar */}
      <div className="flex items-start justify-between gap-4 bg-card border border-border rounded px-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-100 text-indigo-700 flex-shrink-0 mt-0.5">
            <GitBranch className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground leading-tight">{change.title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={cn("text-[10px] font-medium rounded-full px-2 py-0.5", stateInfo.color)}>{stateInfo.label}</span>
              <span className={cn("text-[10px] font-medium rounded-full px-2 py-0.5 capitalize", RISK_COLORS[(change as any).riskLevel ?? "low"] ?? "bg-muted text-muted-foreground")}>
                Risk: {(change as any).riskLevel ?? "low"}
              </span>
              <span className="text-[10px] text-muted-foreground capitalize">Type: {change.type ?? "normal"}</span>
            </div>
          </div>
        </div>
        <PermissionGate module="changes" action="write">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {nextStates.map((s) => (
              <button
                key={s}
                onClick={() => updateState.mutate({ id, status: s } as any)}
                disabled={updateState.isPending}
                className={cn(
                  "rounded border px-2.5 py-1 text-xs font-medium transition capitalize",
                  s === "cancelled" || s === "failed"
                    ? "border-red-300 text-red-600 hover:bg-red-50"
                    : "border-border hover:bg-accent"
                )}
              >
                {STATE_CONFIG[s]?.label ?? s}
              </button>
            ))}
          </div>
        </PermissionGate>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Left: description + activity */}
        <div className="col-span-2 flex flex-col gap-3">
          <div className="bg-card border border-border rounded p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h2>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{change.description || "No description provided."}</p>
          </div>
          {(change as any).implementationPlan && (
            <div className="bg-card border border-border rounded p-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Implementation Plan</h2>
              <p className="text-sm text-foreground/80 whitespace-pre-line">{(change as any).implementationPlan}</p>
            </div>
          )}
          {(change as any).rollbackPlan && (
            <div className="bg-card border border-border rounded p-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Rollback Plan</h2>
              <p className="text-sm text-foreground/80 whitespace-pre-line">{(change as any).rollbackPlan}</p>
            </div>
          )}

          {/* Add comment */}
          <PermissionGate module="changes" action="write">
            <div className="bg-card border border-border rounded p-4 flex flex-col gap-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add Comment</h2>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a note or update…"
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <button
                onClick={handleComment}
                disabled={addComment.isPending || !comment.trim()}
                className="flex items-center gap-1.5 self-start rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition"
              >
                {addComment.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                Comment
              </button>
            </div>
          </PermissionGate>
        </div>

        {/* Right: details */}
        <div className="flex flex-col gap-3">
          <div className="bg-card border border-border rounded p-3 flex flex-col gap-2 text-xs">
            <h2 className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Details</h2>
            {[
              { label: "Requested By",   value: (change as any).requestedBy?.name ?? (change as any).userId ?? "—" },
              { label: "Assigned To",    value: (change as any).assignedTo?.name ?? "—" },
              { label: "Scheduled Start",value: (change as any).scheduledStart ? new Date((change as any).scheduledStart).toLocaleString() : "—" },
              { label: "Scheduled End",  value: (change as any).scheduledEnd   ? new Date((change as any).scheduledEnd).toLocaleString()   : "—" },
              { label: "Created",        value: change.createdAt ? new Date(change.createdAt).toLocaleString() : "—" },
              { label: "Last Updated",   value: change.updatedAt ? new Date(change.updatedAt).toLocaleString() : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-foreground/90 truncate">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
