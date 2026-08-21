"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Layers, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Plus, Download, Database, Cloud, Server,
  Shield, DollarSign,
} from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { downloadCSV, formatInr } from "@/lib/utils";
import { APM_ENABLED } from "@/lib/feature-flags";

const APM_TABS = [
  // Gated on analytics.read to match apm.applications.* on the server, which is
  // enforced with permissionProcedure("analytics", …) — projects.read let users
  // open a tab whose every query then failed authorization.
  { key: "portfolio",  label: "App Inventory",               module: "analytics" as const, action: "read"  as const },
  ...(APM_ENABLED
    ? [
        { key: "lifecycle",  label: "Lifecycle & Rationalization", module: "projects" as const, action: "write" as const },
        { key: "techdebt",   label: "Technology Debt",             module: "projects" as const, action: "read"  as const },
        { key: "cloud",      label: "Cloud Readiness",             module: "projects" as const, action: "read"  as const },
        { key: "capability", label: "Business Capability Map",     module: "reports"  as const, action: "read"  as const },
      ]
    : []),
];

type LifecycleStatus = "investing" | "sustaining" | "harvesting" | "retiring" | "obsolete" | "evaluating";
type DeployModel = "on_premise" | "saas" | "paas" | "hybrid" | "cloud_hosted";
type TechDebtLevel = "critical" | "high" | "medium" | "low" | "none";

interface Application {
  id: string;
  name: string;
  alias: string;
  description: string;
  category: string;
  businessOwner: string;
  technicalOwner: string;
  vendor: string;
  version: string;
  lifecycle: LifecycleStatus;
  deployModel: DeployModel;
  // `usersCount` and `techDebtScore` are what apm.applications.list actually
  // emits. The old `users` / `techDebt` names matched no emitted field and no
  // column, so every read fell through to its `?? 0` default.
  usersCount: number;
  techDebtScore: number;
  annualCost: number;
  lastRenewal?: string;
  nextRenewal?: string;
  healthScore: number;
  businessValue: "critical" | "high" | "medium" | "low";
  techDebt: TechDebtLevel;
  cloudReadiness: "cloud_native" | "lift_shift" | "re_platform" | "re_architect" | "retire" | "not_assessed";
  capabilities: string[];
  integrations: string[];
  compliance: string[];
  slaUptime?: number;
  eolDate?: string;
}

// APPS_DEFAULT (four hand-written demo applications) was removed here.
// It had ZERO references in this file — nothing rendered from it — and it
// declared `users` / `techDebt`, the two names that never existed on the
// procedure or the table. Keeping it compiling would have meant inventing
// numeric tech-debt scores for categorical mock values, so it is deleted
// rather than fabricated.

/*
 * Option lists for the create/edit selects.
 *
 * These are the values the DATABASE enum actually holds, confirmed by querying
 * pg_enum — NOT the keys of CLOUD_CFG below, which spell two of them
 * `re_platform` / `re_architect` where the column stores `replatform` /
 * `rearchitect`. Building a dropdown from the display config would have posted
 * values the enum rejects.
 */
const LIFECYCLE_OPTIONS = ["evaluating", "investing", "sustaining", "harvesting", "retiring", "obsolete"] as const;
const CLOUD_OPTIONS = ["cloud_native", "lift_shift", "replatform", "rearchitect", "retire", "not_assessed"] as const;

const EMPTY_APP_FORM = {
  name: "", category: "", vendor: "", department: "", description: "",
  lifecycle: "sustaining", cloudReadiness: "not_assessed",
  healthScore: "70", techDebtScore: "0", usersCount: "0", annualCost: "",
};

const LIFECYCLE_CFG: Record<LifecycleStatus, { label: string; color: string; bar: string; desc: string }> = {
  investing:  { label: "Investing",  color: "text-green-700 bg-green-100",   bar: "bg-green-500",   desc: "Actively investing to grow capabilities" },
  sustaining: { label: "Sustaining", color: "text-blue-700 bg-blue-100",     bar: "bg-blue-500",    desc: "Maintaining at current level — no new investment" },
  harvesting: { label: "Harvesting", color: "text-yellow-700 bg-yellow-100", bar: "bg-yellow-400",  desc: "Reducing investment, migrating users away" },
  retiring:   { label: "Retiring",   color: "text-orange-700 bg-orange-100", bar: "bg-orange-400",  desc: "Planned decommission in progress" },
  obsolete:   { label: "Obsolete",   color: "text-red-700 bg-red-100",       bar: "bg-red-500",     desc: "No support or maintenance. Must migrate." },
  evaluating: { label: "Evaluating", color: "text-purple-700 bg-purple-100", bar: "bg-purple-500",  desc: "Under evaluation for adoption" },
};

