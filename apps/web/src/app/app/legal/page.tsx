"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Scale, Plus, Search, Download, FileText, Users,
  CheckCircle2, Clock, ChevronRight, Send, Shield, Eye,
  BookOpen, Lock, Globe, Building2, Briefcase, Tag, X,
} from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { downloadCSV } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

const LEGAL_TABS = [
  { key: "dashboard",      label: "Dashboard",      module: "contracts" as const, action: "read"  as const },
  { key: "matters",        label: "Matters",        module: "contracts" as const, action: "read"  as const },
  { key: "requests",       label: "Legal Requests", module: "contracts" as const, action: "write" as const },
  { key: "investigations", label: "Investigations", module: "grc"       as const, action: "read"  as const },
  { key: "contracts",      label: "Contract Review",module: "contracts" as const, action: "read"  as const },
  { key: "knowledge",      label: "Legal Knowledge",module: "knowledge" as const, action: "read"  as const },
];

type MatterType = "litigation" | "employment" | "ip" | "regulatory" | "ma" | "data_privacy" | "corporate" | "commercial";
type MatterStatus = "intake" | "active" | "hold" | "closed" | "appealing";
type RequestStatus = "new" | "in_review" | "awaiting_info" | "in_progress" | "closed";
type InvestigationType = "ethics" | "harassment" | "fraud" | "data_breach" | "whistleblower" | "discrimination";

interface LegalMatter {
  id: string;
  number: string;
  title: string;
  type: MatterType;
  status: MatterStatus;
  priority: "critical" | "high" | "medium" | "low";
  assignedTo: string;
  practice: string;
  client: string;
  counterparty?: string;
  openedDate: string;
  targetDate?: string;
  phase: string;
  tasks: { done: number; total: number };
  estimatedCost: number;
  actualCost: number;
  confidential: boolean;
  description: string;
}

interface LegalRequest {
  id: string;
  number: string;
  type: string;
  subject: string;
  requestedBy: string;
  department: string;
  status: RequestStatus;
  assignedTo?: string;
  created: string;
  dueDate?: string;
  priority: "urgent" | "high" | "normal" | "low";
  notes?: string;
}

interface Investigation {
  id: string;
  number: string;
  type: InvestigationType;
  summary: string;
  anonymous: boolean;
  reporter?: string;
  assignedTo: string;
  status: "new" | "assigned" | "in_progress" | "under_review" | "closed" | "escalated";
  openedDate: string;
  closedDate?: string;
  outcome?: string;
  confidential: boolean;
  priority: "critical" | "high" | "medium" | "low";
}






const MATTER_TYPE_CFG: Record<MatterType, { label: string; color: string }> = {
  litigation:   { label: "Litigation",        color: "text-red-700 bg-red-100" },
  employment:   { label: "Employment",        color: "text-orange-700 bg-orange-100" },
  ip:           { label: "Intellectual Property", color: "text-purple-700 bg-purple-100" },
  regulatory:   { label: "Regulatory",        color: "text-blue-700 bg-blue-100" },
  ma:           { label: "M&A",               color: "text-indigo-700 bg-indigo-100" },
  data_privacy: { label: "Data Privacy",      color: "text-yellow-700 bg-yellow-100" },
  corporate:    { label: "Corporate",         color: "text-muted-foreground bg-muted" },
  commercial:   { label: "Commercial",        color: "text-teal-700 bg-teal-100" },
};

const MATTER_STATUS_CFG: Record<MatterStatus, string> = {
  intake:   "text-muted-foreground bg-muted",
  active:   "text-green-700 bg-green-100",
  hold:     "text-yellow-700 bg-yellow-100",
  closed:   "text-muted-foreground/70 bg-muted/30",
  appealing:"text-purple-700 bg-purple-100",
};

const INV_TYPE_CFG: Record<InvestigationType, { label: string; color: string }> = {
  ethics:         { label: "Ethics Violation",  color: "text-orange-700 bg-orange-100" },
  harassment:     { label: "Harassment",        color: "text-red-700 bg-red-100" },
  fraud:          { label: "Fraud / Financial", color: "text-red-700 bg-red-100" },
  data_breach:    { label: "Data Breach",       color: "text-purple-700 bg-purple-100" },
  whistleblower:  { label: "Whistleblower",     color: "text-blue-700 bg-blue-100" },
  discrimination: { label: "Discrimination",    color: "text-orange-700 bg-orange-100" },
};

