import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Shield,
  Plus,
  Search,
  RefreshCw,
  KeyRound,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sliders,
  Check,
  Minus,
  Sparkles,
  Info,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import {
  getOperators,
  createOperator,
  updateOperator,
  deleteOperator,
  getOperatorRoles,
  createOperatorRole,
  deleteOperatorRole,
} from '../lib/api';
import { formatDateTime, relativeTime } from '../lib/time';
import { useAuth } from '../context/AuthContext';
import type { SuperAdminOperator, OperatorRole, OperatorRoleDefinition } from '../lib/types';

const ROLE_FALLBACK_BADGES: Record<string, { label: string; cls: string }> = {
  super_admin: {
    label: 'Super Admin',
    cls: 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
  },
  operations_staff: {
    label: 'Operations Staff',
    cls: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  },
  support_staff: {
    label: 'Support Staff',
    cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  },
  auditor: {
    label: 'Auditor',
    cls: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  },
};

const CAPABILITIES = [
  { key: 'tenantsView', label: 'View Organizations & Onboarding', category: 'Tenants' },
  { key: 'tenantsManage', label: 'Edit Organization Profile & Flags', category: 'Tenants' },
  { key: 'wizardOverride', label: 'Wizard Step Data Overrides', category: 'Tenants' },
  { key: 'tenantsSuspend', label: 'Suspend / Activate Organizations', category: 'Tenants' },
  { key: 'operatorsManage', label: 'Manage Super-Admin Staff & Roles', category: 'Access Control' },
  { key: 'auditView', label: 'Inspect Server Audit Trails', category: 'Access Control' },
  { key: 'financeView', label: 'View Subscription & MRR Metrics', category: 'Finance' },
  { key: 'financeManage', label: 'Change Tenant Subscription Plans', category: 'Finance' },
  { key: 'complianceView', label: 'Inspect Statutory & DPDP Records', category: 'Compliance & GRC' },
  { key: 'complianceManage', label: 'Trigger DPDP Sweeps & Risk Mitigations', category: 'Compliance & GRC' },
  { key: 'workflowsView', label: 'Temporal / BullMQ Orchestration', category: 'System Operations' },
  { key: 'systemHealth', label: 'Diagnostics & Infrastructure Health', category: 'System Operations' },
];

const ROLE_THEME_MAP: Record<string, { headerCls: string; badgeCls: string }> = {
  super_admin: {
    headerCls: 'text-purple-700 dark:text-purple-300 bg-purple-50/50 dark:bg-purple-950/20',
    badgeCls: 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
  },
  operations_staff: {
    headerCls: 'text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/20',
    badgeCls: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  },
  support_staff: {
    headerCls: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20',
    badgeCls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  },
  auditor: {
    headerCls: 'text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/20',
    badgeCls: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  },
};

const ROLE_HIERARCHY_ORDER: Record<string, number> = {
  super_admin: 1,
  operations_staff: 2,
  support_staff: 3,
  auditor: 4,
};

const COLOR_OPTIONS: { id: 'indigo' | 'purple' | 'blue' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'slate'; label: string; bg: string }[] = [
  { id: 'indigo', label: 'Indigo', bg: 'bg-indigo-500' },
  { id: 'purple', label: 'Purple', bg: 'bg-purple-500' },
  { id: 'blue', label: 'Blue', bg: 'bg-blue-500' },
  { id: 'emerald', label: 'Emerald', bg: 'bg-emerald-500' },
  { id: 'amber', label: 'Amber', bg: 'bg-amber-500' },
  { id: 'rose', label: 'Rose', bg: 'bg-rose-500' },
  { id: 'cyan', label: 'Cyan', bg: 'bg-cyan-500' },
  { id: 'slate', label: 'Slate', bg: 'bg-slate-500' },
];

