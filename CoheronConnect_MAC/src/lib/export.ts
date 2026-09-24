import type { TenantRecord, WizardStepId } from './types';
import { STEP_NAMES } from './types';

function flattenTenant(t: TenantRecord): Record<string, string | number | boolean> {
  const row: Record<string, string | number | boolean> = {
    tenantId: t.id,
    tenantCode: t.tenantCode,
    companyName: t.companyName,
    status: t.status,
    currentStep: t.currentStep ?? '',
    currentStepName: t.currentStep ? STEP_NAMES[t.currentStep] : '',
    completionPct: t.steps ? 0 : 0,
    lastUpdatedAt: t.lastUpdatedAt,
    flagged: t.flag.flagged,
    flagNote: t.flag.note ?? '',
    flagReason: t.flag.reason ?? '',
    assignedOwner: t.flag.assignedOwner ?? '',
  };
  for (const step of t.steps) {
    const prefix = `step${step.id}_${STEP_NAMES[step.id as WizardStepId].replace(/\s+/g, '')}`;
    row[`${prefix}_state`] = step.state;
    if (step.data) {
      for (const [k, v] of Object.entries(step.data)) {
        row[`${prefix}_${k}`] = typeof v === 'object' ? JSON.stringify(v) : (v as string | number | boolean);
      }
    }
  }
  return row;
}

function toCsv(rows: Record<string, string | number | boolean>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportTenantCsv(t: TenantRecord) {
  download(`${t.tenantCode}_wizard.csv`, toCsv([flattenTenant(t)]), 'text/csv;charset=utf-8');
}

export function exportTenantJson(t: TenantRecord) {
  download(`${t.tenantCode}_wizard.json`, JSON.stringify(t, null, 2), 'application/json');
}

export function exportAllCsv(tenants: TenantRecord[]) {
  download('coheronconnect_wizard_all.csv', toCsv(tenants.map(flattenTenant)), 'text/csv;charset=utf-8');
}

export function exportAllJson(tenants: TenantRecord[]) {
  download('coheronconnect_wizard_all.json', JSON.stringify(tenants, null, 2), 'application/json');
}