const PRIORITY_BAR: Record<string, string> = {
  critical: "bg-red-600", high: "bg-orange-500", medium: "bg-yellow-400", low: "bg-green-400", urgent: "bg-red-600",
};

export default function LegalPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const router = useRouter();
  const visibleTabs = LEGAL_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "dashboard");
  const [expandedMatter, setExpandedMatter] = useState<string | null>(null);

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);

  const { data: mattersData, isLoading: loadingMatters, refetch: refetchMatters } = trpc.legal.listMatters.useQuery({ limit: 50 }, mergeTrpcQueryOpts("legal.listMatters", { refetchOnWindowFocus: false },));
  const { data: legalRequestsData, isLoading: loadingRequests } = trpc.legal.listRequests.useQuery({ limit: 50 }, mergeTrpcQueryOpts("legal.listRequests", { refetchOnWindowFocus: false },));
  const { data: investigationsData, isLoading: loadingInvestigations } = trpc.legal.listInvestigations.useQuery({ limit: 50 }, mergeTrpcQueryOpts("legal.listInvestigations", { refetchOnWindowFocus: false },));
  const { data: contractsData, isLoading: loadingContracts } = trpc.contracts.list.useQuery({ limit: 20 }, mergeTrpcQueryOpts("contracts.list", { refetchOnWindowFocus: false },));
  const { data: kbData, isLoading: loadingKb } = trpc.knowledge.list.useQuery({ limit: 50 }, mergeTrpcQueryOpts("knowledge.list", { refetchOnWindowFocus: false },));

  const updateMatter = trpc.legal.updateMatter.useMutation({
    onSuccess: (m: any) => { toast.success(`Matter ${m?.number ?? ""} updated`); refetchMatters(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  const [showNewMatter, setShowNewMatter] = useState(false);
  const [matterForm, setMatterForm] = useState({ title: "", description: "", type: "commercial", estimatedCost: "" });
  const createMatter = trpc.legal.createMatter.useMutation({
    onSuccess: () => { toast.success("Matter created"); setShowNewMatter(false); setMatterForm({ title: "", description: "", type: "commercial", estimatedCost: "" }); refetchMatters(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create matter"),
  });

  const [showNewRequest, setShowNewRequest] = useState(false);
  const [requestForm, setRequestForm] = useState({ title: "", description: "", type: "advisory", priority: "medium" });
  const createRequest = trpc.legal.createRequest.useMutation({
    onSuccess: () => { toast.success("Legal request submitted"); setShowNewRequest(false); setRequestForm({ title: "", description: "", type: "advisory", priority: "medium" }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create request"),
  });

  if (!can("contracts", "read") && !can("grc", "read")) return <AccessDenied module="Legal Service Delivery" />;

  const matters = (mattersData ?? []) as any[];
  const legalRequests = (legalRequestsData ?? []) as any[];
  const investigations = (investigationsData ?? []) as any[];
  const contractReviews = (contractsData?.items ?? []) as any[];
  const kbArticles = (kbData?.items ?? kbData ?? []) as any[];

  const activeMatters = matters.filter((m: any) => m.status === "active");
  const totalExposure = activeMatters.reduce((s: number, m: any) => s + (m.estimatedCost ?? 0), 0);
  const openRequests = legalRequests.filter((l: any) => !["closed"].includes(l.status)).length;
  const openInvestigations = investigations.filter((i: any) => !["closed"].includes(i.status)).length;
  const criticalItems = [...matters, ...investigations].filter((i: any) => i.priority === "critical").length;

  return (
    <>
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Legal Service Delivery</h1>
          <span className="text-[11px] text-muted-foreground/70">Matters · Requests · Investigations · Contract Review</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadCSV(matters.map((m: any) => ({ Number: m.number ?? m.id, Title: m.title, Type: m.type ?? "", Status: m.status, Priority: m.priority ?? "", Assigned_Counsel: m.assignedCounsel ?? "", Open_Date: m.createdAt ? new Date(m.createdAt).toLocaleDateString("en-IN") : "" })), "legal_matters")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          <PermissionGate module="grc" action="write">
            <button
              onClick={() => setShowNewMatter(true)}
              className="flex items-center gap-1 px-3 py-1 bg-purple-700 text-white text-[11px] rounded hover:bg-purple-800"
            >
              <Plus className="w-3 h-3" /> New Matter
            </button>
          </PermissionGate>
          <PermissionGate module="grc" action="write">
            <button
              onClick={() => setShowNewRequest(true)}
              className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
            >
              <Plus className="w-3 h-3" /> New Legal Request
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Active Matters",       value: activeMatters.length,   color: "text-foreground" },
          { label: "Estimated Exposure",   value: `₹${(totalExposure/1000).toFixed(0)}K`, color: "text-red-700" },
          { label: "Open Legal Requests",  value: openRequests,           color: "text-blue-700" },
          { label: "Open Investigations",  value: openInvestigations,     color: openInvestigations > 0 ? "text-orange-700" : "text-green-700" },
          { label: "Critical Priority",    value: criticalItems,          color: criticalItems > 0 ? "text-red-700" : "text-green-700" },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground/70 uppercase">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex border-b border-border bg-card rounded-t overflow-x-auto">
        {visibleTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div className="p-4 grid grid-cols-2 gap-4">
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Active Matters by Practice</div>
              <div className="p-3 space-y-2">
                {["Intellectual Property","Employment Law","Data Privacy & Regulatory","Commercial & Contracts","Corporate & Securities"].map(p => {
                  const count = matters.filter((m: any) => m.practice === p).length;
                  const cost = matters.filter((m: any) => m.practice === p).reduce((s: number, m: any) => s + (m.estimatedCost ?? 0), 0);
                  return (
                    <div key={p} className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground flex-1">{p}</span>
                      <span className="font-bold text-foreground">{count}</span>
                      <span className="font-mono text-muted-foreground">₹{(cost/1000).toFixed(0)}K</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Urgent Legal Requests</div>
              <div className="divide-y divide-border">
                {legalRequests.filter((r: any) => r.priority === "urgent" || r.priority === "high").slice(0, 4).map((r: any) => (
                  <div key={r.id} className="flex items-start justify-between px-3 py-2.5 hover:bg-muted/30">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-[10px] text-primary">{r.number}</span>
                        <span className={`status-badge text-[10px] ${r.priority === "urgent" ? "text-red-700 bg-red-100" : "text-orange-700 bg-orange-100"}`}>{r.priority}</span>
                      </div>
                      <p className="text-[12px] text-foreground">{r.subject}</p>
                      <p className="text-[11px] text-muted-foreground/70">{r.requestedBy} · {r.type}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground/70 flex-shrink-0">{r.dueDate}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Open Investigations</div>
              <div className="divide-y divide-border">
                {loadingInvestigations ? (
                  <div className="px-3 py-4 text-[11px] text-muted-foreground/50 text-center">Loading…</div>
                ) : investigations.filter((i: any) => i.status !== "closed").length === 0 ? (
                  <div className="px-3 py-4 text-[11px] text-muted-foreground/50 text-center">No open investigations</div>
                ) : investigations.filter((i: any) => i.status !== "closed").map((inv: any) => {
                  const cfg = INV_TYPE_CFG[inv.type as InvestigationType] ?? { label: inv.type, color: "text-muted-foreground bg-muted" };
                  return (
                    <div key={inv.id} className="flex items-start gap-2 px-3 py-2.5 hover:bg-muted/30">
                      <Lock className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-mono text-[10px] text-primary">{inv.number ?? inv.id?.slice(0,8)}</span>
                          <span className={`status-badge text-[10px] ${cfg.color}`}>{cfg.label}</span>
                          {inv.anonymous && <span className="status-badge text-[9px] text-muted-foreground bg-muted">Anonymous</span>}
                        </div>
                        <p className="text-[11px] text-foreground/80 truncate">{inv.summary ?? inv.title}</p>
                        <p className="text-[10px] text-muted-foreground/70">{inv.assignedTo}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Contract Review Queue</div>
              <div className="divide-y divide-border">
                {loadingContracts ? (
                  <div className="px-3 py-4 text-[11px] text-muted-foreground/50 text-center">Loading…</div>
                ) : contractReviews.length === 0 ? (
                  <div className="px-3 py-4 text-[11px] text-muted-foreground/50 text-center">No contracts pending review</div>
                ) : contractReviews.slice(0, 4).map((cr: any) => (
                  <div key={cr.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/30">
                    <div>
                      <p className="text-[12px] text-foreground font-medium">{cr.title ?? cr.name}</p>
                      <p className="text-[11px] text-muted-foreground/70">{cr.vendor ?? cr.requestedBy ?? "—"} · {cr.endDate ? `Expires ${new Date(cr.endDate).toLocaleDateString()}` : cr.dueDate ? `Due ${cr.dueDate}` : "—"}</p>
                    </div>
                    <span className={`status-badge text-[10px] capitalize ${cr.status === "active" ? "text-green-700 bg-green-100" : cr.status === "expired" ? "text-red-700 bg-red-100" : cr.status === "in_review" ? "text-blue-700 bg-blue-100" : "text-muted-foreground bg-muted"}`}>
                      {(cr.status ?? "—").replace("_"," ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MATTERS */}
        {tab === "matters" && (
          <div>
            {matters.map((m: any) => {
              const typeCfg = MATTER_TYPE_CFG[m.type as MatterType] ?? MATTER_TYPE_CFG.commercial;
              const isExpanded = expandedMatter === m.id;
              const pctCost = (m.estimatedCost ?? 0) > 0 ? Math.min(100, Math.round(((m.actualCost ?? 0)/(m.estimatedCost ?? 1))*100)) : 0;
              return (
                <div key={m.id} className="border-b border-border last:border-0">
                  <div className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedMatter(isExpanded ? null : m.id)}>
                    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${PRIORITY_BAR[m.priority]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-[11px] text-primary">{m.number}</span>
                        <span className={`status-badge ${typeCfg.color}`}>{typeCfg.label}</span>
                        <span className={`status-badge capitalize ${(MATTER_STATUS_CFG as any)[m.status] ?? ""}`}>{m.status}</span>
                        {m.confidential && <span className="status-badge text-red-600 bg-red-50 text-[9px] flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" />Confidential</span>}
                        <span className="text-[11px] text-muted-foreground/70">Phase: {m.phase}</span>
                      </div>
                      <p className="text-[13px] font-semibold text-foreground">{m.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Assigned: <strong>{m.assignedTo}</strong> · Practice: {m.practice}
                        {m.counterparty && ` · vs. ${m.counterparty}`}
                        {m.targetDate && ` · Target: ${m.targetDate}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[14px] font-bold text-foreground">₹{(m.estimatedCost ?? 0).toLocaleString("en-IN")}</div>
                      <div className="text-[10px] text-muted-foreground/70">Est. exposure</div>
                      <div className="text-[11px] text-muted-foreground">₹{(m.actualCost ?? 0).toLocaleString("en-IN")} spent ({pctCost}%)</div>
                      <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden mt-1">
                        <div className={`h-full rounded-full ${pctCost > 80 ? "bg-red-500" : pctCost > 60 ? "bg-orange-400" : "bg-primary"}`} style={{width:`${pctCost}%`}} />
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-6 pb-4 bg-muted/30/50 border-t border-dashed border-slate-200">
                      <p className="text-[12px] text-foreground/80 mt-3 mb-3">{m.description}</p>
                      <div className="grid grid-cols-4 gap-3 mb-3">
                        {[
                          { label: "Tasks",           value: `${m.tasks.done}/${m.tasks.total} done` },
                          { label: "Practice",        value: m.practice },
                          { label: "Opened",          value: m.openedDate },
                          { label: "Budget Used",     value: `${pctCost}% of ₹${(m.estimatedCost ?? 0).toLocaleString("en-IN")}` },
                        ].map(f => (
                          <div key={f.label} className="text-[11px]">
                            <span className="text-muted-foreground/70">{f.label}: </span>
                            <span className="text-foreground/80 font-semibold">{f.value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setExpandedMatter(m.id); setTab("matters"); }}
                          className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
                        >View Full Matter</button>
                        <button
                          onClick={() => { setTab("requests"); }}
                          className="px-3 py-1 border border-border text-[11px] rounded hover:bg-card text-muted-foreground"
                        >Add Task</button>
                        <label className="px-3 py-1 border border-border text-[11px] rounded hover:bg-card text-muted-foreground cursor-pointer">Upload Document<input type="file" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) toast.info(`Document "${f.name}" received — documents will be stored once DMS integration is enabled.`); e.target.value = ""; }} /></label>
                        {m.status === "active" && <button onClick={() => updateMatter.mutate({ id: m.id, status: "hold" })} disabled={updateMatter.isPending} className="px-3 py-1 border border-border text-[11px] rounded hover:bg-card text-muted-foreground disabled:opacity-50">Place on Hold</button>}
                        {(m.status === "active" || m.status === "hold") && <button onClick={() => toast.message(`Close matter "${m.title}"?`, { description: "This action will archive the matter. It can be reopened if needed.", action: { label: "Close Matter", onClick: () => updateMatter.mutate({ id: m.id, status: "closed" }) }, cancel: { label: "Cancel", onClick: () => {} } })} className="px-3 py-1 bg-red-50 text-red-700 text-[11px] rounded hover:bg-red-100 border border-red-200">Close Matter</button>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* LEGAL REQUESTS */}
        {tab === "requests" && (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Request #</th>
                <th>Type</th>
                <th>Subject</th>
                <th>Requested By</th>
                <th>Department</th>
                <th>Assigned To</th>
                <th>Created</th>
                <th>Due</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {legalRequests.map((r: any) => (
                <tr key={r.id} className={r.status === "closed" ? "opacity-50" : ""}>
                  <td className="p-0"><div className={`priority-bar ${PRIORITY_BAR[r.priority]}`} /></td>
                  <td className="font-mono text-[11px] text-primary">{r.number}</td>
                  <td><span className="status-badge text-muted-foreground bg-muted text-[10px]">{r.type}</span></td>
                  <td className="font-medium text-foreground">{r.subject}</td>
                  <td className="text-muted-foreground">{r.requestedBy}</td>
                  <td className="text-muted-foreground">{r.department}</td>
                  <td className="text-muted-foreground">{r.assignedTo ?? "—"}</td>
                  <td className="text-[11px] text-muted-foreground/70">{r.created}</td>
                  <td className={`text-[11px] ${r.dueDate && new Date(r.dueDate) < new Date() && r.status !== "closed" ? "text-red-600 font-bold" : "text-muted-foreground"}`}>{r.dueDate ?? "—"}</td>
                  <td><span className={`status-badge capitalize ${PRIORITY_BAR[r.priority] === "bg-red-600" ? "text-red-700 bg-red-100" : PRIORITY_BAR[r.priority] === "bg-orange-500" ? "text-orange-700 bg-orange-100" : "text-muted-foreground bg-muted"}`}>{r.priority}</span></td>
                  <td><span className={`status-badge capitalize ${r.status === "closed" ? "text-muted-foreground/70 bg-muted/30" : r.status === "in_progress" ? "text-green-700 bg-green-100" : r.status === "awaiting_info" ? "text-orange-700 bg-orange-100" : "text-blue-700 bg-blue-100"}`}>{r.status.replace("_"," ")}</span></td>
                  <td className="text-[11px] text-muted-foreground/70 max-w-xs truncate">{r.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* INVESTIGATIONS */}
        {tab === "investigations" && (
          <div>
            <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2 text-[12px] text-red-700">
              <Lock className="w-4 h-4 flex-shrink-0" />
              <strong>Confidential.</strong> All investigation records are access-controlled. Unauthorised disclosure is a disciplinary offence.
            </div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>Inv. #</th>
                  <th>Type</th>
                  <th>Summary</th>
                  <th>Anonymous</th>
                  <th>Reporter</th>
                  <th>Assigned To</th>
                  <th>Opened</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {loadingInvestigations ? (
                  <tr><td colSpan={11} className="text-center py-6 text-[11px] text-muted-foreground/50">Loading…</td></tr>
                ) : investigations.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-6 text-[11px] text-muted-foreground/50">No investigations on record</td></tr>
                ) : investigations.map((inv: any) => {
                  const cfg = INV_TYPE_CFG[inv.type as InvestigationType] ?? { label: inv.type, color: "text-muted-foreground bg-muted" };
                  return (
                    <tr key={inv.id} className={inv.status === "closed" ? "opacity-50" : ""}>
                      <td className="p-0"><div className={`priority-bar ${PRIORITY_BAR[inv.priority] ?? "bg-muted"}`} /></td>
                      <td className="font-mono text-[11px] text-primary">{inv.number ?? inv.id?.slice(0,8)}</td>
                      <td><span className={`status-badge ${cfg.color}`}>{cfg.label}</span></td>
                      <td className="font-medium text-foreground max-w-xs truncate">{inv.summary ?? inv.title}</td>
                      <td className="text-center">{inv.anonymous ? <span className="status-badge text-muted-foreground bg-muted text-[10px]">Anonymous</span> : "—"}</td>
                      <td className="text-muted-foreground">{inv.reporter ?? "Anonymous"}</td>
                      <td className="text-muted-foreground">{inv.assignedTo ?? "—"}</td>
                      <td className="text-[11px] text-muted-foreground/70">{inv.openedDate ?? (inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : "—")}</td>
                      <td><span className={`status-badge capitalize ${PRIORITY_BAR[inv.priority] === "bg-red-600" ? "text-red-700 bg-red-100" : "text-orange-700 bg-orange-100"}`}>{inv.priority}</span></td>
                      <td><span className={`status-badge capitalize ${inv.status === "closed" ? "text-muted-foreground/70 bg-muted/30" : inv.status === "escalated" ? "text-red-700 bg-red-100" : inv.status === "in_progress" ? "text-blue-700 bg-blue-100" : "text-muted-foreground bg-muted"}`}>{(inv.status ?? "—").replace("_"," ")}</span></td>
                      <td className="text-[11px] text-muted-foreground max-w-xs truncate">{inv.outcome ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* CONTRACT REVIEW */}
        {tab === "contracts" && (
          <div className="p-4 space-y-3">
            <p className="text-[12px] text-muted-foreground">Contracts submitted for legal review. Legal will mark up, redline, or approve based on risk assessment.</p>
            {loadingContracts ? (
              <div className="py-6 text-center text-[11px] text-muted-foreground/50">Loading…</div>
            ) : contractReviews.length === 0 ? (
              <div className="py-8 text-center text-[11px] text-muted-foreground/50">No contracts pending review</div>
            ) : contractReviews.map((cr: any) => (
              <div key={cr.id} className="border rounded p-4 border-border">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[11px] text-primary">{cr.contractNumber ?? cr.id?.slice(0,8)}</span>
                      <span className={`status-badge capitalize ${cr.status === "active" ? "text-green-700 bg-green-100" : cr.status === "expired" ? "text-red-700 bg-red-100" : cr.status === "draft" ? "text-yellow-700 bg-yellow-100" : "text-muted-foreground bg-muted"}`}>{(cr.status ?? "—").replace("_"," ")}</span>
                    </div>
                    <p className="text-[13px] font-semibold text-foreground">{cr.title ?? cr.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Vendor: {cr.vendor ?? "—"} · Value: {cr.value != null ? `$${Number(cr.value).toLocaleString()}` : "—"} · {cr.endDate ? `Expires ${new Date(cr.endDate).toLocaleDateString()}` : "No expiry"}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => router.push(`/app/contracts?id=${cr.id}`)}
                      className="px-3 py-1 border border-border text-[11px] rounded hover:bg-muted/30 text-muted-foreground"
                    >View</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LEGAL KNOWLEDGE */}
        {tab === "knowledge" && (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Article</th>
                <th>Category</th>
                <th>Author</th>
                <th>Last Updated</th>
                <th>Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingKb ? (
                <tr><td colSpan={7} className="text-center py-6 text-[11px] text-muted-foreground/50">Loading…</td></tr>
              ) : kbArticles.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-6 text-[11px] text-muted-foreground/50">No knowledge base articles yet</td></tr>
              ) : kbArticles.map((kb: any) => (
                <tr key={kb.id}>
                  <td className="p-0"><div className={`priority-bar ${kb.restricted ? "bg-red-500" : "bg-green-500"}`} /></td>
                  <td
                    className="font-medium text-primary hover:underline cursor-pointer"
                    onClick={() => router.push(`/app/knowledge/${kb.id}`)}
                  >{kb.title}</td>
                  <td><span className="status-badge text-muted-foreground bg-muted text-[10px]">{kb.category ?? kb.categoryId ?? "General"}</span></td>
                  <td className="text-muted-foreground">{kb.authorId ?? kb.author ?? "—"}</td>
                  <td className="text-[11px] text-muted-foreground/70">{kb.updatedAt ? new Date(kb.updatedAt).toLocaleDateString() : kb.updated ?? "—"}</td>
                  <td><span className={`status-badge ${kb.restricted ? "text-red-700 bg-red-100 flex items-center gap-1" : "text-green-700 bg-green-100"}`}>{kb.restricted ? <><Lock className="w-2.5 h-2.5" />Restricted</> : "All Staff"}</span></td>
                  <td>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => router.push(`/app/knowledge/${kb.id}`)}
                        className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                      ><Eye className="w-3 h-3" />Read</button>
                      <PermissionGate module="grc" action="write">
                        <button
                          onClick={() => router.push(`/app/knowledge/${kb.id}?edit=1`)}
                          className="text-[11px] text-muted-foreground/70 hover:underline"
                        >Edit</button>
                      </PermissionGate>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>

    {showNewMatter && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold">New Legal Matter</h2>
            <button onClick={() => setShowNewMatter(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Matter Title *</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="e.g. Data Privacy Compliance Review" value={matterForm.title} onChange={(e) => setMatterForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Type</label>
              <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={matterForm.type} onChange={(e) => setMatterForm((f) => ({ ...f, type: e.target.value }))}>
                {["commercial","litigation","employment","ip","regulatory","ma","data_privacy","corporate"].map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Description</label>
              <textarea className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background h-16 resize-none" placeholder="Brief description of the matter…" value={matterForm.description} onChange={(e) => setMatterForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Estimated Cost (₹)</label>
              <input type="number" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="e.g. 500000" value={matterForm.estimatedCost} onChange={(e) => setMatterForm((f) => ({ ...f, estimatedCost: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setShowNewMatter(false)} className="flex-1 px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Cancel</button>
            <button
              onClick={() => {
                if (!matterForm.title.trim()) { toast.error("Matter title is required"); return; }
                createMatter.mutate({ title: matterForm.title.trim(), description: matterForm.description || undefined, type: matterForm.type as any, estimatedCost: matterForm.estimatedCost || undefined });
              }}
              disabled={createMatter.isPending}
              className="flex-1 px-3 py-1.5 text-xs bg-purple-700 text-white rounded hover:bg-purple-800 disabled:opacity-50"
            >
              {createMatter.isPending ? "Creating…" : "Create Matter"}
            </button>
          </div>
        </div>
      </div>
    )}

    {showNewRequest && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold">New Legal Request</h2>
            <button onClick={() => setShowNewRequest(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Request Title *</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="e.g. Contract Review — Vendor NDA" value={requestForm.title} onChange={(e) => setRequestForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Type</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={requestForm.type} onChange={(e) => setRequestForm((f) => ({ ...f, type: e.target.value }))}>
                  {["advisory","contract_review","compliance","litigation_support","employment","ip"].map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Priority</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={requestForm.priority} onChange={(e) => setRequestForm((f) => ({ ...f, priority: e.target.value }))}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Description</label>
              <textarea className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background h-16 resize-none" placeholder="Describe the legal request…" value={requestForm.description} onChange={(e) => setRequestForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setShowNewRequest(false)} className="flex-1 px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Cancel</button>
            <button
              onClick={() => {
                if (!requestForm.title.trim()) { toast.error("Request title is required"); return; }
                createRequest.mutate({ title: requestForm.title.trim(), description: requestForm.description || undefined, type: requestForm.type, priority: requestForm.priority });
              }}
              disabled={createRequest.isPending}
              className="flex-1 px-3 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {createRequest.isPending ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
