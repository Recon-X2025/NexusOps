import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldAlert, AlertTriangle, RefreshCw, Search, Plus,
  CheckCircle2, FileText, ArrowUpRight, X,
  Activity,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import {
  getGrcRisks,
  createGrcRisk,
  updateGrcRisk,
  getOrgs,
  getMe,
  type GrcRiskItem,
} from '../lib/api';
import { useAudit } from '../context/AuditContext';
import { formatDateTime } from '../lib/time';

const LIKELIHOOD_LABELS: Record<number, string> = {
  1: '1 - Rare',
  2: '2 - Unlikely',
  3: '3 - Possible',
  4: '4 - Likely',
  5: '5 - Almost Certain',
};

const IMPACT_LABELS: Record<number, string> = {
  5: '5 - Catastrophic',
  4: '4 - Major',
  3: '3 - Moderate',
  2: '2 - Minor',
  1: '1 - Insignificant',
};

function getCellSeverity(l: number, i: number): 'low' | 'medium' | 'high' | 'critical' {
  const score = l * i;
  if (score <= 6) return 'low';
  if (score <= 9) return 'medium';
  if (score <= 16) return 'high';
  return 'critical';
}

function getSeverityBadge(rating: string) {
  switch (rating) {
    case 'critical':
      return (
        <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
          Critical
        </span>
      );
    case 'high':
      return (
        <span className="inline-flex items-center rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
          High
        </span>
      );
    case 'medium':
      return (
        <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
          Medium
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
          Low
        </span>
      );
  }
}

