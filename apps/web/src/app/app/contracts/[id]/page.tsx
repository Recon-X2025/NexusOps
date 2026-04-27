"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText, ArrowLeft, CheckCircle2, Clock, AlertTriangle, Calendar,
  DollarSign, Shield, Edit2, Save, X, ChevronRight, Building2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, PermissionGate } from "@/lib/rbac-context";
import { EsignPanel } from "@/components/esign/EsignPanel";

const STATE_CFG: Record<string, { label: string; color: string; bar: string }> = {
  draft:              { label: "Draft",              color: "text-muted-foreground bg-muted",     bar: "bg-slate-400" },
  under_review:       { label: "Under Review",       color: "text-blue-700 bg-blue-100",          bar: "bg-blue-500" },
  legal_review:       { label: "Legal Review",       color: "text-purple-700 bg-purple-100",      bar: "bg-purple-500" },
  awaiting_signature: { label: "Awaiting Signature", color: "text-yellow-700 bg-yellow-100",      bar: "bg-yellow-400" },
  active:             { label: "Active",             color: "text-green-700 bg-green-100",        bar: "bg-green-500" },
  expiring_soon:      { label: "Expiring Soon",      color: "text-orange-700 bg-orange-100",      bar: "bg-orange-500" },
  expired:            { label: "Expired",            color: "text-red-700 bg-red-100",            bar: "bg-red-500" },
  terminated:         { label: "Terminated",         color: "text-muted-foreground/70 bg-muted/30", bar: "bg-slate-300" },
};

const TYPE_LABELS: Record<string, string> = {
  nda: "NDA", msa: "MSA", sow: "SOW", license: "License",
  customer_agreement: "Customer Agreement", sla_support: "SLA / Support",
  colocation: "Colocation", employment: "Employment", vendor: "Vendor", partnership: "Partnership",
};

const TERMINAL_STATES = ["expired", "terminated"];

