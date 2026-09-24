import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck, AlertTriangle, Calendar, Clock, CheckCircle2,
  XCircle, Plus, RefreshCw, Search, AlertOctagon, Building2,
  ArrowUpRight, Send, Lock, ShieldAlert,
  X, Filter, Info,
} from 'lucide-react';
import { useRouter } from '../lib/router';
import { useAuth } from '../context/AuthContext';
import { useAudit } from '../context/AuditContext';
import {
  getStatutoryCalendar,
  createStatutoryItem,
  updateStatutoryItem,
  getGrcPolicies,
  createGrcPolicy,
  getOrgs,
  getMe,
} from '../lib/api';
import type {
  StatutoryCalendarItem,
  GrcPolicyItem,
  TenantOrganization,
} from '../lib/types';
import { formatDateTime } from '../lib/time';

type MainCategory = 'all' | 'GST' | 'TDS' | 'EPF / ESI' | 'MCA';

const SUBCATEGORIES: Record<MainCategory, string[]> = {
  all: [],
  GST: ['GSTR-1', 'GSTR-3B'],
  TDS: ['Challan 281', '24Q', '26Q'],
  'EPF / ESI': ['Monthly contribution'],
  MCA: ['AOC-4', 'MGT-7', 'DIR-3 KYC'],
};

