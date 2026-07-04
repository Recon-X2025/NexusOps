/**
 * Onboarding — first-run "getting started" checklist.
 *
 * Read-only: progress is *derived* from existing data (user/ticket/invoice/COA
 * counts), so there are no new tables and nothing to keep in sync. A brand-new
 * pilot org lands on the Command Center and sees this checklist; each item deep-
 * links into the module or the existing /app/onboarding-wizard.
 */
import { router, protectedProcedure } from "../lib/trpc";
import {
  users,
  tickets,
  invoices,
  chartOfAccounts,
  eq,
  and,
  count,
} from "@coheronconnect/db";

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
});
