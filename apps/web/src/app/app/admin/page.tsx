"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import {
  Settings, Users, Shield, Key, Bell, Database, Clock, FileText,
  Plus, Search, Edit2, Trash2, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, Download, Eye, EyeOff, ToggleLeft, ToggleRight,
  Activity, Server, Workflow, BookOpen, ChevronRight, Lock,
  GitBranch, ShoppingCart, Building2, Calendar, CircleDollarSign, PauseCircle, Landmark,
} from "lucide-react";
import {
  SYSTEM_ROLES_CATALOG, type SystemRole,
  ROLE_PERMISSIONS, type Module, type RbacAction,
} from "@/lib/rbac";
import { useRBAC, PermissionGate, AccessDenied } from "@/lib/rbac-context";

const ADMIN_TABS = [
  { key: "overview",         label: "Overview",            icon: Settings,  module: "admin"             as const, action: "read"  as const },
  { key: "users",            label: "User Management",     icon: Users,     module: "users"             as const, action: "read"  as const },
  { key: "roles",            label: "Role Library", icon: Shield,    module: "roles"             as const, action: "read"  as const },
  { key: "rbac",             label: "RBAC Matrix",         icon: Key,       module: "roles"             as const, action: "admin" as const },
  { key: "groups",           label: "Groups & Teams",      icon: Users,     module: "users"             as const, action: "read"  as const },
  { key: "sla_defs",         label: "SLA Definitions",     icon: Clock,     module: "admin"             as const, action: "read"  as const },
  { key: "sla_pause_reasons", label: "SLA pause reasons",  icon: PauseCircle, module: "admin"             as const, action: "admin" as const },
  { key: "biz_rules",        label: "Business Rules",      icon: Workflow,  module: "flows"             as const, action: "admin" as const },
  { key: "procurement_policy", label: "Procurement Policy", icon: ShoppingCart, module: "admin"          as const, action: "admin" as const },
  { key: "security_policy", label: "Security policy", icon: Lock, module: "admin"          as const, action: "admin" as const },
  { key: "crm_deal_thresholds", label: "CRM deal thresholds", icon: CircleDollarSign, module: "admin"      as const, action: "admin" as const },
  { key: "accounting_periods", label: "Accounting periods", icon: Calendar, module: "admin"             as const, action: "admin" as const },
  { key: "legal_entities", label: "Legal entities", icon: Landmark, module: "admin"             as const, action: "admin" as const },
  { key: "people_workplace", label: "People & Workplace", icon: Building2, module: "admin"             as const, action: "admin" as const },
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
  const { can, isAdmin, currentUser, mergeTrpcQueryOpts } = useRBAC();
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

  const [editUser, setEditUser] = useState<{ id: string; name: string; role: string; matrixRole: string | null; status: string; mfaEnrolled?: boolean } | null>(null);
  const [editRole, setEditRole] = useState<"owner" | "admin" | "member" | "viewer">("member");
  const [editMatrixRole, setEditMatrixRole] = useState("");
  const [editMfaEnrolled, setEditMfaEnrolled] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<{ id: string; name: string } | null>(null);

  // @ts-ignore
  const slaQuery = trpc.admin.slaDefinitions.list.useQuery(undefined, mergeTrpcQueryOpts("admin.slaDefinitions.list", undefined));
  // @ts-ignore
  const propsQuery = trpc.admin.systemProperties.list.useQuery(undefined, mergeTrpcQueryOpts("admin.systemProperties.list", undefined));
  // @ts-ignore
  const nrQuery = trpc.admin.notificationRules.list.useQuery(undefined, mergeTrpcQueryOpts("admin.notificationRules.list", undefined));
  // @ts-ignore
  const jobsQuery = trpc.admin.scheduledJobs.list.useQuery(undefined, mergeTrpcQueryOpts("admin.scheduledJobs.list", undefined));
  const usersQuery = trpc.admin.users.list.useQuery(undefined, mergeTrpcQueryOpts("admin.users.list", undefined));
  const auditOverviewQuery = trpc.admin.auditLog.list.useQuery({ page: 1, limit: 5 }, mergeTrpcQueryOpts("admin.auditLog.list", undefined));
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
      const st = (vars as { status?: string })?.status;
      toast.success(`User ${st === "active" ? "activated" : "suspended"}`);
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

  // ── SLA form state ───────────────────────────────────────────────────────
  const [showSlaForm, setShowSlaForm] = useState(false);
  const [editSlaId, setEditSlaId] = useState<string | null>(null);
  const [slaForm, setSlaForm] = useState({ name: "", priority: "P2", responseMinutes: 60, resolveMinutes: 480 });
  // @ts-ignore
  const slaUpsertMutation = trpc.admin.slaDefinitions.upsert.useMutation({
    onSuccess: () => { slaQuery.refetch(); setShowSlaForm(false); setEditSlaId(null); setSlaForm({ name: "", priority: "P2", responseMinutes: 60, resolveMinutes: 480 }); toast.success(editSlaId ? "SLA updated" : "SLA created"); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  // ── System property inline edit state ───────────────────────────────────
  const [editPropKey, setEditPropKey] = useState<string | null>(null);
  const [editPropValue, setEditPropValue] = useState("");
  // @ts-ignore
  const propUpdateMutation = trpc.admin.systemProperties.update.useMutation({
    onSuccess: () => { propsQuery.refetch(); setEditPropKey(null); toast.success("Property updated"); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  // ── Notification rule form state ─────────────────────────────────────────
  const [showNrForm, setShowNrForm] = useState(false);
  const [nrForm, setNrForm] = useState({ name: "", event: "ticket_created", channel: "email" as "email" | "slack" | "teams" | "in_app", recipients: "", conditions: "", active: true });
  // @ts-ignore
  const nrCreateMutation = trpc.admin.notificationRules.create.useMutation({
    onSuccess: () => { nrQuery.refetch(); setShowNrForm(false); setNrForm({ name: "", event: "ticket_created", channel: "email", recipients: "", conditions: "", active: true }); toast.success("Notification rule created"); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

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

  const allUsers = (usersQuery.data ?? []) as Array<{ status?: string; name?: string; email?: string; role?: string; matrixRole?: string | null }>;

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
                  { label: "Active Users",     value: allUsers.filter(u => u.status === "active").length,   color: "text-green-700" },
                  { label: "Role Library",     value: SYSTEM_ROLES_CATALOG.length,                          color: "text-blue-700" },
                  { label: "Pending Invites",  value: allUsers.filter(u => u.status === "invited").length,  color: "text-orange-600" },
                  { label: "Suspended",        value: allUsers.filter(u => u.status === "disabled").length, color: "text-red-700" },
                ].map((k) => (
                  <div key={k.label} className="border border-border rounded p-3">
                    <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
                  </div>
                ))}
              </div>

              {allUsers.filter(u => u.status === "disabled").length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-semibold text-red-700">Suspended Accounts</p>
                    <p className="text-[11px] text-red-600 mt-0.5">
                      {allUsers.filter(u => u.status === "disabled").map(u => u.name).join(", ")} — these users cannot access the platform.
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
                    {(
                      [
                        { label: "Manage Users", desc: "Create, edit, deactivate, reset passwords", tab: "users" },
                        { label: "Role Assignments", desc: "Assign/revoke roles to users", tab: "roles" },
                        { label: "RBAC Permission Matrix", desc: "Full module × action matrix", tab: "rbac" },
                        { label: "Custom Fields", desc: "Org field definitions for tickets, assets, and more", href: "/app/admin/custom-fields" },
                        { label: "SLA Definitions", desc: "Configure SLA targets per priority", tab: "sla_defs" },
                        { label: "Business Rules", desc: "Automated record processing logic", tab: "biz_rules" },
                        { label: "Audit Log", desc: "All system changes and user actions", tab: "audit_log" },
                      ] as const
                    ).map((l) => (
                      "href" in l ? (
                        <Link key={l.href} href={l.href} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 text-left">
                          <div>
                            <div className="text-[12px] font-medium text-foreground">{l.label}</div>
                            <div className="text-[10px] text-muted-foreground/70">{l.desc}</div>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70" />
                        </Link>
                      ) : (
                        <button key={l.tab} type="button" onClick={() => setTab(l.tab)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 text-left">
                          <div>
                            <div className="text-[12px] font-medium text-foreground">{l.label}</div>
                            <div className="text-[10px] text-muted-foreground/70">{l.desc}</div>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70" />
                        </button>
                      )
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
                <button onClick={() => { const csv = ["Name,Email,Role,Matrix Role,MFA enrolled,Status", ...(allUsers as any[]).map((u: any) => `${u.name},${u.email},${u.role},${u.matrixRole ?? ""},${u.mfaEnrolled === true ? "yes" : "no"},${u.status ?? "active"}`)].join("\n"); const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv); a.download = "coheronconnect-users.csv"; a.click(); toast.success("Users exported to CSV"); }} className="flex items-center gap-1 px-2 py-1.5 border border-border rounded text-[11px] text-muted-foreground hover:bg-muted/30">
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
                        <span className={`text-[11px] ${user.mfaEnrolled === true ? "text-green-700 font-medium" : "text-muted-foreground"}`}>
                          {user.mfaEnrolled === true ? "Yes" : "No"}
                        </span>
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
                            onClick={() => {
                              setEditUser({
                                id: user.id,
                                name: user.name,
                                role: user.role,
                                matrixRole: user.matrixRole ?? null,
                                status: user.status ?? "active",
                                mfaEnrolled: user.mfaEnrolled === true,
                              });
                              setEditRole(user.role as any);
                              setEditMatrixRole(user.matrixRole ?? "");
                              setEditMfaEnrolled(user.mfaEnrolled === true);
                            }}
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
                <span className="text-[12px] font-semibold text-foreground/80">{SYSTEM_ROLES_CATALOG.length} roles available in library</span>
                <button onClick={() => toast.info("Custom role creation is coming in a future release. For now, assign one of the 23 built-in system roles to users via the Users tab → Edit Role.", { duration: 6000 })} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
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
                                <button onClick={(e) => { e.stopPropagation(); toast.info(`Role "${r.displayName}" has ${r.role === "admin" ? "all permissions (bypass)" : `${permCount} permission grants`}. System roles have fixed permissions defined in the RBAC matrix. To assign this role to a user, use the Users tab → Edit Role.`, { duration: 6000 }); }} className="text-[11px] text-primary hover:underline">Edit</button>
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
                <button onClick={() => toast.info("Group management is coming in a future release. Groups will allow you to configure assignment groups, escalation chains and approval groups.", { duration: 5000 })} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
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
          {tab === "sla_pause_reasons" && <SlaPauseReasonsTab />}
          {tab === "sla_defs" && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-semibold text-foreground/80">{slaItems.length} SLA definitions</span>
                <button onClick={() => { setEditSlaId(null); setSlaForm({ name: "", priority: "P2", responseMinutes: 60, resolveMinutes: 480 }); setShowSlaForm(true); }} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> New SLA
                </button>
              </div>
              {showSlaForm && (
                <div className="mb-3 border border-primary/30 rounded bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-foreground">{editSlaId ? "Edit SLA Definition" : "New SLA Definition"}</span>
                    <button onClick={() => { setShowSlaForm(false); setEditSlaId(null); }} className="text-muted-foreground/60 hover:text-foreground text-[18px] leading-none">×</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-[11px] text-muted-foreground mb-1 block">SLA Name *</label>
                      <input value={slaForm.name} onChange={(e) => setSlaForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-2 py-1.5 text-[11px] border border-border rounded bg-background outline-none focus:border-primary" placeholder="e.g. P1 Incident Response" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground mb-1 block">Priority</label>
                      <select value={slaForm.priority} onChange={(e) => setSlaForm((f) => ({ ...f, priority: e.target.value }))} className="w-full px-2 py-1.5 text-[11px] border border-border rounded bg-background outline-none focus:border-primary">
                        {["P1","P2","P3","P4"].map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground mb-1 block">Response Target (minutes)</label>
                      <input type="number" min={1} value={slaForm.responseMinutes} onChange={(e) => setSlaForm((f) => ({ ...f, responseMinutes: Number(e.target.value) }))} className="w-full px-2 py-1.5 text-[11px] border border-border rounded bg-background outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground mb-1 block">Resolution Target (minutes)</label>
                      <input type="number" min={1} value={slaForm.resolveMinutes} onChange={(e) => setSlaForm((f) => ({ ...f, resolveMinutes: Number(e.target.value) }))} className="w-full px-2 py-1.5 text-[11px] border border-border rounded bg-background outline-none focus:border-primary" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => { setShowSlaForm(false); setEditSlaId(null); }} className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-muted/30">Cancel</button>
                    <button disabled={!slaForm.name.trim() || slaUpsertMutation.isPending} onClick={() => slaUpsertMutation.mutate({ ...(editSlaId ? { id: editSlaId } : {}), name: slaForm.name.trim(), priority: slaForm.priority, responseMinutes: slaForm.responseMinutes, resolveMinutes: slaForm.resolveMinutes })} className="px-3 py-1.5 text-[11px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60">
                      {slaUpsertMutation.isPending ? "Saving…" : editSlaId ? "Update SLA" : "Create SLA"}
                    </button>
                  </div>
                </div>
              )}
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
                      <td><button onClick={() => { setEditSlaId(s.id); setSlaForm({ name: s.name, priority: s.priority ?? "P2", responseMinutes: s.responseMinutes ?? 60, resolveMinutes: s.resolveMinutes ?? 480 }); setShowSlaForm(true); }} className="text-[11px] text-primary hover:underline">Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          )}

          {/* BUSINESS RULES */}
          {tab === "biz_rules" && <BusinessRulesTab />}

          {tab === "procurement_policy" && <ProcurementPolicyTab />}
          {tab === "security_policy" && <SecurityPolicyTab />}
          {tab === "crm_deal_thresholds" && <CrmDealThresholdsTab />}
          {tab === "accounting_periods" && <AccountingPeriodsTab />}
          {tab === "legal_entities" && <LegalEntitiesTab />}

          {tab === "people_workplace" && <PeopleWorkplacePolicyTab />}

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
                              {editPropKey === p.key ? (
                                <div className="flex items-center gap-1">
                                  <input autoFocus value={editPropValue} onChange={(e) => setEditPropValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") propUpdateMutation.mutate({ key: p.key, value: editPropValue }); if (e.key === "Escape") setEditPropKey(null); }} className="px-1.5 py-0.5 text-[11px] border border-primary rounded font-mono w-40 outline-none" />
                                  <button onClick={() => propUpdateMutation.mutate({ key: p.key, value: editPropValue })} disabled={propUpdateMutation.isPending} className="text-[10px] px-1.5 py-0.5 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60">Save</button>
                                  <button onClick={() => setEditPropKey(null)} className="text-[10px] px-1.5 py-0.5 border border-border rounded hover:bg-muted/30">✕</button>
                                </div>
                              ) : (
                                <>
                                  {p.sensitive && !showSensitive
                                    ? <span className="font-mono text-[11px] text-muted-foreground/70">••••••••</span>
                                    : <code className={`text-[11px] font-mono font-semibold ${p.type === "boolean" ? (p.value === "true" ? "text-green-700" : "text-red-600") : "text-foreground/80"}`}>{p.value}</code>
                                  }
                                  {p.sensitive && <Lock className="w-3 h-3 text-muted-foreground/70 inline ml-1" />}
                                </>
                              )}
                            </td>
                            <td><span className="status-badge text-muted-foreground bg-muted font-mono">{p.type}</span></td>
                            <td className="text-muted-foreground text-[11px]">{p.description}</td>
                            <td><button onClick={() => { setEditPropKey(p.key); setEditPropValue(p.value); }} className="text-[11px] text-primary hover:underline">Edit</button></td>
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
                <button onClick={() => { setNrForm({ name: "", event: "ticket_created", channel: "email", recipients: "", conditions: "", active: true }); setShowNrForm(true); }} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> New Rule
                </button>
              </div>
              {showNrForm && (
                <div className="mb-3 border border-primary/30 rounded bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-foreground">New Notification Rule</span>
                    <button onClick={() => setShowNrForm(false)} className="text-muted-foreground/60 hover:text-foreground text-[18px] leading-none">×</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-[11px] text-muted-foreground mb-1 block">Rule Name *</label>
                      <input value={nrForm.name} onChange={(e) => setNrForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-2 py-1.5 text-[11px] border border-border rounded bg-background outline-none focus:border-primary" placeholder="e.g. Notify team on P1 ticket" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground mb-1 block">Trigger Event *</label>
                      <select value={nrForm.event} onChange={(e) => setNrForm((f) => ({ ...f, event: e.target.value }))} className="w-full px-2 py-1.5 text-[11px] border border-border rounded bg-background outline-none focus:border-primary">
                        {["ticket_created","ticket_updated","ticket_assigned","ticket_escalated","sla_breached","change_approved","change_rejected","approval_requested","approval_decided","work_order_created","hr_case_opened"].map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground mb-1 block">Channel *</label>
                      <select value={nrForm.channel} onChange={(e) => setNrForm((f) => ({ ...f, channel: e.target.value as any }))} className="w-full px-2 py-1.5 text-[11px] border border-border rounded bg-background outline-none focus:border-primary">
                        {["email","slack","teams","in_app"].map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[11px] text-muted-foreground mb-1 block">Recipients * <span className="text-muted-foreground/60">(comma-separated emails, role names or team names)</span></label>
                      <input value={nrForm.recipients} onChange={(e) => setNrForm((f) => ({ ...f, recipients: e.target.value }))} className="w-full px-2 py-1.5 text-[11px] border border-border rounded bg-background outline-none focus:border-primary" placeholder="e.g. itil, john@example.com, support-team" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[11px] text-muted-foreground mb-1 block">Conditions <span className="text-muted-foreground/60">(optional — leave blank to apply to all)</span></label>
                      <input value={nrForm.conditions} onChange={(e) => setNrForm((f) => ({ ...f, conditions: e.target.value }))} className="w-full px-2 py-1.5 text-[11px] border border-border rounded bg-background outline-none focus:border-primary" placeholder="e.g. priority=P1, category=Network" />
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="nr-active" checked={nrForm.active} onChange={(e) => setNrForm((f) => ({ ...f, active: e.target.checked }))} className="w-3.5 h-3.5" />
                      <label htmlFor="nr-active" className="text-[11px] text-muted-foreground">Active</label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setShowNrForm(false)} className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-muted/30">Cancel</button>
                    <button disabled={!nrForm.name.trim() || !nrForm.recipients.trim() || nrCreateMutation.isPending} onClick={() => nrCreateMutation.mutate({ name: nrForm.name.trim(), event: nrForm.event, channel: nrForm.channel, recipients: nrForm.recipients.trim(), conditions: nrForm.conditions.trim() || undefined, active: nrForm.active })} className="px-3 py-1.5 text-[11px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60">
                      {nrCreateMutation.isPending ? "Creating…" : "Create Rule"}
                    </button>
                  </div>
                </div>
              )}
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
                    description: "Connect external tools to CoheronConnect. Supported integrations: PagerDuty, Jira, Splunk, Azure AD, Tenable, Slack, MS Teams, ServiceNow, AWS, GitHub.",
                    action: { label: "Contact Support", onClick: () => window.open("mailto:support@coheron.com?subject=Integration Setup", "_blank") },
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
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editMfaEnrolled}
                  onChange={(e) => setEditMfaEnrolled(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-[11px] text-foreground">
                  MFA enrolled (admin attestation — required when org security policy lists this user&apos;s matrix role under MFA)
                </span>
              </label>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setEditUser(null)} className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-muted/30">Cancel</button>
                <button
                  disabled={updateUserMutation.isPending}
                  onClick={() =>
                    updateUserMutation.mutate({
                      userId: editUser.id,
                      role: editRole,
                      matrixRole: editMatrixRole || null,
                      mfaEnrolled: editMfaEnrolled,
                    })
                  }
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
  const { mergeTrpcQueryOpts } = useRBAC();
  const [page, setPage] = useState(1);
  const [resourceType, setResourceType] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = trpc.admin.auditLog.list.useQuery({ page, limit: 50, resourceType: resourceType || undefined }, mergeTrpcQueryOpts("admin.auditLog.list", undefined));

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
                <Fragment key={e.id}>
                  <tr className="cursor-pointer hover:bg-muted/20" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
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
                </Fragment>
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

/** Org legal entities for invoice / PO tagging (US-CRM-008 / US-FIN-008). */
function LegalEntitiesTab() {
  const { mergeTrpcQueryOpts, isAdmin } = useRBAC();
  const utils = trpc.useUtils();
  const q = trpc.financial.listLegalEntities.useQuery(undefined, mergeTrpcQueryOpts("financial.listLegalEntities", undefined));
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const createLe = trpc.financial.createLegalEntity.useMutation({
    onSuccess: () => {
      void utils.financial.listLegalEntities.invalidate();
      setCode("");
      setName("");
      toast.success("Legal entity added");
    },
    onError: (e) => toast.error(e.message ?? "Create failed"),
  });

  if (!isAdmin()) {
    return (
      <div className="p-4 text-[12px] text-muted-foreground">
        Only organization <strong>owner</strong> or <strong>admin</strong> can manage legal entities.
      </div>
    );
  }

  const rows = q.data ?? [];

  return (
    <div className="p-4 max-w-2xl space-y-4">
      <div>
        <h3 className="text-[12px] font-semibold text-foreground">Legal entities</h3>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          Short <code className="text-[10px]">code</code> + name per company / branch. Invoices (AP/AR) and purchase orders can reference an entity — use on{" "}
          <Link href="/app/financial" className="text-primary hover:underline">Financial</Link>{" "}
          or <Link href="/app/procurement" className="text-primary hover:underline">Procurement</Link> when creating documents.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2 border border-border rounded p-3 bg-muted/20">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Code</label>
          <input
            type="text"
            className="border border-border rounded px-2 py-1.5 text-[12px] bg-background w-32 font-mono"
            placeholder="IN-HO"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={32}
          />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Legal name</label>
          <input
            type="text"
            className="border border-border rounded px-2 py-1.5 text-[12px] bg-background w-full"
            placeholder="CoheronConnect Global Inc"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </div>
        <button
          type="button"
          disabled={createLe.isPending || !code.trim() || !name.trim()}
          onClick={() => createLe.mutate({ code: code.trim(), name: name.trim() })}
          className="text-[11px] px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {createLe.isPending ? "Adding…" : "Add entity"}
        </button>
      </div>
      {q.isLoading ? (
        <p className="text-[12px] text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">No legal entities yet.</p>
      ) : (
        <table className="ent-table w-full">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: { id: string; code: string; name: string }) => (
              <tr key={r.id}>
                <td className="font-mono text-[11px]">{r.code}</td>
                <td className="text-[12px]">{r.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Closed months (`YYYY-MM`) — `financial.markPaid` is blocked for invoices in these periods (org.settings.financial.closedPeriods). */
function AccountingPeriodsTab() {
  const { mergeTrpcQueryOpts, isAdmin } = useRBAC();
  const utils = trpc.useUtils();
  const q = trpc.financial.periodClose.get.useQuery(undefined, mergeTrpcQueryOpts("financial.periodClose.get", undefined));
  const [draft, setDraft] = useState<string[]>([]);
  const [newPeriod, setNewPeriod] = useState("");

  useEffect(() => {
    if (q.data?.closedPeriods) setDraft([...q.data.closedPeriods]);
  }, [q.data?.closedPeriods]);

  const save = trpc.financial.periodClose.setClosedPeriods.useMutation({
    onSuccess: () => {
      void utils.financial.periodClose.get.invalidate();
      toast.success("Accounting periods saved. Mark-paid is blocked for AP in these months.");
    },
    onError: (e) => toast.error(e.message ?? "Save failed"),
  });

  if (!isAdmin()) {
    return (
      <div className="p-4 text-[12px] text-muted-foreground">
        Only organization <strong>owner</strong> or <strong>admin</strong> can change closed accounting periods.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg space-y-4">
      <div>
        <h3 className="text-[12px] font-semibold text-foreground">Closed accounting periods</h3>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          List months as <code className="text-[10px]">YYYY-MM</code> (UTC). Payable invoices dated in a closed month cannot be marked paid until the period is reopened.
        </p>
      </div>
      <div className="rounded border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
        Before closing a month here, run the{" "}
        <Link href="/app/financial" className="text-primary hover:underline font-medium text-foreground/90">
          Finance → Period close
        </Link>{" "}
        checklist for that month.
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
        {draft.length === 0 && (
          <span className="text-[11px] text-muted-foreground italic">No periods closed — all months open for mark-paid.</span>
        )}
        {draft.map((p) => (
          <span
            key={p}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-muted border border-border"
          >
            {p}
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive"
              title="Remove"
              onClick={() => setDraft((d) => d.filter((x) => x !== p))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Add period</label>
          <input
            type="text"
            placeholder="2026-03"
            className="border border-border rounded px-2 py-1.5 text-[12px] bg-background w-28 font-mono"
            value={newPeriod}
            onChange={(e) => setNewPeriod(e.target.value)}
            disabled={q.isLoading}
          />
        </div>
        <button
          type="button"
          className="text-[11px] px-2 py-1.5 rounded border border-border hover:bg-muted/40"
          disabled={q.isLoading}
          onClick={() => {
            const t = newPeriod.trim();
            if (!/^\d{4}-\d{2}$/.test(t)) {
              toast.error("Use YYYY-MM (e.g. 2026-03).");
              return;
            }
            if (draft.includes(t)) {
              toast.error("Period already listed.");
              return;
            }
            setDraft((d) => [...d, t].sort());
            setNewPeriod("");
          }}
        >
          Add
        </button>
      </div>
      <button
        type="button"
        disabled={save.isPending || q.isLoading}
        onClick={() => save.mutate({ periods: draft })}
        className="px-3 py-1.5 text-[11px] rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save closed periods"}
      </button>
    </div>
  );
}

function SlaPauseReasonsTab() {
  const { mergeTrpcQueryOpts, isAdmin } = useRBAC();
  const utils = trpc.useUtils();
  const q = trpc.tickets.slaPauseReasonsCatalog.get.useQuery(
    undefined,
    mergeTrpcQueryOpts("tickets.slaPauseReasonsCatalog.get", undefined),
  );
  const [rows, setRows] = useState<{ code: string; label: string }[]>([]);

  useEffect(() => {
    if (!q.data) return;
    setRows(q.data.reasons.length > 0 ? q.data.reasons.map((r: { code: string; label: string }) => ({ ...r })) : []);
  }, [q.data]);

  const save = trpc.tickets.slaPauseReasonsCatalog.update.useMutation({
    onSuccess: () => {
      void utils.tickets.slaPauseReasonsCatalog.get.invalidate();
      toast.success("SLA pause reasons saved. Agents must pick one when moving a ticket to on hold.");
    },
    onError: (e) => toast.error(e.message ?? "Save failed"),
  });

  if (!isAdmin()) {
    return (
      <div className="p-4 text-[12px] text-muted-foreground">
        Only organization <strong>owner</strong> or <strong>admin</strong> can edit SLA pause reasons.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg space-y-4">
      <div>
        <h3 className="text-[12px] font-semibold text-foreground">SLA pause reason catalog (US-ITSM-001)</h3>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          When the list is <strong>non-empty</strong>, moving a ticket to a status in the <strong>pending</strong> category requires choosing one of these
          codes (audited on the ticket). Leave the list empty to allow on-hold transitions without a catalog reason.
        </p>
      </div>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2 items-start">
            <input
              type="text"
              placeholder="code"
              className="flex-1 min-w-0 border border-border rounded px-2 py-1.5 text-[11px] font-mono bg-background"
              value={row.code}
              onChange={(e) => {
                const v = e.target.value;
                setRows((prev) => prev.map((r, j) => (j === i ? { ...r, code: v } : r)));
              }}
              disabled={q.isLoading || save.isPending}
              maxLength={64}
            />
            <input
              type="text"
              placeholder="Label shown to agents"
              className="flex-[2] min-w-0 border border-border rounded px-2 py-1.5 text-[11px] bg-background"
              value={row.label}
              onChange={(e) => {
                const v = e.target.value;
                setRows((prev) => prev.map((r, j) => (j === i ? { ...r, label: v } : r)));
              }}
              disabled={q.isLoading || save.isPending}
              maxLength={200}
            />
            <button
              type="button"
              className="px-2 py-1.5 text-[10px] rounded border border-border text-muted-foreground hover:bg-muted/50"
              disabled={q.isLoading || save.isPending}
              onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-[11px] text-primary hover:underline"
          disabled={q.isLoading || save.isPending}
          onClick={() => setRows((prev) => [...prev, { code: "", label: "" }])}
        >
          + Add reason
        </button>
      </div>
      <button
        type="button"
        disabled={save.isPending || q.isLoading}
        onClick={() => {
          const cleaned = rows
            .map((r) => ({ code: r.code.trim(), label: r.label.trim() }))
            .filter((r) => r.code.length > 0 && r.label.length > 0);
          const codes = cleaned.map((r) => r.code);
          if (new Set(codes).size !== codes.length) {
            toast.error("Each reason code must be unique.");
            return;
          }
          save.mutate({ reasons: cleaned });
        }}
        className="px-3 py-1.5 text-[11px] rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save catalog"}
      </button>
    </div>
  );
}

function CrmDealThresholdsTab() {
  const { mergeTrpcQueryOpts, isAdmin } = useRBAC();
  const utils = trpc.useUtils();
  const q = trpc.crm.dealApprovalThresholds.get.useQuery(
    undefined,
    mergeTrpcQueryOpts("crm.dealApprovalThresholds.get", undefined),
  );
  const [currency, setCurrency] = useState("INR");
  const [noBelow, setNoBelow] = useState("");
  const [execAbove, setExecAbove] = useState("");

  useEffect(() => {
    if (q.data) {
      setCurrency(q.data.dealApprovalCurrency);
      setNoBelow(String(q.data.dealCloseNoApprovalBelow));
      setExecAbove(String(q.data.dealCloseExecutiveAbove));
    }
  }, [q.data]);

  const save = trpc.crm.dealApprovalThresholds.update.useMutation({
    onSuccess: () => {
      utils.crm.dealApprovalThresholds.get.invalidate();
      toast.success("CRM deal thresholds saved. Closed-won gating uses these values immediately.");
    },
    onError: (e) => toast.error(e.message ?? "Save failed"),
  });

  if (!isAdmin()) {
    return (
      <div className="p-4 text-[12px] text-muted-foreground">
        Only organization <strong>owner</strong> or <strong>admin</strong> can change CRM deal approval thresholds.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-md space-y-4">
      <div>
        <h3 className="text-[12px] font-semibold text-foreground">Deal close approval tiers (US-CRM-003)</h3>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          Amounts compare to deal <code className="text-[10px]">value</code>. Below the first threshold, reps may mark{" "}
          <strong>Closed Won</strong> without a recorded approval. Between the two thresholds requires manager approval; at or above the second requires executive approval. Changes are stored in organization settings and audited.
        </p>
      </div>
      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-foreground">Currency code (ISO 4217)</label>
        <input
          type="text"
          maxLength={3}
          className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background uppercase"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          disabled={q.isLoading}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-foreground">No approval below (deal value &lt; this)</label>
        <input
          type="number"
          min={0}
          className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
          value={noBelow}
          onChange={(e) => setNoBelow(e.target.value)}
          disabled={q.isLoading}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-foreground">Executive approval at or above</label>
        <input
          type="number"
          min={1}
          className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
          value={execAbove}
          onChange={(e) => setExecAbove(e.target.value)}
          disabled={q.isLoading}
        />
        <span className="text-[10px] text-muted-foreground">
          Values &ge; this require <strong>executive</strong> recorded approval before <strong>Closed Won</strong>. Between the two thresholds → <strong>manager</strong>.
        </span>
      </div>
      <button
        type="button"
        disabled={save.isPending || q.isLoading || currency.length !== 3}
        onClick={() => {
          const low = Number(noBelow);
          const high = Number(execAbove);
          if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
            toast.error("Executive threshold must be greater than the no-approval ceiling.");
            return;
          }
          save.mutate({
            dealApprovalCurrency: currency,
            dealCloseNoApprovalBelow: low,
            dealCloseExecutiveAbove: high,
          });
        }}
        className="px-3 py-1.5 text-[11px] rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save thresholds"}
      </button>
    </div>
  );
}

function parseMatrixRolesCsv(s: string): string[] {
  const parts = s.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);
  return [...new Set(parts)];
}

function SecurityPolicyTab() {
  const { mergeTrpcQueryOpts, isAdmin } = useRBAC();
  const utils = trpc.useUtils();
  const q = trpc.admin.securityPolicy.get.useQuery(
    undefined,
    mergeTrpcQueryOpts("admin.securityPolicy.get", undefined),
  );
  const [stepUpCsv, setStepUpCsv] = useState("");
  const [mfaCsv, setMfaCsv] = useState("");

  useEffect(() => {
    if (q.data) {
      setStepUpCsv(q.data.requireStepUpForMatrixRoles.join(", "));
      setMfaCsv(q.data.requireMfaForMatrixRoles.join(", "));
    }
  }, [q.data]);

  const save = trpc.admin.securityPolicy.update.useMutation({
    onSuccess: () => {
      utils.admin.securityPolicy.get.invalidate();
      toast.success("Security policy saved. Step-up and MFA gates use these lists on the next API call.");
    },
    onError: (e) => toast.error(e.message ?? "Save failed"),
  });

  if (!isAdmin()) {
    return (
      <div className="p-4 text-[12px] text-muted-foreground">
        Only organization <strong>owner</strong> or <strong>admin</strong> can edit security policy.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg space-y-5">
      <div>
        <h3 className="text-[12px] font-semibold text-foreground">Privileged authentication (US-SEC-001)</h3>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          Matrix roles are the fine-grained RBAC labels (e.g. <code className="text-[10px]">finance_manager</code>).{" "}
          <strong>Step-up</strong> requires a recent password check via <code className="text-[10px]">auth.verifyStepUp</code>.{" "}
          <strong>MFA</strong> requires the user&apos;s <strong>MFA enrolled</strong> flag (set per user in User Management).
        </p>
      </div>
      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-foreground">Require step-up for matrix roles (comma-separated)</label>
        <input
          type="text"
          className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background font-mono"
          value={stepUpCsv}
          onChange={(e) => setStepUpCsv(e.target.value)}
          placeholder="e.g. finance_manager"
          disabled={q.isLoading}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-foreground">
          Require MFA enrollment for matrix roles (comma-separated)
        </label>
        <input
          type="text"
          className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background font-mono"
          value={mfaCsv}
          onChange={(e) => setMfaCsv(e.target.value)}
          placeholder="e.g. finance_manager"
          disabled={q.isLoading}
        />
        <p className="text-[10px] text-muted-foreground">
          Applies to <code className="text-[10px]">financial.approveInvoice</code> and <code className="text-[10px]">financial.markPaid</code>.
        </p>
      </div>
      <button
        type="button"
        disabled={save.isPending || q.isLoading}
        onClick={() =>
          save.mutate({
            requireStepUpForMatrixRoles: parseMatrixRolesCsv(stepUpCsv),
            requireMfaForMatrixRoles: parseMatrixRolesCsv(mfaCsv),
          })
        }
        className="px-3 py-1.5 text-[11px] rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save security policy"}
      </button>
    </div>
  );
}

function ProcurementPolicyTab() {
  const { mergeTrpcQueryOpts, isAdmin } = useRBAC();
  const utils = trpc.useUtils();
  const q = trpc.procurement.approvalRules.get.useQuery(undefined, mergeTrpcQueryOpts("procurement.approvalRules.get", undefined));
  const [autoBelow, setAutoBelow] = useState("");
  const [deptMax, setDeptMax] = useState("");
  const [matchTol, setMatchTol] = useState("");
  const [dupPolicy, setDupPolicy] = useState<"off" | "warn" | "block">("warn");

  useEffect(() => {
    if (q.data) {
      setAutoBelow(String(q.data.prAutoApproveBelow));
      setDeptMax(String(q.data.prDeptHeadMax));
      setMatchTol(String(q.data.poMatchToleranceAbs ?? 1));
      setDupPolicy(q.data.duplicatePayableInvoicePolicy ?? "warn");
    }
  }, [q.data]);

  const save = trpc.procurement.approvalRules.update.useMutation({
    onSuccess: () => {
      utils.procurement.approvalRules.get.invalidate();
      toast.success("Procurement policy saved. PR rules apply immediately; AP duplicate / match tolerance apply on next API calls.");
    },
    onError: (e) => toast.error(e.message ?? "Save failed"),
  });

  if (!isAdmin()) {
    return (
      <div className="p-4 text-[12px] text-muted-foreground">
        Only organization <strong>owner</strong> or <strong>admin</strong> can change procurement approval thresholds.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-md space-y-6">
      <div>
        <h3 className="text-[12px] font-semibold text-foreground">Purchase requisition approval tiers</h3>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          Totals are computed from PR lines (quantity × unit price). Changes are stored in organization settings and audited.
        </p>
        {q.data?.currencyNote && (
          <p className="text-[10px] text-muted-foreground/80 mt-1">{q.data.currencyNote}</p>
        )}
      </div>
      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-foreground">Auto-approve below (exclusive max)</label>
        <input
          type="number"
          min={0}
          className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
          value={autoBelow}
          onChange={(e) => setAutoBelow(e.target.value)}
          disabled={q.isLoading}
        />
        <span className="text-[10px] text-muted-foreground">PRs with total &lt; this amount are approved automatically.</span>
      </div>
      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-foreground">Department head band — upper bound (exclusive)</label>
        <input
          type="number"
          min={1}
          className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
          value={deptMax}
          onChange={(e) => setDeptMax(e.target.value)}
          disabled={q.isLoading}
        />
        <span className="text-[10px] text-muted-foreground">
          From auto threshold up to &lt; this value → <code className="text-[10px]">dept_head</code>. At or above →{" "}
          <code className="text-[10px]">vp_finance</code>.
        </span>
      </div>

      <div className="border-t border-border pt-4 space-y-2">
        <h3 className="text-[12px] font-semibold text-foreground">AP controls (US-CRM-004 / US-FIN-004)</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong>PO vs invoice match</strong> uses absolute tolerance in the same currency as totals (see <code className="text-[10px]">procurement.invoices.matchToOrder</code>).
          <strong className="font-medium text-foreground"> Duplicate payables</strong> are same vendor + invoice number on the payable flow; <em>warn</em> allows create and returns a flag to the client.
        </p>
        <label className="block text-[11px] font-medium text-foreground">PO / invoice match tolerance (absolute)</label>
        <input
          type="number"
          min={0}
          step="0.01"
          className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
          value={matchTol}
          onChange={(e) => setMatchTol(e.target.value)}
          disabled={q.isLoading}
        />
        <label className="block text-[11px] font-medium text-foreground mt-2">Duplicate payable invoice policy</label>
        <select
          className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
          value={dupPolicy}
          onChange={(e) => setDupPolicy(e.target.value as "off" | "warn" | "block")}
          disabled={q.isLoading}
        >
          <option value="off">Off — no duplicate check</option>
          <option value="warn">Warn — allow; Finance UI can show warning</option>
          <option value="block">Block — reject duplicate vendor + invoice #</option>
        </select>
      </div>

      <button
        type="button"
        disabled={save.isPending || q.isLoading}
        onClick={() => {
          const a = Number(autoBelow);
          const d = Number(deptMax);
          const tol = Number(matchTol);
          if (!Number.isFinite(a) || !Number.isFinite(d) || d <= a) {
            toast.error("Department head upper bound must be greater than the auto-approve ceiling.");
            return;
          }
          if (!Number.isFinite(tol) || tol < 0) {
            toast.error("Match tolerance must be a non-negative number.");
            return;
          }
          save.mutate({
            prAutoApproveBelow: a,
            prDeptHeadMax: d,
            poMatchToleranceAbs: tol,
            duplicatePayableInvoicePolicy: dupPolicy,
          });
        }}
        className="px-3 py-1.5 text-[11px] rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save procurement policy"}
      </button>
    </div>
  );
}

// ── People & Workplace hub (org.settings.peopleWorkplace) ───────────────────
function PeopleWorkplacePolicyTab() {
  const { mergeTrpcQueryOpts, isAdmin } = useRBAC();
  const utils = trpc.useUtils();
  const meQ = trpc.auth.me.useQuery(undefined, mergeTrpcQueryOpts("auth.me", undefined));
  const pw = ((meQ.data?.org as Record<string, unknown> | null)?.settings as Record<string, unknown> | undefined)?.peopleWorkplace as Record<string, unknown> | undefined;
  const [facilitiesLive, setFacilitiesLive] = useState(true);

  useEffect(() => {
    if (!meQ.isLoading && meQ.data?.org) {
      setFacilitiesLive(pw?.facilitiesLive !== false);
    }
  }, [meQ.isLoading, meQ.data?.org, pw?.facilitiesLive]);

  const save = trpc.hr.peopleWorkplace.updateIntegrationFlags.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      toast.success("Workplace hub integration flags saved.");
    },
    onError: (e: { message?: string }) => toast.error(e.message ?? "Save failed"),
  });

  if (!isAdmin()) {
    return (
      <div className="p-4 text-[12px] text-muted-foreground">
        Only organization <strong>owner</strong> or <strong>admin</strong> can change workplace hub integration flags.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg space-y-4">
      <div>
        <h3 className="text-[12px] font-semibold text-foreground">Hub integration toggles</h3>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          When a module is <strong>off</strong>, the People & Workplace hub shows <strong>Off</strong> for that tile and skips live API calls. Defaults are on for new orgs.
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 py-2 border-b border-border">
        <div>
          <div className="text-[12px] font-medium text-foreground">Facilities &amp; rooms</div>
          <div className="text-[10px] text-muted-foreground">Spaces count on the hub</div>
        </div>
        <button
          type="button"
          onClick={() => setFacilitiesLive((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-border hover:bg-muted/40"
        >
          {facilitiesLive ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
          {facilitiesLive ? "Live" : "Off"}
        </button>
      </div>
      <button
        type="button"
        disabled={save.isPending || meQ.isLoading}
        onClick={() => save.mutate({ facilitiesLive })}
        className="px-3 py-1.5 text-[11px] rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save flags"}
      </button>
    </div>
  );
}

// ── Business Rules Tab (ticket automation DSL v1) ────────────────────────────
const BR_COND_PLACEHOLDER = `[
  { "op": "field_changed", "field": "statusId" },
  { "op": "status_category_is", "category": "resolved" }
]`;

const BR_ACT_PLACEHOLDER = `[
  {
    "type": "notify_assignee",
    "title": "Resolved: {{ticket.number}}",
    "body": "{{ticket.title}} — please verify and close if appropriate."
  }
]`;

function BusinessRulesTab() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const utils = trpc.useUtils();
  const listQuery = trpc.admin.businessRules.list.useQuery(undefined, mergeTrpcQueryOpts("admin.businessRules.list", undefined));

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(100);
  const [enabled, setEnabled] = useState(true);
  const [evCreated, setEvCreated] = useState(false);
  const [evUpdated, setEvUpdated] = useState(true);
  const [conditionsJson, setConditionsJson] = useState(BR_COND_PLACEHOLDER);
  const [actionsJson, setActionsJson] = useState(BR_ACT_PLACEHOLDER);

  const createMutation = trpc.admin.businessRules.create.useMutation({
    onSuccess: () => {
      utils.admin.businessRules.list.invalidate();
      closeForm();
      toast.success("Business rule created");
    },
    onError: (e) => toast.error(e.message ?? "Create failed"),
  });

  const updateMutation = trpc.admin.businessRules.update.useMutation({
    onSuccess: () => {
      utils.admin.businessRules.list.invalidate();
      closeForm();
      toast.success("Business rule updated");
    },
    onError: (e) => toast.error(e.message ?? "Update failed"),
  });

  const deleteMutation = trpc.admin.businessRules.delete.useMutation({
    onSuccess: () => {
      utils.admin.businessRules.list.invalidate();
      toast.success("Rule deleted");
    },
    onError: (e) => toast.error(e.message ?? "Delete failed"),
  });

  const toggleMutation = trpc.admin.businessRules.toggle.useMutation({
    onSuccess: () => utils.admin.businessRules.list.invalidate(),
    onError: (e) => toast.error(e.message ?? "Toggle failed"),
  });

  function resetFields() {
    setEditId(null);
    setName("");
    setDescription("");
    setPriority(100);
    setEnabled(true);
    setEvCreated(false);
    setEvUpdated(true);
    setConditionsJson(BR_COND_PLACEHOLDER);
    setActionsJson(BR_ACT_PLACEHOLDER);
  }

  function closeForm() {
    setShowForm(false);
    resetFields();
  }

  function openCreate() {
    resetFields();
    setShowForm(true);
  }

  function openEdit(row: {
    id: string;
    name: string;
    description: string | null;
    priority: number;
    enabled: boolean;
    events: unknown;
    conditions: unknown;
    actions: unknown;
  }) {
    setEditId(row.id);
    setName(row.name);
    setDescription(row.description ?? "");
    setPriority(row.priority);
    setEnabled(row.enabled);
    const ev = (row.events as string[]) ?? [];
    setEvCreated(ev.includes("created"));
    setEvUpdated(ev.includes("updated"));
    setConditionsJson(JSON.stringify(row.conditions ?? [], null, 2));
    setActionsJson(JSON.stringify(row.actions ?? [], null, 2));
    setShowForm(true);
  }

  function submitForm() {
    const events: ("created" | "updated")[] = [];
    if (evCreated) events.push("created");
    if (evUpdated) events.push("updated");
    if (events.length === 0) {
      toast.error("Select at least one event (Created and/or Updated).");
      return;
    }
    let conditions: unknown[];
    let actions: unknown[];
    try {
      conditions = JSON.parse(conditionsJson) as unknown[];
      actions = JSON.parse(actionsJson) as unknown[];
    } catch {
      toast.error("Conditions and actions must be valid JSON arrays.");
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      entityType: "ticket" as const,
      events,
      conditions,
      actions,
      priority,
      enabled,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, ...payload } as never);
    } else {
      createMutation.mutate(payload as never);
    }
  }

  const rows = (listQuery.data ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    priority: number;
    enabled: boolean;
    events: unknown;
    conditions: unknown;
    actions: unknown;
  }>;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-semibold text-foreground/80">Business Rules</span>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
        >
          <Plus className="w-3 h-3" /> New Business Rule
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground mb-3 max-w-3xl">
        Rules run in <span className="font-medium">priority</span> order (lower first) when tickets are{" "}
        <span className="font-medium">created</span> or <span className="font-medium">updated</span>. Conditions use a
        small JSON DSL; actions can send in-app notifications using{" "}
        <code className="text-[10px] bg-muted px-1 rounded">{"{{ticket.number}}"}</code> templates.
      </p>

      {showForm && (
        <div className="mb-4 rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <div className="text-[11px] font-semibold text-foreground">{editId ? "Edit rule" : "New rule"}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[10px] text-muted-foreground">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-[12px]" placeholder="e.g. Notify assignee on resolve" />
            </label>
            <label className="text-[10px] text-muted-foreground">
              Priority (lower runs first)
              <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-[12px]" />
            </label>
          </div>
          <label className="text-[10px] text-muted-foreground block">
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 text-[12px]" />
          </label>
          <div className="flex flex-wrap gap-4 text-[11px]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={evCreated} onChange={(e) => setEvCreated(e.target.checked)} />
              On ticket created
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={evUpdated} onChange={(e) => setEvUpdated(e.target.checked)} />
              On ticket updated
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enabled
            </label>
          </div>
          <label className="text-[10px] text-muted-foreground block">
            Conditions (JSON array)
            <textarea value={conditionsJson} onChange={(e) => setConditionsJson(e.target.value)} rows={5} className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]" spellCheck={false} />
          </label>
          <label className="text-[10px] text-muted-foreground block">
            Actions (JSON array)
            <textarea value={actionsJson} onChange={(e) => setActionsJson(e.target.value)} rows={6} className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]" spellCheck={false} />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitForm}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {editId ? "Save changes" : "Create rule"}
            </button>
            <button type="button" onClick={closeForm} className="px-3 py-1.5 border border-border text-[11px] rounded hover:bg-muted/40">
              Cancel
            </button>
          </div>
        </div>
      )}

      {listQuery.isLoading ? (
        <div className="space-y-2 animate-pulse py-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2 border border-dashed border-border rounded-lg">
          <Workflow className="w-8 h-8 opacity-30" />
          <p className="text-[13px]">No business rules yet</p>
          <p className="text-[11px] text-muted-foreground/70 text-center max-w-md">
            Add a rule to notify assignees when tickets reach a status, or combine <code className="text-[10px]">field_changed</code> with{" "}
            <code className="text-[10px]">status_category_is</code> for precise control.
          </p>
          <button type="button" onClick={openCreate} className="mt-2 text-[11px] text-primary hover:underline">
            Create your first rule
          </button>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Name</th>
                <th>Events</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-[11px]">{r.priority}</td>
                  <td className="font-medium text-[12px]">{r.name}</td>
                  <td className="text-[11px] text-muted-foreground">{Array.isArray(r.events) ? r.events.join(", ") : "—"}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate({ id: r.id, enabled: !r.enabled })}
                      className={`text-[10px] px-2 py-0.5 rounded ${r.enabled ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}
                    >
                      {r.enabled ? "On" : "Off"}
                    </button>
                  </td>
                  <td className="text-right space-x-2">
                    <button type="button" onClick={() => openEdit(r)} className="text-[11px] text-primary hover:underline">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete rule “${r.name}”?`)) deleteMutation.mutate({ id: r.id });
                      }}
                      className="text-[11px] text-red-600 hover:underline"
                    >
                      Delete
                    </button>
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
  const { mergeTrpcQueryOpts } = useRBAC();
  const utils = trpc.useUtils();
  // @ts-ignore
  const rulesQuery = trpc.assignmentRules.list.useQuery({}, mergeTrpcQueryOpts("assignmentRules.list", undefined));
  // @ts-ignore
  const teamsQuery = trpc.assignmentRules.teamsWithMembers.useQuery(undefined, mergeTrpcQueryOpts("assignmentRules.teamsWithMembers", undefined));

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