export function UsersRolesPage() {
  const { email: currentAdminEmail } = useAuth();
  const [activeTab, setActiveTab] = useState<'operators' | 'matrix'>('operators');
  const [operators, setOperators] = useState<SuperAdminOperator[]>([]);
  const [roles, setRoles] = useState<OperatorRoleDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('ALL');

  // Sorted roles: Super Admin always first (root access), followed by operations, support, auditor, and custom roles
  const sortedRoles = useMemo(() => {
    return [...roles].sort((a, b) => {
      const orderA = ROLE_HIERARCHY_ORDER[a.id] ?? (a.isSystem ? 10 : 20);
      const orderB = ROLE_HIERARCHY_ORDER[b.id] ?? (b.isSystem ? 10 : 20);
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }, [roles]);

  // Modal states for Operators
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOperator, setEditModalOperator] = useState<SuperAdminOperator | null>(null);
  const [resetModalOperator, setResetModalOperator] = useState<SuperAdminOperator | null>(null);
  const [deleteModalOperator, setDeleteModalOperator] = useState<SuperAdminOperator | null>(null);

  // Modal states for Roles
  const [createRoleModalOpen, setCreateRoleModalOpen] = useState(false);
  const [deleteRoleModalRole, setDeleteRoleModalRole] = useState<OperatorRoleDefinition | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states for Add Operator
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<string>('super_admin');
  const [formPhone, setFormPhone] = useState('');

  // Form states for Edit Operator
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<string>('super_admin');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'disabled'>('active');

  // Form states for Reset Password
  const [newPassword, setNewPassword] = useState('');

  // Form states for Create Role
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [roleColor, setRoleColor] = useState<'indigo' | 'purple' | 'blue' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'slate'>('indigo');
  const [rolePerms, setRolePerms] = useState<Record<string, boolean>>({
    tenantsView: true,
    auditView: true,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [opsData, rolesData] = await Promise.all([getOperators(), getOperatorRoles()]);
      setOperators(opsData);
      setRoles(rolesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operators.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Metrics
  const stats = useMemo(() => {
    const total = operators.length;
    const superAdmins = operators.filter((o) => o.role === 'super_admin').length;
    const opsStaff = operators.filter((o) => o.role === 'operations_staff').length;
    const supportAndAudit = operators.filter((o) => o.role === 'support_staff' || o.role === 'auditor').length;
    const customRolesCount = roles.filter((r) => !r.isSystem).length;
    const active = operators.filter((o) => o.status === 'active').length;
    return { total, superAdmins, opsStaff, supportAndAudit, customRolesCount, active };
  }, [operators, roles]);

  // Filtered operators
  const filteredOperators = useMemo(() => {
    return operators.filter((op) => {
      if (filterRole !== 'ALL' && op.role !== filterRole) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        op.name.toLowerCase().includes(q) ||
        op.email.toLowerCase().includes(q) ||
        op.role.toLowerCase().includes(q)
      );
    });
  }, [operators, search, filterRole]);

  // Add operator submission
  const handleAddOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await createOperator({
        name: formName,
        email: formEmail,
        password: formPassword,
        role: formRole as OperatorRole,
        phone: formPhone || undefined,
      });
      setAddModalOpen(false);
      setFormName('');
      setFormEmail('');
      setFormPassword('');
      setFormPhone('');
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create operator.');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (op: SuperAdminOperator) => {
    setEditModalOperator(op);
    setEditName(op.name);
    setEditRole(op.role);
    setEditPhone(op.phone ?? '');
    setEditStatus(op.status);
    setFormError(null);
  };

  // Submit Edit Operator
  const handleUpdateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalOperator) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await updateOperator(editModalOperator.id, {
        name: editName,
        role: editRole as OperatorRole,
        phone: editPhone || null,
        status: editStatus,
      });
      setEditModalOperator(null);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update operator.');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Password Reset
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalOperator) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await updateOperator(resetModalOperator.id, { password: newPassword });
      setResetModalOperator(null);
      setNewPassword('');
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Operator
  const handleDeleteOperator = async () => {
    if (!deleteModalOperator) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await deleteOperator(deleteModalOperator.id);
      setDeleteModalOperator(null);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete operator.');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle status directly
  const handleToggleStatus = async (op: SuperAdminOperator) => {
    const nextStatus = op.status === 'active' ? 'disabled' : 'active';
    try {
      await updateOperator(op.id, { status: nextStatus });
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to change status');
    }
  };

  // Create Role submission
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await createOperatorRole({
        name: roleName,
        description: roleDesc,
        color: roleColor,
        permissions: rolePerms,
      });
      setCreateRoleModalOpen(false);
      setRoleName('');
      setRoleDesc('');
      setRoleColor('indigo');
      setRolePerms({ tenantsView: true, auditView: true });
      await loadData();
      setActiveTab('matrix');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create role.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Custom Role submission
  const handleDeleteRole = async () => {
    if (!deleteRoleModalRole) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await deleteOperatorRole(deleteRoleModalRole.id);
      setDeleteRoleModalRole(null);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete role.');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle capability in Create Role modal
  const togglePerm = (key: string) => {
    setRolePerms((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const selectAllPerms = (enable: boolean) => {
    const next: Record<string, boolean> = {};
    for (const cap of CAPABILITIES) {
      next[cap.key] = enable;
    }
    setRolePerms(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Roles"
        subtitle="Manage Super-Admin console operators, staff credentials, and custom security permission matrices"
        actions={
          <div className="flex items-center gap-2">
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFormError(null);
                setCreateRoleModalOpen(true);
              }}
              className="flex items-center gap-1.5"
            >
              <Shield className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              + Create Role
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setFormError(null);
                setAddModalOpen(true);
              }}
              className="flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Operator
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Users className="h-4 w-4 text-brand-500" />
            Total Operators
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-600 dark:text-purple-400">
            <Shield className="h-4 w-4" />
            Super Admins
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stats.superAdmins}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
            <Sliders className="h-4 w-4" />
            Operations Staff
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stats.opsStaff}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <Shield className="h-4 w-4" />
            Support & Audit
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stats.supportAndAudit}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Active Accounts
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stats.active}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('operators')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'operators'
              ? 'border-brand-500 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
          }`}
        >
          <Users className="h-4 w-4" />
          Console Operators & Staff ({operators.length})
        </button>

        <button
          onClick={() => setActiveTab('matrix')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            activeTab === 'matrix'
              ? 'border-brand-500 text-brand-600 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
          }`}
        >
          <Shield className="h-4 w-4" />
          Role & Permission Matrix ({roles.length})
        </button>
      </div>

      {/* TAB CONTENT 1: CONSOLE OPERATORS */}
      {activeTab === 'operators' ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Search */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, email, or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {/* Filter by role & Add Operator */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Filter Role:</span>
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="ALL">All Roles ({operators.length})</option>
                  {sortedRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setFormError(null);
                  setAddModalOpen(true);
                }}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Add Operator
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Operator</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Last Login</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {filteredOperators.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                        {loading ? 'Loading operators...' : 'No operators found matching your criteria.'}
                      </td>
                    </tr>
                  ) : (
                    filteredOperators.map((op) => {
                      const isSelf = op.email.toLowerCase() === currentAdminEmail?.toLowerCase();
                      const matchedRole = roles.find((r) => r.id === op.role);
                      const badgeCls =
                        matchedRole?.badgeCls ||
                        ROLE_FALLBACK_BADGES[op.role]?.cls ||
                        'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700 dark:text-slate-300';
                      const badgeLabel = matchedRole?.name || ROLE_FALLBACK_BADGES[op.role]?.label || op.role.replace(/_/g, ' ');

                      return (
                        <tr key={op.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300 text-xs uppercase">
                                {op.name.slice(0, 2)}
                              </div>
                              <div>
                                <p className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                                  {op.name}
                                  {isSelf && (
                                    <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                                      You
                                    </span>
                                  )}
                                </p>
                                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{op.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeCls}`}>
                              {badgeLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => !isSelf && handleToggleStatus(op)}
                              disabled={isSelf}
                              title={isSelf ? 'Cannot disable self' : 'Toggle status'}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer transition-opacity ${
                                isSelf ? 'cursor-not-allowed opacity-80' : 'hover:opacity-80'
                              } ${
                                op.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                                  : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
                              }`}
                            >
                              {op.status === 'active' ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3" />
                                  Active
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-3 w-3" />
                                  Disabled
                                </>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {op.lastLoginAt ? (
                              <>
                                <div>{formatDateTime(op.lastLoginAt)}</div>
                                <div className="text-[10px] text-slate-400">{relativeTime(op.lastLoginAt)}</div>
                              </>
                            ) : (
                              <span className="text-slate-400">Never logged in</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {formatDateTime(op.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openEditModal(op)}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                                title="Edit operator"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setResetModalOperator(op);
                                  setNewPassword('');
                                  setFormError(null);
                                }}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                                title="Reset password"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                              </button>
                              {!isSelf && (
                                <button
                                  onClick={() => {
                                    setDeleteModalOperator(op);
                                    setFormError(null);
                                  }}
                                  className="rounded p-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                                  title="Delete operator"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
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
        </div>
      ) : (
        /* TAB CONTENT 2: ROLE & PERMISSION MATRIX */
        <div className="space-y-6">
          {/* Header Action Bar */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Active Console Roles</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Built-in core system roles and customized console operator permission profiles.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setFormError(null);
                setCreateRoleModalOpen(true);
              }}
              className="flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Create Custom Role
            </Button>
          </div>

          {/* Role Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {sortedRoles.map((r) => {
              const assignedCount = operators.filter((o) => o.role === r.id).length;
              const theme = ROLE_THEME_MAP[r.id];
              const badgeCls = theme?.badgeCls || r.badgeCls;
              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 flex flex-col justify-between relative group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-slate-900 dark:text-white text-sm">{r.name}</h4>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${badgeCls}`}>
                          {r.isSystem ? 'System' : 'Custom'}
                        </span>
                        {!r.isSystem && (
                          <button
                            onClick={() => {
                              setDeleteRoleModalRole(r);
                              setFormError(null);
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-colors"
                            title="Delete Custom Role"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {r.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1 font-medium">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      {assignedCount} {assignedCount === 1 ? 'Operator' : 'Operators'}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">id: {r.id}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Matrix Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
              <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                Super-Admin Control Plane Permission Matrix
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Capability breakdown enforced across Super-Admin Console operations.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                    <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 min-w-[240px]">
                      Module / Capability
                    </th>
                    {sortedRoles.map((r) => {
                      const theme = ROLE_THEME_MAP[r.id];
                      return (
                        <th
                          key={r.id}
                          className={`px-4 py-2.5 text-center font-semibold uppercase tracking-wider whitespace-nowrap ${
                            theme ? theme.headerCls : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            <span>{r.name}</span>
                            {r.isSystem ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 font-normal">
                                System
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 font-medium">
                                Custom
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {CAPABILITIES.map((cap) => (
                    <tr key={cap.key} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-2">
                          <span>{cap.label}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">({cap.category})</span>
                        </div>
                      </td>
                      {sortedRoles.map((r) => {
                        const isSuperAdmin = r.id === 'super_admin' || r.name.toLowerCase().includes('super admin');
                        // Super Admin has full root access across all console modules
                        const allowed = isSuperAdmin ? true : Boolean((r.permissions as any)?.[cap.key]);
                        return (
                          <td key={r.id} className="px-4 py-2.5 text-center">
                            {allowed ? (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                                <Check className="h-3 w-3 stroke-[3]" />
                              </span>
                            ) : (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500">
                                <Minus className="h-3 w-3" />
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
        </div>
      )}

      {/* MODAL: ADD OPERATOR */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-lg text-slate-900 dark:text-white">Add Console Operator</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Create a new staff account with specific administrative role permissions.
            </p>

            {formError && (
              <div className="mt-4 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddOperator} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Full Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Email Address</label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="operator@coheron.tech"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Initial Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Console Role</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {sortedRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.isSystem ? '(Built-in)' : '(Custom Role)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Phone (Optional)</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" type="button" onClick={() => setAddModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Operator'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT OPERATOR */}
      {editModalOperator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-lg text-slate-900 dark:text-white">Edit Operator</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Update operator profile, role permissions, or status for {editModalOperator.email}.
            </p>

            {formError && (
              <div className="mt-4 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                {formError}
              </div>
            )}

            <form onSubmit={handleUpdateOperator} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Console Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {sortedRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.isSystem ? '(Built-in)' : '(Custom Role)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Account Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'active' | 'disabled')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="active">Active (Can log in)</option>
                  <option value="disabled">Disabled (Blocked)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Phone</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" type="button" onClick={() => setEditModalOperator(null)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET PASSWORD */}
      {resetModalOperator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-lg text-slate-900 dark:text-white">Reset Password</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Set a new console password for <strong>{resetModalOperator.email}</strong>.
            </p>

            {formError && (
              <div className="mt-4 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                {formError}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">New Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter at least 6 characters"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" type="button" onClick={() => setResetModalOperator(null)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={submitting}>
                  {submitting ? 'Updating...' : 'Update Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE OPERATOR CONFIRM */}
      {deleteModalOperator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-lg text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Delete Operator Account
            </h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Are you sure you want to permanently delete <strong>{deleteModalOperator.name}</strong> ({deleteModalOperator.email})? This action will immediately revoke their console access and cannot be undone.
            </p>

            {formError && (
              <div className="mt-4 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                {formError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" type="button" onClick={() => setDeleteModalOperator(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDeleteOperator} disabled={submitting}>
                {submitting ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE CUSTOM ROLE */}
      {createRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800 border border-slate-200 dark:border-slate-700 my-8">
            <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
              <Sparkles className="h-5 w-5" />
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white">Create Custom Operator Role</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Define a tailored console administrative profile with granular module access.
            </p>

            {formError && (
              <div className="mt-4 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateRole} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Role Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={50}
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g. Compliance Officer, Finance Lead, Tier-2 Support"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={roleDesc}
                  onChange={(e) => setRoleDesc(e.target.value)}
                  placeholder="Summarize operator duties and scope of authority..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              {/* Color Accent Picker */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Badge Theme Accent</label>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setRoleColor(c.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                        roleColor === c.id
                          ? 'border-brand-500 ring-2 ring-brand-500/20 bg-slate-50 dark:bg-slate-700 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${c.bg}`} />
                      <span className="text-slate-700 dark:text-slate-300">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Granular Capability Checklist */}
              <div>
                <div className="flex items-center justify-between pb-1">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Capability Privileges ({Object.values(rolePerms).filter(Boolean).length}/{CAPABILITIES.length})
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => selectAllPerms(true)}
                      className="text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300 dark:text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => selectAllPerms(false)}
                      className="text-slate-500 hover:underline"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-700 dark:bg-slate-900/50 space-y-1.5">
                  {CAPABILITIES.map((cap) => {
                    const checked = !!rolePerms[cap.key];
                    return (
                      <label
                        key={cap.key}
                        onClick={() => togglePerm(cap.key)}
                        className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                          checked
                            ? 'border-brand-300 bg-brand-50/70 text-brand-900 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200'
                            : 'border-transparent hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {}}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
                          />
                          <span className="font-medium">{cap.label}</span>
                        </div>
                        <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500">
                          {cap.category}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <Button variant="outline" size="sm" type="button" onClick={() => setCreateRoleModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Save & Publish Role'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CUSTOM ROLE CONFIRM */}
      {deleteRoleModalRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-lg text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Delete Custom Role
            </h3>

            {(() => {
              const assignedOps = operators.filter((o) => o.role === deleteRoleModalRole.id);
              const hasAssigned = assignedOps.length > 0;

              return (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Are you sure you want to remove the custom role{' '}
                    <strong>{deleteRoleModalRole.name}</strong>?
                  </p>

                  {hasAssigned ? (
                    <div className="rounded-lg bg-amber-50 p-3 border border-amber-200 text-xs text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300 flex items-start gap-2">
                      <Info className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Cannot Delete Role</p>
                        <p className="mt-1">
                          There are currently <strong>{assignedOps.length}</strong> operator(s) assigned to this role ({assignedOps.map((o) => o.name).join(', ')}). Please reassign them to another role first.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      No operators are assigned to this role. It will be permanently removed from the control plane matrix.
                    </p>
                  )}

                  {formError && (
                    <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                      {formError}
                    </div>
                  )}

                  <div className="mt-6 flex items-center justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => setDeleteRoleModalRole(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={hasAssigned || submitting}
                      onClick={handleDeleteRole}
                    >
                      {submitting ? 'Deleting...' : 'Delete Role'}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
