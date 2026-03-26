"use client";

import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import {
  Settings, Users, Shield, Key, Bell, Database, Clock, FileText,
  Plus, Search, Edit2, Trash2, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, Download, Eye, EyeOff, ToggleLeft, ToggleRight,
  Activity, Server, Workflow, BookOpen, ChevronRight, Lock,
} from "lucide-react";
import {
  SYSTEM_ROLES_CATALOG, type SystemRole,
  ROLE_PERMISSIONS, type Module, type RbacAction,
} from "@/lib/rbac";
import { useRBAC, PermissionGate, AccessDenied } from "@/lib/rbac-context";

const ADMIN_TABS = [
  { key: "overview",         label: "Overview",            icon: Settings,  module: "admin"             as const, action: "read"  as const },
  { key: "users",            label: "User Management",     icon: Users,     module: "users"             as const, action: "read"  as const },
  { key: "roles",            label: "Roles & Permissions", icon: Shield,    module: "roles"             as const, action: "read"  as const },
  { key: "rbac",             label: "RBAC Matrix",         icon: Key,       module: "roles"             as const, action: "admin" as const },
  { key: "groups",           label: "Groups & Teams",      icon: Users,     module: "users"             as const, action: "read"  as const },
  { key: "sla_defs",         label: "SLA Definitions",     icon: Clock,     module: "admin"             as const, action: "read"  as const },
  { key: "biz_rules",        label: "Business Rules",      icon: Workflow,  module: "flows"             as const, action: "admin" as const },
  { key: "sys_props",        label: "System Properties",   icon: Database,  module: "system_properties" as const, action: "read"  as const },
  { key: "notifications",    label: "Notification Rules",  icon: Bell,      module: "admin"             as const, action: "read"  as const },
  { key: "scheduled_jobs",   label: "Scheduled Jobs",      icon: Clock,     module: "admin"             as const, action: "admin" as const },
  { key: "audit_log",        label: "Audit Log",           icon: FileText,  module: "audit_log"         as const, action: "read"  as const },
  { key: "integrations",     label: "Integration Hub",     icon: Server,    module: "admin"             as const, action: "admin" as const },
];

// All modules for RBAC matrix
const ALL_MODULES: Module[] = [
  "incidents","requests","changes","problems","work_orders","escalations","knowledge","catalog","approvals",
  "events","security","vulnerabilities","grc","risk","audit","hr","onboarding",
  "procurement","inventory","purchase_orders","financial","budget","projects","resources",
  "csm","sam","ham","cmdb","vendors","contracts","reports","analytics","flows","admin",
];

const MODULE_LABELS: Partial<Record<Module, string>> = {
  incidents: "Incidents", requests: "Requests", changes: "Changes", problems: "Problems",
  work_orders: "Work Orders", escalations: "Escalations", knowledge: "Knowledge", catalog: "Catalog",
  approvals: "Approvals", events: "Events", security: "Security", vulnerabilities: "Vulns",
  grc: "GRC", risk: "Risk", audit: "Audit", hr: "HR", onboarding: "Onboarding",
  procurement: "Procurement", inventory: "Inventory", purchase_orders: "POs",
  financial: "Finance", budget: "Budget", projects: "Projects", resources: "Resources",
  csm: "CSM", sam: "SAM", ham: "HAM", cmdb: "CMDB", vendors: "Vendors",
  contracts: "Contracts", reports: "Reports", analytics: "Analytics", flows: "Flows", admin: "Admin",
};

