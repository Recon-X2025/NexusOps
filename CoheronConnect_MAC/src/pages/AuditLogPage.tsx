import { useState, useMemo } from 'react';
import {
  ScrollText,
  Pencil,
  Flag,
  Send,
  UserCog,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Search,
  Filter,
  Download,
  Eye,
  X,
  Lock,
  Sliders,
  Wallet,
} from 'lucide-react';
import { useAudit } from '../context/AuditContext';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { formatDateTime, relativeTime } from '../lib/time';
import { getToken, parseJwt, exportAuditLogs } from '../lib/api';
import type { AuditEntry } from '../lib/types';

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  override_save: {
    label: 'Override save',
    icon: <Pencil className="h-3.5 w-3.5" />,
    cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  },
  UPDATE_WIZARD_DATA: {
    label: 'Wizard Update',
    icon: <Pencil className="h-3.5 w-3.5" />,
    cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  },
  flag: {
    label: 'Flagged',
    icon: <Flag className="h-3.5 w-3.5" />,
    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  },
  FLAG_ORG: {
    label: 'Flagged',
    icon: <Flag className="h-3.5 w-3.5" />,
    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  },
  unflag: {
    label: 'Unflagged',
    icon: <Trash2 className="h-3.5 w-3.5" />,
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  },
  UNFLAG_ORG: {
    label: 'Unflagged',
    icon: <Trash2 className="h-3.5 w-3.5" />,
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  },
  suspend: {
    label: 'Suspended',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    cls: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
  },
  SUSPEND_ORG: {
    label: 'Suspended',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    cls: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
  },
  resume: {
    label: 'Resumed',
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  },
  RESUME_ORG: {
    label: 'Resumed',
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  },
  reminder: {
    label: 'Reminder sent',
    icon: <Send className="h-3.5 w-3.5" />,
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  },
  assign_owner: {
    label: 'Owner assigned',
    icon: <UserCog className="h-3.5 w-3.5" />,
    cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400',
  },
  SET_FEATURE_FLAG: {
    label: 'Flag Override',
    icon: <Sliders className="h-3.5 w-3.5" />,
    cls: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400',
  },
  RESET_FEATURE_FLAG: {
    label: 'Flag Reset',
    icon: <Sliders className="h-3.5 w-3.5" />,
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  },
  OVERRIDE_SUBSCRIPTION: {
    label: 'Plan Override',
    icon: <Wallet className="h-3.5 w-3.5" />,
    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  },
  EXPORT_AUDIT_LOGS: {
    label: 'Audit Export',
    icon: <Download className="h-3.5 w-3.5" />,
    cls: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400',
  },
  REVOKE_ALL_OPERATOR_SESSIONS: {
    label: 'Session Revocation',
    icon: <Lock className="h-3.5 w-3.5" />,
    cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
  },
  note: {
    label: 'Note',
    icon: <ScrollText className="h-3.5 w-3.5" />,
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  },
};

function getActionMeta(action: string = ''): { label: string; icon: React.ReactNode; cls: string } {
  if (ACTION_META[action]) return ACTION_META[action];
  const upper = action.toUpperCase();
  if (ACTION_META[upper]) return ACTION_META[upper];
  const lower = action.toLowerCase();
  if (ACTION_META[lower]) return ACTION_META[lower];

  if (upper.includes('EXPORT')) {
    return {
      label: 'Audit Export',
      icon: <Download className="h-3.5 w-3.5" />,
      cls: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400',
    };
  }
  if (upper.includes('REVOKE') || upper.includes('LOCK')) {
    return {
      label: 'Security Action',
      icon: <Lock className="h-3.5 w-3.5" />,
      cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
    };
  }
  if (upper.includes('FEATURE') || upper.includes('FLAG')) {
    return {
      label: 'Feature Flag',
      icon: <Sliders className="h-3.5 w-3.5" />,
      cls: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400',
    };
  }
  if (upper.includes('SUBSCRIPTION') || upper.includes('BILLING') || upper.includes('PLAN')) {
    return {
      label: 'Billing Override',
      icon: <Wallet className="h-3.5 w-3.5" />,
      cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    };
  }
  if (upper.includes('SUSPEND')) {
    return {
      label: 'Suspended',
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      cls: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
    };
  }
  if (upper.includes('RESUME') || upper.includes('ACTIVATE')) {
    return {
      label: 'Resumed',
      icon: <CheckCircle className="h-3.5 w-3.5" />,
      cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    };
  }
  if (upper.includes('FLAG') && !upper.includes('UNFLAG')) {
    return {
      label: 'Flagged',
      icon: <Flag className="h-3.5 w-3.5" />,
      cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    };
  }
  if (upper.includes('UNFLAG')) {
    return {
      label: 'Unflagged',
      icon: <Trash2 className="h-3.5 w-3.5" />,
      cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    };
  }
  if (upper.includes('WIZARD') || upper.includes('OVERRIDE') || upper.includes('STEP')) {
    return {
      label: 'Wizard Update',
      icon: <Pencil className="h-3.5 w-3.5" />,
      cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
    };
  }
  if (upper.includes('OPERATOR') || upper.includes('STAFF') || upper.includes('USER')) {
    return {
      label: 'Staff Management',
      icon: <UserCog className="h-3.5 w-3.5" />,
      cls: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
    };
  }

  return {
    label: action ? action.replace(/_/g, ' ').replace(/^mac\./i, '') : 'Activity',
    icon: <ScrollText className="h-3.5 w-3.5" />,
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  };
}

