/**
 * A converted lead cannot be quietly un-converted, and cannot be converted twice.
 *
 * Observed on the dev database: a lead showed CONVERTED in the list, "new" in its
 * Edit dialog, was rejected on save, and then showed QUALIFIED — while
 * `converted_deal_id` still pointed at a real deal.
 *
 * Two defects met. The Edit dialog's Status dropdown had no "converted" option,
 * so a converted lead rendered a status the record did not hold. And
 * `leads.update` blocked only the move INTO "converted", never the move OUT — so
 * a status could be written that contradicted `converted_deal_id`.
 *
 * That contradiction was not cosmetic: conversion idempotency required
 * `status === "converted" && convertedDealId`, so the downgrade re-armed the
 * convert path. Measured before the fix: a second convert raised a SECOND deal
 * against the same lead (deals 1 -> 2).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { crmRouter } from "../routers/crm";
import { crmLeads, crmDeals, eq } from "@coheronconnect/db";

const rnd = () => Math.random().toString(36).slice(2, 8);

describe("converted lead integrity", () => {
  let orgId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;
  let leadId: string;

  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    caller = crmRouter.createCaller(createMockContext(s.adminId!, orgId));
    const [lead] = await testDb().insert(crmLeads).values({
      orgId, firstName: "Repro", lastName: `Case${rnd()}`,
      email: `repro.${rnd()}@x.test`, company: `Repro Co ${rnd()}`,
      estimatedValue: "250000", expectedClose: new Date("2026-12-31"),
    } as never).returning();
    leadId = lead!.id;
  });

  const row = async () => (await testDb().select().from(crmLeads).where(eq(crmLeads.id, leadId)))[0]!;
  const dealCount = async () => (await testDb().select().from(crmDeals).where(eq(crmDeals.orgId, orgId))).length;

  it("REFUSES to change a converted lead's status", async () => {
    await caller.leads.convert({ id: leadId, dealTitle: "First" });
    expect((await row()).status).toBe("converted");

    await expect(caller.leads.update({ id: leadId, status: "qualified" }))
      .rejects.toThrow(/already been converted/i);
    expect((await row()).status).toBe("converted");
  });

  it("still allows editing everything ELSE on a converted lead", async () => {
    await caller.leads.convert({ id: leadId, dealTitle: "First" });
    await caller.leads.update({ id: leadId, nextAction: "Send renewal pack" });
    const after = await row();
    expect(after.nextAction).toBe("Send renewal pack");
    expect(after.status).toBe("converted");
  });

  it("accepts a status write that does not actually change it", async () => {
    await caller.leads.convert({ id: leadId, dealTitle: "First" });
    // The dialog no longer sends status for a converted lead, but a no-op write
    // must not be an error either.
    await expect(caller.leads.update({ id: leadId, status: "converted" }))
      .rejects.toThrow(/cannot be set to Converted from this form/i);
  });

  it("converting twice returns the SAME deal and creates no duplicate", async () => {
    const first = await caller.leads.convert({ id: leadId, dealTitle: "First" });
    const before = await dealCount();
    const second = await caller.leads.convert({ id: leadId, dealTitle: "Second" });
    expect(second.id).toBe(first.id);
    expect(await dealCount()).toBe(before);
  });

  it("idempotency survives a status that contradicts the record", async () => {
    // The exact damaged shape found in dev: convertedDealId set, status not
    // "converted". Written directly because the API now refuses to produce it.
    const first = await caller.leads.convert({ id: leadId, dealTitle: "First" });
    await testDb().update(crmLeads).set({ status: "qualified" }).where(eq(crmLeads.id, leadId));
    const before = await dealCount();

    const again = await caller.leads.convert({ id: leadId, dealTitle: "Third" });
    expect(again.id, "must return the original deal, not raise a new one").toBe(first.id);
    expect(await dealCount(), "no duplicate deal").toBe(before);
  });

  it("the refusal message does not name a procedure a user cannot call", async () => {
    await expect(caller.leads.update({ id: leadId, status: "converted" }))
      .rejects.toThrow(/^(?!.*crm\.leads\.convert).*$/s);
  });
});
