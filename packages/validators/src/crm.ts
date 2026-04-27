/**
 * @nexusops/validators — CRM Zod Schemas
 *
 * Single source of truth for all CRM-related validation.
 * Shared between:
 *  - API routers (server-side validation)
 *  - Frontend forms (client-side validation)
 *
 * This eliminates schema duplication and ensures API/UI always agree.
 */
import { z } from "zod";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const AccountTierEnum = z.enum(["enterprise", "mid_market", "smb"]);
export type AccountTier = z.infer<typeof AccountTierEnum>;

export const DealStageEnum = z.enum([
  "prospect",
  "qualification",
  "proposal",
  "negotiation",
  "verbal_commit",
  "closed_won",
  "closed_lost",
]);
export type DealStage = z.infer<typeof DealStageEnum>;

export const LeadStatusEnum = z.enum([
  "new",
  "contacted",
  "qualified",
  "disqualified",
  "converted",
]);
export type LeadStatus = z.infer<typeof LeadStatusEnum>;

export const QuoteStatusEnum = z.enum([
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
]);
export type QuoteStatus = z.infer<typeof QuoteStatusEnum>;

export const ApprovalTierEnum = z.enum(["manager", "executive"]);
export type ApprovalTier = z.infer<typeof ApprovalTierEnum>;

export const LeadSourceEnum = z.enum([
  "website",
  "referral",
  "outbound",
  "event",
  "partner",
  "social",
  "other",
]);
export type LeadSource = z.infer<typeof LeadSourceEnum>;

// ── Account Schemas ───────────────────────────────────────────────────────────

export const CreateAccountSchema = z.object({
  name: z.string().min(1, "Account name is required").max(200),
  industry: z.string().optional(),
  tier: AccountTierEnum.default("smb"),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  annualRevenue: z.string().optional(),
  country: z.string().optional(),
  employees: z.coerce.number().int().min(0).optional(),
  notes: z.string().optional(),
});
export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;

export const UpdateAccountSchema = z.object({
  id: z.string().uuid(),
  healthScore: z.coerce.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;

// ── Deal Schemas ──────────────────────────────────────────────────────────────

export const CreateDealSchema = z.object({
  title: z.string().min(1, "Deal title is required").max(300),
  accountId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  value: z.string().optional(),
  probability: z.coerce.number().min(0).max(100).default(10),
  expectedClose: z.string().optional(),
  description: z.string().optional(),
  source: z.string().optional(),
});
export type CreateDealInput = z.infer<typeof CreateDealSchema>;

export const MovePipelineSchema = z.object({
  id: z.string().uuid(),
  stage: DealStageEnum,
});
export type MovePipelineInput = z.infer<typeof MovePipelineSchema>;

// ── Contact Schemas ───────────────────────────────────────────────────────────

export const CreateContactSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Must be a valid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  title: z.string().optional(),
  accountId: z.string().uuid().optional(),
});
export type CreateContactInput = z.infer<typeof CreateContactSchema>;

// ── Lead Schemas ──────────────────────────────────────────────────────────────

export const CreateLeadSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Must be a valid email").optional().or(z.literal("")),
  company: z.string().optional(),
  source: LeadSourceEnum.default("website"),
});
export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;

export const UpdateLeadSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  company: z.string().optional(),
  title: z.string().optional(),
  status: LeadStatusEnum.optional(),
});
export type UpdateLeadInput = z.infer<typeof UpdateLeadSchema>;

// ── Quote Schemas ─────────────────────────────────────────────────────────────

export const QuoteLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().min(0),
  unitPrice: z.string(),
  total: z.string(),
});
export type QuoteLineItem = z.infer<typeof QuoteLineItemSchema>;

export const CreateQuoteSchema = z.object({
  dealId: z.string().uuid().optional(),
  items: z.array(QuoteLineItemSchema).default([]),
  discountPct: z.string().default("0"),
  validUntil: z.string().optional(),
});
export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;

// ── Activity Schemas ──────────────────────────────────────────────────────────

export const CreateActivitySchema = z.object({
  type: z.string().min(1),
  subject: z.string().min(1, "Subject is required").max(300),
  description: z.string().optional(),
  dealId: z.string().uuid().optional(),
  outcome: z.string().optional(),
});
export type CreateActivityInput = z.infer<typeof CreateActivitySchema>;

// ── Deal Approval Schemas ─────────────────────────────────────────────────────

export const ApproveDealWonSchema = z.object({
  id: z.string().uuid(),
  tier: ApprovalTierEnum,
});
export type ApproveDealWonInput = z.infer<typeof ApproveDealWonSchema>;

export const UpdateDealApprovalThresholdsSchema = z.object({
  dealApprovalCurrency: z.string().length(3).transform((s) => s.toUpperCase()),
  dealCloseNoApprovalBelow: z.coerce.number().min(0).max(1e14),
  dealCloseExecutiveAbove: z.coerce.number().min(1).max(1e14),
});
export type UpdateDealApprovalThresholdsInput = z.infer<typeof UpdateDealApprovalThresholdsSchema>;
