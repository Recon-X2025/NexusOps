"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Shield, AlertTriangle, ChevronLeft, Clock, Cpu, FileText,
  Send, Paperclip, Lock,
} from "lucide-react";
import { useRBAC, PermissionGate, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const SEVERITY_CFG: Record<string, { label: string; color: string; border: string }> = {
  critical:      { label: "Critical", color: "text-red-700 bg-red-100",       border: "border-red-400" },
  high:          { label: "High",     color: "text-orange-700 bg-orange-100", border: "border-orange-400" },
  medium:        { label: "Medium",   color: "text-yellow-700 bg-yellow-100", border: "border-yellow-400" },
  low:           { label: "Low",      color: "text-blue-700 bg-blue-100",     border: "border-blue-400" },
  informational: { label: "Info",     color: "text-slate-700 bg-slate-100",   border: "border-slate-300" },
};

const STATE_CFG: Record<string, string> = {
  new:            "text-slate-700 bg-slate-100",
  triage:         "text-yellow-700 bg-yellow-100",
  containment:    "text-orange-700 bg-orange-100",
  eradication:    "text-purple-700 bg-purple-100",
  recovery:       "text-blue-700 bg-blue-100",
  closed:         "text-green-700 bg-green-100",
  false_positive: "text-muted-foreground bg-muted",
};

const STATE_ORDERED = ["new", "triage", "containment", "eradication", "recovery", "closed"];

import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";
import { DetailGrid } from "@/components/ui/detail-grid";
import { Timeline } from "@/components/ui/timeline";
import { cn } from "@/lib/utils";

export default function SecurityIncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [tab, setTab] = useState("timeline");
  const [note, setNote] = useState("");
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const utils = trpc.useUtils();

  // @ts-ignore
  const incidentQuery = trpc.security.getIncident.useQuery({ id }, mergeTrpcQueryOpts("security.getIncident", undefined));

  // @ts-ignore
  const transitionMutation = trpc.security.transition.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.security.getIncident.invalidate({ id });
      toast.success("Status updated");
    },
    onError: (e: any) => { console.error("security.transition failed:", e); toast.error(e.message || "Failed to update status"); },
  });

  // @ts-ignore
  const addContainmentMutation = trpc.security.addContainment.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.security.getIncident.invalidate({ id });
      setNote("");
      toast.success("Action recorded");
    },
    onError: (e: any) => toast.error(e.message || "Failed to record action"),
  });

  if (!can("security", "read")) return <AccessDenied module="Security Incidents" />;

  return (
    <div className="flex flex-col gap-6 p-6">
      <ResourceView
        query={incidentQuery}
        resourceName="Incident"
        backHref="/app/security"
      >
        {(incident) => {
          const sevCfg = (SEVERITY_CFG[incident.severity] ?? SEVERITY_CFG.medium)!;
          const timeline = (incident.timeline ?? []) as Array<{ time: string; event: string; actor?: string }>;
          const iocs = (incident.iocs ?? []) as Array<{ type: string; value: string; note?: string }>;
          const affectedSystems = (incident.affectedSystems ?? []) as string[];
          const containmentActions = (incident.containmentActions ?? []) as Array<{ action: string; performedAt: string; performedBy: string }>;

          return (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <PageHeader
                title={incident.number || `INC-${id.slice(0, 8)}`}
                subtitle={incident.title}
                icon={Shield}
                backHref="/app/security"
                badge={
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border", sevCfg.color, sevCfg.border)}>
                      ⚡ {sevCfg.label}
                    </span>
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", STATE_CFG[incident.status] ?? "bg-muted text-muted-foreground")}>
                      {incident.status.replace("_", " ")}
                    </span>
                  </div>
                }
                actions={
                  <div className="flex items-center gap-2">
                    <PermissionGate module="security" action="write">
                      <select
                        className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold"
                        value={incident.status}
                        onChange={(e) => transitionMutation.mutate({ id: incident.id, toStatus: e.target.value })}
                        disabled={transitionMutation.isPending}
                      >
                        {STATE_ORDERED.map((s) => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                    </PermissionGate>
                  </div>
                }
              />

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 flex flex-col gap-6">
                  {/* Summary Card */}
                  <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Description</h3>
                    <p className="text-sm text-foreground leading-relaxed">
                      {incident.description || "No description provided."}
                    </p>
                    {affectedSystems.length > 0 && (
                      <div className="mt-4">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Affected Assets</p>
                        <div className="flex flex-wrap gap-2">
                          {affectedSystems.map((s) => (
                            <span key={s} className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 text-[11px] font-bold rounded-lg border border-red-200">
                              <Cpu className="w-3 h-3" />{s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b border-border gap-6">
                    {[
                      { key: "timeline", label: "Timeline" },
                      { key: "tasks", label: `Containment (${containmentActions.length})` },
                      { key: "iocs", label: `IOCs (${iocs.length})` },
                      { key: "notes", label: "Notes" },
                    ].map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={cn(
                          "pb-3 text-sm font-bold uppercase tracking-widest border-b-2 transition-all",
                          tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {tab === "timeline" && (
                    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                      <Timeline
                        items={timeline.map((e, i) => ({
                          id: i.toString(),
                          title: e.event,
                          timestamp: e.time,
                          icon: Shield,
                          type: "info",
                          description: e.actor
                        }))}
                      />
                    </div>
                  )}

                  {tab === "tasks" && (
                    <div className="bg-card border border-border rounded-xl overflow-hidden animate-in fade-in slide-in-from-left-4 duration-300">
                      {containmentActions.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground">No actions recorded.</div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-muted/30 border-b border-border">
                              <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Action</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">By</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Time</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {containmentActions.map((a, i) => (
                              <tr key={i} className="hover:bg-muted/10 transition-colors">
                                <td className="px-4 py-3 text-sm font-medium text-foreground">{a.action}</td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">{a.performedBy}</td>
                                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{new Date(a.performedAt).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {tab === "notes" && (
                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm animate-in fade-in slide-in-from-left-4 duration-300">
                      <PermissionGate module="security" action="write">
                        <div className="flex flex-col gap-4">
                          <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add work note..." className="w-full px-4 py-3 text-sm border border-border rounded-xl bg-background resize-none focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
                          <div className="flex justify-end">
                            <button
                              disabled={addContainmentMutation.isPending || !note.trim()}
                              onClick={() => addContainmentMutation.mutate({ id, action: `Note: ${note}`, performedBy: "current_user" })}
                              className="px-6 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-all shadow-md"
                            >
                              Add Note
                            </button>
                          </div>
                        </div>
                      </PermissionGate>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-6">
                  <DetailGrid
                    title="Incident Info"
                    icon={Shield}
                    items={[
                      { label: "Attack Vector", value: incident.attackVector || "—", icon: AlertTriangle },
                      { label: "Created", value: new Date(incident.createdAt).toLocaleDateString(), icon: CalendarDays },
                      { label: "Updated", value: new Date(incident.updatedAt).toLocaleDateString(), icon: Clock },
                      { label: "Resolved", value: incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleDateString() : "—", icon: CheckCircle2 },
                    ]}
                  />

                  <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Quick Actions</h4>
                    <button
                      onClick={() => addContainmentMutation.mutate({ id, action: "Escalated to CISO", performedBy: "current_user" })}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg transition-all border border-orange-200"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" /> Escalate to CISO
                    </button>
                    <button
                      onClick={() => addContainmentMutation.mutate({ id, action: "Blocked IP at firewall", performedBy: "current_user" })}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-all border border-red-200"
                    >
                      <Lock className="w-3.5 h-3.5" /> Block IP at Firewall
                    </button>
                  </div>
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
