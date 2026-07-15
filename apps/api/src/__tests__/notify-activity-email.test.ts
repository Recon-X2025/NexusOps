/**
 * notifyActivity out-of-band email (escalation reachability).
 *
 * Every workflow-driven, per-user notice (approval outcome, ticket SLA breach,
 * on-call escalation, vulnerability escalation) flows through `notifyActivity`.
 * It previously wrote only the in-app inbox row and never emailed the target —
 * so an escalation to a specific on-call engineer only "arrived" if they happened
 * to be looking at the app. This suite pins the fix: `notifyActivity` resolves the
 * target user's email and passes it to `sendNotification` as the `emailTo` arg,
 * while still writing the in-app row (the source of truth).
 *
 * With no SMTP host configured (the test env), `sendEmail` logs
 * `[EMAIL] Would send to <addr>: <subject>` instead of delivering — so we assert
 * the *real* end-to-end effect: the email transport is reached with the target's
 * actual address. Invariants:
 *   • the in-app `notifications` row is still written;
 *   • the email transport is reached with the target user's real email;
 *   • the lookup is org-scoped — resolving a user under another org yields no
 *     email address (transport not reached), proving (id, orgId) scoping.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { initTestEnvironment, seedFullOrg, testDb, cleanupOrg } from "./helpers";
import { users, notifications } from "@coheronconnect/db";
import { notifyActivity } from "../workflows/activities";

/** Capture the `[EMAIL] Would send to <addr>: <subject>` line the no-SMTP path logs. */
function emailedAddresses(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls
    .map((c) => String(c[0] ?? ""))
    .filter((line) => line.startsWith("[EMAIL] Would send to "))
    .map((line) => line.slice("[EMAIL] Would send to ".length).split(":")[0]!.trim());
}

describe("notifyActivity out-of-band email", () => {
  let orgId: string;
  let agentId: string;
  let agentEmail: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await initTestEnvironment();
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    agentId = seeded.agentId;
    const [row] = await testDb()
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, agentId));
    agentEmail = row!.email;
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(async () => {
    infoSpy.mockRestore();
    await testDb().delete(notifications).where(eq(notifications.orgId, orgId));
    await cleanupOrg(orgId);
  });

  it("emails the target user and writes the in-app notification", async () => {
    await notifyActivity(
      { db: testDb(), orgId, actorId: "system" },
      {
        userId: agentId,
        title: "Escalation L2: vulnerability CVE-9999",
        message: "A breached vulnerability escalated to you.",
        resourceType: "vulnerability",
        resourceId: "00000000-0000-0000-0000-000000000001",
        link: "/app/security/vulnerabilities/x",
      },
    );

    // in-app row still written
    const rows = await testDb()
      .select()
      .from(notifications)
      .where(and(eq(notifications.orgId, orgId), eq(notifications.userId, agentId)));
    expect(rows.length).toBe(1);

    // email transport reached with the target's real address
    expect(emailedAddresses(infoSpy)).toContain(agentEmail);
  });

  it("scopes the email lookup to the notice's org (no email for a foreign-org user)", async () => {
    // `agentId` belongs to `orgId`. Firing the notice under a *different* org must
    // not resolve that user's email, so the transport is never reached.
    const other = await seedFullOrg();
    try {
      await notifyActivity(
        { db: testDb(), orgId: other.orgId, actorId: "system" },
        {
          userId: agentId,
          title: "Cross-org guard",
          message: "Should not resolve an email.",
          resourceType: "vulnerability",
          resourceId: "00000000-0000-0000-0000-000000000003",
        },
      );
      // No FK violation occurs because notifications.userId still references a real
      // user id; but the (id, orgId)-scoped email lookup misses, so no email is sent.
      expect(emailedAddresses(infoSpy)).not.toContain(agentEmail);
      expect(emailedAddresses(infoSpy).length).toBe(0);
    } finally {
      await testDb().delete(notifications).where(eq(notifications.orgId, other.orgId));
      await cleanupOrg(other.orgId);
    }
  });
});
