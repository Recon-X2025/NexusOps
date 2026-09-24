import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sliders,
  Search,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Lock,
  Sparkles,
  Shield,
  Palette,
  Workflow,
  FileCheck2,
  BarChart3,
  Check,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { useOrgs } from '../context/WizardContext';
import { useAudit } from '../context/AuditContext';
import {
  getFeatureFlagsMatrix,
  setTenantFeatureFlag,
  resetTenantFeatureFlag,
  resetTenantFeatureFlags,
  getToken,
  decodeJwtToken,
  type FeatureFlagMatrixItem,
  type FeatureFlagsMatrixResponse,
  type PlatformDefaultsResponse,
} from '../lib/api';

const PLAN_BADGES: Record<string, { label: string; cls: string }> = {
  free: {
    label: 'Free Tier',
    cls: 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
  },
  starter: {
    label: 'Starter Tier',
    cls: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  },
  professional: {
    label: 'Professional Tier',
    cls: 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
  },
  enterprise: {
    label: 'Enterprise Tier',
    cls: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  },
};

const CATEGORY_ICONS: Record<string, JSX.Element> = {
  Intelligence: <Sparkles className="h-3.5 w-3.5 text-purple-500" />,
  Identity: <Shield className="h-3.5 w-3.5 text-blue-500" />,
  Branding: <Palette className="h-3.5 w-3.5 text-pink-500" />,
  Workflows: <Workflow className="h-3.5 w-3.5 text-emerald-500" />,
  Compliance: <FileCheck2 className="h-3.5 w-3.5 text-amber-500" />,
  Analytics: <BarChart3 className="h-3.5 w-3.5 text-cyan-500" />,
};

