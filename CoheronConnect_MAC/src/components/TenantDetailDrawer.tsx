import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, Pencil, Save, X, Flag, Send, UserCog,
  ChevronDown, Lock, Unlock, FileDown, Trash2, Loader2, Archive, Sliders, Layers,
  ShieldCheck, Building2, DollarSign, Users, LifeBuoy, ShoppingBag, FileText,
  Activity, RefreshCw, AlertCircle, UserCheck,
} from 'lucide-react';
import type { TenantRecord, WizardStepId } from '../lib/types';
import { STEP_NAMES, INDUSTRIES, COMPANY_SIZES, INDIAN_STATES } from '../lib/types';
import { STEP_FIELD_RULES, validateField, validateStep, isStepValid, type FieldRule } from '../lib/validation';
import { computeCompletion } from '../context/WizardContext';
import { useWizard } from '../context/WizardContext';
import { useAudit } from '../context/AuditContext';
import { useAuth } from '../context/AuthContext';
import { exportTenantCsv, exportTenantJson } from '../lib/export';
import { relativeTime, formatDateTime } from '../lib/time';
import { Button } from './Button';
import { ImpersonationModal } from './ImpersonationModal';
import {
  MODULE_ENTITLEMENTS,
  getTenantFeatureFlags,
  setTenantFeatureFlag,
} from '../lib/api';

interface Props {
  tenant: TenantRecord;
  onClose: () => void;
}

