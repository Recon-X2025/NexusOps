"use client";

import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import {
  Settings, Users, Shield, Key, Bell, Database, Clock, FileText,
  Plus, Search, Edit2, Trash2, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, Download, Eye, EyeOff, ToggleLeft, ToggleRight,
  Activity, Server, Workflow, BookOpen, ChevronRight, Lock,
  GitBranch,
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
  { key: "assignment_rules", label: "Assignment Rules",    icon: GitBranch, module: "admin"             as const, action: "read"  as const },
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

  // ── User management modal state ──────────────────────────────────────────
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "admin" | "member" | "viewer">("member");
  const [inviteMatrixRole, setInviteMatrixRole] = useState("");
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  const [editUser, setEditUser] = useState<{ id: string; name: string; role: string; matrixRole: string | null; status: string } | null>(null);
  const [editRole, setEditRole] = useState<"owner" | "admin" | "member" | "viewer">("member");
  const [editMatrixRole, setEditMatrixRole] = useState("");
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<{ id: string; name: string } | null>(null);

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
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [toggledRules, setToggledRules] = useState<Set<string>>(new Set());

  const inviteUserMutation = trpc.auth.inviteUser.useMutation({
    onSuccess: (res) => {
      setInviteResult(res.inviteUrl);
      usersQuery.refetch();
      toast.success(`Invite sent to ${inviteEmail}`);
    },
    onError: (e: any) => toast.error(e.message || "Failed to send invite"),
  });
  const updateUserMutation = trpc.admin.users.update.useMutation({
    onSuccess: () => { usersQuery.refetch(); setEditUser(null); toast.success("User role updated"); },
    onError: (e: any) => toast.error(e.message || "Failed to update user"),
  });
  const deactivateUserMutation = trpc.admin.users.update.useMutation({
    onSuccess: (_r, vars) => {
      usersQuery.refetch();
      toast.success(`User ${vars.status === "active" ? "activated" : "suspended"}`);
    },
    onError: (e: any) => toast.error(e.message || "Failed to update user status"),
  });
  const deleteUserMutation = trpc.auth.deleteUser.useMutation({
    onSuccess: () => { usersQuery.refetch(); setConfirmDeleteUser(null); toast.success("User deleted"); },
    onError: (e: any) => toast.error(e.message || "Failed to delete user"),
  });

  // @ts-ignore
  const triggerJobMutation = trpc.admin.scheduledJobs.trigger.useMutation({
    onSuccess: (_res: any, vars: any) => {
      setRunningJobId(null);
      toast.success(`Job triggered successfully. Audit log updated.`);
      auditOverviewQuery.refetch();
      jobsQuery.refetch();
    },
    onError: (e: any) => { setRunningJobId(null); toast.error(e?.message ?? "Something went wrong"); },
  });

  function triggerJobNow(jobId: string, jobName: string) {
    setRunningJobId(jobId);
    triggerJobMutation.mutate({ jobId });
  }

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

  const filteredUsers = allUsers.filter((u: any) =>
    !searchUsers || u.name.toLowerCase().includes(searchUsers.toLowerCase()) || u.email.toLowerCase().includes(searchUsers.toLowerCase()),
  );

  return (
    <>
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
          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-mono">{currentUser.roles.filter(r => r !== "requester")[0] ?? "requester"}</span>
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
                    ) : auditOverviewQuery.data?.items.map((e: any) => (
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
                <button
                  onClick={() => { setInviteEmail(""); setInviteRole("member"); setInviteMatrixRole(""); setInviteResult(null); setShowInviteModal(true); }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
                >
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
                  {filteredUsers.map((user: any) => {
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
                            {user.name.split(" ").map((n: any) => n[0]).join("").slice(0, 2)}
                          </span>
                          <span className="text-foreground font-medium">{user.name}</span>
                        </div>
                      </td>
                      <td className="font-mono text-[11px] text-muted-foreground">{(user.email ?? "").split("@")[0]}</td>
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
                          <button
                            onClick={() => { setEditUser({ id: user.id, name: user.name, role: user.role, matrixRole: user.matrixRole ?? null, status: user.status ?? "active" }); setEditRole(user.role as any); setEditMatrixRole(user.matrixRole ?? ""); }}
                            className="p-1 text-muted-foreground/70 hover:text-primary"
                            title="Edit role"
                          ><Edit2 className="w-3 h-3" /></button>
                          <button
                            onClick={() => deactivateUserMutation.mutate({ userId: user.id, status: user.status === "active" ? "disabled" : "active" })}
                            className={`p-1 ${user.status === "active" ? "text-muted-foreground/70 hover:text-orange-600" : "text-orange-600 hover:text-muted-foreground/70"}`}
                            title={user.status === "active" ? "Suspend user" : "Activate user"}
                            disabled={user.id === currentUser.id}
                          ><Lock className="w-3 h-3" /></button>
                          <button
                            onClick={() => setConfirmDeleteUser({ id: user.id, name: user.name })}
                            className="p-1 text-muted-foreground/70 hover:text-red-600"
                            title="Delete user"
                            disabled={user.id === currentUser.id}
                          ><Trash2 className="w-3 h-3" /></button>
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
                          const assignedCount = allUsers.filter((u: any) => u.role === r.role || u.matrixRole === r.role).length;
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
                      <td><div className="flex gap-1.5">
                        <button
                          onClick={() => toast.info(`Editing rule: "${r.name}". Notification rule editing via API is coming in the next release.`)}
                          className="text-[11px] text-primary hover:underline"
                        >Edit</button>
                        <button
                          onClick={() => {
                            setToggledRules((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                              return next;
                            });
                            toast.success(`Rule "${r.name}" ${toggledRules.has(r.id) ? "activated" : "deactivated"}`);
                          }}
                          className="text-[11px] text-muted-foreground/70 hover:text-orange-600"
                        >Toggle</button>
                      </div></td>
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
                          <button
                            onClick={() => triggerJobNow(j.id, j.name)}
                            disabled={runningJobId === j.id}
                            className="text-[11px] text-primary hover:underline disabled:opacity-50"
                          >
                            {runningJobId === j.id ? "Running…" : "Run Now"}
                          </button>
                          <button
                            onClick={() => toast.info(`Job "${j.name}" — schedule: ${j.schedule}. Edit job schedules via infrastructure config (cron.yaml).`, { duration: 6000 })}
                            className="text-[11px] text-muted-foreground/70 hover:underline"
                          >Edit</button>
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
                <button
                  onClick={() => toast.message("Add Integration", {
                    description: "Connect external tools to NexusOps. Supported integrations: PagerDuty, Jira, Splunk, Azure AD, Tenable, Slack, MS Teams, ServiceNow, AWS, GitHub.",
                    action: { label: "Contact Support", onClick: () => window.open("mailto:support@nexusops.io?subject=Integration Setup", "_blank") },
                    cancel: { label: "Close", onClick: () => {} },
                    duration: 8000,
                  })}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
                >
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

          {/* ASSIGNMENT RULES */}
          {tab === "assignment_rules" && <AssignmentRulesTab />}
        </div>
      </div>
    </div>

      {/* ── Invite User Modal ─────────────────────────────────────── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-lg shadow-xl w-[460px] max-w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Invite New User</h3>
              <button onClick={() => { setShowInviteModal(false); setInviteResult(null); }} className="text-muted-foreground hover:text-foreground">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            {!inviteResult ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Email *</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@company.com"
                    className="w-full border border-border rounded px-2 py-1.5 text-[12px] outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Membership Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background outline-none focus:border-primary"
                  >
                    <option value="member">Member — standard access</option>
                    <option value="viewer">Viewer — read-only</option>
                    <option value="admin">Admin — full platform admin</option>
                    <option value="owner">Owner — full owner rights</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    System Role <span className="text-muted-foreground/60">(fine-grained RBAC)</span>
                  </label>
                  <select
                    value={inviteMatrixRole}
                    onChange={(e) => setInviteMatrixRole(e.target.value)}
                    className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background outline-none focus:border-primary"
                  >
                    <option value="">— None (uses membership role only) —</option>
                    {SYSTEM_ROLES_CATALOG.map((r) => (
                      <option key={r.role} value={r.role}>{r.displayName} — {r.description.slice(0, 60)}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    The system role controls which modules this user can access (e.g. itil, security_analyst, hr_manager).
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button onClick={() => setShowInviteModal(false)} className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-muted/30">Cancel</button>
                  <button
                    disabled={!inviteEmail.trim() || inviteUserMutation.isPending}
                    onClick={async () => {
                      const invite = await inviteUserMutation.mutateAsync({ email: inviteEmail.trim(), role: inviteRole, matrixRole: inviteMatrixRole || null });
                      setInviteResult(invite.inviteUrl);
                    }}
                    className="px-3 py-1.5 text-[11px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-40"
                  >
                    {inviteUserMutation.isPending ? "Sending…" : "Send Invite"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="text-[12px] font-medium">Invite created for {inviteEmail}</span>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Invite URL (share with user)</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] bg-muted/40 border border-border rounded px-2 py-1.5 break-all">{inviteResult}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(inviteResult); toast.success("Copied!"); }}
                      className="px-2 py-1.5 border border-border rounded text-[11px] hover:bg-muted/30"
                    >Copy</button>
                  </div>
                </div>
                {inviteMatrixRole && (
                  <p className="text-[11px] text-muted-foreground bg-blue-50 border border-blue-200 rounded px-3 py-2">
                    After the user accepts the invite, use <strong>Edit Role</strong> to assign the <code>{inviteMatrixRole}</code> system role.
                  </p>
                )}
                <div className="flex justify-end">
                  <button onClick={() => { setShowInviteModal(false); setInviteResult(null); }} className="px-3 py-1.5 text-[11px] bg-primary text-white rounded hover:bg-primary/90">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit User Role Modal ───────────────────────────────────── */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-lg shadow-xl w-[460px] max-w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Edit User Role — {editUser.name}</h3>
              <button onClick={() => setEditUser(null)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Membership Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background outline-none focus:border-primary"
                >
                  <option value="member">Member — standard access</option>
                  <option value="viewer">Viewer — read-only</option>
                  <option value="admin">Admin — full platform admin</option>
                  <option value="owner">Owner — full owner rights</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                  System Role <span className="text-muted-foreground/60">(fine-grained RBAC — controls module access)</span>
                </label>
                <select
                  value={editMatrixRole}
                  onChange={(e) => setEditMatrixRole(e.target.value)}
                  className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background outline-none focus:border-primary"
                >
                  <option value="">— None (uses membership role only) —</option>
                  {SYSTEM_ROLES_CATALOG.map((r) => (
                    <option key={r.role} value={r.role}>{r.displayName} — {r.description.slice(0, 55)}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  Setting a system role grants this user access to the modules and actions defined in the RBAC matrix for that role.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setEditUser(null)} className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-muted/30">Cancel</button>
                <button
                  disabled={updateUserMutation.isPending}
                  onClick={() => updateUserMutation.mutate({ userId: editUser.id, role: editRole, matrixRole: editMatrixRole || null })}
                  className="px-3 py-1.5 text-[11px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-40"
                >
                  {updateUserMutation.isPending ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Modal ───────────────────────────────────── */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-lg shadow-xl w-[380px] max-w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <h3 className="text-sm font-semibold">Delete User</h3>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Are you sure you want to permanently delete <strong>{confirmDeleteUser.name}</strong>?
              This action cannot be undone and will remove all their sessions and access.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmDeleteUser(null)} className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-muted/30">Cancel</button>
              <button
                disabled={deleteUserMutation.isPending}
                onClick={() => deleteUserMutation.mutate({ userId: confirmDeleteUser.id })}
                className="px-3 py-1.5 text-[11px] bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40"
              >
                {deleteUserMutation.isPending ? "Deleting…" : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
      ) : !data?.items?.length ? (
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
              {(data?.items ?? []).map((e: typeof data.items[number]) => (
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

// ── Assignment Rules Tab ──────────────────────────────────────────────────────
const ENTITY_TYPE_LABELS: Record<string, string> = {
  ticket: "Ticket",
  work_order: "Work Order",
  hr_case: "HR Case",
};

const WO_TYPES = [
  "corrective", "preventive", "installation", "inspection",
  "repair", "upgrade", "decommission",
];

const HR_CASE_TYPES = [
  "onboarding", "offboarding", "leave", "policy",
  "benefits", "workplace", "equipment",
];

function AssignmentRulesTab() {
  const utils = trpc.useUtils();
  // @ts-ignore
  const rulesQuery = trpc.assignmentRules.list.useQuery({});
  // @ts-ignore
  const teamsQuery = trpc.assignmentRules.teamsWithMembers.useQuery();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    entityType: "ticket",
    matchValue: "",
    teamId: "",
    algorithm: "load_based",
    capacityThreshold: 20,
    isActive: true,
    sortOrder: 0,
  });

  // @ts-ignore
  const createMutation = trpc.assignmentRules.create.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.assignmentRules.list.invalidate();
      setShowForm(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  // @ts-ignore
  const updateMutation = trpc.assignmentRules.update.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.assignmentRules.list.invalidate();
      setShowForm(false);
      setEditId(null);
      resetForm();
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  // @ts-ignore
  const deleteMutation = trpc.assignmentRules.delete.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.assignmentRules.list.invalidate();
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  // @ts-ignore
  const toggleMutation = trpc.assignmentRules.update.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.assignmentRules.list.invalidate();
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  function resetForm() {
    setForm({ entityType: "ticket", matchValue: "", teamId: "", algorithm: "load_based", capacityThreshold: 20, isActive: true, sortOrder: 0 });
  }

  function startEdit(rule: any) {
    setEditId(rule.id);
    setForm({
      entityType: rule.entityType,
      matchValue: rule.matchValue ?? "",
      teamId: rule.teamId,
      algorithm: rule.algorithm,
      capacityThreshold: rule.capacityThreshold,
      isActive: rule.isActive,
      sortOrder: rule.sortOrder,
    });
    setShowForm(true);
  }

  function handleSubmit() {
    const payload = {
      ...form,
      matchValue: form.matchValue.trim() === "" ? null : form.matchValue.trim(),
    };
    if (editId) {
      // @ts-ignore
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      // @ts-ignore
      createMutation.mutate(payload);
    }
  }

  const rules = (rulesQuery.data ?? []) as any[];
  const teams = (teamsQuery.data ?? []) as any[];

  const matchValueOptions = form.entityType === "work_order"
    ? WO_TYPES
    : form.entityType === "hr_case"
      ? HR_CASE_TYPES
      : [];

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[12px] font-semibold text-foreground/80">Assignment Rules</span>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            Configure how tickets, work orders, and HR cases are automatically routed to teams and agents on creation.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setEditId(null); setShowForm(true); }}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
        >
          <Plus className="w-3 h-3" /> New Rule
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded p-3 flex items-start gap-2">
        <GitBranch className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-blue-700 leading-relaxed">
          <strong>How it works:</strong> When a new item is created without an explicit assignee, the platform finds the matching rule and picks
          the best agent in the target team using the configured algorithm. If every agent is at or above the capacity threshold, the item is
          parked in the team queue. The Workflow Engine&apos;s <code className="font-mono bg-blue-100 px-1 rounded">ACTION_ASSIGN</code> node
          uses these same rules for deferred/conditional routing.
        </div>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="border border-primary/30 rounded bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-foreground/80">{editId ? "Edit Rule" : "New Assignment Rule"}</span>
            <button onClick={() => { setShowForm(false); setEditId(null); resetForm(); }} className="text-muted-foreground/60 hover:text-foreground text-[18px] leading-none">×</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Entity Type</label>
              <select
                value={form.entityType}
                onChange={(e) => setForm({ ...form, entityType: e.target.value, matchValue: "" })}
                className="w-full px-2 py-1.5 text-[12px] border border-border rounded bg-card text-foreground outline-none"
              >
                <option value="ticket">Ticket</option>
                <option value="work_order">Work Order</option>
                <option value="hr_case">HR Case</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Match On
                <span className="text-muted-foreground/50 font-normal ml-1">(leave empty = catch-all fallback)</span>
              </label>
              {form.entityType === "ticket" ? (
                <input
                  value={form.matchValue}
                  onChange={(e) => setForm({ ...form, matchValue: e.target.value })}
                  placeholder="Ticket category UUID (or blank for catch-all)"
                  className="w-full px-2 py-1.5 text-[12px] border border-border rounded bg-card text-foreground outline-none"
                />
              ) : (
                <select
                  value={form.matchValue}
                  onChange={(e) => setForm({ ...form, matchValue: e.target.value })}
                  className="w-full px-2 py-1.5 text-[12px] border border-border rounded bg-card text-foreground outline-none"
                >
                  <option value="">— Catch-all fallback —</option>
                  {matchValueOptions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Target Team</label>
              <select
                value={form.teamId}
                onChange={(e) => setForm({ ...form, teamId: e.target.value })}
                className="w-full px-2 py-1.5 text-[12px] border border-border rounded bg-card text-foreground outline-none"
              >
                <option value="">Select team…</option>
                {teams.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.memberCount} members)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Algorithm</label>
              <select
                value={form.algorithm}
                onChange={(e) => setForm({ ...form, algorithm: e.target.value })}
                className="w-full px-2 py-1.5 text-[12px] border border-border rounded bg-card text-foreground outline-none"
              >
                <option value="load_based">Load-Based (fewest open items)</option>
                <option value="round_robin">Round-Robin (cycle by last assigned)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                Capacity Threshold
                <span className="text-muted-foreground/50 font-normal ml-1">(park in queue if all agents ≥ this)</span>
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={form.capacityThreshold}
                onChange={(e) => setForm({ ...form, capacityThreshold: parseInt(e.target.value) || 20 })}
                className="w-full px-2 py-1.5 text-[12px] border border-border rounded bg-card text-foreground outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Sort Order</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
                className="w-full px-2 py-1.5 text-[12px] border border-border rounded bg-card text-foreground outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-2 text-[12px] text-foreground/80 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="w-3.5 h-3.5"
              />
              Active
            </label>
            <div className="flex-1" />
            <button
              onClick={() => { setShowForm(false); setEditId(null); resetForm(); }}
              className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!form.teamId || createMutation.isPending || updateMutation.isPending}
              className="px-3 py-1.5 text-[11px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {editId ? "Save Changes" : "Create Rule"}
            </button>
          </div>
        </div>
      )}

      {/* Rules table */}
      {rulesQuery.isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-[12px]">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <GitBranch className="w-8 h-8 opacity-25" />
          <p className="text-[13px]">No assignment rules configured</p>
          <p className="text-[11px] text-muted-foreground/60">
            Without rules, all work items require manual assignment. Create a rule to enable auto-routing.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Entity</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Match On</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Team</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Algorithm</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Capacity</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.map((rule: any) => (
                <tr key={rule.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">
                      {ENTITY_TYPE_LABELS[rule.entityType] ?? rule.entityType}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                    {rule.matchValue ?? <span className="italic text-muted-foreground/50">catch-all</span>}
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground/80">{rule.teamName}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {rule.algorithm === "round_robin" ? "Round-Robin" : "Load-Based"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{rule.capacityThreshold}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })}
                      className="flex items-center gap-1"
                      title={rule.isActive ? "Click to disable" : "Click to enable"}
                    >
                      {rule.isActive
                        ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-600" /><span className="text-green-700 text-[11px]">Active</span></>
                        : <><XCircle className="w-3.5 h-3.5 text-muted-foreground/50" /><span className="text-muted-foreground/50 text-[11px]">Inactive</span></>
                      }
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => startEdit(rule)}
                        className="text-[11px] text-primary hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate({ id: rule.id })}
                        className="text-[11px] text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
