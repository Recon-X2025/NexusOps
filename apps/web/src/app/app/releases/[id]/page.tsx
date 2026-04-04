"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  GitBranch, ArrowLeft, ChevronRight, Calendar, Package,
  CheckCircle2, AlertTriangle, Clock, Edit2, Save, X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, PermissionGate } from "@/lib/rbac-context";

const STATE_CFG: Record<string, { label: string; color: string; bar: string }> = {
  planning:        { label: "Planning",        color: "text-muted-foreground bg-muted",    bar: "bg-slate-400" },
  testing:         { label: "Testing",         color: "text-blue-700 bg-blue-100",         bar: "bg-blue-500" },
  cab_approval:    { label: "CAB Review",      color: "text-yellow-700 bg-yellow-100",     bar: "bg-yellow-400" },
  scheduled:       { label: "Scheduled",       color: "text-indigo-700 bg-indigo-100",     bar: "bg-indigo-500" },
  deployment:      { label: "Deploying",       color: "text-orange-700 bg-orange-100",     bar: "bg-orange-500" },
  post_deployment: { label: "Post Deploy",     color: "text-green-700 bg-green-100",       bar: "bg-green-400" },
  complete:        { label: "Complete",        color: "text-green-700 bg-green-100",       bar: "bg-green-500" },
  failed:          { label: "Failed",          color: "text-red-700 bg-red-100",           bar: "bg-red-600" },
  rolled_back:     { label: "Rolled Back",     color: "text-red-700 bg-red-100",           bar: "bg-orange-500" },
};

const TERMINAL_STATES = ["complete", "failed", "rolled_back"];

const STATUS_TRANSITIONS: Record<string, string[]> = {
  planning: ["testing", "scheduled"],
  testing: ["cab_approval", "scheduled", "planning"],
  cab_approval: ["scheduled", "testing"],
  scheduled: ["deployment", "cab_approval"],
  deployment: ["post_deployment", "failed", "rolled_back"],
  post_deployment: ["complete", "failed"],
};

export default function ReleaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useRBAC();
  const utils = trpc.useUtils();

  const { data: release, isLoading } = trpc.changes.getRelease.useQuery({ id });

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [newStatus, setNewStatus] = useState("");

  const updateRelease = trpc.changes.updateRelease.useMutation({
    onSuccess: () => {
      toast.success("Release updated");
      setNewStatus("");
      setEditingNotes(false);
      void utils.changes.getRelease.invalidate({ id });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update release"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Loading release…</span>
      </div>
    );
  }

  if (!release) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <GitBranch className="w-8 h-8 opacity-30" />
        <span className="text-sm">Release not found</span>
        <button onClick={() => router.push("/app/releases")} className="text-xs text-primary hover:underline">Back to Releases</button>
      </div>
    );
  }

  const r = release as any;
  const rawStatus = r.status ?? "planning";
  const sCfg = STATE_CFG[rawStatus] ?? STATE_CFG.planning!;
  const isTerminal = TERMINAL_STATES.includes(rawStatus);
  const nextStates = STATUS_TRANSITIONS[rawStatus] ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button onClick={() => router.push("/app/releases")}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Releases
        </button>
        <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
        <span className="text-[11px] text-muted-foreground font-mono">{r.name}</span>
      </div>

      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-4 border-b border-border">
          <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${sCfg.bar}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-[11px] text-primary">{r.version}</span>
              <span className={`status-badge ${sCfg.color}`}>{sCfg.label}</span>
            </div>
            <h1 className="text-[15px] font-bold text-foreground">{r.name}</h1>
          </div>
          {!isTerminal && can("changes", "write") && nextStates.length > 0 && (
            <div className="flex items-center gap-2">
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                className="text-xs border border-border rounded px-2 py-1 bg-background">
                <option value="">Advance to…</option>
                {nextStates.map((s) => (
                  <option key={s} value={s}>{STATE_CFG[s]?.label ?? s}</option>
                ))}
              </select>
              {newStatus && (
                <button
                  onClick={() => updateRelease.mutate({ id, status: newStatus })}
                  disabled={updateRelease.isPending}
                  className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-50">
                  {updateRelease.isPending ? "Saving…" : "Confirm"}
                </button>
              )}
            </div>
          )}
        </div>

        {isTerminal && (
          <div className="px-4 py-2 bg-muted/40 border-b border-dashed border-border text-[11px] text-muted-foreground/70">
            This release is {sCfg.label}. No further transitions available.
          </div>
        )}

        <div className="grid grid-cols-3 gap-0 divide-x divide-border">
          {[
            { label: "Version", value: r.version, icon: Package },
            { label: "Planned Date", value: r.plannedDate ? new Date(r.plannedDate).toLocaleDateString("en-GB") : "—", icon: Calendar },
            { label: "Actual Date", value: r.actualDate ? new Date(r.actualDate).toLocaleDateString("en-GB") : "—", icon: CheckCircle2 },
          ].map((f, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <f.icon className="w-3 h-3 text-muted-foreground/60" />
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">{f.label}</span>
              </div>
              <div className="text-[13px] font-semibold text-foreground">{f.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[12px] font-semibold text-foreground/80">Release Notes</h3>
          {!isTerminal && !editingNotes && can("changes", "write") && (
            <button onClick={() => { setNotesDraft(r.notes ?? ""); setEditingNotes(true); }}
              className="text-[11px] text-primary hover:underline flex items-center gap-1">
              <Edit2 className="w-3 h-3" /> Edit
            </button>
          )}
        </div>
        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background h-24 resize-none"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Describe what's included in this release…"
            />
            <div className="flex gap-2">
              <button
                onClick={() => updateRelease.mutate({ id, notes: notesDraft })}
                disabled={updateRelease.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded disabled:opacity-50">
                <Save className="w-3 h-3" /> {updateRelease.isPending ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditingNotes(false)} className="flex items-center gap-1 px-2 py-1.5 border border-border text-[11px] rounded hover:bg-accent">
                <X className="w-3 h-3" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">{r.notes ?? "No release notes recorded."}</p>
        )}
      </div>

      {rawStatus === "complete" && (
        <div className="bg-green-50 border border-green-200 rounded px-4 py-3 flex items-center gap-2 text-[12px] text-green-700">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Release {r.version} successfully deployed on {r.actualDate ? new Date(r.actualDate).toLocaleDateString("en-GB") : "—"}.
        </div>
      )}
      {rawStatus === "failed" && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-3 flex items-center gap-2 text-[12px] text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          This release failed. Review post-mortem and create a follow-up release.
        </div>
      )}
    </div>
  );
}
