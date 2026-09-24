import type { TenantRecord, WizardStep, WizardStepId, OnboardingStatus, StepState } from './types';
import { STEP_NAMES } from './types';
import { listOrgs, getOrg, type OrgListParams } from './api';
import { computeCompletion } from './validation';

export interface FetchParams extends OrgListParams {}

export function fetchWizardData(params?: FetchParams): Promise<TenantRecord[]> {
  return listOrgs(params ?? {}).then((raw) => mapOrgListResponse(raw));
}

export function fetchTenantDetail(orgId: string): Promise<TenantRecord> {
  return getOrg(orgId).then((raw) => mapOrgToTenantRecord(raw));
}

// ── Super-Admin org shape (nested domain or flat properties) ──

interface ApiOrg {
  id?: string;
  orgId?: string;
  name?: string;
  displayName?: string;
  companyName?: string;
  slug?: string;
  plan?: string;
  status?: string;
  onboardingStep?: number | null;
  onboardingCompletedAt?: string | null;
  onboardingCompletedBy?: string | null;
  onboardingLastEditedBy?: string | null;
  currentStep?: number | null;
  suspended?: boolean;
  flagged?: boolean;
  flag?: {
    flagged?: boolean;
    note?: string;
    reason?: string;
    assignedOwner?: string;
    reminderSentAt?: string;
    flaggedAt?: string;
  };
  createdAt?: string;
  updatedAt?: string;

  // Flat fields
  industry?: string | null;
  companySize?: string | null;
  size?: string | null;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  supportEmail?: string | null;
  pan?: string | null;
  tan?: string | null;
  epfCode?: string | null;
  pf?: string | null;
  primaryStateCode?: string | null;
  stateCode?: string | null;
  gstin?: string | null;
  cin?: string | null;
  slaP1Hours?: number | null;
  slaP2Hours?: number | null;
  slaP3Hours?: number | null;
  slaP4Hours?: number | null;
  p1Critical?: number | null;
  p2High?: number | null;
  p3Medium?: number | null;
  p4Low?: number | null;

  // Nested domain objects
  profile?: {
    displayName?: string;
    companyName?: string;
    industry?: string;
    companySize?: string;
    size?: string;
    city?: string;
    state?: string;
    website?: string;
    supportEmail?: string;
  };
  compliance?: {
    gstin?: string;
    pan?: string;
    cin?: string;
    tan?: string;
    epfCode?: string;
    pf?: string;
    primaryStateCode?: string;
    stateCode?: string;
  };
  india?: {
    gstin?: string;
    pan?: string;
    cin?: string;
    tan?: string;
    epfCode?: string;
    pf?: string;
    primaryStateCode?: string;
    stateCode?: string;
  };
  itsm?: {
    slaP1Hours?: number;
    slaP2Hours?: number;
    slaP3Hours?: number;
    slaP4Hours?: number;
    p1?: number;
    p2?: number;
    p3?: number;
    p4?: number;
    p1Critical?: number;
    p2High?: number;
    p3Medium?: number;
    p4Low?: number;
  };
}

function getOrgId(org: ApiOrg): string {
  return org.id ?? org.orgId ?? '';
}

function getTenantCode(org: ApiOrg): string {
  return org.slug ?? '';
}

function getCompanyName(org: ApiOrg): string {
  return org.name ?? org.profile?.displayName ?? org.profile?.companyName ?? org.companyName ?? 'Unknown';
}

function getCurrentStep(org: ApiOrg): WizardStepId | null {
  const raw = org.onboardingStep ?? org.currentStep;
  if (raw === undefined || raw === null) return null;
  const clamped = Math.max(1, Math.min(7, raw));
  return clamped as WizardStepId;
}

function getLastUpdatedAt(org: ApiOrg): string {
  return org.updatedAt ?? new Date().toISOString();
}

function getCreatedAt(org: ApiOrg): string {
  return org.createdAt ?? getLastUpdatedAt(org);
}

function getFlag(org: ApiOrg): TenantRecord['flag'] {
  const flagged = org.flagged ?? org.flag?.flagged ?? false;
  if (!flagged && !org.flag?.note) {
    return { flagged: false };
  }
  return {
    flagged,
    note: org.flag?.note,
    reason: org.flag?.reason,
    assignedOwner: org.flag?.assignedOwner,
    reminderSentAt: org.flag?.reminderSentAt,
    flaggedAt: org.flag?.flaggedAt,
  };
}

function profileToData(org: ApiOrg): Record<string, unknown> {
  return {
    companyName: getCompanyName(org),
    industry: org.profile?.industry ?? org.industry ?? '',
    companySize: org.profile?.companySize ?? org.profile?.size ?? org.companySize ?? org.size ?? '',
    city: org.profile?.city ?? org.city ?? '',
    state: org.profile?.state ?? org.state ?? '',
    website: org.profile?.website ?? org.website ?? '',
    supportEmail: org.profile?.supportEmail ?? org.supportEmail ?? '',
  };
}

