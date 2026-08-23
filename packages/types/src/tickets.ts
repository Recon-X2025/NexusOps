import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────────────
export const TicketTypeEnum = z.enum(["incident", "request", "problem", "change"]);
export const TicketStatusCategoryEnum = z.enum([
  "open",
  "in_progress",
  "pending",
  "resolved",
  "closed",
]);
export const TicketRelationTypeEnum = z.enum(["blocks", "blocked_by", "duplicate", "related"]);

export type TicketType = z.infer<typeof TicketTypeEnum>;
export type TicketStatusCategory = z.infer<typeof TicketStatusCategoryEnum>;

// ── Ticket ─────────────────────────────────────────────────────────────────
export const TicketSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  number: z.string(), // e.g. "ORG-0001"
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  priorityId: z.string().uuid().nullable().optional(),
  statusId: z.string().uuid(),
  type: TicketTypeEnum,
  requesterId: z.string().uuid(),
  assigneeId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  requiredSkill: z.string().max(128).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  slaBreached: z.boolean().default(false),
  tags: z.array(z.string()),
  customFields: z.record(z.unknown()).optional(),
  resolvedAt: z.coerce.date().nullable().optional(),
  closedAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Ticket = z.infer<typeof TicketSchema>;

export const IntakeChannelEnum = z.enum([
  "portal",
  "email",
  "api",
  "chat",
  /**
   * Walk-in / in-person request — agent files a ticket on behalf of an employee
   * who came up to the IT/HR desk in person. Replaces the standalone
   * "Walk-Up Experience" surface for our segment (0–500 employees).
   */
  "walk_in",
  "phone",
]);

/**
 * ITIL impact x urgency -> priority tier (1 = Critical … 4 = Low).
 *
 * SHARED DELIBERATELY. The New Ticket form used to hold its own 4x4 copy of this
 * table while sending the server only a 3-value `impact`/`urgency` enum. The
 * server then re-derived priority from that degraded input by averaging, so
 * "multiple groups x high" (a 2 - High on the matrix) collapsed onto the same
 * value as "enterprise-wide x critical" and was stored as Critical — stamping
 * Critical's much tighter SLA clocks on a ticket the user was shown as High.
 *
 * Both sides must read THIS table so the priority displayed is the priority
 * stored. Grades are 1-4 on each axis, matching the form's four options.
 */
export const ITIL_PRIORITY_MATRIX: Record<number, Record<number, number>> = {
  1: { 1: 1, 2: 1, 3: 2, 4: 3 }, // enterprise-wide
  2: { 1: 1, 2: 2, 3: 3, 4: 3 }, // multiple groups / departments
  3: { 1: 2, 2: 3, 3: 3, 4: 4 }, // single department
  4: { 1: 3, 2: 3, 3: 4, 4: 4 }, // individual
};

/** Priority tier (1-4) for a grade pair; falls back to Medium if out of range. */
export function itilPriorityLevel(
  impactGrade: number | undefined,
  urgencyGrade: number | undefined,
): number | null {
  if (!impactGrade || !urgencyGrade) return null;
  return ITIL_PRIORITY_MATRIX[impactGrade]?.[urgencyGrade] ?? null;
}

export const CreateTicketSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  priorityId: z.string().uuid().optional(),
  type: TicketTypeEnum.default("request"),
  impact: z.enum(["high", "medium", "low"]).optional(),
  urgency: z.enum(["high", "medium", "low"]).optional(),
  /**
   * Full ITIL grade (1-4) behind the coarse `impact`/`urgency` enums above.
   * Optional so existing callers keep working; when present the server derives
   * priority from ITIL_PRIORITY_MATRIX instead of averaging the coarse values.
   */
  impactGrade: z.number().int().min(1).max(4).optional(),
  urgencyGrade: z.number().int().min(1).max(4).optional(),
  assigneeId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  /** Skill hint for auto-routing (P1-8). */
  requiredSkill: z.string().max(128).optional(),
  dueDate: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
  /** Phase B1 — CMDB configuration item */
  configurationItemId: z.string().uuid().nullable().optional(),
  /** Phase B3 — known error record */
  knownErrorId: z.string().uuid().nullable().optional(),
  /** Phase C1 */
  isMajorIncident: z.boolean().optional(),
  /** Phase C2 */
  intakeChannel: IntakeChannelEnum.optional(),
  /** Parent incident / major-incident child link (US-ITSM-004). */
  parentTicketId: z.string().uuid().optional(),
});

export const UpdateTicketSchema = CreateTicketSchema.partial().extend({
  statusId: z.string().uuid().optional(),
  /**
   * The agent's account of the fix, shown to the requester and mined by the
   * "similar past resolutions" panel. The resolve dialog marks it required, so
   * it must be accepted here — it was previously sent as a stray top-level
   * `comment` key, which zod stripped, silently discarding every note.
   */
  resolutionNotes: z.string().max(10_000).optional(),
  /** Stored when SLA pauses (pending); audited on ticket update (US-ITSM-001). */
  slaPauseReasonCode: z.string().max(64).optional(),
  /** Clear parent link with `null` (OpenAPI/client may send null explicitly). */
  parentTicketId: z.string().uuid().nullish(),
});

export const AddCommentSchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().min(1),
  isInternal: z.boolean().default(false),
});

export const TicketListFiltersSchema = z.object({
  statusId: z.string().uuid().optional(),
  statusCategory: TicketStatusCategoryEnum.optional(),
  /** When true, exclude tickets whose status category is `resolved` or `closed`. */
  activeOnly: z.boolean().optional(),
  priorityId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  /** When set, only tickets raised by the current user (portal / requester-safe list). */
  ticketScope: z.enum(["mine"]).optional(),
  /** Filter incidents linked to a known error (problem workspace). */
  knownErrorId: z.string().uuid().optional(),
  /** Major incident queue (Phase C1). */
  isMajorIncident: z.boolean().optional(),
  /** Incidents linked via known_errors.problem_id (problem workspace). */
  problemId: z.string().uuid().optional(),
  type: TicketTypeEnum.optional(),
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  slaBreached: z.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(25),
  orderBy: z.enum(["createdAt", "updatedAt", "priority", "number"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