export function TenantDetailDrawer({ tenant: initialTenant, onClose }: Props) {
  const { updateStepData, setFlag, clearFlag, suspendTenant, getTenant } = useWizard();
  const { log } = useAudit();
  const { email } = useAuth();
  const tenant = getTenant(initialTenant.id) ?? initialTenant;

  // Tabs: 'entitlements' (default) | 'onboarding'
  const [activeTab, setActiveTab] = useState<'entitlements' | 'onboarding'>('entitlements');

  // Entitlements state
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [flagsError, setFlagsError] = useState<string | null>(null);
  const [savingFlag, setSavingFlag] = useState<string | null>(null);

  // Onboarding steps state
  const [openSteps, setOpenSteps] = useState<Set<WizardStepId>>(new Set([2, 3, 5]));
  const [overrideMode, setOverrideMode] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<WizardStepId, Record<string, unknown>>>>({});
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagNote, setFlagNote] = useState(tenant.flag.note ?? '');
  const [flagReason, setFlagReason] = useState(tenant.flag.reason ?? 'Incomplete — nudge');
  const [assignOwner, setAssignOwner] = useState(tenant.flag.assignedOwner ?? '');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);

  // Load flags whenever tenant.id changes (ensures clean tenant isolation)
  const loadFlags = useCallback(async () => {
    setFlagsLoading(true);
    setFlagsError(null);
    try {
      const res = await getTenantFeatureFlags(tenant.id);
      setFlags(res);
    } catch (err) {
      setFlagsError(err instanceof Error ? err.message : 'Failed to load module entitlements from server.');
    } finally {
      setFlagsLoading(false);
    }
  }, [tenant.id]);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  // Handle individual toggle switch
  const handleToggleFlag = async (moduleKey: string, moduleName: string) => {
    if (savingFlag) return;
    const prevValue = flags[moduleKey] ?? false;
    const nextValue = !prevValue;

    // Optimistic UI update
    setFlags((prev) => ({ ...prev, [moduleKey]: nextValue }));
    setSavingFlag(moduleKey);
    setFlagsError(null);

    try {
      await setTenantFeatureFlag(tenant.id, moduleKey, nextValue);

      // Server-authoritative refresh
      const fresh = await getTenantFeatureFlags(tenant.id);
      setFlags(fresh);

      // Audit log
      log({
        admin: email ?? 'admin@coheron.tech',
        tenantId: tenant.id,
        tenantName: tenant.companyName,
        action: 'entitlement_toggle',
        summary: `Toggled ${moduleName} ${nextValue ? 'ON' : 'OFF'} for ${tenant.companyName}`,
        before: { [moduleKey]: prevValue },
        after: { [moduleKey]: nextValue },
      });
    } catch (err) {
      // Rollback on failure
      setFlags((prev) => ({ ...prev, [moduleKey]: prevValue }));
      setFlagsError(err instanceof Error ? err.message : `Failed to update entitlement for ${moduleName}`);
    } finally {
      setSavingFlag(null);
    }
  };

  const completion = computeCompletion(tenant.steps);

  const toggleStep = (id: WizardStepId) =>
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const startDraft = (stepId: WizardStepId) => {
    const step = tenant.steps.find((s) => s.id === stepId);
    setDrafts((prev) => ({ ...prev, [stepId]: { ...(step?.data ?? {}) } }));
  };

  const updateDraft = (stepId: WizardStepId, key: string, value: unknown) => {
    setDrafts((prev) => ({
      ...prev,
      [stepId]: { ...(prev[stepId] ?? {}), [key]: value },
    }));
  };

  const handleSave = async (stepId: WizardStepId) => {
    const draft = drafts[stepId];
    if (!draft || !isStepValid(stepId, draft)) return;
    const step = tenant.steps.find((s) => s.id === stepId);
    const before = step?.data ?? {};
    setSaving(true);
    setActionError(null);
    try {
      await updateStepData(tenant.id, stepId, draft);
      log({
        admin: email ?? 'admin@coheron.in',
        tenantId: tenant.id,
        tenantName: tenant.companyName,
        action: 'override_save',
        summary: `Overrode Step ${stepId} (${STEP_NAMES[stepId]})`,
        before,
        after: draft,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[stepId];
        return next;
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save override.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = (stepId: WizardStepId) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[stepId];
      return next;
    });
  };

  const handleFlag = async () => {
    setActionError(null);
    try {
      await setFlag(tenant.id, { flagged: true, note: flagNote, reason: flagReason, assignedOwner: assignOwner || undefined });
      log({
        admin: email ?? 'admin@coheron.in',
        tenantId: tenant.id,
        tenantName: tenant.companyName,
        action: 'flag',
        summary: `Flagged: ${flagReason}${flagNote ? ` — ${flagNote}` : ''}${assignOwner ? ` — owner: ${assignOwner}` : ''}`,
      });
      setFlagOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to flag tenant.');
    }
  };

  const handleUnflag = async () => {
    setActionError(null);
    try {
      await clearFlag(tenant.id);
      log({
        admin: email ?? 'admin@coheron.in',
        tenantId: tenant.id,
        tenantName: tenant.companyName,
        action: 'unflag',
        summary: 'Cleared flag',
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to clear flag.');
    }
  };

  const handleReminder = async () => {
    setActionError(null);
    try {
      const ts = new Date().toISOString();
      await setFlag(tenant.id, { ...tenant.flag, flagged: true, reminderSentAt: ts });
      log({
        admin: email ?? 'admin@coheron.in',
        tenantId: tenant.id,
        tenantName: tenant.companyName,
        action: 'reminder',
        summary: 'Sent onboarding reminder',
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send reminder.');
    }
  };

  const handleAssign = async () => {
    if (!assignOwner.trim()) return;
    setActionError(null);
    try {
      await setFlag(tenant.id, { ...tenant.flag, flagged: true, assignedOwner: assignOwner });
      log({
        admin: email ?? 'admin@coheron.in',
        tenantId: tenant.id,
        tenantName: tenant.companyName,
        action: 'assign_owner',
        summary: `Assigned owner: ${assignOwner}`,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to assign owner.');
    }
  };

  const handleSuspend = async () => {
    setActionError(null);
    setSuspending(true);
    try {
      await suspendTenant(tenant.id);
      log({
        admin: email ?? 'admin@coheron.in',
        tenantId: tenant.id,
        tenantName: tenant.companyName,
        action: 'unflag',
        summary: 'Suspended / archived tenant',
      });
      setConfirmSuspend(false);
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to suspend tenant.');
    } finally {
      setSuspending(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-2xl flex-col bg-slate-50 shadow-2xl animate-slide-in dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-heading text-lg font-semibold text-slate-900 dark:text-white">
                {tenant.companyName}
              </h2>
              {tenant.flag.flagged && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400">
                  <Flag className="h-3 w-3" /> Flagged
                </span>
              )}
            </div>
            <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
              {tenant.id} · {tenant.tenantCode}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Summary strip */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Completion</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={`h-full rounded-full ${completion >= 100 ? 'bg-emerald-500' : completion >= 50 ? 'bg-brand-blue' : 'bg-amber-500'}`}
                style={{ width: `${completion}%` }}
              />
            </div>
            <span className="font-mono text-xs font-medium text-slate-700 dark:text-slate-200">{completion}%</span>
          </div>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {tenant.currentStep ? `Step ${tenant.currentStep} of 7` : 'No step recorded'} · Updated {relativeTime(tenant.lastUpdatedAt)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="warning"
              icon={<UserCheck className="h-3.5 w-3.5" />}
              onClick={() => setShowImpersonateModal(true)}
              disabled={tenant.suspended}
              title={tenant.suspended ? 'Cannot impersonate suspended tenant' : 'Impersonate Tenant User'}
            >
              Impersonate User
            </Button>
            <Button size="sm" variant="ghost" icon={<FileDown className="h-3.5 w-3.5" />} onClick={() => exportTenantCsv(tenant)}>
              CSV
            </Button>
            <Button size="sm" variant="ghost" icon={<FileDown className="h-3.5 w-3.5" />} onClick={() => exportTenantJson(tenant)}>
              JSON
            </Button>
          </div>
        </div>

        {/* Attribution bar */}
        {(tenant.onboardingCompletedBy || tenant.onboardingLastEditedBy || tenant.onboardingCompletedAt) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 bg-slate-50/50 px-5 py-2 text-xs text-slate-500 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-400">
            {tenant.onboardingCompletedBy && (
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-200">Completed by: </span>
                <span>{tenant.onboardingCompletedBy}</span>
                {tenant.onboardingCompletedAt && <span className="text-slate-400"> ({formatDateTime(tenant.onboardingCompletedAt)})</span>}
              </div>
            )}
            {tenant.onboardingLastEditedBy && (
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-200">Last edited by: </span>
                <span>{tenant.onboardingLastEditedBy}</span>
              </div>
            )}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-white px-5 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('entitlements')}
            className={`relative flex items-center gap-2 py-3 px-1 text-xs font-semibold transition-colors ${activeTab === 'entitlements'
                ? 'text-brand-blue dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
          >
            <Sliders className="h-4 w-4" />
            <span>Module Entitlements</span>
            <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              9
            </span>
            {activeTab === 'entitlements' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue dark:bg-blue-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('onboarding')}
            className={`relative ml-6 flex items-center gap-2 py-3 px-1 text-xs font-semibold transition-colors ${activeTab === 'onboarding'
                ? 'text-brand-blue dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
          >
            <Layers className="h-4 w-4" />
            <span>Onboarding Steps</span>
            <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              7
            </span>
            {activeTab === 'onboarding' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue dark:bg-blue-400" />
            )}
          </button>
        </div>

        {activeTab === 'entitlements' ? (
          <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">
            {/* Header info banner */}
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Application Modules Control
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-blue ring-1 ring-inset ring-blue-700/20 dark:bg-blue-500/10 dark:text-blue-400">
                      Plan: {tenant.plan ?? 'Standard'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Configure which application modules are accessible to <strong>{tenant.companyName}</strong> users.
                    Toggles update tenant settings immediately and take effect across all operator sessions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadFlags}
                  disabled={flagsLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700"
                  title="Refresh entitlements from server"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${flagsLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Error banner */}
            {flagsError && (
              <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-brand-danger dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{flagsError}</span>
                </div>
                <button
                  type="button"
                  onClick={loadFlags}
                  className="rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider text-rose-700 underline hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/30"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading State */}
            {flagsLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
                <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Loading entitlements for {tenant.companyName}…
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {MODULE_ENTITLEMENTS.map((mod) => {
                  const isEnabled = flags[mod.key] ?? false;
                  const isSavingThis = savingFlag === mod.key;

                  return (
                    <div
                      key={mod.key}
                      className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700/60">
                          {getModuleIcon(mod.key)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {mod.name}
                            </span>
                            <span
                              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${mod.category === 'Core HR'
                                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                  : mod.category === 'Operations'
                                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                    : mod.category === 'Finance'
                                      ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                                      : mod.category === 'Governance'
                                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                                        : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                                }`}
                            >
                              {mod.category}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                            {mod.description}
                          </p>
                        </div>
                      </div>

                      {/* Toggle Switch */}
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`text-xs font-semibold uppercase tracking-wider ${isEnabled
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400 dark:text-slate-500'
                            }`}
                        >
                          {isEnabled ? 'ON' : 'OFF'}
                        </span>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={isEnabled}
                          disabled={isSavingThis}
                          onClick={() => handleToggleFlag(mod.key, mod.name)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 disabled:cursor-not-allowed ${isEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                        >
                          <span className="sr-only">Toggle {mod.name}</span>
                          <span
                            className={`pointer-events-none relative inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isEnabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                          >
                            {isSavingThis && (
                              <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-slate-600" />
                            )}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Action bar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-800">
              <button
                onClick={() => {
                  if (overrideMode) {
                    setDrafts({});
                  }
                  setOverrideMode((m) => !m);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${overrideMode
                    ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/30 dark:bg-amber-500/10 dark:text-amber-400'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}
              >
                {overrideMode ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {overrideMode ? 'Override mode ON' : 'Enable override'}
              </button>

              {tenant.flag.flagged ? (
                <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={handleUnflag}>
                  Clear flag
                </Button>
              ) : (
                <Button size="sm" variant="ghost" icon={<Flag className="h-3.5 w-3.5" />} onClick={() => setFlagOpen(true)}>
                  Flag
                </Button>
              )}

              {tenant.flag.flagged && (
                <>
                  <Button size="sm" variant="ghost" icon={<Send className="h-3.5 w-3.5" />} onClick={handleReminder}>
                    Send reminder
                  </Button>
                  <div className="flex items-center gap-1.5">
                    <UserCog className="h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={assignOwner}
                      onChange={(e) => setAssignOwner(e.target.value)}
                      placeholder="Assign owner"
                      className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-blue dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    />
                    <Button size="sm" variant="ghost" onClick={handleAssign}>Assign</Button>
                  </div>
                </>
              )}

              <button
                onClick={() => setConfirmSuspend(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-brand-danger transition-all duration-200 hover:scale-[1.02] hover:bg-rose-100 active:scale-[0.98] dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
              >
                <Archive className="h-3.5 w-3.5" />
                Suspend / Archive
              </button>
            </div>

            {/* Error banner */}
            {actionError && (
              <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-5 py-2.5 text-sm text-brand-danger dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
                <button onClick={() => setActionError(null)} className="ml-auto text-xs text-brand-danger hover:underline">Dismiss</button>
              </div>
            )}

            {/* Suspend confirmation */}
            {confirmSuspend && (
              <div className="flex items-center justify-between gap-3 border-b border-rose-200 bg-rose-50 px-5 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
                <div className="flex items-center gap-2 text-sm text-brand-danger dark:text-rose-400">
                  <Archive className="h-4 w-4 shrink-0" />
                  <span>Suspend and archive <strong>{tenant.companyName}</strong>? This is a soft-delete on the server.</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirmSuspend(false)} disabled={suspending}>Cancel</Button>
                  <button
                    onClick={handleSuspend}
                    disabled={suspending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-danger px-3 py-1.5 text-xs font-medium text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    {suspending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                    Confirm suspend
                  </button>
                </div>
              </div>
            )}

            {/* Flag form */}
            {flagOpen && (
              <div className="border-b border-slate-200 bg-amber-50/50 px-5 py-3 dark:border-slate-700 dark:bg-amber-500/5">
                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Reason</label>
                    <select
                      value={flagReason}
                      onChange={(e) => setFlagReason(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <option>Incomplete — nudge</option>
                      <option>Stalled — no activity</option>
                      <option>Invalid data — needs review</option>
                      <option>Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Note (optional)</label>
                    <textarea
                      value={flagNote}
                      onChange={(e) => setFlagNote(e.target.value)}
                      rows={2}
                      className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-brand-blue dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                      placeholder="Add context for the flag…"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="warning" icon={<Flag className="h-3.5 w-3.5" />} onClick={handleFlag}>
                      Confirm flag
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setFlagOpen(false)}>Cancel</Button>
                  </div>
                </div>
              </div>
            )}

            {tenant.flag.flagged && (tenant.flag.note || tenant.flag.assignedOwner || tenant.flag.reminderSentAt) && (
              <div className="border-b border-slate-200 bg-white px-5 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {tenant.flag.reason && <span><span className="font-medium text-slate-600 dark:text-slate-300">Reason:</span> {tenant.flag.reason}</span>}
                  {tenant.flag.note && <span><span className="font-medium text-slate-600 dark:text-slate-300">Note:</span> {tenant.flag.note}</span>}
                  {tenant.flag.assignedOwner && <span><span className="font-medium text-slate-600 dark:text-slate-300">Owner:</span> {tenant.flag.assignedOwner}</span>}
                  {tenant.flag.reminderSentAt && <span><span className="font-medium text-slate-600 dark:text-slate-300">Reminder:</span> {relativeTime(tenant.flag.reminderSentAt)}</span>}
                </div>
              </div>
            )}

            {/* Steps accordion */}
            <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-2">
                {tenant.steps.map((step) => {
                  const isOpen = openSteps.has(step.id);
                  const draft = drafts[step.id];
                  const isEditing = overrideMode && draft !== undefined;
                  const stepErrors = isEditing ? validateStep(step.id, draft ?? {}) : validateStep(step.id, step.data ?? {});
                  const hasErrors = Object.keys(stepErrors).length > 0;

                  return (
                    <div key={step.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                      <button
                        onClick={() => toggleStep(step.id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${step.state === 'complete' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                            : step.state === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                              : step.state === 'acknowledged' || step.state === 'skipped' ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                                : 'bg-slate-50 text-slate-400 dark:bg-slate-800'
                          }`}>
                          {step.id}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{step.name}</p>
                          <p className="text-xs text-slate-400 capitalize">
                            {step.state.replace('_', ' ')}{step.hasData && step.data ? ` · ${Object.keys(step.data).length} fields` : ''}
                          </p>
                        </div>
                        {hasErrors && !isEditing && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs text-brand-danger dark:bg-rose-500/10">
                            <AlertTriangle className="h-3 w-3" /> {Object.keys(stepErrors).length} error(s)
                          </span>
                        )}
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {isOpen && (
                        <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-700">
                          {!step.hasData ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {step.state === 'acknowledged' ? 'Acknowledged' : step.state === 'skipped' ? 'Skipped' : 'Not yet reached'}
                            </p>
                          ) : isEditing && draft ? (
                            <EditStepForm
                              stepId={step.id}
                              draft={draft}
                              errors={stepErrors}
                              saving={saving}
                              onChange={(k, v) => updateDraft(step.id, k, v)}
                              onSave={() => handleSave(step.id)}
                              onCancel={() => handleCancelEdit(step.id)}
                            />
                          ) : (
                            <ViewStepFields stepId={step.id} data={step.data ?? {}} />
                          )}

                          {overrideMode && step.hasData && !isEditing && (
                            <button
                              onClick={() => startDraft(step.id)}
                              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-all duration-200 hover:scale-[1.02] hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit this step
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </aside>

      {showImpersonateModal && (
        <ImpersonationModal
          tenant={tenant}
          onClose={() => setShowImpersonateModal(false)}
        />
      )}
    </>
  );
}

function getModuleIcon(key: string) {
  switch (key) {
    case 'hrms':
      return <Users className="h-4 w-4 text-blue-500" />;
    case 'payroll':
      return <DollarSign className="h-4 w-4 text-emerald-500" />;
    case 'itsm':
      return <LifeBuoy className="h-4 w-4 text-purple-500" />;
    case 'crm':
      return <Building2 className="h-4 w-4 text-amber-500" />;
    case 'finance':
      return <FileText className="h-4 w-4 text-teal-500" />;
    case 'procurement':
      return <ShoppingBag className="h-4 w-4 text-orange-500" />;
    case 'compliance':
      return <ShieldCheck className="h-4 w-4 text-indigo-500" />;
    case 'documents':
      return <FileDown className="h-4 w-4 text-cyan-500" />;
    case 'command_center':
      return <Activity className="h-4 w-4 text-rose-500" />;
    default:
      return <Sliders className="h-4 w-4 text-slate-500" />;
  }
}

function ViewStepFields({ stepId, data }: { stepId: WizardStepId; data: Record<string, unknown> }) {
  const rules = STEP_FIELD_RULES[stepId] ?? [];
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
      {rules.map((rule) => {
        const value = data[rule.key];
        const error = validateField(rule, value);
        const display = rule.type === 'checkbox' ? (value ? 'Yes' : 'No') : (value === undefined || value === '' || value === null) ? '—' : String(value);
        return (
          <div key={rule.key} className="flex flex-col">
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{rule.label}</dt>
            <dd className="flex items-center gap-1.5">
              {rule.type !== 'checkbox' && (
                error ? (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-brand-danger" />
                ) : value !== undefined && value !== '' && value !== null ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : null
              )}
              <span className={`font-mono text-sm ${error ? 'text-brand-danger' : 'text-slate-700 dark:text-slate-200'}`}>
                {display}
              </span>
            </dd>
            {error && (
              <p className="text-xs text-brand-danger">{error}</p>
            )}
            {rule.type === 'checkbox' && (
              <p className="text-xs text-slate-400">{value ? 'Enabled' : 'Disabled'}</p>
            )}
          </div>
        );
      })}
    </dl>
  );
}

function EditStepForm({
  stepId, draft, errors, saving = false, onChange, onSave, onCancel,
}: {
  stepId: WizardStepId;
  draft: Record<string, unknown>;
  errors: Record<string, string>;
  saving?: boolean;
  onChange: (key: string, value: unknown) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const rules = STEP_FIELD_RULES[stepId] ?? [];
  const canSave = Object.keys(validateStep(stepId, draft)).length === 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {rules.map((rule) => (
          <FieldInput key={rule.key} rule={rule} value={draft[rule.key]} error={errors[rule.key]} onChange={(v) => onChange(rule.key, v)} />
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
        <Button size="sm" variant="primary" icon={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} onClick={onSave} disabled={!canSave || saving}>
          {saving ? 'Saving…' : 'Save override'}
        </Button>
        <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={onCancel}>
          Cancel
        </Button>
        {!canSave && (
          <span className="text-xs text-brand-danger">Fix validation errors before saving</span>
        )}
      </div>
    </div>
  );
}

function FieldInput({
  rule, value, error, onChange,
}: { rule: FieldRule; value: unknown; error?: string; onChange: (v: unknown) => void }) {
  const base = `w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-brand-blue dark:bg-slate-900 dark:text-slate-200 ${error ? 'border-brand-danger' : 'border-slate-300 dark:border-slate-600'
    }`;

  if (rule.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
        />
        <span className="text-sm text-slate-700 dark:text-slate-200">{rule.label}</span>
      </label>
    );
  }

  if (rule.type === 'select') {
    const opts = rule.key === 'industry' ? INDUSTRIES : rule.key === 'companySize' ? COMPANY_SIZES : rule.key === 'state' ? INDIAN_STATES : [];
    return (
      <div>
        <label className="mb-0.5 block text-xs font-medium text-slate-500 dark:text-slate-400">{rule.label}</label>
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">Select…</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {error && <p className="mt-0.5 text-xs text-brand-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <label className="mb-0.5 block text-xs font-medium text-slate-500 dark:text-slate-400">{rule.label}</label>
      <input
        type={rule.type === 'number' ? 'number' : 'text'}
        value={String(value ?? '')}
        onChange={(e) => onChange(rule.type === 'number' ? Number(e.target.value) : e.target.value)}
        placeholder={rule.placeholder ?? ''}
        className={base}
      />
      {error && <p className="mt-0.5 text-xs text-brand-danger">{error}</p>}
    </div>
  );
}
