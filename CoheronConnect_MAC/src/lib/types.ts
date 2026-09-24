export type WizardStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type OnboardingStatus = 'complete' | 'in_progress' | 'stalled' | 'not_started';

export interface OrgProfile {
  companyName: string;
  industry: string;
  companySize: string;
  city: string;
  state: string;
  website: string;
  supportEmail: string;
}

export interface IndiaCompliance {
  gstin: string;
  pan: string;
  cin: string;
  tan: string;
  epfCode: string;
  primaryStateCode: string;
  seedHolidays: boolean;
  seedChartOfAccounts: boolean;
}

export interface ItsmConfig {
  p1Critical: number;
  p2High: number;
  p3Medium: number;
  p4Low: number;
}

export type StepState = 'pending' | 'acknowledged' | 'skipped' | 'in_progress' | 'complete';

export interface WizardStep {
  id: WizardStepId;
  name: string;
  state: StepState;
  hasData: boolean;
  data?: Record<string, unknown>;
  updatedAt: string;
}

export interface TenantFlag {
  flagged: boolean;
  note?: string;
  reason?: string;
  assignedOwner?: string;
  reminderSentAt?: string;
  flaggedAt?: string;
}

export interface TenantRecord {
  id: string;
  tenantCode: string;
  companyName: string;
  currentStep: WizardStepId | null;
  onboardingStep?: number | null;
  onboardingCompletedAt?: string | null;
  onboardingCompletedBy?: string | null;
  onboardingLastEditedBy?: string | null;
  steps: WizardStep[];
  status: OnboardingStatus;
  lastUpdatedAt: string;
  createdAt: string;
  flag: TenantFlag;
  suspended?: boolean;
  plan?: string;
  slug?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  admin: string;
  tenantId: string;
  tenantName: string;
  action: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  actorEmail?: string;
  orgId?: string;
  createdAt?: string;
}

export const STEP_NAMES: Record<WizardStepId, string> = {
  1: 'Welcome',
  2: 'Organisation Profile',
  3: 'India Compliance Setup',
  4: 'Invite Your Team',
  5: 'ITSM Configuration',
  6: 'Finance Setup',
  7: 'Done',
};

export const INDUSTRIES = [
  'Information Technology',
  'Financial Services',
  'Manufacturing',
  'Healthcare',
  'Retail & E-commerce',
  'Logistics & Supply Chain',
  'Education',
  'Construction & Real Estate',
  'Telecommunications',
  'Automotive',
];

export const COMPANY_SIZES = ['1-50', '51-200', '201-500', '501-1000', '1000+'];

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana',
  'Uttar Pradesh', 'West Bengal',
];

export type OperatorRole = 'super_admin' | 'operations_staff' | 'support_staff' | 'auditor' | (string & {});

export interface SuperAdminOperator {
  id: string;
  name: string;
  email: string;
  role: OperatorRole;
  status: 'active' | 'disabled';
  phone?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface OperatorRoleDefinition {
  id: string;
  name: string;
  description: string;
  badgeCls: string;
  isSystem?: boolean;
  permissions: {
    tenantsView: boolean;
    tenantsManage: boolean;
    tenantsSuspend: boolean;
    wizardOverride: boolean;
    operatorsManage: boolean;
    auditView: boolean;
    financeView: boolean;
    financeManage: boolean;
    workflowsView: boolean;
    systemHealth: boolean;
    complianceView?: boolean;
    complianceManage?: boolean;
    [key: string]: boolean | undefined;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface TenantSubscription {
  orgId: string;
  orgName: string;
  slug: string;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  priceMonthly: number;
  billingCycle: string;
  subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled';
  stripeCustomerId?: string | null;
  trialEndsAt?: string | null;
  createdAt: string;
}

export interface FinanceOverviewData {
  totalTenants: number;
  totalMrr: number;
  estimatedArr: number;
  paidTenantsCount: number;
  planCounts: {
    free: number;
    starter: number;
    professional: number;
    enterprise: number;
  };
  statusCounts: {
    active: number;
    trialing: number;
    past_due: number;
    canceled: number;
  };
  subscriptions: TenantSubscription[];
}

export interface ComplianceOverviewData {
  highRisksCount: number;
  totalRisksCount: number;
  overdueDeadlinesCount: number;
  dueSoonDeadlinesCount: number;
  upcomingDeadlinesCount: number;
  filedDeadlinesCount: number;
  activeDsrsCount: number;
  totalDsrsCount: number;
  activeBreachesCount: number;
  totalPoliciesCount: number;
  publishedPoliciesCount: number;
}

export interface StatutoryCalendarItem {
  id: string;
  orgId: string;
  orgName?: string | null;
  complianceType: 'annual' | 'event_based' | 'monthly' | 'quarterly';
  eventName: string;
  mcaForm?: string | null;
  financialYear?: string | null;
  dueDate: string;
  status: 'upcoming' | 'due_soon' | 'overdue' | 'filed' | 'not_applicable';
  reminderDaysBefore?: number[] | null;
  filedDate?: string | null;
  srn?: string | null;
  penaltyPerDayInr: string;
  daysOverdue: number;
  totalPenaltyInr: string;
  notes?: string | null;
  createdAt: string;
}

export interface DpdpDsrItem {
  id: string;
  orgId: string;
  orgName?: string | null;
  reference: string;
  requestType: 'access' | 'correction' | 'erasure' | 'grievance' | 'nomination';
  status: 'received' | 'verifying' | 'in_progress' | 'on_hold' | 'fulfilled' | 'rejected' | 'closed';
  principalName: string;
  principalEmail?: string | null;
  principalPhone?: string | null;
  details?: string | null;
  responseWindowDays: number;
  receivedAt: string;
  dueAt: string;
  closedAt?: string | null;
  resolutionNote?: string | null;
}

export interface DpdpBreachItem {
  id: string;
  orgId: string;
  orgName?: string | null;
  reference: string;
  title: string;
  description?: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'detected' | 'assessing' | 'notifying' | 'notified' | 'contained' | 'closed';
  jurisdictionCode: string;
  affectedDataPrincipals?: number | null;
  dataCategories?: string | null;
  detectedAt: string;
  notifyDueAt: string;
  boardNotifiedAt?: string | null;
  principalsNotifiedAt?: string | null;
  containedAt?: string | null;
  closedAt?: string | null;
}

export interface GrcRiskItem {
  id: string;
  orgId: string;
  orgName?: string | null;
  number: string;
  title: string;
  description?: string | null;
  category: 'operational' | 'financial' | 'strategic' | 'compliance' | 'technology' | 'reputational';
  likelihood: number;
  impact: number;
  riskScore: number;
  riskRating: 'low' | 'medium' | 'high' | 'critical';
  status: 'identified' | 'assessed' | 'mitigating' | 'accepted' | 'closed';
  treatment?: 'accept' | 'mitigate' | 'transfer' | 'avoid' | null;
  reviewFrequency: string;
  mitigationPlan?: string | null;
  reviewDate?: string | null;
  createdAt: string;
}

export interface GrcPolicyItem {
  id: string;
  orgId: string;
  orgName?: string | null;
  title: string;
  content?: string | null;
  category?: string | null;
  version: number;
  status: 'draft' | 'review' | 'approved' | 'published' | 'retired';
  reviewCycleMonths: number;
  lastReviewed?: string | null;
  nextReview?: string | null;
  publishedAt?: string | null;
}

export interface TenantOrganization {
  id: string;
  name: string;
}

