/**
 * Fresh-org pilot-readiness guarantees.
 *
 * Ten startups onboard at once via self-serve signup. This suite locks in the
 * day-one experience so a brand-new, empty org is honest and immediately usable:
 *
 *   1. Signup auto-seeds the India chart of accounts, so the org can post
 *      journal entries (invoice GST, depreciation, COGS) from the first login
 *      without a manual acc.coa.seed() step.
 *   2. The service-desk dashboard reports slaCompliancePct = null (not a
 *      fabricated 100%) when the org has zero tickets.
 *   3. The CSM dashboard reports slaBreached = null and avgCsat = null (not a
 *      fabricated 0) when there is no case/survey data yet.
 *
 * Mirrors the other router tests: real Postgres, fresh org per test, drive
 * everything through the real routers/context.
 */
import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import type { Context } from "../lib/trpc";
import { authRouter } from "../routers/auth";
import { dashboardRouter } from "../routers/dashboard";
import { csmRouter } from "../routers/csm";
import { onboardingRouter } from "../routers/onboarding";
import { seedUser } from "./helpers";
import { chartOfAccounts, eq, and, inArray } from "@coheronconnect/db";

function publicContext(): Context {
  return {
    db: testDb(),
    mongoDb: null,
    databaseProvider: "postgres",
    user: null,
    org: null,
    orgId: null,
    sessionId: null,
    requestId: null,
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
    idempotencyKey: null,
    macToken: null,
  } as unknown as Context;
}

describe("Fresh org — self-serve signup seeds the chart of accounts", () => {
  it("a newly signed-up org has the core India COA accounts", async () => {
    const auth = authRouter.createCaller(publicContext());
    const email = `founder-${nanoid(6)}@pilot.coheronconnect.io`;
    const { org } = await auth.signup({
      name: "Pilot Founder",
      email,
      password: "TestPass123!",
      orgName: `Pilot ${nanoid(5)}`,
    });

    const db = testDb();
    const wanted = ["1130", "1170", "2110", "5100", "5500", "1290"];
    const rows = await db
      .select({ code: chartOfAccounts.code })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.orgId, org!.id), inArray(chartOfAccounts.code, wanted)));
    const seen = new Set(rows.map((r) => r.code));
    for (const code of wanted) {
      expect(seen.has(code), `expected COA account ${code} to be seeded on signup`).toBe(true);
    }
  });
});

describe("Fresh org — dashboards stay honest with no data", () => {
  it("service-desk dashboard returns slaCompliancePct = null when there are no tickets", async () => {
    const { orgId, adminId } = await seedFullOrg();
    const dash = dashboardRouter.createCaller(createMockContext(adminId!, orgId));
    const metrics = await dash.getMetrics();
    expect(metrics.totalTickets).toBe(0);
    expect(metrics.slaCompliancePct).toBeNull();
  });

  it("CSM dashboard returns slaBreached = null and avgCsat = null with no cases or surveys", async () => {
    const { orgId, adminId } = await seedFullOrg();
    const csm = csmRouter.createCaller(createMockContext(adminId!, orgId));
    const d = await csm.dashboard();
    expect(d.totalCases).toBe(0);
    expect(d.slaBreached).toBeNull();
    expect(d.avgCsat).toBeNull();
  });
});

describe("Fresh org — onboarding checklist derives progress from live data", () => {
  it("a just-signed-up org has COA done, everything else pending", async () => {
    const auth = authRouter.createCaller(publicContext());
    const email = `founder-${nanoid(6)}@pilot.coheronconnect.io`;
    const { user, org } = await auth.signup({
      name: "Solo Founder",
      email,
      password: "TestPass123!",
      orgName: `Solo ${nanoid(5)}`,
    });

    const onboarding = onboardingRouter.createCaller(createMockContext(user.id, org!.id));
    const result = await onboarding.getChecklist();

    const byKey = new Map(result.items.map((i) => [i.key, i.done]));
    // COA is auto-seeded at signup ⇒ done. Solo founder, no tickets, no invoices ⇒ pending.
    expect(byKey.get("chart_of_accounts")).toBe(true);
    expect(byKey.get("invite_team")).toBe(false);
    expect(byKey.get("first_ticket")).toBe(false);
    expect(byKey.get("first_invoice")).toBe(false);
    expect(result.completed).toBe(1);
    expect(result.total).toBe(4);
    expect(result.allComplete).toBe(false);
  });

  it("inviting a teammate flips the invite_team item to done", async () => {
    const auth = authRouter.createCaller(publicContext());
    const email = `founder-${nanoid(6)}@pilot.coheronconnect.io`;
    const { user, org } = await auth.signup({
      name: "Founder",
      email,
      password: "TestPass123!",
      orgName: `Team ${nanoid(5)}`,
    });

    // A second active user in the org (as an admin invite would create).
    await seedUser(org!.id, { role: "member", status: "active" });

    const onboarding = onboardingRouter.createCaller(createMockContext(user.id, org!.id));
    const result = await onboarding.getChecklist();
    const byKey = new Map(result.items.map((i) => [i.key, i.done]));
    expect(byKey.get("invite_team")).toBe(true);
  });
});
