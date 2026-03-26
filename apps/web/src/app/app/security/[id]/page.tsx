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

export default function SecurityIncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [tab, setTab] = useState("timeline");
  const [note, setNote] = useState("");
  const { can } = useRBAC();
  const utils = trpc.useUtils();

  // @ts-ignore
  const incidentQuery = trpc.security.getIncident.useQuery({ id });

  // @ts-ignore
  const transitionMutation = trpc.security.transition.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.security.getIncident.invalidate({ id });
      toast.success("Status updated");
    },
    onError: (e: any) => { console.error("security.transition failed:", e); toast.error(e.message || "Failed to update status"); },
  });

  if (!can("security", "read")) return <AccessDenied module="Security Incidents" />;

  if (incidentQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3 max-w-full animate-pulse">
        <div className="h-4 w-48 bg-muted rounded" />
        <div className="bg-card border border-border rounded p-4 space-y-3">
          <div className="h-5 w-3/4 bg-muted rounded" />
          <div className="h-4 w-1/2 bg-muted rounded" />
          <div className="h-4 w-2/3 bg-muted rounded" />
          <div className="h-8 w-full bg-muted rounded mt-2" />
        </div>
        <div className="bg-card border border-border rounded h-48" />
      </div>
    );
  }

  if (incidentQuery.error || !incidentQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Shield className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm font-semibold text-muted-foreground">Incident Not Found</p>
        <p className="text-[12px] text-muted-foreground/70">
          The requested incident could not be found or you don&apos;t have access.
        </p>
        <Link href="/app/security" className="text-[12px] text-primary hover:underline">
          ← Back to Security Operations
        </Link>
      </div>
    );
  }

  const incident = incidentQuery.data;
  const sevCfg = (SEVERITY_CFG[incident.severity] ?? SEVERITY_CFG.medium)!;
  const timeline = (incident.timeline ?? []) as Array<{ time: string; event: string; actor?: string }>;
  const iocs = (incident.iocs ?? []) as Array<{ type: string; value: string; note?: string }>;
  const affectedSystems = (incident.affectedSystems ?? []) as string[];
  const containmentActions = (incident.containmentActions ?? []) as Array<{ action: string; performedAt: string; performedBy: string }>;

  return (
    <div className="flex flex-col gap-3 max-w-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
        <Link href="/app/security" className="hover:text-primary flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" /> Security Operations
        </Link>
        <span>/</span>
        <span className="text-muted-foreground font-medium">{incident.number}</span>
      </div>

      {/* Title bar */}
      <div className={`border-l-4 ${sevCfg.border} bg-card border border-border rounded p-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Shield className="w-4 h-4 text-red-600" />
              <span className="font-mono text-[11px] text-primary">{incident.number}</span>
              <span className={`status-badge font-bold ${sevCfg.color}`}>⚡ {sevCfg.label}</span>
              <span className={`status-badge capitalize ${STATE_CFG[incident.status] ?? ""}`}>
                {incident.status.replace("_", " ")}
              </span>
            </div>
            <h1 className="text-[15px] font-bold text-foreground mb-1">{incident.title}</h1>
            {incident.description && (
              <p className="text-[12px] text-muted-foreground leading-relaxed mb-2">{incident.description}</p>
            )}
            <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
              <span>Created: <strong className="text-foreground/80">{new Date(incident.createdAt).toLocaleString()}</strong></span>
              {incident.attackVector && (
                <span>Attack Vector: <strong className="text-foreground/80">{incident.attackVector}</strong></span>
              )}
              {incident.resolvedAt && (
                <span>Resolved: <strong className="text-green-700">{new Date(incident.resolvedAt).toLocaleString()}</strong></span>
              )}
            </div>
          </div>
        </div>

        {/* Affected Systems */}
        {affectedSystems.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-1.5">Affected Systems</p>
            <div className="flex flex-wrap gap-1.5">
              {affectedSystems.map((s) => (
                <span key={s} className="flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 text-[11px] rounded border border-red-200">
                  <Cpu className="w-2.5 h-2.5" />{s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* State transitions */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <PermissionGate module="security" action="write">
            {STATE_ORDERED.map((s, i, arr) => (
              <div key={s} className="flex items-center gap-1">
                <button
                  onClick={() => transitionMutation.mutate({ id: incident.id, toStatus: s })}
                  disabled={transitionMutation.isPending}
                  className={`px-2 py-0.5 text-[11px] rounded border transition-colors disabled:opacity-50
                    ${incident.status === s
                      ? `${STATE_CFG[s]} border-current`
                      : "bg-card text-muted-foreground/70 border-border hover:bg-muted/30"
                    }`}
                >
                  {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
                {i < arr.length - 1 && <span className="text-slate-300 text-[11px]">→</span>}
              </div>
            ))}
          </PermissionGate>
        </div>
      </div>

      <div className="flex gap-3">
        {/* Left: Tabs */}
        <div className="flex-1 min-w-0">
          <div className="flex border-b border-border bg-card rounded-t">
            {[
              { key: "timeline",  label: "Incident Timeline" },
              { key: "tasks",     label: `Containment Actions (${containmentActions.length})` },
              { key: "iocs",      label: `Indicators of Compromise (${iocs.length})` },
              { key: "notes",     label: "Work Notes" },
            ].map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
                  ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="bg-card border border-border rounded-b overflow-hidden">
            {tab === "timeline" && (
              <div className="p-4">
                {timeline.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground/70 text-center py-8">No timeline entries recorded yet.</p>
                ) : (
                  <div className="relative">
                    <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
                    <div className="space-y-3">
                      {timeline.map((e, i) => (
                        <div key={i} className="flex gap-4 relative pl-8">
                          <div className="absolute left-1.5 top-1 w-3 h-3 rounded-full border-2 border-white bg-blue-500" />
                          <div className="flex-1">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="font-mono text-[10px] text-muted-foreground/70">{e.time}</span>
                              {e.actor && (
                                <span className="text-[11px] font-semibold text-muted-foreground">{e.actor}</span>
                              )}
                            </div>
                            <p className="text-[12px] leading-relaxed text-foreground">{e.event}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "tasks" && (
              containmentActions.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-[12px] text-muted-foreground/70">No containment actions recorded for this incident.</p>
                </div>
              ) : (
                <table className="ent-table w-full">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Performed By</th>
                      <th>Performed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {containmentActions.map((a, i) => (
                      <tr key={i}>
                        <td className="text-foreground">{a.action}</td>
                        <td className="text-muted-foreground">{a.performedBy}</td>
                        <td className="font-mono text-[11px] text-muted-foreground">
                          {new Date(a.performedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {tab === "iocs" && (
              iocs.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-[12px] text-muted-foreground/70">No indicators of compromise recorded.</p>
                </div>
              ) : (
                <table className="ent-table w-full">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Indicator Value</th>
                      <th>Note</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iocs.map((ioc, i) => (
                      <tr key={i}>
                        <td><span className="status-badge text-muted-foreground bg-muted font-mono">{ioc.type}</span></td>
                        <td className="font-mono text-[11px] text-red-700 font-semibold">{ioc.value}</td>
                        <td className="text-[11px] text-muted-foreground">{ioc.note ?? "—"}</td>
                        <td>
                          <PermissionGate module="security" action="write">
                            <div className="flex gap-1.5">
                              <button className="text-[11px] text-red-600 hover:underline">Block</button>
                              <button className="text-[11px] text-primary hover:underline">Add to Threat Intel</button>
                            </div>
                          </PermissionGate>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {tab === "notes" && (
              <div className="p-4">
                <PermissionGate module="security" action="write">
                  <div className="border border-border rounded overflow-hidden mb-4">
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4}
                      className="w-full px-3 py-2 text-[12px] outline-none resize-none"
                      placeholder="Add work note (visible to responders only)..." />
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t border-border">
                      <button className="text-muted-foreground/70 hover:text-muted-foreground">
                        <Paperclip className="w-3.5 h-3.5" />
                      </button>
                      <button className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                        <Send className="w-3 h-3" /> Add Note
                      </button>
                    </div>
                  </div>
                </PermissionGate>
                <p className="text-[11px] text-muted-foreground/70 text-center">
                  Work notes are internal only and not shared with requestors.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-56 flex-shrink-0 space-y-3">
          <div className="bg-card border border-border rounded overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase">
              Details
            </div>
            <div className="divide-y divide-border">
              {[
                { label: "Status",        value: incident.status.replace("_", " ") },
                { label: "Severity",      value: sevCfg.label },
                { label: "Attack Vector", value: incident.attackVector ?? "—" },
                { label: "Created",       value: new Date(incident.createdAt).toLocaleDateString() },
                { label: "Updated",       value: new Date(incident.updatedAt).toLocaleDateString() },
                ...(incident.resolvedAt ? [{ label: "Resolved", value: new Date(incident.resolvedAt).toLocaleDateString() }] : []),
              ].map((f) => (
                <div key={f.label} className="px-3 py-2">
                  <p className="text-[10px] text-muted-foreground/70 uppercase">{f.label}</p>
                  <p className="text-[12px] text-foreground/80 font-medium capitalize">{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase">
              Quick Actions
            </div>
            <div className="p-2 space-y-1.5">
              {[
                { label: "Generate DPDP Breach Report",   icon: FileText,      color: "text-red-600" },
                { label: "Escalate to CISO",              icon: AlertTriangle, color: "text-orange-600" },
                { label: "Add IOC to Threat Intel",       icon: Shield,        color: "text-primary" },
                { label: "Block IP at firewall",          icon: Lock,          color: "text-primary" },
                { label: "Export Evidence Package",       icon: FileText,      color: "text-muted-foreground" },
                { label: "Schedule Post-Incident Review", icon: Clock,         color: "text-muted-foreground" },
              ].map((a) => (
                <button key={a.label} className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-foreground/80 hover:bg-muted/30 rounded text-left">
                  <a.icon className={`w-3 h-3 flex-shrink-0 ${a.color}`} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