const DEPLOY_CFG: Record<DeployModel, string> = {
  on_premise:   "text-muted-foreground bg-muted",
  saas:         "text-green-700 bg-green-100",
  paas:         "text-blue-700 bg-blue-100",
  hybrid:       "text-purple-700 bg-purple-100",
  cloud_hosted: "text-indigo-700 bg-indigo-100",
};

const DEBT_CFG: Record<TechDebtLevel, { color: string; bar: string }> = {
  critical: { color: "text-red-700 bg-red-100",    bar: "bg-red-600" },
  high:     { color: "text-orange-700 bg-orange-100", bar: "bg-orange-500" },
  medium:   { color: "text-yellow-700 bg-yellow-100", bar: "bg-yellow-400" },
  low:      { color: "text-green-700 bg-green-100",  bar: "bg-green-400" },
  none:     { color: "text-muted-foreground/70 bg-muted/30",   bar: "bg-border" },
};

const CLOUD_CFG: Record<Application["cloudReadiness"], { label: string; color: string }> = {
  cloud_native: { label: "Cloud Native",    color: "text-green-700 bg-green-100" },
  lift_shift:   { label: "Lift & Shift",    color: "text-blue-700 bg-blue-100" },
  re_platform:  { label: "Re-Platform",     color: "text-purple-700 bg-purple-100" },
  re_architect: { label: "Re-Architect",    color: "text-orange-700 bg-orange-100" },
  retire:       { label: "Retire",          color: "text-red-700 bg-red-100" },
  not_assessed: { label: "Not Assessed",    color: "text-muted-foreground/70 bg-muted/30" },
};

const BIZ_VALUE_CFG: Record<string, string> = {
  critical: "text-red-700 bg-red-100",
  high:     "text-orange-700 bg-orange-100",
  medium:   "text-blue-700 bg-blue-100",
  low:      "text-muted-foreground bg-muted",
};

const CAPABILITY_MAP = [
  { capability: "Finance & Accounting",      apps: ["SAP S/4HANA", "CoheronConnect Platform", "Legacy Invoicing System (LIMS)"],   gap: false },
  { capability: "Human Resources",           apps: ["Workday HCM", "CoheronConnect Platform"],                                       gap: false },
  { capability: "IT Service Management",     apps: ["CoheronConnect Platform"],                                                       gap: false },
  { capability: "CRM / Sales",              apps: ["CoheronConnect Platform", "Salesforce Sales Cloud"],                            gap: true, gapNote: "Salesforce retiring — consolidate to CoheronConnect CRM" },
  { capability: "Security Operations",      apps: ["CoheronConnect Platform", "CrowdStrike Falcon"],                                gap: false },
  { capability: "Strategy & Initiatives",   apps: ["CoheronConnect Platform"],                                                       gap: false },
  { capability: "Knowledge Management",     apps: ["CoheronConnect Platform", "Jira Software + Confluence"],                        gap: true, gapNote: "Dual system — standardise on one platform" },
  { capability: "Collaboration & Comms",    apps: ["Microsoft 365 Suite"],                                                    gap: false },
  { capability: "Accounts Payable",         apps: ["SAP S/4HANA", "CoheronConnect Platform"],                                       gap: true, gapNote: "Legacy LIMS overlap — retire LIMS after migration" },
];

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-border animate-pulse">
          <div className="w-1 self-stretch rounded-full bg-muted flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-muted rounded w-1/4" />
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        </div>
      ))}
    </>
  );
}

