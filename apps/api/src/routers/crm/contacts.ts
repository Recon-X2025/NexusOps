/**
 * crm/contacts.ts — Contacts sub-router
 *
 * All Contact procedures.
 * Accessed via `trpc.crm.contacts.*` on the frontend.
 */
import { router, permissionProcedure } from "../../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { crmContacts, eq, and } from "@coheronconnect/db";

export const crmContactsRouter = router({
  list: permissionProcedure("accounts", "read")
    .input(z.object({ accountId: z.string().uuid().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(crmContacts.orgId, org!.id)];
      if (input.accountId) conditions.push(eq(crmContacts.accountId, input.accountId));
      return db.select().from(crmContacts).where(and(...conditions)).orderBy(crmContacts.lastName).limit(input.limit);
    }),

  get: permissionProcedure("accounts", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [contact] = await db.select().from(crmContacts).where(and(eq(crmContacts.id, input.id), eq(crmContacts.orgId, org!.id)));
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      return contact;
    }),

  create: permissionProcedure("accounts", "write")
    .input(z.object({
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().optional(),
      phone: z.string().optional(),
      title: z.string().optional(),
      accountId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [contact] = await db.insert(crmContacts).values({ orgId: org!.id, ...input }).returning();
      return contact;
    }),

  delete: permissionProcedure("accounts", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [contact] = await db.delete(crmContacts).where(and(eq(crmContacts.id, input.id), eq(crmContacts.orgId, org!.id))).returning();
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      return { success: true };
    }),
});