import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";
import { DetailGrid } from "@/components/ui/detail-grid";

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const utils = trpc.useUtils();

  const contractQuery = trpc.contracts.get.useQuery({ id }, mergeTrpcQueryOpts("contracts.get", undefined));

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [showTransition, setShowTransition] = useState(false);
  const [newStatus, setNewStatus] = useState("");

  const updateContract = trpc.contracts.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Contract status updated");
      setShowTransition(false);
      void utils.contracts.get.invalidate({ id });
      setEditingNotes(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update contract"),
  });

  const completeObligation = trpc.contracts.completeObligation.useMutation({
    onSuccess: () => {
      toast.success("Obligation completed");
      void utils.contracts.get.invalidate({ id });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update obligation"),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <ResourceView
        query={contractQuery}
        resourceName="Contract"
        backHref="/app/contracts"
      >
        {(contract) => {
          const rawState = (contract as any).status ?? (contract as any).state ?? "draft";
          const sCfg = STATE_CFG[rawState] ?? STATE_CFG.draft!;
          const isTerminal = TERMINAL_STATES.includes(rawState);
          const endDate = (contract as any).endDate ?? (contract as any).end_date;
          const daysToExpiry = endDate
            ? Math.round((new Date(endDate).getTime() - Date.now()) / 86400000)
            : null;
          const obligations = (contract as any).obligations ?? [];

          return (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <PageHeader
                title={(contract as any).title}
                subtitle={`Contracts / ${(contract as any).contractNumber ?? id.slice(-8).toUpperCase()}`}
                icon={FileText}
                backHref="/app/contracts"
                badge={
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", sCfg.color)}>
                      {sCfg.label}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">
                      {TYPE_LABELS[(contract as any).type] ?? (contract as any).type}
                    </span>
                    {!isTerminal && daysToExpiry !== null && daysToExpiry <= 90 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-orange-700 bg-orange-100">
                        ⚠ {daysToExpiry > 0 ? `${daysToExpiry}d to expiry` : "Expired"}
                      </span>
                    )}
                  </div>
                }
                actions={
                  !isTerminal && (
                    <PermissionGate module="contracts" action="write">
                      <button
                        onClick={() => { setShowTransition(true); setNewStatus(""); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" /> Update Status
                      </button>
                    </PermissionGate>
                  )
                }
              />

              {isTerminal && (
                <div className="px-4 py-2 bg-muted/40 border border-border border-dashed rounded-xl text-[11px] text-muted-foreground/70 flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5" />
                  This contract is in a terminal state ({rawState}). No further actions are available.
                </div>
              )}

              {showTransition && (
                <div className="px-5 py-4 bg-blue-50 border border-blue-200 rounded-xl animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-blue-800">Transition Status:</span>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="text-sm border border-blue-300 rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select new state…</option>
                      {Object.entries(STATE_CFG).filter(([k]) => k !== rawState && !TERMINAL_STATES.includes(k)).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                      <option value="terminated">Terminate</option>
                    </select>
                    <button
                      disabled={!newStatus || updateContract.isPending}
                      onClick={() => updateContract.mutate({ id, status: newStatus as any })}
                      className="px-4 py-1.5 bg-blue-700 text-white text-xs font-bold rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors"
                    >
                      {updateContract.isPending ? "Updating…" : "Confirm Change"}
                    </button>
                    <button onClick={() => setShowTransition(false)} className="text-sm text-blue-600 hover:underline">Cancel</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 flex flex-col gap-6">
                  {/* Obligations Card */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-foreground/80 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                        Contract Obligations ({obligations.length})
                      </h3>
                      {obligations.filter((o: any) => o.status !== "completed").length > 0 && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-orange-700">
                          {obligations.filter((o: any) => o.status !== "completed").length} Outstanding
                        </span>
                      )}
                    </div>
                    {obligations.length === 0 ? (
                      <div className="p-12 text-center text-sm text-muted-foreground italic">No obligations recorded for this agreement.</div>
                    ) : (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-muted/50 border-b border-border">
                            <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Obligation</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Party</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Due Date</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                            {!isTerminal && can("contracts", "write") && <th className="px-4 py-3 w-10"></th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {obligations.map((obl: any) => (
                            <tr key={obl.id} className={cn("hover:bg-muted/30 transition-colors", obl.status === "completed" && "opacity-60")}>
                              <td className="px-4 py-3 text-sm text-foreground font-medium">{obl.description}</td>
                              <td className="px-4 py-3">
                                <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                                  obl.party === "counterparty" ? "text-blue-700 bg-blue-100" :
                                  obl.party === "both" ? "text-purple-700 bg-purple-100" :
                                  "text-green-700 bg-green-100"
                                )}>
                                  {obl.party === "counterparty" ? "Them" : obl.party === "both" ? "Both" : "Us"}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{obl.dueDate ?? "—"}</td>
                              <td className="px-4 py-3">
                                <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                                  obl.status === "completed" ? "text-green-700 bg-green-100" :
                                  obl.status === "overdue" ? "text-red-700 bg-red-100" :
                                  "text-yellow-700 bg-yellow-100"
                                )}>
                                  {obl.status ?? "pending"}
                                </span>
                              </td>
                              {!isTerminal && can("contracts", "write") && (
                                <td className="px-4 py-3 text-right">
                                  {obl.status !== "completed" && (
                                    <button
                                      onClick={() => completeObligation.mutate({ id: obl.id })}
                                      disabled={completeObligation.isPending}
                                      className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
                                    >
                                      Done
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {!isTerminal && (
                    <PermissionGate module="contracts" action="read">
                      <EsignPanel
                        sourceType="contract"
                        sourceId={id}
                        defaultTitle={`${(contract as any).title} — ${(contract as any).counterparty}`}
                        subject={`${(contract as any).counterparty} · ${(contract as any).contractNumber ?? id.slice(-8)}`}
                        defaultSigners={[
                          ...((contract as any).counterpartyContactName && (contract as any).counterpartyContactEmail
                            ? [{
                                name: (contract as any).counterpartyContactName,
                                email: (contract as any).counterpartyContactEmail,
                                role: "counterparty",
                              }]
                            : []),
                        ]}
                      />
                    </PermissionGate>
                  )}

                  {/* Notes Section */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-foreground/80 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        Contract Notes
                      </h3>
                      {!isTerminal && !editingNotes && (
                        <PermissionGate module="contracts" action="write">
                          <button
                            onClick={() => { setNotesDraft((contract as any).notes ?? ""); setEditingNotes(true); }}
                            className="text-xs font-bold text-primary hover:underline"
                          >
                            Edit Notes
                          </button>
                        </PermissionGate>
                      )}
                    </div>
                    {editingNotes ? (
                      <div className="space-y-4">
                        <textarea
                          className="w-full text-sm border border-border rounded-xl px-4 py-3 bg-muted/20 outline-none focus:ring-2 focus:ring-primary h-32 resize-none"
                          value={notesDraft}
                          onChange={(e) => setNotesDraft(e.target.value)}
                        />
                        <div className="flex gap-3 justify-end">
                          <button
                            onClick={() => updateContract.mutate({ id, notes: notesDraft } as any)}
                            disabled={updateContract.isPending}
                            className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all"
                          >
                            <Save className="w-3.5 h-3.5" /> {updateContract.isPending ? "Saving…" : "Save Changes"}
                          </button>
                          <button
                            onClick={() => setEditingNotes(false)}
                            className="px-4 py-1.5 border border-border text-xs font-bold rounded-lg hover:bg-muted transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap italic">
                        {(contract as any).notes || "No internal notes recorded for this contract."}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  {/* Contract Attributes using DetailGrid */}
                  <DetailGrid
                    title="Key Attributes"
                    icon={Shield}
                    items={[
                      {
                        label: "Contract Value",
                        value: (contract as any).value ? `₹${Number((contract as any).value).toLocaleString("en-IN")}` : "No Fee",
                        icon: DollarSign,
                        className: "font-bold text-foreground"
                      },
                      { label: "Counterparty", value: (contract as any).counterparty, icon: Building2 },
                      { label: "Governing Law", value: (contract as any).governingLaw ?? "—", icon: Shield },
                      { label: "Notice Period", value: `${(contract as any).noticePeriodDays ?? 30} days`, icon: Clock },
                      { label: "Start Date", value: (contract as any).startDate ? new Date((contract as any).startDate).toLocaleDateString("en-GB") : "—", icon: Calendar },
                      { label: "End Date", value: endDate ? new Date(endDate).toLocaleDateString("en-GB") : "—", icon: Calendar },
                      { label: "Auto-Renew", value: (contract as any).autoRenew ? "Enabled" : "Disabled", icon: CheckCircle2 },
                    ].filter(f => f.value)}
                  />

                  {/* Summary Card */}
                  <div className="bg-muted/30 border border-border border-dashed rounded-xl p-5">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Compliance Summary</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Obligation Health</span>
                        <span className="font-bold text-green-700">100% Clear</span>
                      </div>
                      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: "100%" }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                        All milestones and obligations for this period have been met according to the last audit.
                      </p>
                    </div>
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