export function AuditLogPage() {
  const { entries, loading, error, refresh } = useAudit();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const operatorRole = useMemo(() => {
    const token = getToken();
    if (!token) return 'super_admin';
    const jwt = parseJwt(token);
    return (jwt?.operatorRole as string) || (jwt?.role as string) || 'super_admin';
  }, []);

  const isSupportStaff = operatorRole === 'support_staff';
  const canExport = !isSupportStaff;

  const handleExport = async (format: 'csv' | 'json') => {
    if (!canExport) return;
    setExporting(format);
    setExportNotice(null);
    try {
      const res = await exportAuditLogs({ format });
      const filename = `coheronconnect-audit-export-${new Date().toISOString().slice(0, 10)}.${format}`;
      const blob = new Blob([typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2)], {
        type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportNotice(`Exported ${res.count} records as ${format.toUpperCase()} (Audit event recorded).`);
      refresh(); // Refresh audit logs so the export action appears in the trail!
    } catch (err) {
      setExportNotice(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(null);
    }
  };

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filterType !== 'ALL') {
        const upper = (e.action || '').toUpperCase();
        if (filterType === 'SUSPEND' && !upper.includes('SUSPEND') && !upper.includes('RESUME')) return false;
        if (filterType === 'FLAG' && !upper.includes('FLAG')) return false;
        if (filterType === 'WIZARD' && !upper.includes('WIZARD') && !upper.includes('OVERRIDE')) return false;
        if (filterType === 'FEATURE_FLAG' && !upper.includes('FEATURE_FLAG')) return false;
        if (filterType === 'BILLING' && !upper.includes('SUBSCRIPTION') && !upper.includes('BILLING')) return false;
        if (filterType === 'EXPORT' && !upper.includes('EXPORT')) return false;
        if (filterType === 'SECURITY' && !upper.includes('REVOKE') && !upper.includes('SECURITY')) return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (e.tenantName && e.tenantName.toLowerCase().includes(q)) ||
        (e.tenantId && e.tenantId.toLowerCase().includes(q)) ||
        (e.admin && e.admin.toLowerCase().includes(q)) ||
        (e.action && e.action.toLowerCase().includes(q)) ||
        (e.summary && e.summary.toLowerCase().includes(q))
      );
    });
  }, [entries, search, filterType]);

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Reverse-chronological authoritative trail of every administrative action, override, and security event"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('csv')}
              disabled={!canExport || exporting !== null}
              title={!canExport ? 'Export restricted for support_staff' : 'Export filtered logs as CSV'}
              className="flex items-center gap-1.5"
            >
              <Download className={`h-3.5 w-3.5 ${exporting === 'csv' ? 'animate-bounce' : ''}`} />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('json')}
              disabled={!canExport || exporting !== null}
              title={!canExport ? 'Export restricted for support_staff' : 'Export filtered logs as JSON'}
              className="flex items-center gap-1.5"
            >
              <Download className={`h-3.5 w-3.5 ${exporting === 'json' ? 'animate-bounce' : ''}`} />
              Export JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh()}
              disabled={loading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span>
            Audit entries are authoritative server-side in PostgreSQL. All modifications, overrides, and exports are immutably logged with actor attribution.
          </span>
        </div>
        {isSupportStaff && (
          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            <Lock className="h-3 w-3" /> Data Minimized Mode (support_staff)
          </span>
        )}
      </div>

      {exportNotice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          {exportNotice}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Filters and Search Bar */}
      <div className="mb-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by tenant, admin, or action..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Category:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="ALL">All Events ({entries.length})</option>
            <option value="SUSPEND">Suspension / Resume</option>
            <option value="FLAG">Flagged / Unflagged</option>
            <option value="WIZARD">Wizard Updates</option>
            <option value="FEATURE_FLAG">Feature Flags</option>
            <option value="BILLING">Billing & Subscriptions</option>
            <option value="EXPORT">Audit Exports</option>
            <option value="SECURITY">Security Governance</option>
          </select>
        </div>
      </div>

      {entries.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center dark:border-slate-700 dark:bg-slate-800/50">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500">
            <ScrollText className="h-7 w-7" />
          </div>
          <h3 className="font-heading text-lg font-semibold text-slate-700 dark:text-slate-200">No audit entries yet</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Platform activities, tenant overrides, feature flags, and administrative actions will appear here.
          </p>
        </div>
      ) : filteredEntries.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">No matching audit logs found for your search/filter.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Timestamp</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Operator</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Target</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Action</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Summary</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Payload Preview</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredEntries.map((e) => {
                  const meta = getActionMeta(e.action);
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setSelectedEntry(e)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <p className="text-sm text-slate-700 dark:text-slate-200">{formatDateTime(e.timestamp)}</p>
                        <p className="text-xs text-slate-400">{relativeTime(e.timestamp)}</p>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {e.admin || 'superadmin'}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{e.tenantName || 'Platform'}</p>
                        {e.tenantId && e.tenantId !== 'platform' && (
                          <p className="font-mono text-xs text-slate-400">{e.tenantId.slice(0, 8)}…</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
                          {meta.icon}
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                        {e.summary || `${e.action} executed`}
                      </td>
                      <td className="px-4 py-2.5">
                        {e.before && e.after ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600 dark:bg-slate-700 dark:text-slate-300">Before</span>
                            <span className="text-slate-400">→</span>
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">After</span>
                          </div>
                        ) : e.after ? (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Snapshot</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedEntry(e);
                          }}
                          className="h-7 px-2 text-xs"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" /> Inspect
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DETAIL INSPECTION MODAL */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${getActionMeta(selectedEntry.action).cls}`}>
                  {getActionMeta(selectedEntry.action).icon}
                  {getActionMeta(selectedEntry.action).label}
                </span>
                <h3 className="font-heading text-lg font-semibold text-slate-800 dark:text-slate-100">
                  Audit Entry Details
                </h3>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
                  <p className="text-slate-400 font-medium">Actor Attribution</p>
                  <p className="font-mono mt-0.5 text-slate-700 dark:text-slate-200">{selectedEntry.admin || 'superadmin'}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
                  <p className="text-slate-400 font-medium">Timestamp</p>
                  <p className="mt-0.5 text-slate-700 dark:text-slate-200">{formatDateTime(selectedEntry.timestamp)} ({relativeTime(selectedEntry.timestamp)})</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
                  <p className="text-slate-400 font-medium">Target Organization</p>
                  <p className="mt-0.5 text-slate-700 dark:text-slate-200">{selectedEntry.tenantName || 'Platform Level'}</p>
                  {selectedEntry.tenantId && <p className="font-mono text-[11px] text-slate-400">{selectedEntry.tenantId}</p>}
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
                  <p className="text-slate-400 font-medium">Action Identifier</p>
                  <p className="font-mono mt-0.5 text-slate-700 dark:text-slate-200">{selectedEntry.action}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-400">Activity Summary</p>
                <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-700/30 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  {selectedEntry.summary || `${selectedEntry.action} executed on ${selectedEntry.tenantName}`}
                </p>
              </div>

              {/* Before and After Diffs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Before State</p>
                    {isSupportStaff && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                        <Lock className="h-2.5 w-2.5" /> Minimized
                      </span>
                    )}
                  </div>
                  <pre className="max-h-56 overflow-auto rounded-lg bg-slate-50 p-3 text-xs font-mono text-slate-700 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700">
                    {selectedEntry.before ? JSON.stringify(selectedEntry.before, null, 2) : 'null (no prior state)'}
                  </pre>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">After State</p>
                    {isSupportStaff && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                        <Lock className="h-2.5 w-2.5" /> Minimized
                      </span>
                    )}
                  </div>
                  <pre className="max-h-56 overflow-auto rounded-lg bg-blue-50/50 p-3 text-xs font-mono text-blue-900 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-800">
                    {selectedEntry.after ? JSON.stringify(selectedEntry.after, null, 2) : 'null (no after payload)'}
                  </pre>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSelectedEntry(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
