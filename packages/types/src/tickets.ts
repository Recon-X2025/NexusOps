import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────────────
export const TicketTypeEnum = z.enum(["incident", "request", "problem", "change"]);
export const TicketStatusCategoryEnum = z.enum(["open", "in_progress", "resolved", "closed"]);
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

export const CreateTicketSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  priorityId: z.string().uuid().optional(),
  type: TicketTypeEnum.default("request"),
  assigneeId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  dueDate: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
});

export const UpdateTicketSchema = CreateTicketSchema.partial().extend({
  statusId: z.string().uuid().optional(),
});

export const AddCommentSchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().min(1),
  isInternal: z.boolean().default(false),
});

export const TicketListFiltersSchema = z.object({
  statusId: z.string().uuid().optional(),
  statusCategory: TicketStatusCategoryEnum.optional(),
  priorityId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  type: TicketTypeEnum.optional(),
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  slaBreached: z.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(25),
  orderBy: z.enum(["createdAt", "updatedAt", "priority", "number"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
