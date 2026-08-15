/**
 * `converted` must not be reachable through an update.
 *
 * Conversion is a structured action: `leads.convert` requires an estimated value
 * and an expected close date and creates the account, contact and deal together.
 * Both update procedures accepted `status: "converted"`, which walked straight past
 * that and produced a lead marked converted with no deal behind it. The row control
 * added in Round 9b never offered it, but the API did.
 *
 * The enum keeps "converted" — it is a legitimate stored value. Only reaching it by
 * update is blocked.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import { crmLeads, eq, and } from "@coheronconnect/db";
import { crmRouter } from "../routers/crm";

describe("lead status: the converted bypass", () => {
  let orgId: string;
  let userId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" }));
    caller = crmRouter.createCaller(createMockContext(userId, orgId));
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  async function newLead(extra: Record<string, unknown> = {}) {
    return (await caller.leads.create({
      firstName: "Ada", lastName: "Lovelace",
      email: `bypass-${Math.random().toString(36).slice(2, 8)}@acme.test`,
      phone: "+91 90000 00000", company: "Acme", ...extra,
    } as never)) as { id: string };
  }

  it("crm.leads.update REJECTS status converted, naming leads.convert", async () => {
    const lead = await newLead();
    await expect(
      caller.leads.update({ id: lead.id, status: "converted" } as never),
    ).rejects.toMatchObject({ message: expect.stringMatching(/leads\.convert/i) });
  });

  it("the deprecated crm.updateLead REJECTS it too", async () => {
    const lead = await newLead();
    await expect(
      caller.updateLead({ id: lead.id, status: "converted" } as never),
    ).rejects.toMatchObject({ message: expect.stringMatching(/leads\.convert/i) });
  });

  it("the lead is left untouched by a rejected update", async () => {
    const lead = await newLead();
    await expect(caller.leads.update({ id: lead.id, status: "converted" } as never)).rejects.toThrow();
    const [row] = await testDb().select({ status: crmLeads.status, convertedDealId: crmLeads.convertedDealId })
      .from(crmLeads).where(and(eq(crmLeads.id, lead.id), eq(crmLeads.orgId, orgId)));
    expect(row!.status).not.toBe("converted");
    expect(row!.convertedDealId).toBeNull();
  });

  it("leads.convert still sets converted successfully", async () => {
    const lead = await newLead({ estimatedValue: "250000.00", expectedClose: new Date("2026-12-31") });
    const deal = (await caller.leads.convert({ id: lead.id, dealTitle: "Acme rollout" } as never)) as { id: string };
    const [row] = await testDb().select({ status: crmLeads.status, convertedDealId: crmLeads.convertedDealId })
      .from(crmLeads).where(and(eq(crmLeads.id, lead.id), eq(crmLeads.orgId, orgId)));
    expect(row!.status).toBe("converted");
    expect(row!.convertedDealId).toBe(deal.id);
  });

  it.each(["contacted", "qualified", "disqualified"])(
    "every other status (%s) still updates normally",
    async (status) => {
      const lead = await newLead();
      const updated = (await caller.leads.update({ id: lead.id, status } as never)) as { status: string };
      expect(updated.status).toBe(status);
    },
  );
});
