"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Building2,
  Loader2,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  getOrganizations,
  createOrganization,
  suspendOrganization,
  resumeOrganization,
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

const PLAN_STYLES: Record<string, string> = {
  free: "bg-slate-100 text-slate-600",
  starter: "bg-blue-50 text-blue-700",
  professional: "bg-indigo-50 text-indigo-700",
  enterprise: "bg-violet-50 text-violet-700",
};

function StatusBadge({ suspended }: { suspended?: boolean }) {
  return suspended ? (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-red-50 text-red-600">
      Suspended
    </span>
  ) : (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700">
      Active
    </span>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${PLAN_STYLES[plan] ?? "bg-slate-100 text-slate-600"}`}>
      {plan}
    </span>
  );
}

interface NewOrgModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function NewOrgModal({ onClose, onSuccess }: NewOrgModalProps) {
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("free");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await createOrganization({ name, plan, adminEmail, adminName });
      toast.success(`Organization "${result.org.name}" created. Admin invite will be sent to ${result.adminEmail}.`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">New Organization</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Organization Name</label>
            <input
              required
              minLength={2}
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Plan</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Admin Email</label>
            <input
              required
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@acme.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Admin Name</label>
            <input
              required
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Organization
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface OrgPanelProps {
  org: Org;
  onClose: () => void;
  onAction: () => void;
}

function OrgPanel({ org, onClose, onAction }: OrgPanelProps) {
  const suspended = !!(org.settings as Record<string, unknown> | null)?.suspended;
  const [loading, setLoading] = useState(false);

  async function handleSuspend() {
    setLoading(true);
    try {
      await suspendOrganization(org.id);
      toast.success(`${org.name} suspended`);
      onAction();
    } catch {
      toast.error("Failed to suspend organization");
    } finally {
      setLoading(false);
    }
  }

  async function handleResume() {
    setLoading(true);
    try {
      await resumeOrganization(org.id);
      toast.success(`${org.name} resumed`);
      onAction();
    } catch {
      toast.error("Failed to resume organization");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-96 border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-800">Organization Details</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
              <Building2 className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">{org.name}</p>
              <p className="text-xs text-slate-500">/{org.slug}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Plan</p>
              <div className="mt-1"><PlanBadge plan={org.plan} /></div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Status</p>
              <div className="mt-1"><StatusBadge suspended={suspended} /></div>
            </div>
            <div className="col-span-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Created</p>
              <p className="mt-1 text-sm text-slate-700">
                {formatDistanceToNow(new Date(org.createdAt), { addSuffix: true })}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">ID</p>
              <p className="mt-1 font-mono text-xs text-slate-500">{org.id}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 p-5 space-y-2">
          {suspended ? (
            <button
              onClick={handleResume}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60 transition-colors"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Resume Organization
            </button>
          ) : (
            <button
              onClick={handleSuspend}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60 transition-colors"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Suspend Organization
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OrganizationsPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOrganizations(page, search || undefined);
      setOrgs(data as Org[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Organizations</h1>
          <p className="text-sm text-slate-500">All tenant organizations on the platform</p>
        </div>
        <button
          onClick={() => setShowNewOrg(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Organization
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search organizations…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Plan</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Created</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : orgs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                  No organizations found.
                </td>
              </tr>
            ) : (
              orgs.map((org) => {
                const suspended = !!(org.settings as Record<string, unknown> | null)?.suspended;
                return (
                  <tr
                    key={org.id}
                    onClick={() => setSelectedOrg(org)}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{org.name}</td>
                    <td className="px-4 py-3"><PlanBadge plan={org.plan} /></td>
                    <td className="px-4 py-3"><StatusBadge suspended={suspended} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDistanceToNow(new Date(org.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/organizations/${org.id}`); }}
                        className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-500">Page {page}</p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={orgs.length < 50}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {showNewOrg && (
        <NewOrgModal onClose={() => setShowNewOrg(false)} onSuccess={() => void load()} />
      )}

      {selectedOrg && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/20"
            onClick={() => setSelectedOrg(null)}
          />
          <OrgPanel
            org={selectedOrg}
            onClose={() => setSelectedOrg(null)}
            onAction={() => { setSelectedOrg(null); void load(); }}
          />
        </>
      )}
    </div>
  );
}
