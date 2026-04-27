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

import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";
import { DetailGrid } from "@/components/ui/detail-grid";
import { cn } from "@/lib/utils";

export default function ReleaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const utils = trpc.useUtils();

  const releaseQuery = trpc.changes.getRelease.useQuery({ id }, mergeTrpcQueryOpts("changes.getRelease", undefined));

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

  return (
    <div className="flex flex-col gap-6 p-6">
      <ResourceView
        query={releaseQuery}
        resourceName="Release"
        backHref="/app/releases"
      >
        {(r) => {
          const rawStatus = r.status ?? "planning";
          const sCfg = STATE_CFG[rawStatus] ?? STATE_CFG.planning!;
          const isTerminal = TERMINAL_STATES.includes(rawStatus);
          const nextStates = STATUS_TRANSITIONS[rawStatus] ?? [];

          return (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <PageHeader
                title={r.name}
                subtitle={`Version ${r.version}`}
                icon={GitBranch}
                backHref="/app/releases"
                badge={
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", sCfg.color)}>
                      {sCfg.label}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground font-mono">
                      {r.version}
                    </span>
                  </div>
                }
                actions={
                  !isTerminal && can("changes", "write") && nextStates.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value)}
                        className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold"
                      >
                        <option value="">Advance Status…</option>
                        {nextStates.map((s) => (
                          <option key={s} value={s}>{STATE_CFG[s]?.label ?? s}</option>
                        ))}
                      </select>
                      {newStatus && (
                        <button
                          onClick={() => updateRelease.mutate({ id, status: newStatus })}
                          className="px-4 py-1.5 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90 transition-all shadow-md"
                        >
                          Confirm
                        </button>
                      )}
                    </div>
                  )
                }
              />

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 flex flex-col gap-6">
                  {/* Notes Card */}
                  <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Release Notes</h3>
                      {!isTerminal && !editingNotes && can("changes", "write") && (
                        <button onClick={() => { setNotesDraft(r.notes ?? ""); setEditingNotes(true); }} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                          <Edit2 className="w-3 h-3" /> Edit Notes
                        </button>
                      )}
                    </div>
                    {editingNotes ? (
                      <div className="flex flex-col gap-4">
                        <textarea
                          className="w-full text-sm border border-border rounded-xl px-4 py-3 bg-background h-32 resize-none focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                          value={notesDraft}
                          onChange={(e) => setNotesDraft(e.target.value)}
                          placeholder="Describe what's included in this release…"
                        />
                        <div className="flex gap-3 justify-end">
                          <button onClick={() => setEditingNotes(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted/50 transition-all">Cancel</button>
                          <button onClick={() => updateRelease.mutate({ id, notes: notesDraft })} className="px-6 py-2 text-sm font-bold bg-primary text-white rounded-lg hover:bg-primary/90 transition-all shadow-md">Save Changes</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{r.notes || "No release notes recorded."}</p>
                    )}
                  </div>

                  {rawStatus === "complete" && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 text-sm text-green-700 font-medium">
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                      Release successfully deployed on {r.actualDate ? new Date(r.actualDate).toLocaleDateString("en-IN") : "—"}.
                    </div>
                  )}
                  {rawStatus === "failed" && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-sm text-red-700 font-medium">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                      This release failed. Review post-mortem and create a follow-up release.
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-6">
                  <DetailGrid
                    title="Metadata"
                    icon={Package}
                    items={[
                      { label: "Planned Date", value: r.plannedDate ? new Date(r.plannedDate).toLocaleDateString("en-IN") : "—", icon: Calendar },
                      { label: "Actual Date", value: r.actualDate ? new Date(r.actualDate).toLocaleDateString("en-IN") : "—", icon: CheckCircle2 },
                      { label: "Created", value: new Date(r.createdAt).toLocaleDateString("en-IN"), icon: Clock },
                    ]}
                  />
                </div>
              </div>
            </div>
          );
        }}
      </ResourceView>
    </div>
  );
}
  );
}
