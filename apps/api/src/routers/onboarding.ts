import { router, protectedProcedure } from "../lib/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { panColumns } from "../lib/pan";
import {
  users,
  tickets,
  invoices,
  chartOfAccounts,
  organizations,
  eq,
  and,
  count,
  sql,
} from "@coheronconnect/db";

import { writeWizardData, DuplicateGstinError } from "../services/orgWizardWrite";

export const profileSchema = z.object({
  displayName: z.string().min(1),
  industry: z.string().min(1),
  size: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  website: z.string().url().or(z.string().min(1)),
  supportEmail: z.string().email(),
});

export const indiaSchema = z.object({
  gstin: z.string().length(15).regex(/^[0-9A-Z]{15}$/, "Invalid GSTIN format"),
  pan: z.string().length(10).regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN"),
  cin: z.string().length(21).regex(/^[L|U]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/, "Invalid CIN"),
  tan: z.string().length(10).regex(/^[A-Z]{4}[0-9]{5}[A-Z]{1}$/, "Invalid TAN"),
  pf: z.string().min(1),
  stateCode: z.string().length(2),
});

export const itsmSchema = z.object({
  p1: z.number().int().positive(),
  p2: z.number().int().positive(),
  p3: z.number().int().positive(),
  p4: z.number().int().positive(),
});

export const saveWizardDataInputSchema = z.object({
  profile: profileSchema.optional(),
  india: indiaSchema.optional(),
  itsm: itsmSchema.optional(),
  step: z.number().int().positive().optional(),
});

export type OnboardingItemKey =
  | "invite_team"
  | "chart_of_accounts"
  | "first_ticket"
  | "first_invoice";

export interface OnboardingItem {
  key: OnboardingItemKey;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

export const onboardingRouter = router({
  /**
   * Derived checklist for the current org. `done` is computed live from row
   * counts — no state is persisted, so it is always accurate and needs no
   * migration. Returns the items plus a rolled-up completion count.
   */
  getChecklist: protectedProcedure.query(async ({ ctx }) => {
    const { db, org } = ctx;
    const orgId = org!.id;

    const [
      [activeUsersRow],
      [coaRow],
      [ticketsRow],
      [invoicesRow],
    ] = await Promise.all([
      db
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.status, "active"))),
      db
        .select({ n: count() })
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.orgId, orgId)),
      db
        .select({ n: count() })
        .from(tickets)
        .where(eq(tickets.orgId, orgId)),
      db
        .select({ n: count() })
        .from(invoices)
        .where(eq(invoices.orgId, orgId)),
    ]);

    const activeUsers = activeUsersRow?.n ?? 0;
    const coaCount = coaRow?.n ?? 0;
    const ticketCount = ticketsRow?.n ?? 0;
    const invoiceCount = invoicesRow?.n ?? 0;

    const items: OnboardingItem[] = [
      {
        key: "invite_team",
        title: "Invite a teammate",
        description: "Add at least one more person so it isn't a team of one.",
        href: "/app/admin",
        // The founder is the first active user; anything beyond that means a
        // teammate has been added (or an invite has been accepted).
        done: activeUsers > 1,
      },
      {
        key: "chart_of_accounts",
        title: "Set up your chart of accounts",
        description: "The India chart of accounts that finance and GST posting rely on.",
        href: "/app/onboarding-wizard",
        done: coaCount > 0,
      },
      {
        key: "first_ticket",
        title: "Log your first request",
        description: "Create a ticket to try the service desk end to end.",
        href: "/app/tickets",
        done: ticketCount > 0,
      },
      {
        key: "first_invoice",
        title: "Create your first invoice",
        description: "Raise an invoice to exercise the finance and ledger flow.",
        href: "/app/financial",
        done: invoiceCount > 0,
      },
    ];

    const completed = items.filter((i) => i.done).length;

    return {
      items,
      completed,
      total: items.length,
      allComplete: completed === items.length,
    };
  }),

  /**
   * Save wizard step data.
   */
  saveWizardData: protectedProcedure
    .input(saveWizardDataInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const orgId = org!.id;

      try {
        await writeWizardData(db, orgId, input, {
          type: "tenant_user",
          id: user!.id
        });
        return { success: true };
      } catch (e: any) { // any-ratchet-allow: custom postgres error handling
        if (e instanceof DuplicateGstinError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e.message
          });
        }
        throw e;
      }
    }),

  /**
   * Complete onboarding wizard.
   */
  completeWizard: protectedProcedure
    .input(z.object({}))
    .mutation(async ({ ctx }) => {
      const { db, org, user } = ctx;
      const orgId = org!.id;
      await db.update(organizations).set({
        onboardingStep: 7,
        onboardingCompletedAt: new Date(),
        onboardingCompletedBy: user!.id,
        updatedAt: new Date(),
      }).where(eq(organizations.id, orgId));
      return { success: true };
    }),

  /**
   * Retrieve current onboarding wizard state.
   */
  getWizardData: protectedProcedure.query(async ({ ctx }) => {
    const { db, org } = ctx;
    const orgId = org!.id;

    const [orgRow] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!orgRow) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organisation not found",
      });
    }

    const { gstinRegistry, legalEntities } = await import("@coheronconnect/db/schema");
    const [gstinRow] = await db
      .select()
      .from(gstinRegistry)
      .where(eq(gstinRegistry.orgId, orgId))
      .limit(1);

    const [leRow] = await db
      .select()
      .from(legalEntities)
      .where(eq(legalEntities.orgId, orgId))
      .limit(1);

    return {
      profile: {
        displayName: orgRow.name,
        industry: orgRow.industry ?? "",
        size: orgRow.companySize ?? "",
        city: orgRow.city ?? "",
        state: orgRow.state ?? "",
        website: orgRow.website ?? "",
        supportEmail: orgRow.supportEmail ?? "",
      },
      india: {
        gstin: gstinRow?.gstin ?? "",
        pan: orgRow.pan ?? "",
        cin: leRow?.cin ?? "",
        tan: orgRow.tan ?? "",
        pf: orgRow.epfCode ?? "",
        stateCode: orgRow.primaryStateCode ?? "",
      },
      itsm: {
        p1: orgRow.slaP1Hours ?? 4,
        p2: orgRow.slaP2Hours ?? 8,
        p3: orgRow.slaP3Hours ?? 24,
        p4: orgRow.slaP4Hours ?? 72,
      },
      onboardingStep: orgRow.onboardingStep ?? 1,
      onboardingCompletedAt: orgRow.onboardingCompletedAt,
    };
  }),
});