export function GrcRisksPage() {
  const { refresh: refreshAuditLogs } = useAudit();

  const [risks, setRisks] = useState<GrcRiskItem[]>([]);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [operatorRole, setOperatorRole] = useState<string>('super_admin');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [matrixFilter, setMatrixFilter] = useState<{ likelihood: number; impact: number } | null>(null);

  // Modals state
  const [showAddRiskModal, setShowAddRiskModal] = useState(false);
  const [selectedRiskToEdit, setSelectedRiskToEdit] = useState<GrcRiskItem | null>(null);

  // Form states
  const [riskForm, setRiskForm] = useState({
    orgId: '',
    title: '',
    description: '',
    category: 'operational' as GrcRiskItem['category'],
    likelihood: 3,
    impact: 3,
    treatment: 'mitigate' as 'accept' | 'mitigate' | 'transfer' | 'avoid',
    mitigationPlan: '',
    reviewFrequency: 'quarterly',
  });

  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    likelihood: 3,
    impact: 3,
    treatment: 'mitigate' as 'accept' | 'mitigate' | 'transfer' | 'avoid',
    status: 'identified' as GrcRiskItem['status'],
    mitigationPlan: '',
    reviewFrequency: 'quarterly',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [risksRes, orgsRes, me] = await Promise.all([
        getGrcRisks(),
        getOrgs(),
        getMe().catch(() => null),
      ]);
      setRisks(risksRes ?? []);
      setOrgs(orgsRes ?? []);
      if (me?.user?.role) {
        setOperatorRole(me.user.role);
      }
      if (orgsRes.length > 0 && !riskForm.orgId) {
        setRiskForm((prev) => ({ ...prev, orgId: orgsRes[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch GRC risk data.');
    } finally {
      setLoading(false);
    }
  }, [riskForm.orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Capability checks
  const hasComplianceView = operatorRole !== 'support_staff';
  const canManageCompliance = operatorRole !== 'auditor' && hasComplianceView;

  // Matrix counts map: key = `${likelihood}-${impact}`
  const matrixCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of risks) {
      const key = `${r.likelihood}-${r.impact}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [risks]);

  // KPI calculations
  const metrics = useMemo(() => {
    const critical = risks.filter((r) => r.riskRating === 'critical');
    const high = risks.filter((r) => r.riskRating === 'high');
    const mitigating = risks.filter((r) => r.status === 'mitigating');
    const total = risks.length;

    return {
      criticalCount: critical.length,
      highCount: high.length,
      mitigatingCount: mitigating.length,
      totalCount: total,
    };
  }, [risks]);

  // Filtered risks
  const filteredRisks = useMemo(() => {
    return risks.filter((r) => {
      // Matrix cell filter
      if (matrixFilter) {
        if (r.likelihood !== matrixFilter.likelihood || r.impact !== matrixFilter.impact) {
          return false;
        }
      }

      // Category filter
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;

      // Severity filter
      if (severityFilter !== 'all' && r.riskRating !== severityFilter) return false;

      // Status filter
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;

      // Text search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = r.title.toLowerCase().includes(q);
        const matchesNum = r.number.toLowerCase().includes(q);
        const matchesDesc = (r.description ?? '').toLowerCase().includes(q);
        const matchesOrg = (r.orgName ?? '').toLowerCase().includes(q) || r.orgId.toLowerCase().includes(q);
        if (!matchesTitle && !matchesNum && !matchesDesc && !matchesOrg) return false;
      }

      return true;
    });
  }, [risks, matrixFilter, categoryFilter, severityFilter, statusFilter, search]);

  // Handler: Create Risk
  const handleCreateRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createGrcRisk(riskForm);
      setShowAddRiskModal(false);
      setActionSuccess(`Risk ${created.number} created with score ${created.riskScore}.`);
      await loadData();
      await refreshAuditLogs();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create GRC risk.');
    }
  };

  // Handler: Update Risk
  const handleUpdateRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRiskToEdit) return;
    try {
      await updateGrcRisk(selectedRiskToEdit.id, {
        title: editForm.title,
        description: editForm.description || undefined,
        likelihood: editForm.likelihood,
        impact: editForm.impact,
        treatment: editForm.treatment,
        status: editForm.status,
        mitigationPlan: editForm.mitigationPlan || undefined,
        reviewFrequency: editForm.reviewFrequency || undefined,
      });

      setSelectedRiskToEdit(null);
      setActionSuccess(`Risk ${selectedRiskToEdit.number} updated successfully.`);
      await loadData();
      await refreshAuditLogs();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update risk assessment.');
    }
  };

  const openEditModal = (r: GrcRiskItem) => {
    setSelectedRiskToEdit(r);
    setEditForm({
      title: r.title,
      description: r.description || '',
      likelihood: r.likelihood,
      impact: r.impact,
      treatment: (r.treatment as any) || 'mitigate',
      status: r.status,
      mitigationPlan: r.mitigationPlan || '',
      reviewFrequency: r.reviewFrequency || 'quarterly',
    });
  };

  if (!loading && !hasComplianceView) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          title="GRC Risk Matrix"
          subtitle="Cross-tenant enterprise risk register, 5×5 heat matrix, and mitigation tracking"
        />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900/50 dark:bg-amber-950/20">
          <ShieldAlert className="mx-auto h-12 w-12 text-amber-600 dark:text-amber-400" />
          <h2 className="mt-4 font-heading text-lg font-bold text-slate-900 dark:text-white">Access Restricted</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Your role (<span className="font-semibold">{operatorRole}</span>) does not have compliance inspection privileges (<code>complianceView</code> required).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        title="GRC Risk Matrix"
        subtitle="Cross-tenant enterprise risk register, 5×5 heat matrix, and mitigation tracking"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />}
              onClick={loadData}
              disabled={loading}
            >
              Refresh
            </Button>
            {canManageCompliance && (
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setShowAddRiskModal(true)}
              >
                Log New GRC Risk
              </Button>
            )}
          </div>
        }
      />

      {/* Navigation Quick-Links */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 text-xs dark:border-slate-700">
        <span className="font-semibold text-slate-500 dark:text-slate-400">Security & Compliance:</span>
        <a
          href="#/compliance-grc"
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <span>Statutory Compliance Oversight</span>
          <ArrowUpRight className="h-3 w-3" />
        </a>
        <a
          href="#/compliance/dpdp"
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <span>DPDP 2023 Control Tower</span>
          <ArrowUpRight className="h-3 w-3" />
        </a>
        <span className="rounded-md bg-blue-100 px-2.5 py-1 font-semibold text-brand-blue dark:bg-blue-500/20 dark:text-blue-400">
          GRC Risk Matrix
        </span>
      </div>

      {/* Auditor Read-Only Banner */}
      {operatorRole === 'auditor' && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Auditor Mode (Read-Only):</strong> You have inspection privileges (<code>complianceView</code>). Creating and updating enterprise risks are disabled (<code>complianceManage</code> required).
          </span>
        </div>
      )}

      {/* Action Success Banner */}
      {actionSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Risks */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Identified Risks
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-brand-blue dark:bg-blue-500/10 dark:text-blue-400">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white">
              {metrics.totalCount}
            </span>
            <span className="text-xs text-slate-400">active items</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Cataloged cross-tenant risks</p>
        </div>

        {/* Critical Rating */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Critical Risks
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-rose-600 dark:text-rose-400">
              {metrics.criticalCount}
            </span>
            <span className="text-xs font-semibold text-rose-600">Score &gt; 16</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Requires immediate executive mitigation</p>
        </div>

        {/* High Rating */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              High Severity Risks
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-orange-600 dark:text-orange-400">
              {metrics.highCount}
            </span>
            <span className="text-xs font-semibold text-orange-600">Score 10–16</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Elevated probability or impact</p>
        </div>

        {/* Mitigating Active */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Actively Mitigating
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {metrics.mitigatingCount}
            </span>
            <span className="text-xs text-slate-400">in execution</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Assigned mitigation action plans</p>
        </div>
      </div>

      {/* SECTION 1: 5 × 5 RISK HEAT MATRIX */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
          <div>
            <h2 className="font-heading text-sm font-bold text-slate-900 dark:text-white">
              5 × 5 Probability × Impact Heat Matrix
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Visual risk concentration matrix. Click any cell to filter the register below.
            </p>
          </div>
          {matrixFilter && (
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-brand-blue dark:bg-blue-500/10 dark:text-blue-300">
                Filtered: Likelihood {matrixFilter.likelihood} × Impact {matrixFilter.impact}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setMatrixFilter(null)}>
                Clear Matrix Filter
              </Button>
            </div>
          )}
        </div>

        {/* The 5x5 Grid */}
        <div className="mt-4 flex flex-col items-center">
          <div className="grid grid-cols-6 gap-2 w-full max-w-2xl text-xs font-semibold">
            {/* Header row: Impact labels */}
            <div className="flex items-center justify-center p-2 text-slate-400 font-bold uppercase text-[10px]">
              Impact ↓ \ Likelihood →
            </div>
            {[1, 2, 3, 4, 5].map((l) => (
              <div key={l} className="p-2 text-center text-slate-600 dark:text-slate-300">
                <div className="font-bold">{l}</div>
                <div className="text-[10px] text-slate-400 font-normal">
                  {l === 1 ? 'Rare' : l === 2 ? 'Unlikely' : l === 3 ? 'Possible' : l === 4 ? 'Likely' : 'Almost'}
                </div>
              </div>
            ))}

            {/* Matrix rows: Impact from 5 down to 1 */}
            {[5, 4, 3, 2, 1].map((i) => (
              <>
                {/* Row label */}
                <div key={`label-${i}`} className="flex flex-col justify-center pr-2 text-right text-slate-600 dark:text-slate-300">
                  <div className="font-bold">{i}</div>
                  <div className="text-[10px] text-slate-400 font-normal">
                    {i === 5 ? 'Catastr.' : i === 4 ? 'Major' : i === 3 ? 'Mod.' : i === 2 ? 'Minor' : 'Insign.'}
                  </div>
                </div>

                {/* 5 cells */}
                {[1, 2, 3, 4, 5].map((l) => {
                  const key = `${l}-${i}`;
                  const count = matrixCounts.get(key) ?? 0;
                  const severity = getCellSeverity(l, i);
                  const isSelected = matrixFilter?.likelihood === l && matrixFilter?.impact === i;

                  let bgClass = '';
                  if (severity === 'critical') {
                    bgClass = 'bg-rose-100/80 text-rose-900 border-rose-300 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800';
                  } else if (severity === 'high') {
                    bgClass = 'bg-orange-100/80 text-orange-900 border-orange-300 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-800';
                  } else if (severity === 'medium') {
                    bgClass = 'bg-amber-100/80 text-amber-900 border-amber-300 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800';
                  } else {
                    bgClass = 'bg-emerald-100/80 text-emerald-900 border-emerald-300 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800';
                  }

                  return (
                    <button
                      key={key}
                      onClick={() => setMatrixFilter(isSelected ? null : { likelihood: l, impact: i })}
                      className={`relative flex flex-col items-center justify-center rounded-xl border p-3 transition-all ${bgClass} ${
                        isSelected ? 'ring-2 ring-brand-blue ring-offset-2 scale-105 shadow-md' : ''
                      }`}
                    >
                      <span className="font-mono text-base font-bold">{count}</span>
                      <span className="text-[10px] opacity-75">Score: {l * i}</span>
                    </button>
                  );
                })}
              </>
            ))}
          </div>

          {/* Severity Legend */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-emerald-500" />
              <span className="text-slate-600 dark:text-slate-300">Low (1–6)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-amber-500" />
              <span className="text-slate-600 dark:text-slate-300">Medium (7–9)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-orange-500" />
              <span className="text-slate-600 dark:text-slate-300">High (10–16)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-rose-600" />
              <span className="text-slate-600 dark:text-slate-300">Critical (17–25)</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: CROSS-TENANT RISK REGISTER */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-800/80">
          <div>
            <h2 className="font-heading text-sm font-bold text-slate-900 dark:text-white">
              Enterprise Risk Register ({filteredRisks.length} items)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cross-tenant risks with likelihood, impact, treatment, and mitigation plans
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search risk, category or tenant…"
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All Categories</option>
              <option value="operational">Operational</option>
              <option value="financial">Financial</option>
              <option value="strategic">Strategic</option>
              <option value="compliance">Compliance</option>
              <option value="technology">Technology</option>
              <option value="reputational">Reputational</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All Statuses</option>
              <option value="identified">Identified</option>
              <option value="assessed">Assessed</option>
              <option value="mitigating">Mitigating</option>
              <option value="accepted">Accepted</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-3 text-left">Risk Number & Title</th>
                <th className="px-4 py-3 text-left">Tenant</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">L × I = Score</th>
                <th className="px-4 py-3 text-left">Severity</th>
                <th className="px-4 py-3 text-left">Treatment</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Next Review</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredRisks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-xs text-slate-400">
                    No risk items found matching current filters.
                  </td>
                </tr>
              ) : (
                filteredRisks.map((r) => (
                  <tr key={r.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {r.number}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {r.title}
                        </span>
                        {r.description && (
                          <span className="line-clamp-1 text-[11px] text-slate-400">{r.description}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{r.orgName}</span>
                        <span className="font-mono text-[11px] text-slate-400">{r.orgId}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                        {r.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <span className="text-slate-600 dark:text-slate-300">{r.likelihood}</span>
                        <span className="text-slate-400">×</span>
                        <span className="text-slate-600 dark:text-slate-300">{r.impact}</span>
                        <span className="text-slate-400">=</span>
                        <span className="font-bold text-slate-900 dark:text-white">{r.riskScore}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getSeverityBadge(r.riskRating)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold uppercase text-brand-blue dark:bg-blue-500/10 dark:text-blue-300">
                        {r.treatment || 'mitigate'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {r.reviewDate ? formatDateTime(r.reviewDate) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManageCompliance ? (
                        <button
                          onClick={() => openEditModal(r)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-blue dark:hover:bg-slate-700"
                          title="Update Risk Assessment & Mitigation"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">View Only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Log New GRC Risk */}
      {showAddRiskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-700">
              <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                Log New GRC Risk
              </h3>
              <button onClick={() => setShowAddRiskModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRisk} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Target Tenant</label>
                <select
                  value={riskForm.orgId}
                  onChange={(e) => setRiskForm({ ...riskForm, orgId: e.target.value })}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name} ({o.id})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Risk Title</label>
                <input
                  type="text"
                  required
                  value={riskForm.title}
                  onChange={(e) => setRiskForm({ ...riskForm, title: e.target.value })}
                  placeholder="e.g. Critical Vendor API Gateway Downtime"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Category</label>
                  <select
                    value={riskForm.category}
                    onChange={(e) => setRiskForm({ ...riskForm, category: e.target.value as any })}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="operational">Operational</option>
                    <option value="financial">Financial</option>
                    <option value="strategic">Strategic</option>
                    <option value="compliance">Compliance</option>
                    <option value="technology">Technology</option>
                    <option value="reputational">Reputational</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Treatment Strategy</label>
                  <select
                    value={riskForm.treatment}
                    onChange={(e) => setRiskForm({ ...riskForm, treatment: e.target.value as any })}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="mitigate">Mitigate</option>
                    <option value="accept">Accept</option>
                    <option value="transfer">Transfer</option>
                    <option value="avoid">Avoid</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
                    Likelihood (1–5)
                  </label>
                  <select
                    value={riskForm.likelihood}
                    onChange={(e) => setRiskForm({ ...riskForm, likelihood: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {[1, 2, 3, 4, 5].map((num) => (
                      <option key={num} value={num}>{LIKELIHOOD_LABELS[num]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
                    Impact (1–5)
                  </label>
                  <select
                    value={riskForm.impact}
                    onChange={(e) => setRiskForm({ ...riskForm, impact: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {[1, 2, 3, 4, 5].map((num) => (
                      <option key={num} value={num}>{IMPACT_LABELS[num]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Mitigation Action Plan</label>
                <textarea
                  rows={2}
                  value={riskForm.mitigationPlan}
                  onChange={(e) => setRiskForm({ ...riskForm, mitigationPlan: e.target.value })}
                  placeholder="Specific technical, contractual, or operational safeguards…"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setShowAddRiskModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit">Log Risk to Register</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Update Risk Assessment & Mitigation */}
      {selectedRiskToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-700">
              <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                Update Assessment: {selectedRiskToEdit.number}
              </h3>
              <button onClick={() => setSelectedRiskToEdit(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateRisk} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Risk Title</label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Likelihood (1–5)</label>
                  <select
                    value={editForm.likelihood}
                    onChange={(e) => setEditForm({ ...editForm, likelihood: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {[1, 2, 3, 4, 5].map((num) => (
                      <option key={num} value={num}>{LIKELIHOOD_LABELS[num]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Impact (1–5)</label>
                  <select
                    value={editForm.impact}
                    onChange={(e) => setEditForm({ ...editForm, impact: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {[1, 2, 3, 4, 5].map((num) => (
                      <option key={num} value={num}>{IMPACT_LABELS[num]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Treatment Strategy</label>
                  <select
                    value={editForm.treatment}
                    onChange={(e) => setEditForm({ ...editForm, treatment: e.target.value as any })}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="mitigate">Mitigate</option>
                    <option value="accept">Accept</option>
                    <option value="transfer">Transfer</option>
                    <option value="avoid">Avoid</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="identified">Identified</option>
                    <option value="assessed">Assessed</option>
                    <option value="mitigating">Mitigating</option>
                    <option value="accepted">Accepted</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">Mitigation Action Plan</label>
                <textarea
                  rows={3}
                  value={editForm.mitigationPlan}
                  onChange={(e) => setEditForm({ ...editForm, mitigationPlan: e.target.value })}
                  placeholder="Safeguards, fallback architecture, or control procedures…"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setSelectedRiskToEdit(null)}>Cancel</Button>
                <Button variant="primary" type="submit">Confirm Assessment Update</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