export function ComplianceGrcPage() {
  const { navigate } = useRouter();
  const { email: operatorEmail } = useAuth();
  const { log, refresh: refreshAuditLogs } = useAudit();

  const [activeView, setActiveView] = useState<'statutory' | 'policies'>('statutory');
  const [calendarItems, setCalendarItems] = useState<StatutoryCalendarItem[]>([]);
  const [policiesList, setPoliciesList] = useState<GrcPolicyItem[]>([]);
  const [orgsList, setOrgsList] = useState<TenantOrganization[]>([]);
  const [operatorRole, setOperatorRole] = useState<string>('super_admin');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MainCategory>('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  const [statutoryStatusFilter, setStatutoryStatusFilter] = useState<string>('all');

  // Modals state
  const [showAddDeadlineModal, setShowAddDeadlineModal] = useState(false);
  const [showMarkFiledModal, setShowMarkFiledModal] = useState<StatutoryCalendarItem | null>(null);
  const [showNudgeModal, setShowNudgeModal] = useState<StatutoryCalendarItem | null>(null);
  const [inspectTenantOrgId, setInspectTenantOrgId] = useState<string | null>(null);
  const [showAddPolicyModal, setShowAddPolicyModal] = useState(false);

  // Mark as Filed Form state
  const [filedConfirmation, setFiledConfirmation] = useState(false);
  const [filedForm, setFiledForm] = useState({
    srn: '',
    filedDate: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [markFiledSubmitting, setMarkFiledSubmitting] = useState(false);
  const [markFiledError, setMarkFiledError] = useState<string | null>(null);

  // Nudge Form state
  const [nudgeCustomNote, setNudgeCustomNote] = useState('');
  const [nudgeSubmitting, setNudgeSubmitting] = useState(false);

  // Add Deadline Form state
  const [deadlineForm, setDeadlineForm] = useState({
    orgId: '',
    complianceType: 'monthly' as 'annual' | 'event_based' | 'monthly' | 'quarterly',
    eventName: '',
    mcaForm: '',
    financialYear: '2025-26',
    dueDate: '',
    penaltyPerDayInr: '100',
    notes: '',
  });

  // Policy Form state
  const [policyForm, setPolicyForm] = useState({
    orgId: '',
    title: '',
    content: '',
    category: 'Information Security',
    reviewCycleMonths: 12,
    status: 'published' as 'draft' | 'review' | 'approved' | 'published' | 'retired',
  });

  // Check operator capability (complianceView permits viewing, complianceManage permits mutations)
  const hasComplianceView = operatorRole !== 'support_staff';
  const canManageCompliance = operatorRole !== 'auditor' && hasComplianceView;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [calendarData, policiesData, orgsData, me] = await Promise.all([
        getStatutoryCalendar(),
        getGrcPolicies(),
        getOrgs(),
        getMe().catch(() => null),
      ]);
      setCalendarItems(calendarData);
      setPoliciesList(policiesData);
      setOrgsList(orgsData);
      if (me?.user?.role) {
        setOperatorRole(me.user.role);
      }

      if (orgsData.length > 0 && !deadlineForm.orgId) {
        setDeadlineForm((prev) => ({ ...prev, orgId: orgsData[0].id }));
        setPolicyForm((prev) => ({ ...prev, orgId: orgsData[0].id }));
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load Statutory Compliance data from backend');
    } finally {
      setLoading(false);
    }
  }, [deadlineForm.orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // KPI calculations
  const kpiMetrics = useMemo(() => {
    const totalObligations = calendarItems.length;
    const filedCompliant = calendarItems.filter((i) => i.status === 'filed').length;
    const dueSoon = calendarItems.filter((i) => i.status === 'due_soon').length;
    const overdue = calendarItems.filter((i) => i.status === 'overdue').length;

    let totalPenalty = 0;
    const criticalOrgs = new Set<string>();

    for (const item of calendarItems) {
      const penalty = parseFloat(item.totalPenaltyInr || '0') || ((item.daysOverdue || 0) * (parseFloat(item.penaltyPerDayInr) || 0));
      totalPenalty += penalty;

      if (item.status === 'overdue' || penalty > 0) {
        criticalOrgs.add(item.orgId);
      }
    }

    return {
      totalObligations,
      filedCompliant,
      dueSoon,
      overdue,
      totalPenaltyExposure: totalPenalty,
      criticalTenantsCount: criticalOrgs.size,
    };
  }, [calendarItems]);

  // Filtered Statutory Deadlines
  const filteredDeadlines = useMemo(() => {
    return calendarItems.filter((item) => {
      // Status filter
      if (statutoryStatusFilter !== 'all' && item.status !== statutoryStatusFilter) {
        return false;
      }

      // Category match
      const searchableText = `${item.eventName} ${item.mcaForm || ''} ${item.complianceType || ''}`.toLowerCase();

      if (selectedCategory !== 'all') {
        if (selectedCategory === 'GST') {
          const isGst = searchableText.includes('gst');
          if (!isGst) return false;
          if (selectedSubcategory === 'GSTR-1' && !searchableText.includes('gstr-1') && !searchableText.includes('gstr1')) {
            return false;
          }
          if (selectedSubcategory === 'GSTR-3B' && !searchableText.includes('gstr-3b') && !searchableText.includes('gstr3b')) {
            return false;
          }
        } else if (selectedCategory === 'TDS') {
          const isTds = searchableText.includes('tds') || searchableText.includes('281') || searchableText.includes('24q') || searchableText.includes('26q');
          if (!isTds) return false;
          if (selectedSubcategory === 'Challan 281' && !searchableText.includes('281')) {
            return false;
          }
          if (selectedSubcategory === '24Q' && !searchableText.includes('24q')) {
            return false;
          }
          if (selectedSubcategory === '26Q' && !searchableText.includes('26q')) {
            return false;
          }
        } else if (selectedCategory === 'EPF / ESI') {
          const isEpfEsi = searchableText.includes('epf') || searchableText.includes('esi') || searchableText.includes('pf') || searchableText.includes('provident');
          if (!isEpfEsi) return false;
          if (selectedSubcategory === 'Monthly contribution' && !searchableText.includes('monthly') && !searchableText.includes('contribution')) {
            return false;
          }
        } else if (selectedCategory === 'MCA') {
          const isMca = searchableText.includes('mca') || searchableText.includes('aoc-4') || searchableText.includes('mgt-7') || searchableText.includes('dir-3') || searchableText.includes('annual');
          if (!isMca) return false;
          if (selectedSubcategory === 'AOC-4' && !searchableText.includes('aoc-4') && !searchableText.includes('aoc4')) {
            return false;
          }
          if (selectedSubcategory === 'MGT-7' && !searchableText.includes('mgt-7') && !searchableText.includes('mgt7')) {
            return false;
          }
          if (selectedSubcategory === 'DIR-3 KYC' && !searchableText.includes('dir-3') && !searchableText.includes('kyc')) {
            return false;
          }
        }
      }

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesEvent = item.eventName.toLowerCase().includes(q);
        const matchesOrg = (item.orgName || '').toLowerCase().includes(q) || item.orgId.toLowerCase().includes(q);
        const matchesForm = (item.mcaForm || '').toLowerCase().includes(q);
        if (!matchesEvent && !matchesOrg && !matchesForm) return false;
      }

      return true;
    });
  }, [calendarItems, selectedCategory, selectedSubcategory, statutoryStatusFilter, searchQuery]);

  // Selected tenant items for drill-down modal
  const inspectTenantItems = useMemo(() => {
    if (!inspectTenantOrgId) return [];
    return calendarItems.filter((i) => i.orgId === inspectTenantOrgId);
  }, [calendarItems, inspectTenantOrgId]);

  const inspectTenantName = useMemo(() => {
    if (!inspectTenantOrgId) return '';
    const found = calendarItems.find((i) => i.orgId === inspectTenantOrgId);
    return found?.orgName || orgsList.find((o) => o.id === inspectTenantOrgId)?.name || inspectTenantOrgId;
  }, [calendarItems, inspectTenantOrgId, orgsList]);

  // Handler: Mark as Filed
  async function handleMarkFiledSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!showMarkFiledModal) return;
    if (!filedConfirmation) {
      setMarkFiledError('Please verify filing confirmation before proceeding.');
      return;
    }
    if (!filedForm.srn.trim()) {
      setMarkFiledError('SRN / Acknowledgement number is required.');
      return;
    }
    if (!filedForm.filedDate) {
      setMarkFiledError('Filing date is required.');
      return;
    }

    setMarkFiledSubmitting(true);
    setMarkFiledError(null);
    try {
      await updateStatutoryItem(showMarkFiledModal.id, {
        status: 'filed',
        srn: filedForm.srn.trim(),
        filedDate: filedForm.filedDate,
        notes: filedForm.notes ? filedForm.notes.trim() : undefined,
      });

      // Server already written to super_admin_audit_logs; refresh audit logs from server
      await refreshAuditLogs();

      setActionSuccess(`Filing recorded as filed with SRN: ${filedForm.srn.trim()}`);
      setShowMarkFiledModal(null);
      await loadData();
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: unknown) {
      setMarkFiledError(err instanceof Error ? err.message : 'Failed to mark statutory obligation as filed');
    } finally {
      setMarkFiledSubmitting(false);
    }
  }

  // Handler: Send Statutory Nudge
  async function handleSendNudgeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!showNudgeModal) return;

    setNudgeSubmitting(true);
    try {
      log({
        admin: operatorEmail || 'admin@coheron.tech',
        tenantId: showNudgeModal.orgId,
        tenantName: showNudgeModal.orgName || 'Tenant',
        action: 'statutory_nudge',
        summary: `Dispatched statutory compliance nudge to ${showNudgeModal.orgName || showNudgeModal.orgId} for ${showNudgeModal.eventName}`,
        before: {},
        after: {
          obligationId: showNudgeModal.id,
          obligationName: showNudgeModal.eventName,
          dueDate: showNudgeModal.dueDate,
          daysOverdue: showNudgeModal.daysOverdue,
          penaltyExposureInr: showNudgeModal.totalPenaltyInr,
          operatorAttribution: operatorEmail || 'admin@coheron.tech',
          customNote: nudgeCustomNote.trim() || undefined,
        },
      });

      setActionSuccess(
        `Statutory nudge logged for ${showNudgeModal.orgName || showNudgeModal.orgId} (${showNudgeModal.eventName}). Operator attribution recorded in audit log.`
      );
      setShowNudgeModal(null);
      setNudgeCustomNote('');
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record statutory nudge');
    } finally {
      setNudgeSubmitting(false);
    }
  }

  // Handler: Create Statutory Deadline
  async function handleCreateDeadline(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createStatutoryItem(deadlineForm);
      setShowAddDeadlineModal(false);
      setActionSuccess('Statutory filing deadline created successfully.');
      await loadData();
      await refreshAuditLogs();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create statutory deadline');
    }
  }

  // Handler: Create Policy
  async function handleCreatePolicy(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createGrcPolicy(policyForm);
      setShowAddPolicyModal(false);
      setActionSuccess('Governance policy created and published.');
      await loadData();
      await refreshAuditLogs();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create policy');
    }
  }

  function getFilingStatusBadge(status: string) {
    switch (status) {
      case 'filed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> Compliant
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            <XCircle className="h-3 w-3" /> Overdue
          </span>
        );
      case 'due_soon':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" /> Due Soon
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            <Clock className="h-3 w-3" /> Upcoming
          </span>
        );
    }
  }

  function getSeverityBadge(item: StatutoryCalendarItem) {
    if (item.status === 'filed') {
      return (
        <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
          Compliant
        </span>
      );
    }
    const penalty = parseFloat(item.totalPenaltyInr || '0');
    if (item.status === 'overdue' && (item.daysOverdue > 15 || penalty >= 5000)) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-xs">
          <AlertOctagon className="h-3 w-3" /> Critical
        </span>
      );
    }
    if (item.status === 'overdue') {
      return (
        <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
          Overdue
        </span>
      );
    }
    if (item.status === 'due_soon') {
      return (
        <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
          Due Soon
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        Low
      </span>
    );
  }

  function computeDaysText(item: StatutoryCalendarItem) {
    if (item.status === 'filed') {
      return <span className="text-emerald-600 font-medium">Filed</span>;
    }
    if (item.status === 'overdue') {
      return <span className="font-bold text-rose-600 dark:text-rose-400">{item.daysOverdue} days overdue</span>;
    }
    const diff = new Date(item.dueDate).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) {
      return <span className="font-bold text-amber-600">Due today</span>;
    }
    return <span className="text-slate-600 dark:text-slate-300 font-medium">{days} days remaining</span>;
  }

  if (!loading && !hasComplianceView) {
    return (
      <div className="space-y-6 pb-12">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/20">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold text-slate-900 dark:text-white">Compliance Oversight</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cross-tenant statutory compliance control tower
            </p>
          </div>
        </div>
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
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold text-slate-900 dark:text-white">Compliance Oversight</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cross-tenant statutory compliance control tower
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Shortcuts & Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={() => setActiveView('statutory')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeView === 'statutory'
                  ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-800 dark:text-indigo-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Statutory
            </button>
            <button
              onClick={() => navigate('/compliance/dpdp')}
              className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              <Lock className="h-3 w-3 text-blue-500" />
              <span>DPDP 2023</span>
              <ArrowUpRight className="h-3 w-3 opacity-60" />
            </button>
            <button
              onClick={() => navigate('/compliance/grc-risks')}
              className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              <ShieldAlert className="h-3 w-3 text-orange-500" />
              <span>GRC Risks</span>
              <ArrowUpRight className="h-3 w-3 opacity-60" />
            </button>
            <button
              onClick={() => setActiveView('policies')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeView === 'policies'
                  ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-800 dark:text-indigo-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Policies
            </button>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 text-xs font-medium text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-xs font-medium text-rose-800 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Auditor Read-Only Banner */}
      {operatorRole === 'auditor' && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Auditor Mode (Read-Only):</strong> You have inspection privileges (<code>complianceView</code>). Administrative actions, filing confirmations, and statutory nudges are disabled (<code>complianceManage</code> required).
          </span>
        </div>
      )}

      {/* KPI / Exposure Area: 6 Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {/* KPI 1: Total Statutory Obligations */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
              Total Obligations
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Calendar className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-extrabold text-slate-900 dark:text-white">
              {kpiMetrics.totalObligations}
            </span>
            <span className="text-[11px] text-slate-500">active</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Across all registered tenants</p>
        </div>

        {/* KPI 2: Filed / Compliant */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
              Filed / Compliant
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {kpiMetrics.filedCompliant}
            </span>
            <span className="text-[11px] text-emerald-600 font-medium">with SRN</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            {kpiMetrics.totalObligations > 0
              ? `${Math.round((kpiMetrics.filedCompliant / kpiMetrics.totalObligations) * 100)}% compliance rate`
              : 'No obligations'}
          </p>
        </div>

        {/* KPI 3: Due Soon */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
              Due Soon
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-extrabold text-amber-600 dark:text-amber-400">
              {kpiMetrics.dueSoon}
            </span>
            <span className="text-[11px] text-amber-600 font-medium">&lt;15 days</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Upcoming filing deadlines</p>
        </div>

        {/* KPI 4: Overdue */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
              Overdue
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
              <XCircle className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-extrabold text-rose-600 dark:text-rose-400">
              {kpiMetrics.overdue}
            </span>
            <span className="text-[11px] text-rose-600 font-medium">breached</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Immediate nudge required</p>
        </div>

        {/* KPI 5: Total Penalty Exposure */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
              Penalty Exposure
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
              <span className="font-bold text-xs">₹</span>
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-heading text-xl font-extrabold text-slate-900 dark:text-white">
              ₹{kpiMetrics.totalPenaltyExposure.toLocaleString('en-IN')}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Accrued statutory liability</p>
        </div>

        {/* KPI 6: Critical Tenants */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
              Critical Tenants
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
              <AlertOctagon className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-extrabold text-rose-600 dark:text-rose-400">
              {kpiMetrics.criticalTenantsCount}
            </span>
            <span className="text-[11px] text-rose-600 font-medium">at risk</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Tenants with overdue returns</p>
        </div>
      </div>

      {activeView === 'statutory' ? (
        <div className="space-y-4">
          {/* Category Filter Chips & Subcategory Chips */}
          <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {/* Primary Category Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" /> Category:
              </span>
              {(['all', 'GST', 'TDS', 'EPF / ESI', 'MCA'] as MainCategory[]).map((cat) => {
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setSelectedSubcategory('all');
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {cat === 'all' ? 'All Categories' : cat}
                  </button>
                );
              })}
            </div>

            {/* Subcategory Filter Chips when active */}
            {selectedCategory !== 'all' && SUBCATEGORIES[selectedCategory].length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mr-1">
                  {selectedCategory} Subcategories:
                </span>
                <button
                  onClick={() => setSelectedSubcategory('all')}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                    selectedSubcategory === 'all'
                      ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-400'
                  }`}
                >
                  All {selectedCategory}
                </button>
                {SUBCATEGORIES[selectedCategory].map((subcat) => (
                  <button
                    key={subcat}
                    onClick={() => setSelectedSubcategory(subcat)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                      selectedSubcategory === subcat
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-400'
                    }`}
                  >
                    {subcat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search Bar & Action Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search obligation, form, or tenant ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-72 rounded-lg border border-slate-200 bg-white pr-3 pl-8 text-xs text-slate-900 shadow-xs focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <select
                value={statutoryStatusFilter}
                onChange={(e) => setStatutoryStatusFilter(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 shadow-xs focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">All Filing Statuses</option>
                <option value="overdue">Overdue</option>
                <option value="due_soon">Due Soon (&lt;15d)</option>
                <option value="upcoming">Upcoming</option>
                <option value="filed">Compliant / Filed</option>
              </select>

              {(selectedCategory !== 'all' || selectedSubcategory !== 'all' || statutoryStatusFilter !== 'all' || searchQuery) && (
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setSelectedSubcategory('all');
                    setStatutoryStatusFilter('all');
                    setSearchQuery('');
                  }}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <X className="h-3 w-3" /> Clear filters
                </button>
              )}
            </div>

            {canManageCompliance && (
              <button
                onClick={() => setShowAddDeadlineModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" />
                + Add Statutory Obligation
              </button>
            )}
          </div>

          {/* Statutory Calendar Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Obligation</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Tenant & ID</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3">Filing Status</th>
                    <th className="px-4 py-3">Days Remaining / Overdue</th>
                    <th className="px-4 py-3">Penalty Exposure</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredDeadlines.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                        No statutory compliance items match your search and filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredDeadlines.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        {/* 1. Obligation */}
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-900 dark:text-white">{item.eventName}</div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {item.mcaForm && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                Form: {item.mcaForm}
                              </span>
                            )}
                            {item.srn && (
                              <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                                SRN: {item.srn}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 2. Category */}
                        <td className="px-4 py-3.5">
                          <span className="capitalize font-medium text-slate-800 dark:text-slate-200">
                            {item.complianceType.replace('_', ' ')}
                          </span>
                          <div className="text-[10px] text-slate-400">FY {item.financialYear}</div>
                        </td>

                        {/* 3. Tenant & ID */}
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => setInspectTenantOrgId(item.orgId)}
                            className="text-left font-medium text-indigo-600 hover:text-indigo-800 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                          >
                            {item.orgName || 'Platform / Global'}
                          </button>
                          <div className="font-mono text-[10px] text-slate-400">
                            ID: {item.orgId}
                          </div>
                        </td>

                        {/* 4. Due Date */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {formatDateTime(item.dueDate).split(',')[0]}
                          </div>
                        </td>

                        {/* 5. Filing Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {getFilingStatusBadge(item.status)}
                        </td>

                        {/* 6. Days Remaining / Overdue */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {computeDaysText(item)}
                        </td>

                        {/* 7. Penalty Exposure */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="font-mono font-medium text-slate-900 dark:text-white">
                            ₹{item.penaltyPerDayInr}/day
                          </div>
                          {parseFloat(item.totalPenaltyInr) > 0 ? (
                            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                              Accrued: ₹{parseFloat(item.totalPenaltyInr).toLocaleString('en-IN')}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">₹0 accrued</span>
                          )}
                        </td>

                        {/* 8. Severity */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {getSeverityBadge(item)}
                        </td>

                        {/* 9. Actions */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Inspect Tenant Drill-down */}
                            <button
                              onClick={() => setInspectTenantOrgId(item.orgId)}
                              title="Inspect Tenant Compliance"
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              Inspect
                            </button>

                            {/* Send Nudge (Only if not filed and has manage permissions) */}
                            {item.status !== 'filed' && canManageCompliance && (
                              <button
                                onClick={() => setShowNudgeModal(item)}
                                title="Send Statutory Nudge"
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 shadow-xs transition hover:bg-amber-100 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300"
                              >
                                <Send className="h-3 w-3" />
                                Nudge
                              </button>
                            )}

                            {/* Mark as Filed (Only if not filed and has manage permissions) */}
                            {item.status !== 'filed' && canManageCompliance && (
                              <button
                                onClick={() => {
                                  setShowMarkFiledModal(item);
                                  setFiledConfirmation(false);
                                  setMarkFiledError(null);
                                  setFiledForm({
                                    srn: item.srn || '',
                                    filedDate: new Date().toISOString().split('T')[0],
                                    notes: '',
                                  });
                                }}
                                className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 shadow-xs transition hover:bg-indigo-100 dark:border-indigo-800/40 dark:bg-indigo-950/40 dark:text-indigo-300"
                              >
                                Mark Filed
                              </button>
                            )}

                            {!canManageCompliance && (
                              <span className="text-[10px] text-slate-400 italic">View Only</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Policies View (Preserved) */
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heading text-base font-bold text-slate-900 dark:text-white">
                Platform Governance Policies & Controls
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Statutory regulatory policy documents and enterprise review cycles
              </p>
            </div>
            {canManageCompliance && (
              <button
                onClick={() => setShowAddPolicyModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" />
                + Create Policy
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Policy Title</th>
                    <th className="px-4 py-3">Tenant / Org</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Review Cycle</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {policiesList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        No governance policies found.
                      </td>
                    </tr>
                  ) : (
                    policiesList.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-900 dark:text-white">{item.title}</div>
                          <div className="text-[10px] text-slate-400">Version {item.version}</div>
                        </td>
                        <td className="px-4 py-3.5">{item.orgName || 'Global'}</td>
                        <td className="px-4 py-3.5">{item.category}</td>
                        <td className="px-4 py-3.5">{item.reviewCycleMonths} months</td>
                        <td className="px-4 py-3.5 capitalize">
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {item.publishedAt ? formatDateTime(item.publishedAt) : item.lastReviewed ? formatDateTime(item.lastReviewed) : 'Active'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 1: MARK AS FILED ── */}
      {showMarkFiledModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                    Mark Statutory Obligation as Filed
                  </h3>
                  <p className="text-[11px] text-slate-500">Record filing acknowledgement and SRN number</p>
                </div>
              </div>
              <button
                onClick={() => setShowMarkFiledModal(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleMarkFiledSubmit} className="mt-4 space-y-4">
              {markFiledError && (
                <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                  {markFiledError}
                </div>
              )}

              {/* Target Obligation & Tenant Readout */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Obligation:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{showMarkFiledModal.eventName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tenant / Org:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{showMarkFiledModal.orgName} ({showMarkFiledModal.orgId})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Statutory Due Date:</span>
                  <span className="font-medium">{formatDateTime(showMarkFiledModal.dueDate).split(',')[0]}</span>
                </div>
              </div>

              {/* SRN / Acknowledgement Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  SRN / Acknowledgement Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SRN-2026-98124578"
                  value={filedForm.srn}
                  onChange={(e) => setFiledForm({ ...filedForm, srn: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white font-mono"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  Service Request Number (MCA) or Acknowledgement Receipt Number (GST/TDS)
                </p>
              </div>

              {/* Filing Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Filing Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={filedForm.filedDate}
                  onChange={(e) => setFiledForm({ ...filedForm, filedDate: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Filing Notes / Challan Details (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Verified on MCA21 / GSTN portal"
                  value={filedForm.notes}
                  onChange={(e) => setFiledForm({ ...filedForm, notes: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Confirmation Checkbox */}
              <div className="flex items-start gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <input
                  type="checkbox"
                  id="confirmFilingCheck"
                  checked={filedConfirmation}
                  onChange={(e) => setFiledConfirmation(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                />
                <label htmlFor="confirmFilingCheck" className="text-xs text-slate-600 dark:text-slate-400">
                  I confirm this statutory filing has been validated on the statutory portal. MAC operator attribution ({operatorEmail || 'superadmin'}) will be written to the server audit trail.
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMarkFiledModal(null)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={markFiledSubmitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {markFiledSubmitting ? 'Recording...' : 'Confirm & Mark as Filed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: SEND STATUTORY NUDGE ── */}
      {showNudgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                  <Send className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                    Send Statutory Nudge
                  </h3>
                  <p className="text-[11px] text-slate-500">Record and dispatch compliance notification</p>
                </div>
              </div>
              <button
                onClick={() => setShowNudgeModal(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSendNudgeSubmit} className="mt-4 space-y-4">
              {/* Obligation Summary */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Target Tenant:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{showNudgeModal.orgName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tenant ID:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{showNudgeModal.orgId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Obligation:</span>
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">{showNudgeModal.eventName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Due Date:</span>
                  <span className="font-medium">{formatDateTime(showNudgeModal.dueDate).split(',')[0]}</span>
                </div>
                {showNudgeModal.status === 'overdue' && (
                  <div className="flex justify-between text-rose-600 font-semibold">
                    <span>Days Overdue:</span>
                    <span>{showNudgeModal.daysOverdue} days (₹{showNudgeModal.totalPenaltyInr} penalty)</span>
                  </div>
                )}
              </div>

              {/* Attribution Notice */}
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="font-medium">Operator Attribution & Audit Trail</p>
                  <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                    This statutory nudge will record operator <strong>{operatorEmail || 'superadmin'}</strong> in the platform audit log. Automated email/SMS dispatch routes via the tenant communication gateway where configured.
                  </p>
                </div>
              </div>

              {/* Custom Note */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Additional Operator Guidance / Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Please upload the GSTR-3B challan or input SRN before end of business."
                  value={nudgeCustomNote}
                  onChange={(e) => setNudgeCustomNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNudgeModal(null)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={nudgeSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {nudgeSubmitting ? 'Logging...' : 'Dispatch Statutory Nudge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 3: TENANT DRILL-DOWN INSPECTION ── */}
      {inspectTenantOrgId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                    Tenant Compliance Inspection
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {inspectTenantName} · ID: {inspectTenantOrgId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectTenantOrgId(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 overflow-y-auto space-y-4 pr-1">
              {/* Tenant Quick Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Obligations</div>
                  <div className="mt-1 font-heading text-lg font-bold text-slate-900 dark:text-white">
                    {inspectTenantItems.length}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Overdue</div>
                  <div className="mt-1 font-heading text-lg font-bold text-rose-600">
                    {inspectTenantItems.filter((i) => i.status === 'overdue').length}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Penalty Accrued</div>
                  <div className="mt-1 font-heading text-lg font-bold text-slate-900 dark:text-white">
                    ₹{inspectTenantItems.reduce((acc, i) => acc + (parseFloat(i.totalPenaltyInr || '0') || 0), 0).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Obligations Table for Tenant */}
              <div className="rounded-xl border border-slate-200 overflow-hidden dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-3 py-2">Obligation</th>
                      <th className="px-3 py-2">Due Date</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {inspectTenantItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                          No statutory obligations logged for this tenant.
                        </td>
                      </tr>
                    ) : (
                      inspectTenantItems.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                            {item.eventName}
                            {item.mcaForm && (
                              <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.2 font-mono text-[9px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                {item.mcaForm}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {formatDateTime(item.dueDate).split(',')[0]}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {getFilingStatusBadge(item.status)}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            {item.status !== 'filed' && canManageCompliance && (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    setInspectTenantOrgId(null);
                                    setShowNudgeModal(item);
                                  }}
                                  className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
                                >
                                  Nudge
                                </button>
                                <button
                                  onClick={() => {
                                    setInspectTenantOrgId(null);
                                    setShowMarkFiledModal(item);
                                    setFiledConfirmation(false);
                                    setFiledForm({
                                      srn: item.srn || '',
                                      filedDate: new Date().toISOString().split('T')[0],
                                      notes: '',
                                    });
                                  }}
                                  className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                                >
                                  Mark Filed
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                onClick={() => setInspectTenantOrgId(null)}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: ADD STATUTORY DEADLINE (PRESERVED) ── */}
      {showAddDeadlineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                  <Plus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                    Add Statutory Compliance Obligation
                  </h3>
                  <p className="text-[11px] text-slate-500">Log statutory filing deadline across tenants</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddDeadlineModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDeadline} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Target Tenant Organization <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={deadlineForm.orgId}
                  onChange={(e) => setDeadlineForm({ ...deadlineForm, orgId: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {orgsList.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.id.slice(0, 8)}...)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Obligation Event Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GSTR-3B Monthly Return, TDS Challan 281"
                  value={deadlineForm.eventName}
                  onChange={(e) => setDeadlineForm({ ...deadlineForm, eventName: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Category Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={deadlineForm.complianceType}
                    onChange={(e) => setDeadlineForm({ ...deadlineForm, complianceType: e.target.value as any })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                    <option value="event_based">Event Based</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Form Name / Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GSTR-1, AOC-4"
                    value={deadlineForm.mcaForm}
                    onChange={(e) => setDeadlineForm({ ...deadlineForm, mcaForm: e.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Statutory Due Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={deadlineForm.dueDate}
                    onChange={(e) => setDeadlineForm({ ...deadlineForm, dueDate: e.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Penalty per Day (INR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={deadlineForm.penaltyPerDayInr}
                    onChange={(e) => setDeadlineForm({ ...deadlineForm, penaltyPerDayInr: e.target.value })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddDeadlineModal(false)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Save Obligation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 5: ADD POLICY (PRESERVED) ── */}
      {showAddPolicyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                Create Governance Policy
              </h3>
              <button onClick={() => setShowAddPolicyModal(false)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreatePolicy} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Target Tenant
                </label>
                <select
                  value={policyForm.orgId}
                  onChange={(e) => setPolicyForm({ ...policyForm, orgId: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {orgsList.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Policy Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Information Security Policy"
                  value={policyForm.title}
                  onChange={(e) => setPolicyForm({ ...policyForm, title: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Category
                </label>
                <input
                  type="text"
                  value={policyForm.category}
                  onChange={(e) => setPolicyForm({ ...policyForm, category: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddPolicyModal(false)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Publish Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