function complianceToData(org: ApiOrg): Record<string, unknown> {
  const comp = org.compliance ?? org.india;
  let pan = comp?.pan ?? org.pan ?? '';
  const gstin = comp?.gstin ?? org.gstin ?? '';
  if (pan && (pan.startsWith('v2:') || pan.includes(':')) && gstin && gstin.length === 15) {
    pan = gstin.slice(2, 12);
  }
  return {
    gstin,
    pan,
    cin: comp?.cin ?? org.cin ?? '',
    tan: comp?.tan ?? org.tan ?? '',
    epfCode: comp?.epfCode ?? comp?.pf ?? org.epfCode ?? org.pf ?? '',
    primaryStateCode: comp?.primaryStateCode ?? comp?.stateCode ?? org.primaryStateCode ?? org.stateCode ?? '',
  };
}

function itsmToData(org: ApiOrg): Record<string, unknown> {
  const itsm = org.itsm;
  return {
    p1Critical: itsm?.slaP1Hours ?? itsm?.p1 ?? itsm?.p1Critical ?? org.slaP1Hours ?? org.p1Critical ?? 0,
    p2High: itsm?.slaP2Hours ?? itsm?.p2 ?? itsm?.p2High ?? org.slaP2Hours ?? org.p2High ?? 0,
    p3Medium: itsm?.slaP3Hours ?? itsm?.p3 ?? itsm?.p3Medium ?? org.slaP3Hours ?? org.p3Medium ?? 0,
    p4Low: itsm?.slaP4Hours ?? itsm?.p4 ?? itsm?.p4Low ?? org.slaP4Hours ?? org.p4Low ?? 0,
  };
}

function hasProfileData(org: ApiOrg): boolean {
  const p = profileToData(org);
  return Boolean(p.industry || p.city || p.companySize || p.website || p.supportEmail);
}

function hasComplianceData(org: ApiOrg): boolean {
  const c = complianceToData(org);
  return Boolean(c.pan || c.tan || c.epfCode || c.primaryStateCode || c.gstin || c.cin);
}

function hasItsmData(org: ApiOrg): boolean {
  const i = itsmToData(org);
  return i.p1Critical !== undefined && i.p1Critical !== null;
}

function deriveStepState(hasData: boolean, stepId: number, currentStep: number | null): StepState {
  if (currentStep === null) return hasData ? 'complete' : 'pending';
  if (stepId < currentStep) return hasData ? 'complete' : 'acknowledged';
  if (stepId === currentStep) return 'in_progress';
  return 'pending';
}

function buildSteps(org: ApiOrg): WizardStep[] {
  const currentStep = getCurrentStep(org);
  const profile = hasProfileData(org);
  const compliance = hasComplianceData(org);
  const itsm = hasItsmData(org);

  const stepConfigs: { id: WizardStepId; hasData: boolean; data: Record<string, unknown> | undefined }[] = [
    { id: 1, hasData: false, data: undefined },
    { id: 2, hasData: profile, data: profile ? profileToData(org) : {} },
    { id: 3, hasData: compliance, data: compliance ? complianceToData(org) : {} },
    { id: 4, hasData: false, data: undefined },
    { id: 5, hasData: itsm, data: itsm ? itsmToData(org) : {} },
    { id: 6, hasData: false, data: undefined },
    { id: 7, hasData: false, data: undefined },
  ];

  return stepConfigs.map(({ id, hasData, data }) => ({
    id,
    name: STEP_NAMES[id],
    state: deriveStepState(hasData, id, currentStep),
    hasData,
    data,
    updatedAt: getLastUpdatedAt(org),
  }));
}

function deriveStatus(org: ApiOrg, completionPct: number): OnboardingStatus {
  if (org.suspended) return 'stalled';
  if (org.onboardingCompletedAt) return 'complete';
  if (completionPct === 100) return 'complete';
  if (completionPct > 0) return 'in_progress';
  return 'not_started';
}

export function mapOrgToTenantRecord(org: unknown): TenantRecord {
  const o = (typeof org === 'object' && org !== null ? org : {}) as ApiOrg;
  const steps = buildSteps(o);
  const completionPct = computeCompletion(steps);

  return {
    id: getOrgId(o),
    tenantCode: getTenantCode(o),
    companyName: getCompanyName(o),
    currentStep: getCurrentStep(o),
    onboardingStep: o.onboardingStep ?? o.currentStep ?? null,
    onboardingCompletedAt: o.onboardingCompletedAt ?? null,
    onboardingCompletedBy: o.onboardingCompletedBy ?? null,
    onboardingLastEditedBy: o.onboardingLastEditedBy ?? null,
    steps,
    status: deriveStatus(o, completionPct),
    lastUpdatedAt: getLastUpdatedAt(o),
    createdAt: getCreatedAt(o),
    flag: getFlag(o),
    suspended: o.suspended ?? false,
    plan: o.plan,
    slug: o.slug,
  };
}

export function mapOrgListResponse(raw: unknown): TenantRecord[] {
  if (Array.isArray(raw)) {
    return raw.map(mapOrgToTenantRecord);
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.orgs)) return obj.orgs.map(mapOrgToTenantRecord);
    if (Array.isArray(obj.data)) return obj.data.map(mapOrgToTenantRecord);
    if (Array.isArray(obj.items)) return obj.items.map(mapOrgToTenantRecord);
    if (Array.isArray(obj.results)) return obj.results.map(mapOrgToTenantRecord);
  }
  return [];
}
