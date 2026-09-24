import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { AuditEntry } from '../lib/types';
import { getAuditLogs } from '../lib/api';

interface AuditState {
  entries: AuditEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  log: (entry: Omit<AuditEntry, 'id' | 'timestamp'>) => void;
}

const AuditContext = createContext<AuditState | null>(null);

let counter = 0;

export function AuditProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await getAuditLogs();
      const rawList = (Array.isArray(raw) ? raw : []) as Array<Record<string, unknown>>;
      const serverEntries: AuditEntry[] = rawList.map((e) => {
        const tenantId = (e.tenantId ?? e.orgId ?? 'platform') as string;
        const tenantName = (e.tenantName ?? e.orgName ?? (e.orgId ? `Org ${String(e.orgId).slice(0, 8)}` : 'Platform')) as string;
        const action = (e.action ?? 'note') as string;
        const before = (e.before ?? e.beforeJson) as Record<string, unknown> | undefined;
        const after = (e.after ?? e.afterJson) as Record<string, unknown> | undefined;
        const admin = (e.admin ?? e.actorEmail ?? 'superadmin') as string;
        const timestamp = (e.timestamp ?? e.createdAt ?? new Date().toISOString()) as string;

        let summary = e.summary as string | undefined;
        if (!summary) {
          const upper = action.toUpperCase();
          if (upper.includes('SUSPEND')) summary = `Suspended tenant ${tenantName}`;
          else if (upper.includes('RESUME') || upper.includes('ACTIVATE')) summary = `Re-activated tenant ${tenantName}`;
          else if (upper.includes('FLAG') && !upper.includes('UNFLAG')) summary = `Flagged tenant ${tenantName}`;
          else if (upper.includes('UNFLAG')) summary = `Removed flag from ${tenantName}`;
          else if (upper.includes('WIZARD') || upper.includes('OVERRIDE')) summary = `Updated wizard data for ${tenantName}`;
          else if (upper.includes('CREATE_STATUTORY_DEADLINE')) summary = `Created statutory filing deadline for ${tenantName}`;
          else if (upper.includes('UPDATE_STATUTORY_DEADLINE')) summary = `Updated statutory compliance record for ${tenantName}`;
          else if (upper.includes('CREATE_DPDP_DSR')) summary = `Logged Data Subject Request (DSR) for ${tenantName}`;
          else if (upper.includes('UPDATE_DPDP_DSR')) summary = `Updated Data Subject Request status for ${tenantName}`;
          else if (upper.includes('CREATE_DPDP_BREACH')) summary = `Logged personal data breach incident for ${tenantName}`;
          else if (upper.includes('UPDATE_DPDP_BREACH')) summary = `Updated data breach containment status for ${tenantName}`;
          else if (upper.includes('TRIGGER_DPDP_SWEEPS') || upper.includes('SWEEPS')) summary = `Triggered automated DPDP compliance sweeps`;
          else if (upper.includes('CREATE_COMPLIANCE_RISK')) summary = `Logged enterprise platform risk for ${tenantName}`;
          else if (upper.includes('UPDATE_COMPLIANCE_RISK')) summary = `Updated risk assessment & mitigation for ${tenantName}`;
          else if (upper.includes('CREATE_COMPLIANCE_POLICY')) summary = `Created governance policy for ${tenantName}`;
          else summary = `${action.replace(/_/g, ' ')} on ${tenantName}`;
        }

        return {
          id: String(e.id ?? `aud_${Date.now()}_${counter++}`),
          timestamp,
          admin,
          tenantId,
          tenantName,
          action,
          summary,
          before,
          after,
        };
      });

      setEntries((prev) => {
        const serverIds = new Set(serverEntries.map((e) => e.id));
        const pendingLocal = prev.filter((e) => !serverIds.has(e.id));
        return [...pendingLocal, ...serverEntries];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit logs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const log = (entry: Omit<AuditEntry, 'id' | 'timestamp'>) => {
    const full: AuditEntry = {
      ...entry,
      id: `aud_${Date.now()}_${counter++}`,
      timestamp: new Date().toISOString(),
    };
    setEntries((prev) => [full, ...prev]);
  };

  return (
    <AuditContext.Provider value={{ entries, loading, error, refresh, log }}>
      {children}
    </AuditContext.Provider>
  );
}

export function useAudit() {
  const ctx = useContext(AuditContext);
  if (!ctx) throw new Error('useAudit must be used within AuditProvider');
  return ctx;
}

