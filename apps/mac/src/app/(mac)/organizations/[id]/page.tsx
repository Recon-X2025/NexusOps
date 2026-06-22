"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  ArrowLeft,
  Loader2,
  Users,
  Activity,
  Plug,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import {
  getOrganizationById,
  getOrgUsers,
  suspendOrganization,
  resumeOrganization,
  revokeOrgSessions,
} from "@/lib/mac-api";

interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface OrgUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt?: string | null;
  createdAt: string;
}

const PLAN_STYLES: Record<string, string> = {
  free: "bg-slate-100 text-slate-600",
  starter: "bg-blue-50 text-blue-700",
  professional: "bg-indigo-50 text-indigo-700",
  enterprise: "bg-violet-50 text-violet-700",
};

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        </div>
        <p className="mb-5 text-sm text-slate-600">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrgDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [org, setOrg] = useState<Org | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"users" | "integrations" | "metrics">("users");
  const [confirm, setConfirm] = useState<"suspend" | "resume" | "revoke" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orgData, usersData] = await Promise.all([
        getOrganizationById(params.id),
        getOrgUsers(params.id),
      ]);
      setOrg(orgData as Org);
      setUsers(usersData as OrgUser[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load org");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  async function handleConfirmedAction() {
    if (!org || !confirm) return;
    setActionLoading(true);
    try {
      if (confirm === "suspend") {
        await suspendOrganization(org.id);
        toast.success(`${org.name} suspended`);
      } else if (confirm === "resume") {
        await resumeOrganization(org.id);
        toast.success(`${org.name} resumed`);
      } else if (confirm === "revoke") {
        await revokeOrgSessions(org.id);
        toast.success(`All sessions for ${org.name} revoked`);
      }
      setConfirm(null);
      void load();
    } catch {
      toast.error("Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Organization not found.
      </div>
    );
  }

  const suspended = !!org.settings?.suspended;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/organizations")}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Organizations
        </button>
      </div>

      {/* Org overview */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
              <Building2 className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">{org.name}</h1>
              <p className="text-sm text-slate-500">/{org.slug}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-medium ${PLAN_STYLES[org.plan] ?? "bg-slate-100 text-slate-600"}`}>
              {org.plan}
            </span>
            {suspended ? (
              <span className="inline-flex items-center rounded px-2.5 py-1 text-xs font-medium bg-red-50 text-red-600">
                Suspended
              </span>
            ) : (
              <span className="inline-flex items-center rounded px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700">
                Active
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">ID</p>
            <p className="mt-1 font-mono text-xs text-slate-600">{org.id.slice(0, 8)}…</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Created</p>
            <p className="mt-1 text-sm text-slate-700">
              {format(new Date(org.createdAt), "dd MMM yyyy")}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Users</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{users.length}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Last Updated</p>
            <p className="mt-1 text-sm text-slate-700">
              {formatDistanceToNow(new Date(org.updatedAt), { addSuffix: true })}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
          {suspended ? (
            <button
              onClick={() => setConfirm("resume")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              Resume Organization
            </button>
          ) : (
            <button
              onClick={() => setConfirm("suspend")}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
            >
              Suspend Organization
            </button>
          )}
          <button
            onClick={() => setConfirm("revoke")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Revoke All Sessions
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-100">
          {[
            { id: "users" as const, label: "Users", icon: Users },
            { id: "integrations" as const, label: "Integrations", icon: Plug },
            { id: "metrics" as const, label: "Metrics", icon: Activity },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? "border-indigo-500 text-indigo-700 bg-indigo-50/40"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === "users" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Name</th>
                  <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Email</th>
                  <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Role</th>
                  <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                  <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-slate-400">No users in this organization.</td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 font-medium text-slate-800">{user.name}</td>
                      <td className="py-2.5 text-slate-600">{user.email}</td>
                      <td className="py-2.5">
                        <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 capitalize">
                          {user.role}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${user.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-slate-500">
                        {user.lastLoginAt
                          ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })
                          : "Never"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === "integrations" && (
            <div className="py-6 text-center text-sm text-slate-400">
              Integration details will be loaded from the API in production.
            </div>
          )}

          {activeTab === "metrics" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Total Tickets", value: "—" },
                  { label: "Avg Resolution Time", value: "—" },
                  { label: "Open Incidents", value: "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400">Detailed metrics charts are available in the production API.</p>
            </div>
          )}
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          title={
            confirm === "suspend"
              ? "Suspend Organization"
              : confirm === "resume"
              ? "Resume Organization"
              : "Revoke All Sessions"
          }
          message={
            confirm === "suspend"
              ? `Are you sure you want to suspend "${org.name}"? Users will lose access immediately.`
              : confirm === "resume"
              ? `Resume access for "${org.name}"?`
              : `This will invalidate all active sessions for users in "${org.name}". They will need to log in again.`
          }
          confirmLabel={
            confirm === "suspend" ? "Suspend" : confirm === "resume" ? "Resume" : "Revoke Sessions"
          }
          confirmClass={
            confirm === "resume"
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "bg-red-600 hover:bg-red-500"
          }
          onConfirm={handleConfirmedAction}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
