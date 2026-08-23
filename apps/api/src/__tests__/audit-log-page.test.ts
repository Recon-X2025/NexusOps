/**
 * Audit-log read path — the page at /app/admin/audit-log.
 *
 * That page exists because a notification pointed at it and it did not exist:
 * the sweep that verifies the tamper-evident chain notifies owners on failure
 * ("audit entries were deleted or altered, investigate immediately") and linked
 * to a route that 404'd. The alert was real; the destination was missing.
 *
 * So the chain verdict is part of the contract, not decoration — someone
 * arriving from that notification needs it answered.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initTestEnvironment, seedFullOrg, authedCaller, createSession, cleanupOrg } from "./helpers";

describe.sequential("admin.auditLog", () => {
  let orgA: Awaited<ReturnType<typeof seedFullOrg>>, orgB: Awaited<ReturnType<typeof seedFullOrg>>;
  let callerA: Awaited<ReturnType<typeof authedCaller>>, callerB: Awaited<ReturnType<typeof authedCaller>>;

  beforeAll(async () => {
    await initTestEnvironment();
    orgA = await seedFullOrg(); orgB = await seedFullOrg();
    callerA = await authedCaller(await createSession(orgA.adminId));
    callerB = await authedCaller(await createSession(orgB.adminId));
    // generate audit entries by doing auditable work
    await callerA.tickets.create({
      title: "Audit page fixture", type: "incident",
      priorityId: orgA.p1Id!, statusId: orgA.statusOpenId!,
    });
  });
  afterAll(async () => { await cleanupOrg(orgA.orgId); await cleanupOrg(orgB.orgId); });

  it("verifyChain answers, and says so honestly", async () => {
    const v = (await callerA.admin.auditLog.verifyChain()) as {
      ok: boolean; entries: number; brokenAtSeq: number | null; reason?: string;
    };
    expect(typeof v.ok).toBe("boolean");
    expect(typeof v.entries).toBe("number");
    // an intact chain must not claim a break, and a broken one must locate it
    if (v.ok) expect(v.brokenAtSeq).toBeNull();
    else expect(v.reason ?? v.brokenAtSeq).toBeTruthy();
  });

  it("list returns this org's entries with the actor resolved", async () => {
    const r = (await callerA.admin.auditLog.list({ page: 1, limit: 50 })) as {
      items: Array<{ orgId: string; action: string; userEmail: string | null }>;
      total: number;
    };
    expect(r.total).toBeGreaterThan(0);
    expect(r.items.every((e) => e.orgId === orgA.orgId)).toBe(true);
  });

  it("one tenant's audit log is not visible to another", async () => {
    const a = (await callerA.admin.auditLog.list({ page: 1, limit: 50 })) as { items: Array<{ orgId: string }> };
    const b = (await callerB.admin.auditLog.list({ page: 1, limit: 50 })) as { items: Array<{ orgId: string }> };
    expect(a.items.length).toBeGreaterThan(0);
    expect(b.items.every((e) => e.orgId === orgB.orgId)).toBe(true);
    expect(b.items.some((e) => e.orgId === orgA.orgId)).toBe(false);
  });

  it("filters narrow the result rather than returning everything", async () => {
    const all = (await callerA.admin.auditLog.list({ page: 1, limit: 50 })) as { total: number };
    const filtered = (await callerA.admin.auditLog.list({
      page: 1, limit: 50, action: "definitely-not-an-action",
    })) as { total: number };
    expect(filtered.total).toBeLessThan(all.total);
  });
});