export function FeatureFlagsPage() {
  const { tenants, loading: loadingTenants } = useOrgs();
  const { log } = useAudit();

  // Operator RBAC
  const operatorRole = useMemo(() => {
    const token = getToken();
    if (!token) return 'super_admin';
    const jwt = decodeJwtToken(token);
    return (jwt?.operatorRole as string) || (jwt?.role as string) || 'super_admin';
  }, []);

  const isReadOnly = operatorRole === 'auditor' || operatorRole === 'support_staff';
  const canManage = operatorRole === 'super_admin' || operatorRole === 'operations_staff';

  // Selection & Filter State
  const [selectedOrgId, setSelectedOrgId] = useState<string>('platform');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Matrix Data State
  const [matrixData, setMatrixData] = useState<FeatureFlagsMatrixResponse | null>(null);
  const [platformData, setPlatformData] = useState<PlatformDefaultsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Mutation in-flight state
  const [togglingFlag, setTogglingFlag] = useState<string | null>(null);
  const [resettingAll, setResettingAll] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetReason, setResetReason] = useState('');

  // Auto-select first tenant when tenants load if on platform
  useEffect(() => {
    if (selectedOrgId === 'platform' && tenants.length > 0) {
      setSelectedOrgId(tenants[0]!.id);
    }
  }, [tenants, selectedOrgId]);

  // Load Data
  const loadMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (selectedOrgId === 'platform') {
        const res = (await getFeatureFlagsMatrix()) as PlatformDefaultsResponse;
        setPlatformData(res);
        setMatrixData(null);
      } else {
        const res = (await getFeatureFlagsMatrix(selectedOrgId)) as FeatureFlagsMatrixResponse;
        setMatrixData(res);
        setPlatformData(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch feature flags matrix.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  // Handle Toggle Switch
  const handleToggle = async (item: FeatureFlagMatrixItem) => {
    if (!canManage || togglingFlag || !matrixData) return;
    const nextState = !item.effective;
    setTogglingFlag(item.key);
    setError(null);

    // Optimistic update
    setMatrixData((prev) => {
      if (!prev) return prev;
      const updatedFlags = prev.flags.map((f) =>
        f.key === item.key
          ? {
              ...f,
              effective: nextState,
              isOverride: nextState !== f.planDefault,
            }
          : f
      );
      const updatedOverrides = { ...prev.overrides, [item.key]: nextState };
      return {
        ...prev,
        flags: updatedFlags,
        overrides: updatedOverrides,
        effective: { ...prev.effective, [item.key]: nextState },
      };
    });

    try {
      await setTenantFeatureFlag(
        matrixData.orgId,
        item.key,
        nextState,
        `Flag ${item.name} set to ${nextState ? 'ENABLED' : 'DISABLED'} by operator`
      );

      log({
        tenantId: matrixData.orgId,
        tenantName: matrixData.orgName,
        action: 'SET_FEATURE_FLAG',
        summary: `Toggled feature flag ${item.name} (${item.key}) to ${nextState ? 'ON' : 'OFF'} for ${matrixData.orgName}`,
        before: { flag: item.key, effective: item.effective, isOverride: item.isOverride },
        after: { flag: item.key, effective: nextState, isOverride: nextState !== item.planDefault },
        admin: 'operator',
      });

      setSuccessBanner(`Flag '${item.name}' updated to ${nextState ? 'Enabled' : 'Disabled'}.`);
      await loadMatrix();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to update flag ${item.name}`);
      await loadMatrix(); // rollback
    } finally {
      setTogglingFlag(null);
    }
  };

  // Handle Single Flag Reset to Plan Default
  const handleResetSingle = async (item: FeatureFlagMatrixItem) => {
    if (!canManage || togglingFlag || !matrixData) return;
    setTogglingFlag(item.key);
    setError(null);

    try {
      const res = await resetTenantFeatureFlag(
        matrixData.orgId,
        item.key,
        `Reset flag ${item.name} to plan default`
      );

      log({
        tenantId: matrixData.orgId,
        tenantName: matrixData.orgName,
        action: 'RESET_FEATURE_FLAG',
        summary: `Reset flag ${item.name} (${item.key}) to plan default (${res.planDefault ? 'ON' : 'OFF'}) for ${matrixData.orgName}`,
        before: { flag: item.key, override: item.effective },
        after: { flag: item.key, restoredDefault: res.planDefault ?? item.planDefault },
        admin: 'operator',
      });

      setSuccessBanner(`Flag '${item.name}' reset to plan default (${item.planDefault ? 'ON' : 'OFF'}).`);
      await loadMatrix();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to reset flag ${item.name}`);
    } finally {
      setTogglingFlag(null);
    }
  };

  // Handle Reset All Overrides for Tenant
  const handleResetAll = async () => {
    if (!canManage || !matrixData) return;
    setResettingAll(true);
    setError(null);

    try {
      await resetTenantFeatureFlags(
        matrixData.orgId,
        resetReason.trim() || 'All overrides reset to plan defaults'
      );

      log({
        tenantId: matrixData.orgId,
        tenantName: matrixData.orgName,
        action: 'RESET_FEATURE_FLAGS',
        summary: `Reset all feature flag overrides to plan defaults for ${matrixData.orgName}`,
        before: { overrides: matrixData.overrides },
        after: { overrides: {}, reason: resetReason.trim() || 'Reset to defaults' },
        admin: 'operator',
      });

      setSuccessBanner(`All feature flag overrides reset to plan defaults for ${matrixData.orgName}.`);
      setShowResetConfirm(false);
      setResetReason('');
      await loadMatrix();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset feature flags.');
    } finally {
      setResettingAll(false);
    }
  };

  // Filtered Flags
  const filteredFlags = useMemo(() => {
    if (!matrixData) return [];
    return matrixData.flags.filter((flag) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchKey = flag.key.toLowerCase().includes(q);
        const matchName = flag.name.toLowerCase().includes(q);
        const matchDesc = flag.description.toLowerCase().includes(q);
        if (!matchKey && !matchName && !matchDesc) return false;
      }

      // Status filter
      if (statusFilter === 'OVERRIDES_ONLY' && !flag.isOverride) return false;
      if (statusFilter === 'INHERITED_ONLY' && flag.isOverride) return false;
      if (statusFilter === 'ENABLED' && !flag.effective) return false;
      if (statusFilter === 'DISABLED' && flag.effective) return false;

      return true;
    });
  }, [matrixData, search, statusFilter]);

  const activeOverridesCount = useMemo(() => {
    if (!matrixData) return 0;
    return Object.keys(matrixData.overrides).length;
  }, [matrixData]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feature Flags Control Matrix"
        subtitle="Platform-level and tenant-specific feature gatekeeper, dark launches, and tier entitlements"
        action={
          <div className="flex items-center gap-2">
            {isReadOnly && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                <Lock className="h-3 w-3" />
                Read-Only ({operatorRole === 'auditor' ? 'Auditor' : 'Support Staff'})
              </span>
            )}
            {matrixData && activeOverridesCount > 0 && canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-1.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-500/30"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset All Overrides ({activeOverridesCount})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={loadMatrix}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {successBanner && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
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

      {/* Organization Selector & Filter Controls Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 shadow-sm">
        <div className="flex items-center gap-2.5 flex-1 max-w-md">
          <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
          <div className="flex-1">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
              Target Organization
            </label>
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              disabled={loadingTenants}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            >
              <option value="platform">🌐 Platform Baseline (Default Entitlement Tiers)</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  🏢 {t.companyName} ({t.slug}) — {(t.plan ?? 'free').toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search flag key, name..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="ALL">All States</option>
            <option value="OVERRIDES_ONLY">Overrides Only</option>
            <option value="INHERITED_ONLY">Plan Inherited Only</option>
            <option value="ENABLED">Effective Enabled</option>
            <option value="DISABLED">Effective Disabled</option>
          </select>
        </div>
      </div>

      {/* Selected Tenant Summary Banner */}
      {matrixData && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400 font-bold text-sm">
              {matrixData.orgName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                  {matrixData.orgName}
                </h3>
                <span className="font-mono text-xs text-slate-400">({matrixData.slug})</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    PLAN_BADGES[matrixData.plan]?.cls ?? PLAN_BADGES.free.cls
                  }`}
                >
                  {PLAN_BADGES[matrixData.plan]?.label ?? matrixData.plan.toUpperCase()}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Evaluating entitlement gates against <strong>{matrixData.plan}</strong> plan defaults.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Override State:
            </span>
            {activeOverridesCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                <Sliders className="h-3 w-3" />
                {activeOverridesCount} Explicit Override{activeOverridesCount > 1 ? 's' : ''} Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                <CheckCircle2 className="h-3 w-3" />
                All Flags Inherited from Plan Defaults
              </span>
            )}
          </div>
        </div>
      )}

      {/* PLATFORM BASELINE VIEW (When 'platform' is selected) */}
      {selectedOrgId === 'platform' && platformData && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {platformData.tiers.map((tier) => {
              const meta = PLAN_BADGES[tier.plan] ?? PLAN_BADGES.free;
              const enabledCount = Object.values(tier.defaults).filter(Boolean).length;
              const totalCount = Object.keys(tier.defaults).length;
              return (
                <div
                  key={tier.plan}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.cls}`}>
                      {meta.label}
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      {enabledCount} of {totalCount} ON
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Default entitlement tier for tenants subscribed to {tier.plan}.
                  </p>
                </div>
              );
            })}
          </div>

          {/* Platform Catalog Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Feature Flag
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Free
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Starter
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Professional
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {platformData.catalog.map((item) => (
                  <tr key={item.key} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {CATEGORY_ICONS[item.category] ?? <Sliders className="h-3.5 w-3.5 text-slate-400" />}
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white text-xs">{item.name}</p>
                          <p className="font-mono text-[11px] text-slate-400">{item.key}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{item.description}</p>
                        </div>
                      </div>
                    </td>
                    {(['free', 'starter', 'professional', 'enterprise'] as const).map((tierKey) => {
                      const tierObj = platformData.tiers.find((t) => t.plan === tierKey);
                      const isDefaultOn = tierObj?.defaults[item.key] ?? false;
                      return (
                        <td key={tierKey} className="px-4 py-3 text-center whitespace-nowrap">
                          {isDefaultOn ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                              ON
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                              OFF
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TENANT MATRIX TABLE (When a specific tenant is selected) */}
      {matrixData && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Flag Identifier
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Description
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Plan Default
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Effective State
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Override Status
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Toggle Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredFlags.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                      {loading ? 'Loading feature flag matrix...' : 'No feature flags match your filter criteria.'}
                    </td>
                  </tr>
                ) : (
                  filteredFlags.map((flag) => {
                    const isToggling = togglingFlag === flag.key;
                    return (
                      <tr key={flag.key} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {CATEGORY_ICONS[flag.category] ?? <Sliders className="h-3.5 w-3.5 text-slate-400" />}
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white text-xs">{flag.name}</p>
                              <p className="font-mono text-[11px] text-slate-400">{flag.key}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 max-w-xs">
                          {flag.description}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {flag.planDefault ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                              ON
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                              OFF
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {flag.effective ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Enabled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {flag.isOverride ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                              <Sliders className="h-2.5 w-2.5" />
                              Explicit Override
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-normal text-slate-400 dark:text-slate-500">
                              Inherited from Plan
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {flag.isOverride && canManage && (
                              <button
                                onClick={() => handleResetSingle(flag)}
                                disabled={isToggling}
                                title="Reset to plan default"
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Reset Default
                              </button>
                            )}

                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => handleToggle(flag)}
                                disabled={isToggling}
                                aria-label={`Toggle ${flag.name}`}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                                  flag.effective ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700'
                                } ${isToggling ? 'opacity-50 cursor-wait' : ''}`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    flag.effective ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            ) : (
                              <div className="inline-flex items-center gap-1 text-xs text-slate-400 cursor-not-allowed">
                                <Lock className="h-3 w-3" />
                                <span>Locked</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: RESET ALL OVERRIDES CONFIRMATION */}
      {showResetConfirm && matrixData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-rose-500" />
              Reset All Feature Flags to Plan Defaults?
            </h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              This will immediately remove all <strong>{activeOverridesCount} custom overrides</strong> for{' '}
              <strong>{matrixData.orgName}</strong>. All feature gates will revert back to their default{' '}
              <span className="font-semibold">{matrixData.plan}</span> subscription entitlements.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Justification Reason (Optional audit note)
              </label>
              <input
                type="text"
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder="e.g. Contract expired, enterprise pilot ended..."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowResetConfirm(false)}
                disabled={resettingAll}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleResetAll}
                disabled={resettingAll}
              >
                {resettingAll ? 'Resetting...' : 'Confirm Reset to Defaults'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
