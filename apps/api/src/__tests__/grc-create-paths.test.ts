/**
 * GRC create paths — WIRING-01 item W2.
 *
 * `risk_controls` (40 rows) and `audit_findings` (30 rows) existed on 5434/DEV
 * with no writer anywhere in the repo, while `addControlEvidence` let evidence be
 * filed against a control no tenant could create, and the GRC workbench displayed
 * findings that had no read path through the API at all.
 *
 * These procedures close both directions. Every foreign key they accept comes from
 * the caller, so each is checked against the caller's org: a control or finding is
 * stamped with OUR org_id, which means RLS accepts the row whoever its parent
 * belongs to. The org check IS the isolation here.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initTestEnvironment, seedFullOrg, authedCaller, createSession, cleanupOrg } from "./helpers";

describe.sequential("grc create paths", () => {
  let orgA: Awaited<ReturnType<typeof seedFullOrg>>, orgB: Awaited<ReturnType<typeof seedFullOrg>>;
  let callerA: Awaited<ReturnType<typeof authedCaller>>, callerB: Awaited<ReturnType<typeof authedCaller>>;
  let auditA = "", riskA = "";

  beforeAll(async () => {
    await initTestEnvironment();
    orgA = await seedFullOrg(); orgB = await seedFullOrg();
    callerA = await authedCaller(await createSession(orgA.adminId));
    callerB = await authedCaller(await createSession(orgB.adminId));
    auditA = ((await callerA.grc.createAudit({ title: "Org A internal audit" })) as { id: string }).id;
    riskA  = ((await callerA.grc.createRisk({ title: "Org A risk" })) as { id: string }).id;
  });

  afterAll(async () => { await cleanupOrg(orgA.orgId); await cleanupOrg(orgB.orgId); });

  it("creates a control with an allocated number", async () => {
    const c = (await callerA.grc.createControl({
      title: "Quarterly access review", controlType: "detective", mappedRiskIds: [riskA],
    })) as { id: string; controlNumber: string; orgId: string };
    expect(c.orgId).toBe(orgA.orgId);
    expect(c.controlNumber).toMatch(/^CTL/);
    const list = (await callerA.grc.listControls({})) as Array<{ id: string }>;
    expect(list.some((x) => x.id === c.id)).toBe(true);
  });

  it("numbers are sequential per org, not random", async () => {
    const a = (await callerA.grc.createControl({ title: "One" })) as { controlNumber: string };
    const b = (await callerA.grc.createControl({ title: "Two" })) as { controlNumber: string };
    const n = (s: string) => Number(s.replace(/\D/g, ""));
    expect(n(b.controlNumber)).toBe(n(a.controlNumber) + 1);
  });

  it("refuses a risk belonging to another tenant", async () => {
    await expect(callerB.grc.createControl({ title: "Injected", mappedRiskIds: [riskA] }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("creates a finding against its own audit", async () => {
    const f = (await callerA.grc.createFinding({
      auditPlanId: auditA, title: "Segregation of duties gap", findingSeverity: "high",
      criteria: "Approver and requester must differ",
      condition: "Same user did both on 3 requisitions",
      cause: "No enforced approval chain",
      effect: "Unreviewed spend",
    })) as { id: string; findingNumber: string; orgId: string };
    expect(f.orgId).toBe(orgA.orgId);
    expect(f.findingNumber).toMatch(/^FND/);
  });

  it("refuses a finding against another tenant's audit", async () => {
    await expect(callerB.grc.createFinding({
      auditPlanId: auditA, title: "Injected finding",
      criteria: "x", condition: "y", cause: "z", effect: "w",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("listFindings is scoped to the caller's org", async () => {
    const a = (await callerA.grc.listFindings({})) as Array<{ orgId: string }>;
    const b = (await callerB.grc.listFindings({})) as Array<{ orgId: string }>;
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((f) => f.orgId === orgA.orgId)).toBe(true);
    expect(b).toHaveLength(0);
  });
});
