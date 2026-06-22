/**
 * Custom Fields Router
 * Manage org-level custom field definitions and per-entity values.
 */

import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const ENTITY_VALUES = ["ticket","asset","employee","contract","vendor","project","change_request","lead","invoice","expense_claim","okr_objective"] as const;
const FIELD_TYPES   = ["text","textarea","number","decimal","boolean","date","datetime","select","multi_select","url","email","phone","user_reference","file","json"] as const;

export const customFieldsRouter = router({
  // ── Definitions ────────────────────────────────────────────────────────

  listDefinitions: permissionProcedure("admin", "read").input(z.object({
    entity:    z.enum(ENTITY_VALUES),
    activeOnly: z.boolean().default(true),
  })).query(async ({ ctx, input }) => {
    const { org, db } = ctx;
    const { customFieldDefinitions, eq: dbEq, and: dbAnd, asc: dbAsc } = await import("@coheronconnect/db");
    const conds: any[] = [dbEq(customFieldDefinitions.orgId, org!.id), dbEq(customFieldDefinitions.entity, input.entity)];
    if (input.activeOnly) conds.push(dbEq(customFieldDefinitions.isActive, true));
    return db.select().from(customFieldDefinitions).where(dbAnd(...conds)).orderBy(dbAsc(customFieldDefinitions.sortOrder));
  }),

  createDefinition: permissionProcedure("admin", "write").input(z.object({
    entity:       z.enum(ENTITY_VALUES),
    name:         z.string().min(1).max(60).regex(/^[a-z_][a-z0-9_]*$/, "Name must be lowercase snake_case (start with letter/underscore, then letters, digits, or underscores only)"),
    label:        z.string().min(1).max(100),
    type:         z.enum(FIELD_TYPES).default("text"),
    options:      z.array(z.object({ value: z.string(), label: z.string() })).optional(),
    isRequired:   z.boolean().default(false),
    isListColumn: z.boolean().default(false),
    placeholder:  z.string().optional(),
    helpText:     z.string().optional(),
    groupName:    z.string().optional(),
    defaultValue: z.string().optional(),
    sortOrder:    z.number().int().default(0),
  })).mutation(async ({ ctx, input }) => {
    const { org, db } = ctx;
    const { customFieldDefinitions } = await import("@coheronconnect/db");
    const [field] = await db.insert(customFieldDefinitions).values({
      ...input,
      orgId: org!.id,
      options: input.options ? JSON.stringify(input.options) : null,
    }).returning();
    return field!;
  }),

  updateDefinition: permissionProcedure("admin", "write").input(z.object({
    id:           z.string().uuid(),
    label:        z.string().min(1).max(100).optional(),
    isRequired:   z.boolean().optional(),
    isListColumn: z.boolean().optional(),
    isActive:     z.boolean().optional(),
    placeholder:  z.string().optional(),
    helpText:     z.string().optional(),
    sortOrder:    z.number().int().optional(),
    options:      z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  })).mutation(async ({ ctx, input }) => {
    const { org, db } = ctx;
    const { customFieldDefinitions, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
    const { id, options, ...rest } = input;
    const [field] = await db.update(customFieldDefinitions)
      .set({ ...rest, ...(options !== undefined ? { options: JSON.stringify(options) } : {}), updatedAt: new Date() })
      .where(dbAnd(dbEq(customFieldDefinitions.id, id), dbEq(customFieldDefinitions.orgId, org!.id)))
      .returning();
    return field!;
  }),

  deleteDefinition: permissionProcedure("admin", "write").input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const { org, db } = ctx;
    const { customFieldDefinitions, customFieldValues, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
    // Soft-delete: mark inactive instead of hard delete to preserve history
    const [field] = await db.update(customFieldDefinitions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(dbAnd(dbEq(customFieldDefinitions.id, input.id), dbEq(customFieldDefinitions.orgId, org!.id)))
      .returning();
    return { success: true, id: field?.id };
  }),

  // ── Values ──────────────────────────────────────────────────────────────

  getValues: permissionProcedure("admin", "read").input(z.object({
    entity:   z.enum(ENTITY_VALUES),
    entityId: z.string().uuid(),
  })).query(async ({ ctx, input }) => {
    const { org, db } = ctx;
    const { customFieldValues, customFieldDefinitions, eq: dbEq, and: dbAnd } = await import("@coheronconnect/db");
    const values = await db.select({ value: customFieldValues, field: customFieldDefinitions })
      .from(customFieldValues)
      .innerJoin(customFieldDefinitions, dbEq(customFieldValues.fieldId, customFieldDefinitions.id))
      .where(dbAnd(
        dbEq(customFieldValues.orgId, org!.id),
        dbEq(customFieldValues.entity, input.entity),
        dbEq(customFieldValues.entityId, input.entityId),
      ));
    return values;
  }),

  setValues: permissionProcedure("admin", "write").input(z.object({
    entity:   z.enum(ENTITY_VALUES),
    entityId: z.string().uuid(),
    values:   z.array(z.object({ fieldId: z.string().uuid(), value: z.unknown() })),
  })).mutation(async ({ ctx, input }) => {
    const { org, db } = ctx;
    const { customFieldValues } = await import("@coheronconnect/db");
    const rows = input.values.map(v => ({
      orgId:    org!.id,
      fieldId:  v.fieldId,
      entity:   input.entity,
      entityId: input.entityId,
      value:    JSON.stringify(v.value),
    }));

    if (rows.length === 0) return { count: 0 };

    const { sql } = await import("@coheronconnect/db");
    await db.insert(customFieldValues).values(rows)
      .onConflictDoUpdate({
        target: ["field_id", "entity_id"],
        set: { value: sql`excluded.value`, updatedAt: new Date() },
      });

    return { count: rows.length };
  }),
});
