"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { Users, Plus, Search, Star, Mail, MessageSquare, Award, AlertTriangle } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

const CSM_TABS = [
  { key: "cases",    label: "Customer Cases",  module: "csm"      as const, action: "read" as const },
  { key: "sla",      label: "SLA Performance", module: "csm"      as const, action: "read" as const },
];

const PRIORITY_COLOR: Record<string, string> = {
  critical: "text-red-700 bg-red-100",
  high:     "text-orange-700 bg-orange-100",
  medium:   "text-yellow-700 bg-yellow-100",
  low:      "text-green-700 bg-green-100",
};

const CASE_STATE: Record<string, string> = {
  new:               "text-blue-700 bg-blue-100",
  in_progress:       "text-orange-700 bg-orange-100",
  awaiting_customer: "text-yellow-700 bg-yellow-100",
  pending:           "text-muted-foreground bg-muted",
  resolved:          "text-green-700 bg-green-100",
  closed:            "text-muted-foreground bg-muted",
};

export default function CSMPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const router = useRouter();
  const visibleTabs = CSM_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "cases");

  const casesQuery = trpc.csm.cases.list.useQuery({ limit: 50 }, mergeTrpcQueryOpts("csm.cases.list", undefined));

  const accountsQuery = trpc.csm.accounts.list.useQuery({}, mergeTrpcQueryOpts("csm.accounts.list", undefined));
  const contactsQuery = trpc.csm.contacts.list.useQuery({}, mergeTrpcQueryOpts("csm.contacts.list", undefined));

  const [showNewCase, setShowNewCase] = useState(false);
  const [caseForm, setCaseForm] = useState({ title: "", description: "", priority: "medium", accountId: "", contactId: "" });
  const [caseMsg, setCaseMsg] = useState<string | null>(null);

  const createCase = trpc.csm.cases.create.useMutation({
    onSuccess: () => {
      setCaseMsg("Case created successfully");
      setShowNewCase(false);
      setCaseForm({ title: "", description: "", priority: "medium", accountId: "", contactId: "" });
      casesQuery.refetch();
      setTimeout(() => setCaseMsg(null), 4000);
    },
    onError: (e: any) => {
      setCaseMsg(`Error: ${e.message}`);
      setTimeout(() => setCaseMsg(null), 5000);
    },
  });

  // Portal users — customer contacts via India compliance router
  const portalUsersQuery = trpc.indiaCompliance.portalUsers.list.useQuery({}, mergeTrpcQueryOpts("indiaCompliance.portalUsers.list", undefined));
  const [suspendReason, setSuspendReason] = useState<Record<string, string>>({});
  const suspendPortalUser = trpc.indiaCompliance.portalUsers.suspend.useMutation({
    onSuccess: () => portalUsersQuery.refetch(),
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });
  const unlockPortalUser = trpc.indiaCompliance.portalUsers.unlock.useMutation({
    onSuccess: () => portalUsersQuery.refetch(),
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });
  const portalUsers: any[] = portalUsersQuery.data ?? [];

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);

  if (!can("csm", "read") && !can("accounts", "read")) return <AccessDenied module="Customer Service Management" />;

  // Use live data when available, fall back to static
  const CASES = (casesQuery.data as any)?.items ?? (Array.isArray(casesQuery.data) ? casesQuery.data : []);
  const ACCOUNTS = (Array.isArray(accountsQuery.data) ? accountsQuery.data : (accountsQuery.data as any)?.items ?? []);

  const openCases = CASES.filter((c: any) => !["resolved", "closed"].includes(c.state)).length;
  const criticalCases = CASES.filter((c: any) => c.priority === "critical" && !["resolved","closed"].includes(c.state)).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-body-sm font-semibold text-foreground">Customer Service Management</h1>
          <span className="text-[11px] text-muted-foreground/70">Cases · SLA Performance</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewCase((v) => !v)}
            className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" /> {showNewCase ? "Cancel" : "New Case"}
          </button>
        </div>
      </div>

      {caseMsg && (
        <div className={`px-3 py-2 rounded text-[12px] font-medium border ${caseMsg.startsWith("Error") ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"}`}>{caseMsg}</div>
      )}
      {showNewCase && (
        <div className="bg-card border border-primary/30 rounded p-4">
          <h3 className="text-[12px] font-semibold text-foreground mb-3">New Customer Case</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground">Case Title *</label>
              <input className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" placeholder="Issue summary" value={caseForm.title} onChange={(e) => setCaseForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Priority</label>
              <select className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={caseForm.priority} onChange={(e) => setCaseForm((f) => ({ ...f, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground">Account</label>
              <select className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={caseForm.accountId} onChange={(e) => setCaseForm((f) => ({ ...f, accountId: e.target.value, contactId: "" }))}>
                <option value="">— Select Account —</option>
                {ACCOUNTS.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Contact</label>
              <select className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={caseForm.contactId} onChange={(e) => setCaseForm((f) => ({ ...f, contactId: e.target.value }))}>
                <option value="">— Select Contact —</option>
                {(Array.isArray(contactsQuery.data?.items) ? contactsQuery.data.items : Array.isArray(contactsQuery.data) ? contactsQuery.data : []).filter((c: any) => !caseForm.accountId || c.accountId === caseForm.accountId).map((c: any) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
              </select>
            </div>
            <div className="col-span-3">
              <label className="text-[11px] text-muted-foreground">Description</label>
              <textarea className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background h-16 resize-none" placeholder="Describe the customer issue…" value={caseForm.description} onChange={(e) => setCaseForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              disabled={!caseForm.title || createCase.isPending}
              onClick={() => createCase.mutate({ 
                title: caseForm.title, 
                description: caseForm.description || undefined, 
                priority: caseForm.priority, 
                accountId: caseForm.accountId || undefined, 
                contactId: caseForm.contactId || undefined 
              })}
              className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {createCase.isPending ? "Creating…" : "Create Case"}
            </button>
            <button onClick={() => setShowNewCase(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Open Cases",        value: openCases,      color: "text-blue-700" },
          { label: "Critical Cases",    value: criticalCases,  color: "text-red-700" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            {(casesQuery.isLoading || accountsQuery.isLoading) ? (
              <div className="h-6 bg-muted rounded animate-pulse mb-1 w-12" />
            ) : (
              <div className={`text-h4 font-bold ${k.color}`}>{k.value}</div>
            )}
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex border-b border-border bg-card rounded-t">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {tab === "cases" && (
          <>
            {casesQuery.isLoading ? (
              <div className="animate-pulse p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-4 bg-muted rounded w-24" />
                    <div className="h-4 bg-muted rounded flex-1" />
                    <div className="h-4 bg-muted rounded w-32" />
                    <div className="h-4 bg-muted rounded w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th />
                    <th>Case #</th>
                    <th>Title</th>
                    <th>Account</th>
                    <th>Contact</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {CASES.map((c: any) => {
                    const accountName = ACCOUNTS.find((a: any) => a.id === c.accountId)?.name ?? "—";
                    const contacts = Array.isArray(contactsQuery.data?.items) ? contactsQuery.data.items : Array.isArray(contactsQuery.data) ? contactsQuery.data : [];
                    const contact = contacts.find((ct: any) => ct.id === c.contactId);
                    const contactName = contact ? `${contact.firstName} ${contact.lastName}` : "—";
                    // For assignee, ideally we map user ID, but we will just show ID or "—" if we don't have the users list easily
                    const assigneeName = c.assigneeId ? c.assigneeId.substring(0, 8) : "—";
                    
                    return (
                    <tr key={c.id} className={c.slaBreached ? "bg-red-50/30" : ""}>
                      <td className="p-0"><div className={`priority-bar ${c.priority === "critical" ? "bg-red-600" : c.priority === "high" ? "bg-orange-500" : "bg-yellow-400"}`} /></td>
                      <td className="text-primary font-mono text-[11px]">{c.number}</td>
                      <td className="max-w-xs">
                        <div className="flex items-center gap-1">
                          {c.slaBreached && <span className="text-red-500 text-[10px] font-bold">⚠</span>}
                          <span className="text-foreground">{c.title}</span>
                        </div>
                      </td>
                      <td className="text-muted-foreground text-[11px]">{accountName}</td>
                      <td className="text-muted-foreground text-[11px]">{contactName}</td>
                      <td><span className={`status-badge capitalize ${PRIORITY_COLOR[c.priority] ?? ""}`}>{c.priority}</span></td>
                      <td><span className={`status-badge capitalize ${CASE_STATE[c.status] ?? "text-muted-foreground bg-muted"}`}>{c.status?.replace(/_/g, " ") ?? "new"}</span></td>
                      <td className="text-muted-foreground text-[11px]">{assigneeName}</td>
                      <td>
                        <button
                          onClick={() => router.push(`/app/csm/${c.id}`)}
                          className="px-2 py-1 bg-primary text-white rounded text-[10px] hover:bg-primary/90"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )})}
                  {CASES.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-[12px] text-muted-foreground/70">
                        No customer cases found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}


        {tab === "sla" && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "First Response SLA", enterprise: "1 hr", professional: "4 hrs", starter: "24 hrs", entMet: 94, proMet: 98, starMet: 100 },
              { label: "Resolution SLA",     enterprise: "4 hrs (P1)", professional: "24 hrs", starter: "72 hrs", entMet: 78, proMet: 91, starMet: 100 },
              { label: "CSAT Target",        enterprise: "≥4.5/5", professional: "≥4.0/5", starter: "≥3.5/5", entMet: 82, proMet: 88, starMet: 95 },
            ].map((row) => (
              <div key={row.label} className="border border-border rounded">
                <div className="px-3 py-2 border-b border-border bg-muted/30">
                  <span className="text-[11px] font-semibold text-muted-foreground">{row.label}</span>
                </div>
                <div className="p-3 space-y-2">
                  {[
                    { tier: "Enterprise", target: row.enterprise, pct: row.entMet },
                    { tier: "Professional", target: row.professional, pct: row.proMet },
                    { tier: "Starter", target: row.starter, pct: row.starMet },
                  ].map((t) => (
                    <div key={t.tier}>
                      <div className="flex items-center justify-between mb-0.5 text-[11px]">
                        <span className="text-muted-foreground">{t.tier} ({t.target})</span>
                        <span className={`font-bold ${t.pct >= 95 ? "text-green-700" : t.pct >= 80 ? "text-yellow-600" : "text-red-600"}`}>{t.pct}%</span>
                      </div>
                      <div className="h-1.5 bg-border rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${t.pct >= 95 ? "bg-green-500" : t.pct >= 80 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${t.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