export default function AdminConsolePage() {
  const { can, isAdmin, currentUser } = useRBAC();
  const visibleTabs = ADMIN_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "overview");
  const [searchUsers, setSearchUsers] = useState("");
  const [selectedRole, setSelectedRole] = useState<SystemRole | null>(null);
  const [showSensitive, setShowSensitive] = useState(false);

  // @ts-ignore
  const slaQuery = trpc.admin.slaDefinitions.list.useQuery();
  // @ts-ignore
  const propsQuery = trpc.admin.systemProperties.list.useQuery();
  // @ts-ignore
  const nrQuery = trpc.admin.notificationRules.list.useQuery();
  // @ts-ignore
  const jobsQuery = trpc.admin.scheduledJobs.list.useQuery();
  const usersQuery = trpc.admin.users.list.useQuery();
  const auditOverviewQuery = trpc.admin.auditLog.list.useQuery({ page: 1, limit: 5 });

  const slaItems = slaQuery.data ?? [];
  const sysProps = propsQuery.data ?? [];
  const notifRules = nrQuery.data ?? [];
  const scheduledJobs = jobsQuery.data ?? [];

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);

  if (!can("admin", "read")) {
    return <AccessDenied module="Admin Console" />;
  }

  const allUsers = usersQuery.data ?? [];

  const filteredUsers = allUsers.filter((u) =>
    !searchUsers || u.name.toLowerCase().includes(searchUsers.toLowerCase()) || u.email.toLowerCase().includes(searchUsers.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Admin Console</h1>
          <span className="text-[11px] text-muted-foreground/70">System Administration · RBAC · Configuration</span>
          {isAdmin() && (
            <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded font-bold">ADMIN ACCESS</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground/70">Logged in as:</span>
          <span className="text-[11px] font-mono font-semibold text-foreground/80">{currentUser.username}</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-mono">{currentUser.roles[0]}</span>
        </div>
      </div>

      <div className="flex gap-0 overflow-hidden rounded-lg border border-border">
        {/* Left nav */}
        <div className="w-44 flex-shrink-0 bg-muted/30 border-r border-border">
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] text-left transition-colors
                  ${tab === t.key ? "bg-primary text-white font-medium" : "text-muted-foreground hover:bg-muted"}`}>
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 bg-card overflow-hidden">
          {/* OVERVIEW */}
          {tab === "overview" && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Total Users",      value: allUsers.length,                                       color: "text-foreground/80" },
                  { label: "Active Users",     value: allUsers.filter(u => u.status === "active").length,   color: "text-green-700" },
                  { label: "Roles Defined",    value: SYSTEM_ROLES_CATALOG.length,                          color: "text-blue-700" },
                  { label: "Inactive Users",   value: allUsers.filter(u => u.status !== "active").length,   color: "text-red-700" },
                ].map((k) => (
                  <div key={k.label} className="border border-border rounded p-3">
                    <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
                  </div>
                ))}
              </div>

              {allUsers.filter(u => u.status !== "active").length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-semibold text-yellow-700">Inactive Accounts</p>
                    <p className="text-[11px] text-yellow-600 mt-0.5">
                      {allUsers.filter(u => u.status !== "active").map(u => u.name).join(", ")} — review and archive if appropriate.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="border border-border rounded overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Quick Links
                  </div>
                  <div className="divide-y divide-border">
                    {[
                      { label: "Manage Users", desc: "Create, edit, deactivate, reset passwords", tab: "users" },
                      { label: "Role Assignments", desc: "Assign/revoke roles to users", tab: "roles" },
                      { label: "RBAC Permission Matrix", desc: "Full module × action matrix", tab: "rbac" },
                      { label: "SLA Definitions", desc: "Configure SLA targets per priority", tab: "sla_defs" },
                      { label: "Business Rules", desc: "Automated record processing logic", tab: "biz_rules" },
                      { label: "Audit Log", desc: "All system changes and user actions", tab: "audit_log" },
                    ].map((l) => (
                      <button key={l.tab} onClick={() => setTab(l.tab)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 text-left">
                        <div>
                          <div className="text-[12px] font-medium text-foreground">{l.label}</div>
                          <div className="text-[10px] text-muted-foreground/70">{l.desc}</div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border border-border rounded overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Recent Audit Activity
                  </div>
                  <div className="divide-y divide-border max-h-72 overflow-y-auto">
                    {auditOverviewQuery.isLoading ? (
                      <div className="px-3 py-4 text-[11px] text-muted-foreground/60 animate-pulse">Loading…</div>
                    ) : !auditOverviewQuery.data?.items?.length ? (
                      <div className="px-3 py-4 text-[11px] text-muted-foreground/60">No audit events yet.</div>
                    ) : auditOverviewQuery.data.items.map((e: any) => (
                      <div key={e.id} className="px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="status-badge text-blue-700 bg-blue-100">info</span>
                          <span className="text-[10px] text-muted-foreground/70">{new Date(e.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-[11px] text-foreground/80">
                          <span className="font-semibold">{e.userName ?? "System"}</span> — {e.action}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70">{e.resourceType}{e.resourceId ? ` · ${e.resourceId.slice(0,8)}…` : ""}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* USER MANAGEMENT */}
          {tab === "users" && (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-card border border-border rounded flex-1 max-w-sm">
                  <Search className="w-3 h-3 text-muted-foreground/70" />
                  <input value={searchUsers} onChange={(e) => setSearchUsers(e.target.value)}
                    placeholder="Search users..." className="text-[11px] outline-none flex-1 placeholder:text-muted-foreground/70" />
                </div>
                <button className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> New User
                </button>
                <button className="flex items-center gap-1 px-2 py-1.5 border border-border rounded text-[11px] text-muted-foreground hover:bg-muted/30">
                  <Download className="w-3 h-3" /> Export
                </button>
              </div>
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th className="w-4" />
                    <th>Name</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Roles</th>
                    <th>MFA</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const userRoles = [user.role, user.matrixRole].filter(Boolean) as string[];
                    const isActive = user.status === "active";
                    return (
                    <tr key={user.id} className={!isActive ? "opacity-50" : ""}>
                      <td className="p-0">
                        <div className={`priority-bar ${isActive ? "bg-green-500" : "bg-slate-400"}`} />
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-bold flex-shrink-0">
                            {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </span>
                          <span className="text-foreground font-medium">{user.name}</span>
                        </div>
                      </td>
                      <td className="font-mono text-[11px] text-muted-foreground">{user.email.split("@")[0]}</td>
                      <td className="text-[11px] text-muted-foreground">{user.email}</td>
                      <td className="text-muted-foreground text-[11px]">—</td>
                      <td>
                        <div className="flex flex-wrap gap-0.5">
                          {userRoles.map((r) => (
                            <span key={r} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${r === "admin" ? "bg-red-100 text-red-700 font-bold" : "bg-purple-100 text-purple-700"}`}>
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className="text-muted-foreground text-[11px]">—</span>
                      </td>
                      <td>
                        <span className={`status-badge capitalize ${isActive ? "text-green-700 bg-green-100" : "text-muted-foreground bg-muted"}`}>
                          {user.status ?? "Active"}
                        </span>
                      </td>
                      <td className="text-[11px] text-muted-foreground/70">
                        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Never"}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <button className="p-1 text-muted-foreground/70 hover:text-primary"><Edit2 className="w-3 h-3" /></button>
                          <button className="p-1 text-muted-foreground/70 hover:text-red-600"><Lock className="w-3 h-3" /></button>
                          <button className="p-1 text-muted-foreground/70 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ROLES */}
          {tab === "roles" && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-foreground/80">{SYSTEM_ROLES_CATALOG.length} system roles defined</span>
                <button className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> Create Custom Role
                </button>
              </div>
              {["Platform","ITSM","Security","GRC","HR","Procurement","Finance","PMO","Asset","Analytics"].map((cat) => {
                const catRoles = SYSTEM_ROLES_CATALOG.filter((r) => r.category === cat);
                if (catRoles.length === 0) return null;
                return (
                  <div key={cat} className="border border-border rounded overflow-hidden">
                    <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {cat}
                    </div>
                    <table className="ent-table w-full">
                      <thead>
                        <tr>
                          <th>Role ID</th>
                          <th>Display Name</th>
                          <th>Description</th>
                          <th className="text-center">Assigned Users</th>
                          <th className="text-center">Elevated</th>
                          <th>Permissions</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catRoles.map((r) => {
                          const assignedCount = allUsers.filter((u) => u.role === r.role || u.matrixRole === r.role).length;
                          const permCount = Object.values(
                            ROLE_PERMISSIONS[r.role as keyof typeof ROLE_PERMISSIONS] ?? {},
                          ).flat().length;
                          return (
                            <tr key={r.role} onClick={() => setSelectedRole(r.role)} className="cursor-pointer hover:bg-blue-50/30">
                              <td className="font-mono text-[11px] text-primary">{r.role}</td>
                              <td className="font-medium text-foreground">{r.displayName}</td>
                              <td className="max-w-xs text-muted-foreground text-[11px]">{r.description}</td>
                              <td className="text-center">
                                <span className={`font-bold text-[12px] ${assignedCount === 0 ? "text-muted-foreground/70" : "text-foreground/80"}`}>{assignedCount}</span>
                              </td>
                              <td className="text-center">
                                {r.isElevated
                                  ? <span className="status-badge text-red-700 bg-red-100">Elevated</span>
                                  : <span className="text-slate-300 text-[11px]">—</span>}
                              </td>
                              <td>
                                <span className="text-[11px] text-muted-foreground">{r.role === "admin" ? "All (bypass)" : `${permCount} grants`}</span>
                              </td>
                              <td>
                                <button className="text-[11px] text-primary hover:underline">Edit</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {/* RBAC MATRIX */}
          {tab === "rbac" && (
            <div className="p-4 overflow-x-auto">
              <p className="text-[11px] text-muted-foreground mb-3">
                Full permission matrix — rows = roles, columns = modules. Actions: <span className="font-mono bg-muted px-1">R</span>ead, <span className="font-mono bg-muted px-1">W</span>rite, <span className="font-mono bg-muted px-1">D</span>elete, <span className="font-mono bg-muted px-1">A</span>dmin, <span className="font-mono bg-muted px-1">P</span>rove, <span className="font-mono bg-muted px-1">S</span>ign (Assign), <span className="font-mono bg-muted px-1">C</span>lose
              </p>
              <div className="overflow-x-auto">
                <table className="text-[10px] border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left px-2 py-1.5 bg-muted border border-slate-200 sticky left-0 z-10 text-[11px] font-semibold min-w-36">Role</th>
                      {ALL_MODULES.map((mod) => (
                        <th key={mod} className="px-1 py-1.5 bg-muted border border-slate-200 text-center min-w-12 font-semibold text-[9px] rotate-0">
                          <div className="writing-mode-vertical" style={{writingMode:"vertical-rl", transform:"rotate(180deg)", maxHeight: 60}}>
                            {MODULE_LABELS[mod] ?? mod}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SYSTEM_ROLES_CATALOG.map((roleDef) => {
                      const perms =
                        ROLE_PERMISSIONS[roleDef.role as keyof typeof ROLE_PERMISSIONS] ?? {};
                      const isAdminRole = roleDef.role === "admin";
                      return (
                        <tr key={roleDef.role} className="hover:bg-blue-50/30">
                          <td className="px-2 py-1 border border-slate-200 bg-card sticky left-0 z-10">
                            <span className={`font-mono text-[10px] ${isAdminRole ? "text-red-700 font-bold" : "text-foreground/80"}`}>
                              {roleDef.role}
                            </span>
                          </td>
                          {ALL_MODULES.map((mod) => {
                            const actions = isAdminRole ? ["read","write","delete","admin","approve","assign","close"] : (perms[mod] ?? []);
                            const hasAny = actions.length > 0;
                            const actionStr = (actions as RbacAction[]).map((a: RbacAction) => {
                              const map: Record<string,string> = { read:"R", write:"W", delete:"D", admin:"A", approve:"P", assign:"S", close:"C" };
                              return map[a] ?? String(a).charAt(0).toUpperCase();
                            }).join("");
                            return (
                              <td key={mod} className={`border border-slate-200 text-center py-1 px-0.5 text-[9px] font-mono font-bold
                                ${isAdminRole ? "bg-red-50 text-red-600" : hasAny ? "bg-green-50 text-green-700" : "bg-card text-slate-200"}`}>
                                {hasAny ? (isAdminRole ? "ALL" : actionStr) : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GROUPS */}
          {tab === "groups" && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-semibold text-foreground/80">Groups &amp; Teams</span>
                <button className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> New Group
                </button>
              </div>
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Users className="w-8 h-8 opacity-30" />
                <p className="text-[13px]">No groups configured</p>
                <p className="text-[11px] text-muted-foreground/60">Create assignment groups, escalation groups and approval groups.</p>
              </div>
            </div>
          )}

          {/* SLA DEFINITIONS */}
          {tab === "sla_defs" && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-semibold text-foreground/80">{slaItems.length} SLA definitions</span>
                <button className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> New SLA
                </button>
              </div>
              {slaQuery.isLoading ? (
                <div className="space-y-2 animate-pulse">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded" />)}
                </div>
              ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>SLA Name</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Metric</th>
                    <th>Target</th>
                    <th>Schedule</th>
                    <th>Biz Hrs Only</th>
                    <th>Pause on Hold</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {slaItems.map((s: any) => (
                    <tr key={s.id}>
                      <td className="font-mono text-[11px] text-primary">{s.id}</td>
                      <td className="font-medium text-foreground">{s.name}</td>
                      <td><span className="status-badge text-muted-foreground bg-muted">{s.category}</span></td>
                      <td><span className={`status-badge ${s.priority === "P1" ? "text-red-700 bg-red-100" : s.priority === "P2" ? "text-orange-700 bg-orange-100" : "text-muted-foreground bg-muted"}`}>{s.priority}</span></td>
                      <td className="text-muted-foreground">{s.metric}</td>
                      <td><span className="font-mono text-[12px] font-bold text-foreground">{s.target}</span></td>
                      <td className="text-muted-foreground text-[11px]">{s.schedule}</td>
                      <td className="text-center">{s.businessHoursOnly ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" /> : <XCircle className="w-3.5 h-3.5 text-slate-300 inline" />}</td>
                      <td className="text-center">{s.pauseOnHold ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" /> : <XCircle className="w-3.5 h-3.5 text-slate-300 inline" />}</td>
                      <td><span className={`status-badge ${s.active ? "text-green-700 bg-green-100" : "text-muted-foreground bg-muted"}`}>{s.active ? "Active" : "Inactive"}</span></td>
                      <td><button className="text-[11px] text-primary hover:underline">Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          )}

          {/* BUSINESS RULES */}
          {tab === "biz_rules" && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-semibold text-foreground/80">Business Rules</span>
                <button className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> New Business Rule
                </button>
              </div>
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Workflow className="w-8 h-8 opacity-30" />
                <p className="text-[13px]">No business rules configured</p>
                <p className="text-[11px] text-muted-foreground/60">Create automation rules to trigger actions on record changes.</p>
              </div>
            </div>
          )}

          {/* SYSTEM PROPERTIES */}
          {tab === "sys_props" && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-semibold text-foreground/80">{sysProps.length} system properties</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowSensitive((s) => !s)} className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground">
                    {showSensitive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showSensitive ? "Hide" : "Show"} sensitive values
                  </button>
                </div>
              </div>
              {propsQuery.isLoading ? (
                <div className="space-y-2 animate-pulse">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded" />)}
                </div>
              ) : (
              <>
              {["Platform","Security","Auth","Email","ITSM","Discovery","Procurement","Analytics"].map((cat) => {
                const props = (sysProps as any[]).filter((p) => p.category === cat);
                if (props.length === 0) return null;
                return (
                  <div key={cat} className="mb-3 border border-border rounded overflow-hidden">
                    <div className="px-3 py-1.5 bg-muted/30 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{cat}</div>
                    <table className="ent-table w-full">
                      <thead><tr><th>Property Key</th><th>Value</th><th>Type</th><th>Description</th><th>Actions</th></tr></thead>
                      <tbody>
                        {props.map((p: any) => (
                          <tr key={p.key}>
                            <td><code className="text-[11px] text-primary font-mono">{p.key}</code></td>
                            <td>
                              {p.sensitive && !showSensitive
                                ? <span className="font-mono text-[11px] text-muted-foreground/70">••••••••</span>
                                : <code className={`text-[11px] font-mono font-semibold ${p.type === "boolean" ? (p.value === "true" ? "text-green-700" : "text-red-600") : "text-foreground/80"}`}>{p.value}</code>
                              }
                              {p.sensitive && <Lock className="w-3 h-3 text-muted-foreground/70 inline ml-1" />}
                            </td>
                            <td><span className="status-badge text-muted-foreground bg-muted font-mono">{p.type}</span></td>
                            <td className="text-muted-foreground text-[11px]">{p.description}</td>
                            <td><button className="text-[11px] text-primary hover:underline">Edit</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              </>
              )}
            </div>
          )}

          {/* NOTIFICATIONS */}
          {tab === "notifications" && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-semibold text-foreground/80">{notifRules.length} notification rules</span>
                <button className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> New Rule
                </button>
              </div>
              {nrQuery.isLoading ? (
                <div className="space-y-2 animate-pulse">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded" />)}
                </div>
              ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Rule Name</th>
                    <th>Trigger Event</th>
                    <th>Channel</th>
                    <th>Recipients</th>
                    <th>Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(notifRules as any[]).map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-[11px] text-primary">{r.id}</td>
                      <td className="font-medium text-foreground">{r.name}</td>
                      <td><span className="status-badge text-blue-700 bg-blue-100">{r.event}</span></td>
                      <td className="text-muted-foreground text-[11px]">{r.channel}</td>
                      <td className="text-muted-foreground text-[11px]">{r.recipients}</td>
                      <td>
                        <span className={`status-badge ${r.active ? "text-green-700 bg-green-100" : "text-muted-foreground bg-muted"}`}>
                          {r.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td><div className="flex gap-1.5"><button className="text-[11px] text-primary hover:underline">Edit</button><button className="text-[11px] text-muted-foreground/70 hover:text-orange-600">Toggle</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          )}

          {/* SCHEDULED JOBS */}
          {tab === "scheduled_jobs" && (
            <div className="p-4">
              {jobsQuery.isLoading ? (
                <div className="space-y-2 animate-pulse">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded" />)}
                </div>
              ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th className="w-4" />
                    <th>Job ID</th>
                    <th>Job Name</th>
                    <th>Schedule</th>
                    <th>Last Run</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Next Run</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(scheduledJobs as any[]).map((j) => (
                    <tr key={j.id}>
                      <td className="p-0"><div className={`priority-bar ${j.status === "success" ? "bg-green-500" : j.status === "partial" ? "bg-yellow-500" : "bg-red-500"}`} /></td>
                      <td className="font-mono text-[11px] text-primary">{j.id}</td>
                      <td className="font-medium text-foreground">{j.name}</td>
                      <td className="text-muted-foreground text-[11px]">{j.schedule}</td>
                      <td className="text-muted-foreground text-[11px]">{j.lastRun}</td>
                      <td className="font-mono text-[11px] text-muted-foreground">{j.duration}</td>
                      <td>
                        <span className={`status-badge ${j.status === "success" ? "text-green-700 bg-green-100" : j.status === "partial" ? "text-yellow-700 bg-yellow-100" : "text-red-700 bg-red-100"}`}>
                          {j.status === "success" ? "✓ Success" : j.status === "partial" ? "⚠ Partial" : "✗ Failed"}
                        </span>
                      </td>
                      <td className="text-muted-foreground text-[11px]">{j.nextRun}</td>
                      <td>
                        <div className="flex gap-1.5">
                          <button className="text-[11px] text-primary hover:underline">Run Now</button>
                          <button className="text-[11px] text-muted-foreground/70 hover:underline">Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          )}

          {/* AUDIT LOG */}
          {tab === "audit_log" && <AuditLogTab />}

          {/* INTEGRATIONS */}
          {tab === "integrations" && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-semibold text-foreground/80">Integration Hub</span>
                <button className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> Add Integration
                </button>
              </div>
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Server className="w-8 h-8 opacity-30" />
                <p className="text-[13px]">No integrations configured</p>
                <p className="text-[11px] text-muted-foreground/60">Connect external tools: PagerDuty, Jira, Splunk, Azure AD, Tenable and more.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditLogTab() {
  const [page, setPage] = useState(1);
  const [resourceType, setResourceType] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = trpc.admin.auditLog.list.useQuery(
    { page, limit: 50, resourceType: resourceType || undefined },
  );

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[12px] font-semibold text-foreground/80">System Audit Log</span>
        <span className="text-[11px] text-muted-foreground/70">— All write operations and mutations</span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={resourceType}
            onChange={(e) => { setResourceType(e.target.value); setPage(1); }}
            className="text-[11px] border border-border rounded px-2 py-1 bg-background text-foreground"
          >
            <option value="">All resource types</option>
            {["auth","tickets","assets","changes","security","grc","financial","hr","procurement","contracts","projects","crm","legal","devops","knowledge","catalog"].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading audit log…</div>
      ) : !data?.items.length ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No audit events yet. Mutations will appear here.</div>
      ) : (
        <>
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource Type</th>
                <th>Resource ID</th>
                <th>IP Address</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((e: typeof data.items[number]) => (
                <>
                  <tr key={e.id} className="cursor-pointer hover:bg-muted/20" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                    <td className="font-mono text-[11px] text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="text-foreground/80 font-medium">{e.userName ?? "—"}</td>
                    <td className="text-muted-foreground text-[11px] font-mono">{e.action}</td>
                    <td><span className="status-badge text-muted-foreground bg-muted">{e.resourceType}</span></td>
                    <td className="font-mono text-[11px] text-muted-foreground">{e.resourceId ? e.resourceId.slice(0, 8) + "…" : "—"}</td>
                    <td className="font-mono text-[11px] text-muted-foreground">{e.ipAddress ?? "—"}</td>
                    <td className="text-[11px] text-primary">{expandedId === e.id ? "▲" : "▼"}</td>
                  </tr>
                  {expandedId === e.id && (
                    <tr key={`${e.id}-detail`}>
                      <td colSpan={7} className="bg-muted/10 px-4 py-3">
                        <div className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
                          {e.changes ? JSON.stringify(e.changes, null, 2) : "No change data captured."}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-muted-foreground">Page {data.page} of {data.pages} ({data.total} events)</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="text-[11px] px-2 py-1 border border-border rounded disabled:opacity-40 hover:bg-muted/30">← Prev</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= (data.pages ?? 1)} className="text-[11px] px-2 py-1 border border-border rounded disabled:opacity-40 hover:bg-muted/30">Next →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
