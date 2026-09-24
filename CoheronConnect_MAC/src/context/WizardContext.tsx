import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { TenantRecord, WizardStepId } from '../lib/types';
import { fetchWizardData, fetchTenantDetail, type FetchParams } from '../lib/wizardData';
import { isStepValid, computeCompletion } from '../lib/validation';
import { updateOrg, flagOrg, suspendOrg, type UpdateOrgBody } from '../lib/api';

interface WizardState {
  tenants: TenantRecord[];
  loading: boolean;
  error: string | null;
  loadedAt: string | null;
  refresh: (params?: FetchParams) => Promise<void>;
  updateStepData: (tenantId: string, stepId: WizardStepId, data: Record<string, unknown>) => Promise<void>;
  setFlag: (tenantId: string, flag: TenantRecord['flag']) => Promise<void>;
  clearFlag: (tenantId: string) => Promise<void>;
  suspendTenant: (tenantId: string) => Promise<void>;
  getTenant: (id: string) => TenantRecord | undefined;
}

const WizardContext = createContext<WizardState | null>(null);

function buildUpdateBody(stepId: WizardStepId, data: Record<string, unknown>): UpdateOrgBody {
  const body: UpdateOrgBody = {};
  if (stepId === 2) {
    body.profile = {
      displayName: data.companyName,
      industry: data.industry,
      size: data.companySize,
      city: data.city,
      state: data.state,
      website: data.website,
      supportEmail: data.supportEmail,
    };
  } else if (stepId === 3) {
    body.compliance = {
      gstin: data.gstin,
      pan: data.pan,
      cin: data.cin,
      tan: data.tan,
      pf: data.epfCode,
      stateCode: data.primaryStateCode,
      seedHolidays: data.seedHolidays,
      seedChartOfAccounts: data.seedChartOfAccounts,
    };
  } else if (stepId === 5) {
    body.itsm = {
      p1: data.p1Critical,
      p2: data.p2High,
      p3: data.p3Medium,
      p4: data.p4Low,
    };
  }
  return body;
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const refresh = useCallback(async (params?: FetchParams) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWizardData(params);
      setTenants(data);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wizard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // After a successful write, refetch the single org from the server so the
  // UI reflects server truth rather than an optimistic guess.
  const refetchTenant = useCallback(async (tenantId: string) => {
    try {
      const fresh = await fetchTenantDetail(tenantId);
      setTenants((prev) => prev.map((t) => (t.id === tenantId ? fresh : t)));
    } catch {
      // fall back to a list refresh if the detail call fails
      await refresh();
    }
  }, [refresh]);

  const updateStepData = useCallback(async (tenantId: string, stepId: WizardStepId, data: Record<string, unknown>) => {
    if (!isStepValid(stepId, data)) throw new Error('Validation failed before save.');
    const body = buildUpdateBody(stepId, data);
    await updateOrg(tenantId, body);
    await refetchTenant(tenantId);
  }, [refetchTenant]);

  const setFlag = useCallback(async (tenantId: string, flag: TenantRecord['flag']) => {
    await flagOrg(tenantId, { flagged: true, note: flag.note, reason: flag.reason, assignedOwner: flag.assignedOwner, reminderSentAt: flag.reminderSentAt });
    await refetchTenant(tenantId);
  }, [refetchTenant]);

  const clearFlag = useCallback(async (tenantId: string) => {
    await flagOrg(tenantId, { flagged: false });
    await refetchTenant(tenantId);
  }, [refetchTenant]);

  const suspendTenant = useCallback(async (tenantId: string) => {
    await suspendOrg(tenantId);
    await refetchTenant(tenantId);
  }, [refetchTenant]);

  const getTenant = useCallback((id: string) => tenants.find((t) => t.id === id), [tenants]);

  return (
    <WizardContext.Provider
      value={{ tenants, loading, error, loadedAt, refresh, updateStepData, setFlag, clearFlag, suspendTenant, getTenant }}
    >
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useWizard must be used within WizardProvider');
  return ctx;
}

export const useOrgs = useWizard;

export { computeCompletion, fetchTenantDetail };
