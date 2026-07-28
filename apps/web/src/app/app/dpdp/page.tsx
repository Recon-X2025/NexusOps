"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import {
  ShieldCheck,
  Plus,
  Search,
  Filter,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useSearchParams, useRouter } from "next/navigation";

export default function DPDPPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "dsr";

  const setTab = (t: string) => {
    router.push(`/app/dpdp?tab=${t}`);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">DPDP Privacy Operations</h1>
            <p className="text-sm text-muted-foreground">Manage DSRs, Consents, and Breaches (DPDP Act 2023)</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-border px-6 pt-4 shrink-0 overflow-x-auto hide-scrollbar">
        {[
          { id: "dsr", label: "Data Subject Requests" },
          { id: "consent", label: "Consent Ledger" },
          { id: "breach", label: "Breach Register" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap pb-3 text-sm font-medium transition-colors border-b-2 ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-muted/20 p-6">
        {tab === "dsr" && <DSRView />}
        {tab === "consent" && <ConsentView />}
        {tab === "breach" && <BreachView />}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// DSR View
// ----------------------------------------------------------------------
function DSRView() {
  const [isIntakeOpen, setIsIntakeOpen] = useState(false);
  const { data: dsrs, refetch } = trpc.compliance.dsr.list.useQuery();
  const { data: summary } = trpc.compliance.dsr.slaSummary.useQuery();
  const utils = trpc.useUtils();

  const transitionMutation = trpc.compliance.dsr.transition.useMutation({
    onSuccess: () => {
      toast.success("DSR updated");
      refetch();
      utils.compliance.dsr.slaSummary.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground mb-1">Open DSRs</div>
          <div className="text-2xl font-bold text-foreground">{summary?.open ?? "-"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground mb-1">Overdue</div>
          <div className="text-2xl font-bold text-destructive">{summary?.overdue ?? "-"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground mb-1">Due Soon</div>
          <div className="text-2xl font-bold text-orange-500">{summary?.dueSoon ?? "-"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-medium text-muted-foreground mb-1">Closed</div>
          <div className="text-2xl font-bold text-foreground">{summary?.closed ?? "-"}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search DSRs..."
              className="h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary w-64"
            />
          </div>
          <button className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted">
            <Filter className="h-4 w-4" /> Filter
          </button>
        </div>
        <button
          onClick={() => setIsIntakeOpen(true)}
          className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Intake DSR
        </button>
      </div>

      <div className="flex-1 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Principal</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Due Date</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dsrs?.map((dsr) => (
                <tr key={dsr.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{dsr.reference}</td>
                  <td className="px-4 py-3 capitalize">{dsr.requestType}</td>
                  <td className="px-4 py-3">{dsr.principalName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        dsr.status === "received"
                          ? "bg-blue-500/10 text-blue-500"
                          : dsr.status === "in_progress"
                          ? "bg-amber-500/10 text-amber-500"
                          : dsr.status === "fulfilled"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : dsr.status === "rejected"
                          ? "bg-red-500/10 text-red-500"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {dsr.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {format(new Date(dsr.dueAt), "MMM d, yyyy")}
                    {new Date(dsr.dueAt).getTime() < Date.now() && dsr.status !== "closed" && dsr.status !== "fulfilled" && dsr.status !== "rejected" && (
                      <span className="ml-2 text-xs text-destructive font-medium">(Overdue)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    {dsr.status === "received" && (
                      <button
                        onClick={() => transitionMutation.mutate({ id: dsr.id, toStatus: "in_progress" })}
                        className="text-xs text-primary hover:underline"
                      >
                        Start Progress
                      </button>
                    )}
                    {dsr.status === "in_progress" && (
                      <button
                        onClick={() => transitionMutation.mutate({ id: dsr.id, toStatus: "fulfilled" })}
                        className="text-xs text-emerald-500 hover:underline"
                      >
                        Fulfill
                      </button>
                    )}
                    {(dsr.status === "fulfilled" || dsr.status === "rejected") && (
                      <button
                        onClick={() => transitionMutation.mutate({ id: dsr.id, toStatus: "closed" })}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Close
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {dsrs?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No DSRs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DSRIntakeModal isOpen={isIntakeOpen} onClose={() => setIsIntakeOpen(false)} onSaved={refetch} />
    </div>
  );
}

function DSRIntakeModal({ isOpen, onClose, onSaved }: { isOpen: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ requestType: "access", principalName: "", details: "" });
  const createMutation = trpc.compliance.dsr.create.useMutation({
    onSuccess: () => {
      toast.success("DSR intake completed");
      onSaved();
      onClose();
      setForm({ requestType: "access", principalName: "", details: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-6 shadow-xl border border-border">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Intake New DSR</h2>
            <button onClick={onClose}><XCircle className="h-5 w-5 text-muted-foreground" /></button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Principal Name</label>
              <input
                type="text"
                value={form.principalName}
                onChange={(e) => setForm({ ...form, principalName: e.target.value })}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Name of Data Principal"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Request Type</label>
              <select
                value={form.requestType}
                onChange={(e) => setForm({ ...form, requestType: e.target.value })}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="access">Access</option>
                <option value="erasure">Erasure (Right to be Forgotten)</option>
                <option value="correction">Correction / Update</option>
                <option value="grievance">Grievance</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Details</label>
              <textarea
                value={form.details}
                onChange={(e) => setForm({ ...form, details: e.target.value })}
                className="mt-1 flex min-h-[80px] w-full rounded-md border border-input bg-background p-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Optional request details"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted">Cancel</button>
            <button
              onClick={() => createMutation.mutate({ requestType: form.requestType as any, principalName: form.principalName, details: form.details })}
              disabled={createMutation.isPending || !form.principalName}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              Intake Request
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ----------------------------------------------------------------------
// Consent View
// ----------------------------------------------------------------------
function ConsentView() {
  const [isGrantOpen, setIsGrantOpen] = useState(false);
  const { data: consents, refetch } = trpc.compliance.consent.list.useQuery();

  const withdrawMutation = trpc.compliance.consent.withdraw.useMutation({
    onSuccess: () => { toast.success("Consent withdrawn"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Consent Ledger</h2>
        <button
          onClick={() => setIsGrantOpen(true)}
          className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Grant Consent
        </button>
      </div>

      <div className="flex-1 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Principal Ref</th>
                <th className="px-4 py-3 font-medium">Purpose</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Updated At</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {consents?.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">{c.principalRef}</td>
                  <td className="px-4 py-3">{c.purpose}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${c.status === "granted" ? "bg-emerald-500/10 text-emerald-500" : c.status === "withdrawn" ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">v{c.version}</td>
                  <td className="px-4 py-3">{format(new Date(c.updatedAt), "MMM d, yyyy HH:mm")}</td>
                  <td className="px-4 py-3">
                    {c.status === "granted" && (
                      <button onClick={() => withdrawMutation.mutate({ id: c.id, reason: "Manual withdrawal" })} className="text-xs text-red-500 hover:underline">
                        Withdraw
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {consents?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No consents found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConsentGrantModal isOpen={isGrantOpen} onClose={() => setIsGrantOpen(false)} onSaved={refetch} />
    </div>
  );
}

function ConsentGrantModal({ isOpen, onClose, onSaved }: { isOpen: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ principalRef: "", purpose: "" });
  const grantMutation = trpc.compliance.consent.grant.useMutation({
    onSuccess: () => { toast.success("Consent granted"); onSaved(); onClose(); setForm({ principalRef: "", purpose: "" }); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-6 shadow-xl border border-border">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Grant Consent</h2>
            <button onClick={onClose}><XCircle className="h-5 w-5 text-muted-foreground" /></button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Principal Ref (Email/Phone/ID)</label>
              <input type="text" value={form.principalRef} onChange={(e) => setForm({ ...form, principalRef: e.target.value })} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" placeholder="user@example.com" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Purpose</label>
              <input type="text" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Marketing communications" />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted">Cancel</button>
            <button onClick={() => grantMutation.mutate({ principalRef: form.principalRef, purpose: form.purpose })} disabled={grantMutation.isPending || !form.principalRef || !form.purpose} className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
              Grant
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ----------------------------------------------------------------------
// Breach View
// ----------------------------------------------------------------------
function BreachView() {
  const [isIntakeOpen, setIsIntakeOpen] = useState(false);
  const { data: breaches, refetch } = trpc.compliance.breach.list.useQuery();
  
  const transitionMutation = trpc.compliance.breach.transition.useMutation({
    onSuccess: () => { toast.success("Breach status updated"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Breach Register</h2>
        <button
          onClick={() => setIsIntakeOpen(true)}
          className="flex h-9 items-center gap-2 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
        >
          <AlertTriangle className="h-4 w-4" /> Log Breach
        </button>
      </div>

      <div className="flex-1 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Notify Due At</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {breaches?.map((b) => (
                <tr key={b.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{b.reference}</td>
                  <td className="px-4 py-3">{b.title}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${b.severity === "high" || b.severity === "critical" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"}`}>
                      {b.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize">{b.status}</td>
                  <td className="px-4 py-3">
                    {format(new Date(b.notifyDueAt), "MMM d, HH:mm")}
                    {new Date(b.notifyDueAt).getTime() < Date.now() && !b.principalsNotifiedAt && b.status !== "closed" && (
                      <span className="ml-2 text-xs text-destructive font-medium">(Overdue)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    {b.status === "detected" && (
                      <button onClick={() => transitionMutation.mutate({ id: b.id, toStatus: "notifying" })} className="text-xs text-primary hover:underline">
                        Start Notify
                      </button>
                    )}
                    {b.status === "notifying" && (
                      <button onClick={() => transitionMutation.mutate({ id: b.id, toStatus: "notified" })} className="text-xs text-emerald-500 hover:underline">
                        Mark Notified
                      </button>
                    )}
                    {b.status === "notified" && (
                      <button onClick={() => transitionMutation.mutate({ id: b.id, toStatus: "contained" })} className="text-xs text-blue-500 hover:underline">
                        Mark Contained
                      </button>
                    )}
                    {b.status === "contained" && (
                      <button onClick={() => transitionMutation.mutate({ id: b.id, toStatus: "closed" })} className="text-xs text-muted-foreground hover:underline">
                        Close
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {breaches?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No breaches logged</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BreachIntakeModal isOpen={isIntakeOpen} onClose={() => setIsIntakeOpen(false)} onSaved={refetch} />
    </div>
  );
}

function BreachIntakeModal({ isOpen, onClose, onSaved }: { isOpen: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: "", severity: "medium" });
  const createMutation = trpc.compliance.breach.create.useMutation({
    onSuccess: () => { toast.success("Breach logged"); onSaved(); onClose(); setForm({ title: "", severity: "medium" }); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-6 shadow-xl border border-border">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-destructive">Log Security Breach</h2>
            <button onClick={onClose}><XCircle className="h-5 w-5 text-muted-foreground" /></button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Title</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" placeholder="E.g., S3 Bucket Exposure" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Severity</label>
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted">Cancel</button>
            <button onClick={() => createMutation.mutate({ title: form.title, severity: form.severity as any })} disabled={createMutation.isPending || !form.title} className="px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50">
              Log Breach
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
