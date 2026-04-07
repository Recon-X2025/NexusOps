"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, X, ExternalLink } from "lucide-react";
import { getOrganizations, getBillingInfo, updateBillingInfo } from "@/lib/mac-api";
import type { OrgRow, BillingInfo } from "@/lib/mac-api";

const PLAN_STYLES: Record<string, string> = {
  free: "bg-slate-100 text-slate-600",
  starter: "bg-blue-50 text-blue-700",
  professional: "bg-indigo-50 text-indigo-700",
  enterprise: "bg-violet-50 text-violet-700",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  trialing: "bg-yellow-50 text-yellow-700",
  past_due: "bg-red-50 text-red-700",
  canceled: "bg-slate-100 text-slate-500",
  unpaid: "bg-red-100 text-red-800",
};

interface OrgBilling extends OrgRow {
  billing?: BillingInfo;
}

interface UpdateModalProps {
  org: OrgBilling;
  onClose: () => void;
  onSuccess: () => void;
}

function UpdateModal({ org, onClose, onSuccess }: UpdateModalProps) {
  const [plan, setPlan] = useState(org.billing?.plan ?? org.plan);
  const [stripeCustomerId, setStripeCustomerId] = useState(org.billing?.stripeCustomerId ?? "");
  const [subscriptionStatus, setSubscriptionStatus] = useState(org.billing?.subscriptionStatus ?? "");
  const [trialEndsAt, setTrialEndsAt] = useState(org.billing?.trialEndsAt ? org.billing.trialEndsAt.slice(0, 16) : "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateBillingInfo({
        orgId: org.id,
        plan,
        stripeCustomerId: stripeCustomerId || undefined,
        subscriptionStatus: subscriptionStatus as any || undefined,
        trialEndsAt: trialEndsAt ? new Date(trialEndsAt).toISOString() : undefined,
      });
      toast.success("Billing info updated");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Update Billing — {org.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400">
              {["free", "starter", "professional", "enterprise"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Stripe Customer ID</label>
            <input value={stripeCustomerId} onChange={(e) => setStripeCustomerId(e.target.value)} placeholder="cus_..." className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Subscription Status</label>
            <select value={subscriptionStatus} onChange={(e) => setSubscriptionStatus(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400">
              <option value="">— none —</option>
              {["active", "trialing", "past_due", "canceled", "unpaid"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Trial Ends At</label>
            <input type="datetime-local" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [orgs, setOrgs] = useState<OrgBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOrg, setEditOrg] = useState<OrgBilling | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getOrganizations(1) as OrgRow[];
      const enriched = await Promise.all(rows.map(async (org) => {
        try {
          const billing = await getBillingInfo(org.id);
          return { ...org, billing };
        } catch {
          return { ...org };
        }
      }));
      setOrgs(enriched);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Billing</h1>
        <p className="text-sm text-slate-500">Stripe billing info and plan management per organization</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              {["Organization", "Plan", "Stripe Customer", "Status", "Trial Ends", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></td></tr>
            ) : orgs.map((org) => {
              const status = org.billing?.subscriptionStatus;
              return (
                <tr key={org.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{org.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${PLAN_STYLES[org.billing?.plan ?? org.plan] ?? "bg-slate-100 text-slate-600"}`}>
                      {org.billing?.plan ?? org.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{org.billing?.stripeCustomerId ?? "—"}</td>
                  <td className="px-4 py-3">
                    {status ? (
                      <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"}`}>{status}</span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {org.billing?.trialEndsAt ? new Date(org.billing.trialEndsAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditOrg(org)} className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50">Update Plan</button>
                      {org.billing?.stripeCustomerId && (
                        <a href={`https://dashboard.stripe.com/customers/${org.billing.stripeCustomerId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">
                          <ExternalLink className="h-3 w-3" />Stripe
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editOrg && <UpdateModal org={editOrg} onClose={() => setEditOrg(null)} onSuccess={() => void load()} />}
    </div>
  );
}
