import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wallet,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  Building2,
  ExternalLink,
  ShieldAlert,
  Lock,
  Check,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import {
  getFinanceOverview,
  updateTenantSubscription,
  getToken,
  decodeJwtToken,
} from '../lib/api';
import { useAudit } from '../context/AuditContext';
import { formatDateTime } from '../lib/time';
import type { FinanceOverviewData, TenantSubscription } from '../lib/types';

const PLAN_BADGES: Record<string, { label: string; cls: string; price: string }> = {
  free: {
    label: 'Free',
    cls: 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
    price: '$0 / mo',
  },
  starter: {
    label: 'Starter',
    cls: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
    price: '$49 / mo',
  },
  professional: {
    label: 'Professional',
    cls: 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
    price: '$199 / mo',
  },
  enterprise: {
    label: 'Enterprise',
    cls: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    price: '$499 / mo',
  },
};

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  active: {
    label: 'Active',
    cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  },
  trialing: {
    label: 'Trialing',
    cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20',
  },
  past_due: {
    label: 'Past Due',
    cls: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  },
  canceled: {
    label: 'Canceled',
    cls: 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600',
  },
  unpaid: {
    label: 'Unpaid',
    cls: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  },
};

export function FinanceModulePage() {
  const { log } = useAudit();
  const [data, setData] = useState<FinanceOverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Operator RBAC determination
  const operatorRole = useMemo(() => {
    const token = getToken();
    if (!token) return 'super_admin';
    const jwt = decodeJwtToken(token);
    return (jwt?.operatorRole as string) || (jwt?.role as string) || 'super_admin';
  }, []);

  const isSupportStaff = operatorRole === 'support_staff';
  const isReadOnly = operatorRole === 'auditor' || operatorRole === 'operations_staff';
  const canManage = operatorRole === 'super_admin';

  // Modal State
  const [editingSub, setEditingSub] = useState<TenantSubscription | null>(null);
  const [editPlan, setEditPlan] = useState<'free' | 'starter' | 'professional' | 'enterprise'>('free');
  const [editStatus, setEditStatus] = useState<'active' | 'trialing' | 'past_due' | 'canceled'>('active');
  const [editStripeId, setEditStripeId] = useState('');
  const [editTrialEndsAt, setEditTrialEndsAt] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (isSupportStaff) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getFinanceOverview();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch financial overview.');
    } finally {
      setLoading(false);
    }
  }, [isSupportStaff]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Edit Modal
  const handleOpenEdit = (sub: TenantSubscription) => {
    if (!canManage) return;
    setEditingSub(sub);
    setEditPlan(sub.plan);
    setEditStatus(sub.subscriptionStatus);
    setEditStripeId(sub.stripeCustomerId ?? '');
    setEditTrialEndsAt(sub.trialEndsAt ? sub.trialEndsAt.split('T')[0] ?? '' : '');
    setOverrideReason('');
    setModalError(null);
  };

  // Submit Modal
  const handleSubmitSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub || !canManage) return;
    const trimmedReason = overrideReason.trim();
    if (trimmedReason.length < 10) {
      setModalError('Override reason must be at least 10 characters long.');
      return;
    }

    setSubmitting(true);
    setModalError(null);
    try {
      await updateTenantSubscription(editingSub.orgId, {
        plan: editPlan,
        subscriptionStatus: editStatus,
        stripeCustomerId: editStripeId.trim() || undefined,
        trialEndsAt: editTrialEndsAt ? new Date(editTrialEndsAt).toISOString() : null,
        reason: trimmedReason,
      });

      log({
        tenantId: editingSub.orgId,
        tenantName: editingSub.orgName,
        action: 'OVERRIDE_SUBSCRIPTION',
        summary: `Overrode subscription plan for ${editingSub.orgName} to ${editPlan} (${editStatus})`,
        before: { plan: editingSub.plan, status: editingSub.subscriptionStatus },
        after: { plan: editPlan, status: editStatus, reason: trimmedReason },
        admin: 'superadmin',
      });

      setSuccessMessage(`Subscription plan updated successfully for ${editingSub.orgName}.`);
      setEditingSub(null);
      await loadData();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to update subscription.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSubscriptions = useMemo(() => {
    if (!data) return [];
    return data.subscriptions.filter((s) => {
      if (planFilter !== 'ALL' && s.plan !== planFilter) return false;
      if (statusFilter !== 'ALL' && s.subscriptionStatus !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.orgName.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.stripeCustomerId && s.stripeCustomerId.toLowerCase().includes(q))
      );
    });
  }, [data, search, planFilter, statusFilter]);

  // Support Staff Access Denial Screen
  if (isSupportStaff) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Finance & Subscriptions"
          subtitle="Multi-tenant subscription management, billing tiers, Stripe customer sync, and platform revenue metrics"
        />
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-8 text-center dark:border-amber-500/20 dark:bg-amber-500/5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-500/10">
            <ShieldAlert className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">
            Finance & Subscription Access Restricted
          </h3>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Your operator role (<span className="font-semibold font-mono text-amber-700 dark:text-amber-300">Support Staff</span>) does not have the <code className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">financeView</code> capability required to inspect platform revenue, MRR/ARR metrics, or tenant subscription contracts.
          </p>
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            Contact a Super Admin if your operational duties require financial inspection clearance.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance & Subscriptions"
        subtitle="Multi-tenant subscription management, billing tiers, Stripe customer sync, and platform revenue metrics"
        action={
          <div className="flex items-center gap-2">
            {isReadOnly && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                <Lock className="h-3 w-3" />
                Read-Only ({operatorRole === 'auditor' ? 'Auditor' : 'Operations Staff'})
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 font-bold text-base leading-none"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Revenue & Tier Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Estimated MRR</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            ${(data?.totalMrr ?? 0).toLocaleString()}
            <span className="text-xs font-normal text-slate-400"> / month</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            ARR Run-rate: ~${(data?.estimatedArr ?? 0).toLocaleString()} / year
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Paid Subscriptions</span>
            <CreditCard className="h-4 w-4 text-brand-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {data?.paidTenantsCount ?? 0}
            <span className="text-xs font-normal text-slate-400"> / {data?.totalTenants ?? 0} tenants</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Free Plan: {data?.planCounts?.free ?? 0} organizations
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Active & Trialing</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {(data?.statusCounts?.active ?? 0) + (data?.statusCounts?.trialing ?? 0)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {data?.statusCounts?.trialing ?? 0} in active trial period
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>At Risk / Past Due</span>
            <ShieldAlert className="h-4 w-4 text-rose-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
            {data?.statusCounts?.past_due ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Canceled / Inactive: {data?.statusCounts?.canceled ?? 0}
          </p>
        </div>
      </div>

      {/* Plan Tiers Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['starter', 'professional', 'enterprise', 'free'] as const).map((p) => {
          const meta = PLAN_BADGES[p];
          const count = (data?.planCounts as any)?.[p] ?? 0;
          return (
            <div
              key={p}
              className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-800/60"
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${meta.cls}`}>
                  {meta.label}
                </span>
                <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {meta.price}
                </span>
              </div>
              <p className="mt-3 text-xl font-bold text-slate-900 dark:text-white">{count} tenants</p>
            </div>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenant name, slug, or Stripe ID..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="ALL">All Plans</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="ALL">All Statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past Due</option>
            <option value="canceled">Canceled</option>
          </select>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Tenant
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Current Plan
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Billing Cycle
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Status
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Stripe Customer
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Registered
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredSubscriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    {loading ? 'Loading subscription data...' : 'No tenant subscriptions match your filters.'}
                  </td>
                </tr>
              ) : (
                filteredSubscriptions.map((sub) => {
                  const planMeta = PLAN_BADGES[sub.plan] ?? PLAN_BADGES.free;
                  const statusMeta = STATUS_BADGES[sub.subscriptionStatus] ?? STATUS_BADGES.active;

                  return (
                    <tr key={sub.orgId} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">{sub.orgName}</p>
                            <p className="font-mono text-xs text-slate-400">{sub.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${planMeta.cls}`}>
                          {planMeta.label}
                        </span>
                        <span className="ml-1.5 font-mono text-xs text-slate-400">
                          {sub.priceMonthly > 0 ? `$${sub.priceMonthly}/mo` : 'Free'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 capitalize whitespace-nowrap">
                        {sub.billingCycle}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.cls}`}>
                          {statusMeta.label}
                        </span>
                        {sub.trialEndsAt && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            Trial ends {formatDateTime(sub.trialEndsAt)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {sub.stripeCustomerId ? (
                          <span className="font-mono text-xs text-brand-600 dark:text-brand-400 flex items-center gap-1">
                            {sub.stripeCustomerId}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDateTime(sub.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {canManage ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEdit(sub)}
                            className="text-xs"
                          >
                            Manage Plan
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled
                            className="text-xs opacity-60 cursor-not-allowed inline-flex items-center gap-1"
                            title="Requires Super Admin role to override subscription plans"
                          >
                            <Lock className="h-3 w-3" />
                            Read-Only
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: MANAGE SUBSCRIPTION */}
      {editingSub && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <Wallet className="h-5 w-5 text-brand-500" />
              Manage Subscription Plan
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Override billing tier, contract status, or Stripe IDs for <strong>{editingSub.orgName}</strong>.
            </p>

            {modalError && (
              <div className="mt-4 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitSubscription} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Subscription Tier</label>
                <select
                  value={editPlan}
                  onChange={(e) => setEditPlan(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="free">Free ($0 / month)</option>
                  <option value="starter">Starter ($49 / month)</option>
                  <option value="professional">Professional ($199 / month)</option>
                  <option value="enterprise">Enterprise ($499 / month)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Subscription Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="active">Active</option>
                  <option value="trialing">Trialing</option>
                  <option value="past_due">Past Due (Delinquent)</option>
                  <option value="canceled">Canceled</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Stripe Customer ID (Optional)
                </label>
                <input
                  type="text"
                  value={editStripeId}
                  onChange={(e) => setEditStripeId(e.target.value)}
                  placeholder="cus_..."
                  className="mt-1 w-full font-mono rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Trial Expiry Date (Optional)
                </label>
                <input
                  type="date"
                  value={editTrialEndsAt}
                  onChange={(e) => setEditTrialEndsAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              {/* Mandatory Reason with character counter */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Override Justification Reason <span className="text-rose-500">*</span>
                  </label>
                  <span
                    className={`text-[10px] font-mono ${
                      overrideReason.trim().length >= 10
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'text-slate-400'
                    }`}
                  >
                    {overrideReason.trim().length}/10 chars min
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Explain why this subscription plan is being altered (minimum 10 characters)..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  required
                />
                {overrideReason.trim().length > 0 && overrideReason.trim().length < 10 && (
                  <p className="mt-1 text-[10px] text-rose-500">
                    Minimum 10 characters required ({10 - overrideReason.trim().length} more needed)
                  </p>
                )}
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" type="button" onClick={() => setEditingSub(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={submitting || overrideReason.trim().length < 10}
                >
                  {submitting ? 'Saving...' : 'Update Subscription'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