export default function APMPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const router = useRouter();
  const visibleTabs = APM_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "portfolio");
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [showNewApp, setShowNewApp] = useState(false);
  const [editApp, setEditApp] = useState<any | null>(null);
  const [appMsg, setAppMsg] = useState<string | null>(null);
  const [appForm, setAppForm] = useState({ ...EMPTY_APP_FORM });

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  // @ts-ignore
  const appsQuery = trpc.apm.applications.list.useQuery({}, mergeTrpcQueryOpts("apm.applications.list", undefined));
  // @ts-ignore
  const summaryQuery = trpc.apm.portfolio.summary.useQuery(undefined, mergeTrpcQueryOpts("apm.portfolio.summary", undefined));
  // @ts-ignore
  const createAppMutation = trpc.apm.applications.create.useMutation({
    onSuccess: () => {
      appsQuery.refetch(); summaryQuery.refetch();
      setShowNewApp(false); setAppForm(EMPTY_APP_FORM);
      setAppMsg("Application created."); setTimeout(() => setAppMsg(null), 4000);
      toast.success("Application added");
    },
    onError: (e: any) => { console.error("apm.applications.create failed:", e); toast.error(e.message || "Failed to add application"); },
  });
  // @ts-ignore
  const updateAppMutation = trpc.apm.applications.update.useMutation({
    onSuccess: () => {
      appsQuery.refetch(); summaryQuery.refetch();
      setEditApp(null);
      setAppMsg("Application updated."); setTimeout(() => setAppMsg(null), 4000);
      toast.success("Application updated");
    },
    onError: (e: any) => { toast.error(e.message || "Failed to update application"); },
  });

  if (!can("analytics", "read")) return <AccessDenied module="App Inventory" />;

  const summary = summaryQuery.data as (undefined | {
    total:number; avgHealthScore:number; totalAnnualCost:number;
    retireCandidates:number; highTechDebt:number; highTechDebtMinScore:number; cloudNative:number;
  });
  const APPS: Application[] = (((appsQuery.data as any)?.items ?? appsQuery.data ?? []) as Application[]);

  const totalAnnualCost = APPS.reduce((s, a) => s + (a.annualCost ?? 0), 0);
  const retireCandidates = APPS.filter(a => ["retiring","harvesting","obsolete"].includes(a.lifecycle)).length;
  const criticalDebt = APPS.filter(a => a.techDebt === "critical" || a.techDebt === "high").length;
  const cloudNative = APPS.filter(a => a.cloudReadiness === "cloud_native").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-body-sm font-semibold text-foreground">App Inventory</h1>
          <span className="text-[11px] text-muted-foreground/70">
            {APM_ENABLED
              ? "Inventory · Lifecycle · Tech Debt · Cloud · Capability Map"
              : "Applications used across your organization · vendor · cost · renewal"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
              onClick={() => downloadCSV(
                APPS.map((a) => ({
                  Name: a.name,
                  Alias: a.alias ?? "",
                  Category: a.category,
                  Lifecycle: a.lifecycle ?? "",
                  DeployModel: a.deployModel ?? "",
                  TechDebt: a.techDebt ?? "",
                  AnnualCost: a.annualCost ?? 0,
                  EOL: a.eolDate ?? "",
                  Owner: a.businessOwner ?? "",
                })),
                "apm_portfolio_export",
              )}
              className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
            >
              <Download className="w-3 h-3" /> Export
            </button>
          <PermissionGate module="cmdb" action="write">
            <button
              data-testid="apm-add-open"
              onClick={() => { setEditApp(null); setAppForm({ ...EMPTY_APP_FORM }); setShowNewApp((v) => !v); }}
              className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
            >
              <Plus className="w-3 h-3" /> Add Application
            </button>
          </PermissionGate>
        </div>
      </div>


      {appMsg && (
        <div className="px-3 py-2 bg-green-50 border border-green-200 rounded text-[12px] text-green-700 font-medium" data-testid="apm-form-msg">{appMsg}</div>
      )}

      {showNewApp && (() => { const F: any = appForm; const S: any = setAppForm; return (
        <div className="bg-card border border-primary/30 rounded p-4" data-testid="apm-new-app">
          <h3 className="text-[12px] font-semibold text-foreground mb-3">New Application</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground">Application Name *</label>
              <input data-testid="apm-f-name" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" placeholder="Application name" value={F.name ?? ""} onChange={(e) => S((f: any) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Category</label>
              <input data-testid="apm-f-category" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" placeholder="Finance / HR / Security" value={F.category ?? ""} onChange={(e) => S((f: any) => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Lifecycle</label>
              <select data-testid="apm-f-lifecycle" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.lifecycle ?? "sustaining"} onChange={(e) => S((f: any) => ({ ...f, lifecycle: e.target.value }))}>
                {LIFECYCLE_OPTIONS.map((o) => <option key={o} value={o}>{LIFECYCLE_CFG[o]?.label ?? o}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Cloud Readiness</label>
              <select data-testid="apm-f-cloud" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.cloudReadiness ?? "not_assessed"} onChange={(e) => S((f: any) => ({ ...f, cloudReadiness: e.target.value }))}>
                {CLOUD_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Vendor</label>
              <input data-testid="apm-f-vendor" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.vendor ?? ""} onChange={(e) => S((f: any) => ({ ...f, vendor: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Department</label>
              <input data-testid="apm-f-department" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.department ?? ""} onChange={(e) => S((f: any) => ({ ...f, department: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Health Score (0-100)</label>
              <input data-testid="apm-f-health" type="number" min={0} max={100} step={1} className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.healthScore ?? ""} onChange={(e) => S((f: any) => ({ ...f, healthScore: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Tech Debt Score (0-100)</label>
              <input data-testid="apm-f-debt" type="number" min={0} max={100} step={1} className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.techDebtScore ?? ""} onChange={(e) => S((f: any) => ({ ...f, techDebtScore: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Users</label>
              <input data-testid="apm-f-users" type="number" min={0} step={1} className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.usersCount ?? ""} onChange={(e) => S((f: any) => ({ ...f, usersCount: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Annual Cost</label>
              <input data-testid="apm-f-cost" type="number" min={0} className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" placeholder="0" value={F.annualCost ?? ""} onChange={(e) => S((f: any) => ({ ...f, annualCost: e.target.value }))} />
            </div>
            <div className="col-span-3">
              <label className="text-[11px] text-muted-foreground">Description</label>
              <textarea data-testid="apm-f-desc" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background h-14 resize-none" value={F.description ?? ""} onChange={(e) => S((f: any) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button disabled={!F.name || createAppMutation.isPending} data-testid="apm-create-submit"
              onClick={() => createAppMutation.mutate({
                name: F.name,
                category: F.category || undefined,
                vendor: F.vendor || undefined,
                department: F.department || undefined,
                description: F.description || undefined,
                lifecycle: F.lifecycle,
                cloudReadiness: F.cloudReadiness,
                healthScore: F.healthScore === "" || F.healthScore == null ? undefined : Number(F.healthScore),
                techDebtScore: F.techDebtScore === "" || F.techDebtScore == null ? undefined : Number(F.techDebtScore),
                usersCount: F.usersCount === "" || F.usersCount == null ? undefined : Number(F.usersCount),
                annualCost: F.annualCost === "" || F.annualCost == null ? undefined : String(F.annualCost),
              } as any)}
              className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50">
              {createAppMutation.isPending ? "Creating..." : "Create Application"}
            </button>
            <button onClick={() => setShowNewApp(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent">Cancel</button>
          </div>
        </div>
      ); })()}

      {editApp && (() => { const F: any = editApp; const S: any = setEditApp; return (
        <div className="bg-card border border-primary/30 rounded p-4" data-testid="apm-edit-app">
          <h3 className="text-[12px] font-semibold text-foreground mb-3">Edit Application</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground">Application Name *</label>
              <input data-testid="apm-f-name" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" placeholder="Application name" value={F.name ?? ""} onChange={(e) => S((f: any) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Category</label>
              <input data-testid="apm-f-category" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" placeholder="Finance / HR / Security" value={F.category ?? ""} onChange={(e) => S((f: any) => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Lifecycle</label>
              <select data-testid="apm-f-lifecycle" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.lifecycle ?? "sustaining"} onChange={(e) => S((f: any) => ({ ...f, lifecycle: e.target.value }))}>
                {LIFECYCLE_OPTIONS.map((o) => <option key={o} value={o}>{LIFECYCLE_CFG[o]?.label ?? o}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Cloud Readiness</label>
              <select data-testid="apm-f-cloud" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.cloudReadiness ?? "not_assessed"} onChange={(e) => S((f: any) => ({ ...f, cloudReadiness: e.target.value }))}>
                {CLOUD_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Vendor</label>
              <input data-testid="apm-f-vendor" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.vendor ?? ""} onChange={(e) => S((f: any) => ({ ...f, vendor: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Department</label>
              <input data-testid="apm-f-department" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.department ?? ""} onChange={(e) => S((f: any) => ({ ...f, department: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Health Score (0-100)</label>
              <input data-testid="apm-f-health" type="number" min={0} max={100} step={1} className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.healthScore ?? ""} onChange={(e) => S((f: any) => ({ ...f, healthScore: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Tech Debt Score (0-100)</label>
              <input data-testid="apm-f-debt" type="number" min={0} max={100} step={1} className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.techDebtScore ?? ""} onChange={(e) => S((f: any) => ({ ...f, techDebtScore: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Users</label>
              <input data-testid="apm-f-users" type="number" min={0} step={1} className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" value={F.usersCount ?? ""} onChange={(e) => S((f: any) => ({ ...f, usersCount: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Annual Cost</label>
              <input data-testid="apm-f-cost" type="number" min={0} className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background" placeholder="0" value={F.annualCost ?? ""} onChange={(e) => S((f: any) => ({ ...f, annualCost: e.target.value }))} />
            </div>
            <div className="col-span-3">
              <label className="text-[11px] text-muted-foreground">Description</label>
              <textarea data-testid="apm-f-desc" className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1 bg-background h-14 resize-none" value={F.description ?? ""} onChange={(e) => S((f: any) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button disabled={!F.name || updateAppMutation.isPending} data-testid="apm-edit-submit"
              onClick={() => updateAppMutation.mutate({
                id: F.id,
                name: F.name,
                category: F.category || undefined,
                vendor: F.vendor || undefined,
                department: F.department || undefined,
                description: F.description || undefined,
                lifecycle: F.lifecycle,
                cloudReadiness: F.cloudReadiness,
                healthScore: F.healthScore === "" || F.healthScore == null ? undefined : Number(F.healthScore),
                techDebtScore: F.techDebtScore === "" || F.techDebtScore == null ? undefined : Number(F.techDebtScore),
                usersCount: F.usersCount === "" || F.usersCount == null ? undefined : Number(F.usersCount),
                annualCost: F.annualCost === "" || F.annualCost == null ? undefined : String(F.annualCost),
              } as any)}
              className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50">
              {updateAppMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
            <button onClick={() => setEditApp(null)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent">Cancel</button>
          </div>
        </div>
      ); })()}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          /*
           * Every tile reads the SERVER summary, which counts across the whole
           * org in SQL. The previous fallbacks (`?? APPS.length`, `?? criticalDebt`)
           * computed over `applications.list({ limit: 50 })`, so on any org past
           * 50 apps a tile silently became "the first 50". `Cloud Native` showed
           * this in the open: it read 0/50 while the org held 75 applications.
           * While the summary is loading the tiles render "—", never a number
           * derived from a partial page.
           */
          { label: "Applications",       value: summary ? summary.total : "—",                 color: "text-foreground" },
          { label: "Annual License Cost",value: summary ? formatInr(summary.totalAnnualCost) : "—", color: "text-foreground/80" },
          { label: "Retire Candidates",  value: summary ? summary.retireCandidates : "—",      color: (summary?.retireCandidates ?? 0) > 0 ? "text-orange-700" : "text-green-700" },
          { label: `High Tech Debt (≥${summary?.highTechDebtMinScore ?? 70})`, value: summary ? summary.highTechDebt : "—", color: (summary?.highTechDebt ?? 0) > 0 ? "text-red-700" : "text-green-700" },
          { label: "Cloud Native",       value: summary ? `${summary.cloudNative}/${summary.total}` : "—", color: "text-green-700" },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-h4 font-bold ${k.color}`}>{k.value}</div>
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
        {/* PORTFOLIO */}
        {tab === "portfolio" && (
          <div>
            {appsQuery.isLoading ? (
              <SkeletonRows count={5} />
            ) : APPS.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground/70 text-[12px]">No applications in portfolio.</div>
            ) : (
              APPS.map(app => {
                const lCfg = LIFECYCLE_CFG[app.lifecycle] ?? LIFECYCLE_CFG.sustaining;
                const dCfg = DEBT_CFG[app.techDebt] ?? DEBT_CFG.none;
                const isExpanded = expandedApp === app.id;
                return (
                  <div key={app.id} className="border-b border-border last:border-0">
                    <div className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30"
                      onClick={() => setExpandedApp(isExpanded ? null : app.id)}>
                      <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${lCfg.bar}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`status-badge ${lCfg.color}`}>{lCfg.label}</span>
                          <span className="status-badge text-muted-foreground bg-muted text-[10px]">{app.category}</span>
                          <span className={`status-badge capitalize ${DEPLOY_CFG[app.deployModel] ?? "text-muted-foreground bg-muted"}`}>{(app.deployModel ?? "").replace("_"," ")}</span>
                          <span className={`status-badge capitalize ${BIZ_VALUE_CFG[app.businessValue] ?? "text-muted-foreground bg-muted"}`}>Biz: {app.businessValue}</span>
                          {app.eolDate && <span className="status-badge text-red-700 bg-red-100 text-[10px]">EOL: {app.eolDate}</span>}
                        </div>
                        <p className="text-[13px] font-semibold text-foreground">{app.name} <span className="font-normal text-muted-foreground/70">({app.alias}) v{app.version}</span></p>
                        <p className="text-[11px] text-muted-foreground">{app.description}</p>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">Owner: {app.businessOwner} / {app.technicalOwner} · Vendor: {app.vendor} · {(app.usersCount ?? 0).toLocaleString()} users</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-mono font-bold text-[14px] text-foreground">
                          {(app.annualCost ?? 0) > 0 ? `₹${((app.annualCost ?? 0)/1000).toFixed(0)}K` : "Internal"}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70">annual cost</div>
                        <button
                          data-testid={`apm-edit-${app.id}`}
                          onClick={(e) => { e.stopPropagation(); setShowNewApp(false); setEditApp({
                            id: app.id, name: app.name, category: app.category ?? "", vendor: (app as any).vendor ?? "",
                            department: (app as any).department ?? "", description: (app as any).description ?? "",
                            lifecycle: app.lifecycle, cloudReadiness: app.cloudReadiness,
                            healthScore: String(app.healthScore ?? ""), techDebtScore: String(app.techDebtScore ?? ""),
                            usersCount: String(app.usersCount ?? ""), annualCost: app.annualCost == null ? "" : String(app.annualCost),
                          }); }}
                          className="mt-1 text-[10px] text-primary hover:underline"
                        >Edit</button>
                        <div className="flex items-center gap-1.5 mt-1 justify-end">
                          <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${(app.healthScore ?? 0) >= 80 ? "bg-green-500" : (app.healthScore ?? 0) >= 60 ? "bg-yellow-400" : "bg-red-500"}`} style={{width:`${app.healthScore ?? 0}%`}} />
                          </div>
                          <span className={`text-[11px] font-bold ${(app.healthScore ?? 0) >= 80 ? "text-green-700" : (app.healthScore ?? 0) >= 60 ? "text-yellow-600" : "text-red-700"}`}>{app.healthScore ?? 0}</span>
                        </div>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-6 pb-4 bg-muted/30/50 border-t border-dashed border-slate-200">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-2">Technical Details</p>
                            <div className="space-y-1 text-[11px]">
                              <div><span className="text-muted-foreground/70">Tech Debt: </span><span className={`font-semibold status-badge ${dCfg.color}`}>{app.techDebt}</span></div>
                              <div><span className="text-muted-foreground/70">Cloud Readiness: </span><span className={`font-semibold status-badge ${(CLOUD_CFG[app.cloudReadiness] ?? CLOUD_CFG.not_assessed).color}`}>{(CLOUD_CFG[app.cloudReadiness] ?? CLOUD_CFG.not_assessed).label}</span></div>
                              {app.slaUptime && <div><span className="text-muted-foreground/70">SLA Uptime: </span><span className="text-foreground/80 font-mono">{app.slaUptime}%</span></div>}
                              {app.nextRenewal && <div><span className="text-muted-foreground/70">Next Renewal: </span><span className="text-foreground/80">{app.nextRenewal}</span></div>}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-2">Capabilities</p>
                            <div className="flex flex-wrap gap-1">
                              {(app.capabilities ?? []).map(c => <span key={c} className="status-badge text-[10px] text-indigo-700 bg-indigo-50">{c}</span>)}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-2">Integrations</p>
                            <div className="flex flex-wrap gap-1">
                              {(app.integrations ?? []).map(i => <span key={i} className="status-badge text-[10px] text-muted-foreground bg-muted">{i}</span>)}
                            </div>
                          </div>
                        </div>
                        {(app.compliance ?? []).length > 0 && (
                          <div className="mt-2">
                            <span className="text-[10px] text-muted-foreground/70">Compliance: </span>
                            {(app.compliance ?? []).map(c => <span key={c} className="status-badge text-[10px] text-green-700 bg-green-50 mr-1">{c}</span>)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* LIFECYCLE */}
        {tab === "lifecycle" && (
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {(Object.entries(LIFECYCLE_CFG) as [LifecycleStatus, typeof LIFECYCLE_CFG[LifecycleStatus]][]).map(([status, cfg]) => {
                const count = APPS.filter(a => a.lifecycle === status).length;
                const cost = APPS.filter(a => a.lifecycle === status).reduce((s,a)=>s+(a.annualCost ?? 0),0);
                return (
                  <div key={status} className={`border rounded p-3 ${count > 0 ? "border-border" : "border-slate-100 opacity-40"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${cfg.bar}`} />
                      <span className={`status-badge ${cfg.color}`}>{cfg.label}</span>
                      <span className="font-bold text-foreground">{count}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/70">{cfg.desc}</p>
                    {cost > 0 && <p className="text-[11px] font-mono text-muted-foreground mt-1">₹{(cost/1000).toFixed(0)}K / yr</p>}
                  </div>
                );
              })}
            </div>
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Rationalization Candidates</div>
              <table className="ent-table w-full">
                <thead><tr><th className="w-4" /><th>Application</th><th>Lifecycle</th><th>Annual Cost</th><th>Users</th><th>Health</th><th>Target</th></tr></thead>
                <tbody>
                  {APPS.filter(a => ["harvesting","retiring","obsolete"].includes(a.lifecycle)).map(a => {
                    const lCfg = LIFECYCLE_CFG[a.lifecycle];
                    return (
                      <tr key={a.id}>
                        <td className="p-0"><div className={`priority-bar ${lCfg.bar}`} /></td>
                        <td className="font-semibold text-foreground">{a.name}</td>
                        <td><span className={`status-badge ${lCfg.color}`}>{lCfg.label}</span></td>
                        <td className="font-mono text-[11px] text-foreground/80">{(a.annualCost ?? 0) > 0 ? `₹${((a.annualCost ?? 0)/1000).toFixed(0)}K` : "Internal"}</td>
                        <td className="text-center font-mono">{a.usersCount ?? 0}</td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${(a.healthScore ?? 0) >= 70 ? "bg-green-400" : (a.healthScore ?? 0) >= 50 ? "bg-yellow-400" : "bg-red-500"}`} style={{width:`${a.healthScore ?? 0}%`}} />
                            </div>
                            <span className="text-[11px]">{a.healthScore ?? 0}</span>
                          </div>
                        </td>
                        <td className="text-[11px] text-primary">{a.eolDate ?? a.nextRenewal ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TECH DEBT */}
        {tab === "techdebt" && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {(["critical","high","medium","low"] as TechDebtLevel[]).map(level => {
                const count = APPS.filter(a => a.techDebt === level).length;
                const cost = APPS.filter(a => a.techDebt === level).reduce((s,a)=>s+(a.annualCost ?? 0),0);
                const cfg = DEBT_CFG[level];
                return (
                  <div key={level} className="bg-card border border-border rounded px-3 py-2">
                    <div className={`text-h4 font-bold ${cfg.color.split(" ")[0]}`}>{count}</div>
                    <div className="text-[10px] text-muted-foreground uppercase capitalize">{level} debt</div>
                    {cost > 0 && <div className="text-[10px] text-muted-foreground/70">₹{(cost/1000).toFixed(0)}K spend</div>}
                  </div>
                );
              })}
            </div>
            <table className="ent-table w-full">
              <thead><tr><th className="w-4" /><th>Application</th><th>Tech Debt</th><th>Lifecycle</th><th>Deploy Model</th><th>EOL / Renewal</th><th>Annual Cost</th><th>Actions</th></tr></thead>
              <tbody>
                {APPS.sort((a,b) => ["critical","high","medium","low","none"].indexOf(a.techDebt) - ["critical","high","medium","low","none"].indexOf(b.techDebt)).map(a => {
                  const dCfg = DEBT_CFG[a.techDebt] ?? DEBT_CFG.none;
                  const lCfg = LIFECYCLE_CFG[a.lifecycle] ?? LIFECYCLE_CFG.sustaining;
                  return (
                    <tr key={a.id} className={a.techDebt === "critical" ? "bg-red-50/20" : ""}>
                      <td className="p-0"><div className={`priority-bar ${dCfg.bar}`} /></td>
                      <td className="font-semibold text-foreground">{a.name}</td>
                      <td><span className={`status-badge capitalize ${dCfg.color}`}>{a.techDebt} debt</span></td>
                      <td><span className={`status-badge ${lCfg.color}`}>{lCfg.label}</span></td>
                      <td><span className={`status-badge capitalize ${DEPLOY_CFG[a.deployModel] ?? "text-muted-foreground bg-muted"}`}>{(a.deployModel ?? "").replace("_"," ")}</span></td>
                      <td className="text-[11px] text-muted-foreground">{a.eolDate ?? a.nextRenewal ?? "—"}</td>
                      <td className="font-mono text-[11px]">{(a.annualCost ?? 0) > 0 ? `₹${((a.annualCost ?? 0)/1000).toFixed(0)}K` : "Internal"}</td>
                      <td>
                        {(a.techDebt === "critical" || a.techDebt === "high") && (
                          <button
                            onClick={() => router.push(`/app/tickets/new?type=request&title=${encodeURIComponent("Tech Debt Improvement: " + a.name)}&description=${encodeURIComponent("Application: " + a.name + " has " + a.techDebt + " tech debt level. Improvement required.")}`)}
                            className="text-[11px] text-primary hover:underline"
                          >Create Improvement</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* CLOUD READINESS */}
        {tab === "cloud" && (
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {Object.entries(CLOUD_CFG).map(([key, cfg]) => {
                const count = APPS.filter(a => a.cloudReadiness === key).length;
                return count > 0 ? (
                  <div key={key} className="border border-border rounded p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`status-badge ${cfg.color}`}>{cfg.label}</span>
                      <span className="font-bold text-foreground">{count}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {APPS.filter(a => a.cloudReadiness === key).map(a => a.alias).join(", ")}
                    </div>
                  </div>
                ) : null;
              })}
            </div>
            <table className="ent-table w-full">
              <thead><tr><th className="w-4" /><th>Application</th><th>Cloud Readiness</th><th>Current Deployment</th><th>Migration Effort</th><th>Annual Cost</th><th>Priority</th></tr></thead>
              <tbody>
                {APPS.filter(a => !["cloud_native","retire"].includes(a.cloudReadiness)).map(a => {
                  const cfg = CLOUD_CFG[a.cloudReadiness] ?? CLOUD_CFG.not_assessed;
                  const effort = a.cloudReadiness === "lift_shift" ? "Low" : a.cloudReadiness === "re_platform" ? "Medium" : "High";
                  return (
                    <tr key={a.id}>
                      <td className="p-0"><div className={`priority-bar ${a.cloudReadiness === "re_architect" ? "bg-orange-500" : "bg-blue-400"}`} /></td>
                      <td className="font-semibold text-foreground">{a.name}</td>
                      <td><span className={`status-badge ${cfg.color}`}>{cfg.label}</span></td>
                      <td><span className={`status-badge capitalize ${DEPLOY_CFG[a.deployModel] ?? "text-muted-foreground bg-muted"}`}>{(a.deployModel ?? "").replace("_"," ")}</span></td>
                      <td><span className={`status-badge ${effort === "High" ? "text-red-700 bg-red-100" : effort === "Medium" ? "text-orange-700 bg-orange-100" : "text-green-700 bg-green-100"}`}>{effort}</span></td>
                      <td className="font-mono text-[11px]">{(a.annualCost ?? 0) > 0 ? `₹${((a.annualCost ?? 0)/1000).toFixed(0)}K` : "Internal"}</td>
                      <td><span className={`status-badge capitalize ${BIZ_VALUE_CFG[a.businessValue] ?? "text-muted-foreground bg-muted"}`}>{a.businessValue}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* CAPABILITY MAP */}
        {tab === "capability" && (
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3">
              {CAPABILITY_MAP.map(cm => (
                <div key={cm.capability} className={`border rounded p-4 ${cm.gap ? "border-orange-200 bg-orange-50/10" : "border-border"}`}>
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-semibold text-foreground text-[12px]">{cm.capability}</p>
                    {cm.gap ? (
                      <span className="status-badge text-orange-700 bg-orange-100 text-[10px] flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />Gap</span>
                    ) : (
                      <span className="status-badge text-green-700 bg-green-100 text-[10px]">✓ Covered</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {cm.apps.map(a => <span key={a} className="status-badge text-[10px] text-primary bg-primary/10">{a}</span>)}
                  </div>
                  {cm.gap && cm.gapNote && <p className="text-[11px] text-orange-700 mt-1">{cm.gapNote}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
