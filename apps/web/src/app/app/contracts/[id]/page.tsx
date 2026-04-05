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

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useRBAC();
  const utils = trpc.useUtils();

  const { data: contract, isLoading } = trpc.contracts.get.useQuery({ id });

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [showTransition, setShowTransition] = useState(false);
  const [newStatus, setNewStatus] = useState("");

  const updateContract = trpc.contracts.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Contract status updated");
      setShowTransition(false);
      void utils.contracts.get.invalidate({ id });
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Loading contract…</span>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <FileText className="w-8 h-8 opacity-30" />
        <span className="text-sm">Contract not found</span>
        <button onClick={() => router.push("/app/contracts")} className="text-xs text-primary hover:underline">
          Back to Contracts
        </button>
      </div>
    );
  }

  const rawState = (contract as any).status ?? (contract as any).state ?? "draft";
  const sCfg = STATE_CFG[rawState] ?? STATE_CFG.draft!;
  const isTerminal = TERMINAL_STATES.includes(rawState);
  const endDate = (contract as any).endDate ?? (contract as any).end_date;
  const daysToExpiry = endDate
    ? Math.round((new Date(endDate).getTime() - Date.now()) / 86400000)
    : null;
  const obligations = (contract as any).obligations ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button onClick={() => router.push("/app/contracts")}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Contracts
        </button>
        <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
        <span className="text-[11px] text-muted-foreground font-mono">{(contract as any).contractNumber ?? id.slice(-8).toUpperCase()}</span>
      </div>

      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-4 border-b border-border">
          <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${sCfg.bar}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-[11px] text-primary">{(contract as any).contractNumber}</span>
              <span className={`status-badge ${sCfg.color}`}>{sCfg.label}</span>
              <span className="status-badge text-muted-foreground bg-muted text-[10px]">{TYPE_LABELS[(contract as any).type] ?? (contract as any).type}</span>
              {!isTerminal && daysToExpiry !== null && daysToExpiry <= 90 && (
                <span className="status-badge text-orange-700 bg-orange-100 text-[10px]">
                  ⚠ {daysToExpiry > 0 ? `${daysToExpiry}d to expiry` : "Expired"}
                </span>
              )}
            </div>
            <h1 className="text-[15px] font-bold text-foreground">{(contract as any).title}</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Counterparty: <strong>{(contract as any).counterparty}</strong>
            </p>
          </div>
          {!isTerminal && (
            <PermissionGate module="contracts" action="write">
              <button onClick={() => { setShowTransition(true); setNewStatus(""); }}
                className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                <Edit2 className="w-3 h-3" /> Update Status
              </button>
            </PermissionGate>
          )}
        </div>

        {isTerminal && (
          <div className="px-4 py-2 bg-muted/40 border-b border-dashed border-border text-[11px] text-muted-foreground/70">
            This contract is in a terminal state ({rawState}). No further actions are available.
          </div>
        )}

        {showTransition && (
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-medium text-blue-800">Move to:</span>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                className="text-xs border border-blue-300 rounded px-2 py-1 bg-white">
                <option value="">— select —</option>
                {Object.entries(STATE_CFG).filter(([k]) => k !== rawState && !TERMINAL_STATES.includes(k)).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
                <option value="terminated">Terminate</option>
              </select>
              <button
                disabled={!newStatus || updateContract.isPending}
                onClick={() => updateContract.mutate({ id, status: newStatus as any })}
                className="px-3 py-1 bg-blue-700 text-white text-[11px] rounded hover:bg-blue-800 disabled:opacity-50">
                {updateContract.isPending ? "Saving…" : "Confirm"}
              </button>
              <button onClick={() => setShowTransition(false)} className="text-blue-600 hover:underline text-[11px]">Cancel</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-0 divide-x divide-border">
          {[
            { label: "Contract Value", value: (contract as any).value ? `₹${Number((contract as any).value).toLocaleString("en-IN")}` : "No Fee", icon: DollarSign },
            { label: "Governing Law", value: (contract as any).governingLaw ?? "—", icon: Shield },
            { label: "Notice Period", value: `${(contract as any).noticePeriodDays ?? 30} days`, icon: Clock },
            { label: "Start Date", value: (contract as any).startDate ? new Date((contract as any).startDate).toLocaleDateString("en-GB") : "—", icon: Calendar },
            { label: "End Date", value: endDate ? new Date(endDate).toLocaleDateString("en-GB") : "—", icon: Calendar },
            { label: "Auto-Renew", value: (contract as any).autoRenew ? "Yes" : "No", icon: CheckCircle2 },
          ].map((f, i) => (
            <div key={i} className={`px-4 py-3 ${i >= 3 ? "border-t border-border" : ""}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <f.icon className="w-3 h-3 text-muted-foreground/60" />
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">{f.label}</span>
              </div>
              <div className="text-[13px] font-semibold text-foreground">{f.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-foreground/80">
            Obligations ({obligations.length})
          </span>
          {obligations.filter((o: any) => o.status !== "completed").length > 0 && (
            <span className="text-[11px] text-orange-700">
              {obligations.filter((o: any) => o.status !== "completed").length} open
            </span>
          )}
        </div>
        {obligations.length === 0 ? (
          <div className="px-4 py-6 text-center text-[11px] text-muted-foreground/50">No obligations recorded.</div>
        ) : (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th>Obligation</th>
                <th>Party</th>
                <th>Recurring</th>
                <th>Due Date</th>
                <th>Status</th>
                {!isTerminal && can("contracts", "write") && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {obligations.map((obl: any) => (
                <tr key={obl.id} className={obl.status === "completed" ? "opacity-50" : ""}>
                  <td className="text-[12px] text-foreground">{obl.description}</td>
                  <td>
                    <span className={`status-badge text-[10px] ${obl.party === "counterparty" ? "text-blue-700 bg-blue-100" : obl.party === "both" ? "text-purple-700 bg-purple-100" : "text-green-700 bg-green-100"}`}>
                      {obl.party === "counterparty" ? "Them" : obl.party === "both" ? "Both" : "Us"}
                    </span>
                  </td>
                  <td className="text-[11px] text-muted-foreground">{obl.recurring ?? "—"}</td>
                  <td className="text-[11px] text-muted-foreground font-mono">{obl.dueDate ?? "—"}</td>
                  <td>
                    <span className={`status-badge text-[10px] capitalize ${obl.status === "completed" ? "text-green-700 bg-green-100" : obl.status === "overdue" ? "text-red-700 bg-red-100" : "text-yellow-700 bg-yellow-100"}`}>
                      {obl.status ?? "pending"}
                    </span>
                  </td>
                  {!isTerminal && can("contracts", "write") && (
                    <td>
                      {obl.status !== "completed" && (
                        <button
                          onClick={() => completeObligation.mutate({ id: obl.id })}
                          disabled={completeObligation.isPending}
                          className="text-[11px] text-green-700 hover:underline disabled:opacity-50">
                          Mark Complete
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

      <div className="bg-card border border-border rounded px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-semibold text-foreground/80">Notes</span>
          {!isTerminal && !editingNotes && (
            <PermissionGate module="contracts" action="write">
              <button onClick={() => { setNotesDraft((contract as any).notes ?? ""); setEditingNotes(true); }}
                className="text-[11px] text-primary hover:underline">Edit</button>
            </PermissionGate>
          )}
        </div>
        {editingNotes ? (
          <div className="space-y-2">
            <textarea className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background h-24 resize-none"
              value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
            <div className="flex gap-2">
              <button
                onClick={() => updateContract.mutate({ id, notes: notesDraft } as any)}
                disabled={updateContract.isPending}
                className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded disabled:opacity-50">
                <Save className="w-3 h-3" /> {updateContract.isPending ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditingNotes(false)} className="flex items-center gap-1 px-2 py-1 border border-border text-[11px] rounded hover:bg-accent">
                <X className="w-3 h-3" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">{(contract as any).notes || "No notes recorded."}</p>
        )}
      </div>
    </div>
  );
}
