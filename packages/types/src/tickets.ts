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

export const CreateTicketSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  priorityId: z.string().uuid().optional(),
  type: TicketTypeEnum.default("request"),
  impact: z.enum(["high", "medium", "low"]).optional(),
  urgency: z.enum(["high", "medium", "low"]).optional(),
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
