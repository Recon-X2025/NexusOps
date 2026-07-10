"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Shield, AlertTriangle, Clock, Cpu, Lock, CalendarDays,
  CheckCircle2, Plus, X, Brain, BookOpen, Pencil, XCircle,
} from "lucide-react";
import { useRBAC, PermissionGate, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";
import { DetailGrid } from "@/components/ui/detail-grid";
import { Timeline } from "@/components/ui/timeline";
import { cn } from "@/lib/utils";

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

const STATE_ORDERED = ["new", "triage", "containment", "eradication", "recovery", "closed", "false_positive"];

export default function SecurityIncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [tab, setTab] = useState("timeline");
  const [note, setNote] = useState("");
  const [editingAttackVector, setEditingAttackVector] = useState(false);
  const [attackVectorDraft, setAttackVectorDraft] = useState("");

  // Threat Intel state
  const [showAddTi, setShowAddTi] = useState(false);
  const [tiForm, setTiForm] = useState({ description: "", documentUri: "" });

  // Compliance Evidence state
  const [showAddComp, setShowAddComp] = useState(false);
  const [compForm, setCompForm] = useState({
    riskId: "", complianceFrameworkId: "", auditId: "", auditDocUri: "",
    failedControlId: "", failedControlDocUri: "", securityPolicyId: "",
    securityPolicyDocUri: "", supportingDocUri: "",
  });

  const { can, mergeTrpcQueryOpts } = useRBAC();
  const utils = trpc.useUtils();

  // @ts-ignore
  const incidentQuery = trpc.security.getIncident.useQuery({ id }, mergeTrpcQueryOpts("security.getIncident", undefined));

  // @ts-ignore
  const threatIntelQ = trpc.security.listThreatIntel.useQuery(
    { incidentId: id },
    // @ts-ignore
    mergeTrpcQueryOpts("security.listThreatIntel", { enabled: !!id }),
  );

  // @ts-ignore
  const complianceQ = trpc.security.listComplianceEvidence.useQuery(
    { incidentId: id },
    // @ts-ignore
    mergeTrpcQueryOpts("security.listComplianceEvidence", { enabled: !!id }),
  );

  // @ts-ignore
  const vulnsQ = trpc.security.listVulnerabilities.useQuery(
    { incidentId: id, limit: 100 },
    // @ts-ignore
    mergeTrpcQueryOpts("security.listVulnerabilities", { enabled: !!id }),
  );

  // GRC data for dropdowns
  // @ts-ignore
  const risksQ = trpc.grc.listRisks.useQuery({ limit: 200 }, mergeTrpcQueryOpts("grc.listRisks", undefined));
  // @ts-ignore
  const policiesQ = trpc.grc.listPolicies.useQuery({ limit: 200 }, mergeTrpcQueryOpts("grc.listPolicies", undefined));
  // @ts-ignore
  const auditsQ = trpc.grc.listAudits.useQuery(undefined, mergeTrpcQueryOpts("grc.listAudits", undefined));
  // @ts-ignore
  const controlsQ = trpc.grc.listControls.useQuery({ limit: 200 }, mergeTrpcQueryOpts("grc.listControls", undefined));

  // @ts-ignore
  const transitionMutation = trpc.security.transition.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.security.getIncident.invalidate({ id });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message || "Failed to update status"),
  });

  // @ts-ignore
  const updateIncidentMut = trpc.security.updateIncident.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.security.getIncident.invalidate({ id });
      setEditingAttackVector(false);
      toast.success("Incident updated");
    },
    onError: (e: any) => toast.error(e.message || "Failed to update"),
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

  // @ts-ignore
  const createTiMut = trpc.security.createThreatIntel.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.security.listThreatIntel.invalidate({ incidentId: id });
      setShowAddTi(false);
      setTiForm({ description: "", documentUri: "" });
      toast.success("Threat intelligence record added");
    },
    onError: (e: any) => toast.error(e.message || "Failed to add"),
  });

  // @ts-ignore
  const createCompMut = trpc.security.createComplianceEvidence.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.security.listComplianceEvidence.invalidate({ incidentId: id });
      setShowAddComp(false);
      setCompForm({ riskId: "", complianceFrameworkId: "", auditId: "", auditDocUri: "", failedControlId: "", failedControlDocUri: "", securityPolicyId: "", securityPolicyDocUri: "", supportingDocUri: "" });
      toast.success("Compliance evidence linked");
    },
    onError: (e: any) => toast.error(e.message || "Failed to link"),
  });

  if (!can("security", "read")) return <AccessDenied module="Security Incidents" />;

  const tiList = (threatIntelQ.data ?? []) as any[];
  const compList = (complianceQ.data ?? []) as any[];
  const vulnList = (vulnsQ.data ?? []) as any[];
  const risks = (risksQ.data ?? []) as any[];
  const policies = (policiesQ.data ?? []) as any[];
  const audits = (auditsQ.data ?? []) as any[];
  const controls = (controlsQ.data ?? []) as any[];

  return (
    <div className="flex flex-col gap-6 p-6">
      <ResourceView query={incidentQuery} resourceName="Incident" backHref="/app/security">
        {(incident) => {
          const sevCfg = (SEVERITY_CFG[incident.severity] ?? SEVERITY_CFG.medium)!;
          const timeline = (incident.timeline ?? []) as Array<{ time: string; event: string; actor?: string }>;
          const iocs = (incident.iocs ?? []) as Array<{ type: string; value: string; note?: string }>;
          const affectedSystems = (incident.affectedSystems ?? []) as string[];
          const containmentActions = (incident.containmentActions ?? []) as Array<{ action: string; performedAt: string; performedBy: string }>;
          const isClosed = incident.status === "closed" || incident.status === "false_positive";

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
                        onChange={(e) => transitionMutation.mutate({ id: incident.id, toStatus: e.target.value as any })}
                        disabled={transitionMutation.isPending || isClosed}
                      >
                        {STATE_ORDERED.map((s) => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}</option>
                        ))}
                      </select>
                      {!isClosed && (
                        <button
                          onClick={() => transitionMutation.mutate({ id: incident.id, toStatus: "closed" as any })}
                          disabled={transitionMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors shadow disabled:opacity-60"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Mark and End
                        </button>
                      )}
                    </PermissionGate>
                  </div>
                }
              />

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* ── Main Column ── */}
                <div className="lg:col-span-3 flex flex-col gap-6">

                  {/* Summary Card with editable Attack Vector */}
                  <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Description</h3>
                    <p className="text-sm text-foreground leading-relaxed">{incident.description || "No description provided."}</p>

                    {/* Attack Vector */}
                    <div className="mt-5 pt-4 border-t border-border">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Attack Vector</p>
                        <PermissionGate module="security" action="write">
                          {!editingAttackVector ? (
                            <button
                              onClick={() => { setAttackVectorDraft(incident.attackVector ?? ""); setEditingAttackVector(true); }}
                              className="flex items-center gap-1 text-[10px] text-primary hover:underline font-bold"
                            >
                              <Pencil className="w-2.5 h-2.5" /> Edit
                            </button>
                          ) : (
                            <button onClick={() => setEditingAttackVector(false)} className="text-[10px] text-muted-foreground hover:underline">Cancel</button>
                          )}
                        </PermissionGate>
                      </div>
                      {editingAttackVector ? (
                        <div className="flex gap-2">
                          <input
                            className="flex-1 text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 outline-none"
                            value={attackVectorDraft}
                            onChange={(e) => setAttackVectorDraft(e.target.value)}
                            placeholder="e.g. Phishing email, RDP brute force, Supply chain..."
                            onKeyDown={(e) => { if (e.key === "Enter") updateIncidentMut.mutate({ id, attackVector: attackVectorDraft }); }}
                          />
                          <button
                            onClick={() => updateIncidentMut.mutate({ id, attackVector: attackVectorDraft })}
                            disabled={updateIncidentMut.isPending}
                            className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-60"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <p className={cn("text-sm", incident.attackVector ? "text-foreground font-medium" : "text-muted-foreground italic")}>
                          {incident.attackVector || "Not specified — click Edit to set"}
                        </p>
                      )}
                    </div>

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
                  <div className="flex border-b border-border gap-6 overflow-x-auto">
                    {[
                      { key: "timeline",       label: "Timeline" },
                      { key: "tasks",          label: `Containment (${containmentActions.length})` },
                      { key: "iocs",           label: `IOCs (${iocs.length})` },
                      { key: "threat_intel",   label: `Threat Intel (${tiList.length})` },
                      { key: "compliance",     label: `Compliance (${compList.length})` },
                      { key: "vulnerabilities",label: `Vulnerabilities (${vulnList.length})` },
                      { key: "notes",          label: "Notes" },
                    ].map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={cn(
                          "pb-3 text-sm font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap",
                          tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Timeline */}
                  {tab === "timeline" && (
                    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                      <Timeline
                        items={timeline.map((e, i) => ({
                          id: i.toString(),
                          title: e.event,
                          timestamp: e.time,
                          icon: Shield,
                          type: "info" as any,
                          description: e.actor,
                        }))}
                      />
                    </div>
                  )}

                  {/* Containment Actions */}
                  {tab === "tasks" && (
                    <div className="bg-card border border-border rounded-xl overflow-hidden animate-in fade-in slide-in-from-left-4 duration-300">
                      {containmentActions.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground">No actions recorded.</div>
                      ) : (
                        <div className="overflow-x-auto">
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
                        </div>
                      )}
                    </div>
                  )}

                  {/* IOCs */}
                  {tab === "iocs" && (
                    <div className="bg-card border border-border rounded-xl overflow-hidden animate-in fade-in slide-in-from-left-4 duration-300">
                      {iocs.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground">No IOCs recorded.</div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-muted/30 border-b border-border">
                              <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Type</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Value</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Note</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {iocs.map((ioc, i) => (
                              <tr key={i} className="hover:bg-muted/10">
                                <td className="px-4 py-3 text-[11px] font-bold text-primary uppercase">{ioc.type}</td>
                                <td className="px-4 py-3 text-sm font-mono">{ioc.value}</td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">{ioc.note ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* ── Threat Intelligence ── */}
                  {tab === "threat_intel" && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-left-4 duration-300">
                      <div className="flex justify-between items-center">
                        <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-widest">Threat Intelligence Records</p>
                        <PermissionGate module="security" action="write">
                          <button
                            onClick={() => setShowAddTi(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 shadow-md transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add Threat Intelligence
                          </button>
                        </PermissionGate>
                      </div>
                      <div className="bg-card border border-border rounded-xl overflow-hidden">
                        {tiList.length === 0 ? (
                          <div className="p-12 text-center flex flex-col items-center gap-2 text-muted-foreground">
                            <Brain className="w-8 h-8 opacity-20" />
                            <p className="text-sm">No threat intelligence linked yet.</p>
                          </div>
                        ) : (
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-muted/30 border-b border-border">
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">TI ID</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Description</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Document</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Added</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {tiList.map((ti) => (
                                <tr key={ti.id} className="hover:bg-muted/10 transition-colors">
                                  <td className="px-4 py-3 text-[11px] font-mono font-bold text-primary">{ti.number}</td>
                                  <td className="px-4 py-3 text-sm text-foreground max-w-xs">{ti.description}</td>
                                  <td className="px-4 py-3 text-sm">
                                    {ti.documentUri ? (
                                      <a href={ti.documentUri} target="_blank" rel="noreferrer" className="text-primary underline text-xs font-bold">View Doc</a>
                                    ) : <span className="text-muted-foreground">—</span>}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(ti.createdAt).toLocaleDateString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Compliance Evidence ── */}
                  {tab === "compliance" && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-left-4 duration-300">
                      <div className="flex justify-between items-center">
                        <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-widest">Compliance Evidence & GRC Links</p>
                        <PermissionGate module="security" action="write">
                          <button
                            onClick={() => setShowAddComp(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 shadow-md transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add Compliance Evidence
                          </button>
                        </PermissionGate>
                      </div>
                      <div className="bg-card border border-border rounded-xl overflow-hidden">
                        {compList.length === 0 ? (
                          <div className="p-12 text-center flex flex-col items-center gap-2 text-muted-foreground">
                            <BookOpen className="w-8 h-8 opacity-20" />
                            <p className="text-sm">No compliance evidence linked yet.</p>
                            <p className="text-xs">Link GRC Risk, Audit findings, Failed Controls and Policies to this incident.</p>
                          </div>
                        ) : (
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-muted/30 border-b border-border">
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Risk (GRC)</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Audit</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Failed Control</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Policy</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Supporting Doc</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Added</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {compList.map((ev: any) => {
                                const risk = risks.find((r: any) => r.id === ev.riskId);
                                const audit = audits.find((a: any) => a.id === ev.auditId);
                                const control = controls.find((c: any) => c.id === ev.failedControlId);
                                const policy = policies.find((p: any) => p.id === ev.securityPolicyId);
                                return (
                                  <tr key={ev.id} className="hover:bg-muted/10 transition-colors">
                                    <td className="px-4 py-3 text-sm">
                                      {risk ? <span className="text-orange-700 font-bold text-[11px]">{risk.number} — {risk.title}</span> : <span className="text-muted-foreground">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {audit ? (
                                        <div>
                                          <div className="text-foreground font-medium text-xs">{audit.title}</div>
                                          {ev.auditDocUri && <a href={ev.auditDocUri} target="_blank" rel="noreferrer" className="text-primary text-[10px] underline">View</a>}
                                        </div>
                                      ) : <span className="text-muted-foreground">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {control ? (
                                        <div>
                                          <div className="text-foreground font-medium text-xs">{control.title}</div>
                                          {ev.failedControlDocUri && <a href={ev.failedControlDocUri} target="_blank" rel="noreferrer" className="text-primary text-[10px] underline">View</a>}
                                        </div>
                                      ) : <span className="text-muted-foreground">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {policy ? (
                                        <div>
                                          <div className="text-foreground font-medium text-xs">{policy.title}</div>
                                          {ev.securityPolicyDocUri && <a href={ev.securityPolicyDocUri} target="_blank" rel="noreferrer" className="text-primary text-[10px] underline">View</a>}
                                        </div>
                                      ) : <span className="text-muted-foreground">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {ev.supportingDocUri ? <a href={ev.supportingDocUri} target="_blank" rel="noreferrer" className="text-primary text-xs underline font-bold">View Doc</a> : <span className="text-muted-foreground">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(ev.createdAt).toLocaleDateString()}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Vulnerabilities ── */}
                  {tab === "vulnerabilities" && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-left-4 duration-300">
                      <div className="flex justify-between items-center">
                        <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-widest">Linked Vulnerabilities</p>
                      </div>
                      <div className="bg-card border border-border rounded-xl overflow-hidden">
                        {vulnList.length === 0 ? (
                          <div className="p-12 text-center flex flex-col items-center gap-2 text-muted-foreground">
                            <Shield className="w-8 h-8 opacity-20" />
                            <p className="text-sm">No vulnerabilities linked yet.</p>
                          </div>
                        ) : (
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-muted/30 border-b border-border">
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">CVE / ID</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Title</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Severity</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {vulnList.map((v: any) => (
                                <tr key={v.id} className="hover:bg-muted/10 transition-colors">
                                  <td className="px-4 py-3 text-[11px] font-mono font-bold text-primary">{v.cveId || v.id.slice(0, 8)}</td>
                                  <td className="px-4 py-3 text-sm text-foreground max-w-md">{v.title}</td>
                                  <td className="px-4 py-3 text-sm capitalize">{v.severity}</td>
                                  <td className="px-4 py-3 text-sm capitalize text-muted-foreground">{v.status.replace("_", " ")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
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

                {/* ── Sidebar ── */}
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
                    {!isClosed && (
                      <>
                        <button
                          onClick={() => transitionMutation.mutate({ id: incident.id, toStatus: "closed" as any })}
                          disabled={transitionMutation.isPending}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-all border border-green-200 disabled:opacity-60"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Mark and End (Close)
                        </button>
                        <button
                          onClick={() => transitionMutation.mutate({ id: incident.id, toStatus: "false_positive" as any })}
                          disabled={transitionMutation.isPending}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 disabled:opacity-60"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Close as False Positive
                        </button>
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
                      </>
                    )}
                    {isClosed && (
                      <div className="text-center text-xs text-muted-foreground py-2">
                        ✅ This incident is <span className="font-bold">{incident.status.replace("_", " ")}</span>.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Add Threat Intel Modal ── */}
              {showAddTi && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-primary" />
                        <h3 className="text-base font-bold text-foreground">Add Threat Intelligence</h3>
                      </div>
                      <button onClick={() => setShowAddTi(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="p-6 flex flex-col gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Description *</label>
                        <textarea
                          rows={3}
                          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background resize-none focus:ring-2 focus:ring-primary/20 outline-none"
                          placeholder="Describe the threat intelligence (actor, campaign, TTPs, IOCs source...)"
                          value={tiForm.description}
                          onChange={(e) => setTiForm({ ...tiForm, description: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Supporting Document URL</label>
                        <input
                          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 outline-none"
                          placeholder="https://… (report, PDF, feed link)"
                          value={tiForm.documentUri}
                          onChange={(e) => setTiForm({ ...tiForm, documentUri: e.target.value })}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Paste a URL to a document or attachment link.</p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
                      <button onClick={() => setShowAddTi(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                      <button
                        disabled={!tiForm.description.trim() || createTiMut.isPending}
                        onClick={() => createTiMut.mutate({ incidentId: id, description: tiForm.description, documentUri: tiForm.documentUri || undefined })}
                        className="px-6 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90 shadow-lg disabled:opacity-50"
                      >
                        {createTiMut.isPending ? "Saving…" : "Add Threat Intel"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Add Compliance Evidence Modal ── */}
              {showAddComp && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-primary" />
                        <h3 className="text-base font-bold text-foreground">Add Compliance Evidence</h3>
                      </div>
                      <button onClick={() => setShowAddComp(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="p-6 overflow-y-auto flex flex-col gap-4">
                      <p className="text-xs text-muted-foreground">Link GRC records from the Risk Register, Audits, Controls and Policies to this Security Incident for full traceability.</p>

                      {/* GRC Risk */}
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Compliance Framework / Risk (GRC Risk Register)</label>
                        <select className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" value={compForm.riskId} onChange={(e) => setCompForm({ ...compForm, riskId: e.target.value })}>
                          <option value="">— Select Risk —</option>
                          {risks.map((r: any) => <option key={r.id} value={r.id}>{r.number} — {r.title}</option>)}
                        </select>
                      </div>

                      {/* Audit */}
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Audit</label>
                        <select className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background mb-2" value={compForm.auditId} onChange={(e) => setCompForm({ ...compForm, auditId: e.target.value })}>
                          <option value="">— Select Audit —</option>
                          {audits.map((a: any) => <option key={a.id} value={a.id}>{a.title}</option>)}
                        </select>
                        <input className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" placeholder="Audit document URL" value={compForm.auditDocUri} onChange={(e) => setCompForm({ ...compForm, auditDocUri: e.target.value })} />
                      </div>

                      {/* Failed Control */}
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Failed Control</label>
                        <select className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background mb-2" value={compForm.failedControlId} onChange={(e) => setCompForm({ ...compForm, failedControlId: e.target.value })}>
                          <option value="">— Select Control —</option>
                          {controls.map((c: any) => <option key={c.id} value={c.id}>{c.controlNumber} — {c.title}</option>)}
                        </select>
                        <input className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" placeholder="Failed control evidence URL" value={compForm.failedControlDocUri} onChange={(e) => setCompForm({ ...compForm, failedControlDocUri: e.target.value })} />
                      </div>

                      {/* Security Policy */}
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Security Policy</label>
                        <select className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background mb-2" value={compForm.securityPolicyId} onChange={(e) => setCompForm({ ...compForm, securityPolicyId: e.target.value })}>
                          <option value="">— Select Policy —</option>
                          {policies.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                        <input className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" placeholder="Policy document URL" value={compForm.securityPolicyDocUri} onChange={(e) => setCompForm({ ...compForm, securityPolicyDocUri: e.target.value })} />
                      </div>

                      {/* Supporting Doc */}
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Additional Supporting Document URL</label>
                        <input className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" placeholder="https://… (general evidence attachment)" value={compForm.supportingDocUri} onChange={(e) => setCompForm({ ...compForm, supportingDocUri: e.target.value })} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
                      <button onClick={() => setShowAddComp(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                      <button
                        disabled={createCompMut.isPending}
                        onClick={() => createCompMut.mutate({
                          incidentId: id,
                          riskId: compForm.riskId || undefined,
                          auditId: compForm.auditId || undefined,
                          auditDocUri: compForm.auditDocUri || undefined,
                          failedControlId: compForm.failedControlId || undefined,
                          failedControlDocUri: compForm.failedControlDocUri || undefined,
                          securityPolicyId: compForm.securityPolicyId || undefined,
                          securityPolicyDocUri: compForm.securityPolicyDocUri || undefined,
                          supportingDocUri: compForm.supportingDocUri || undefined,
                        })}
                        className="px-6 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90 shadow-lg disabled:opacity-50"
                      >
                        {createCompMut.isPending ? "Saving…" : "Link Compliance Evidence"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        }}
      </ResourceView>
    </div>
  );
}
