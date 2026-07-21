/**
 * G6 — Lossless lead→deal conversion tests.
 *
 * Before G6, `crm.leads.convert` created a deal from only { title, value } and
 * dropped the lead's company + person entirely (crmLeads carried no
 * account/contact). These tests prove:
 *   - convert upserts a crm_account from the lead's company,
 *   - convert upserts a crm_contact from the lead's person,
 *   - the new deal carries both accountId + contactId,
 *   - the lead is flagged converted and back-linked to account/contact/deal,
 *   - open activities logged against the contact are re-pointed at the deal,
 *   - a second convert call is idempotent (returns the same deal, no duplicates),
 *   - an existing account with the same name is reused (no duplicate account).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { crmRouter } from "../routers/crm";
import { crmLeads, crmAccounts, crmContacts, crmActivities, crmDeals, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("G6: lossless lead→deal conversion", () => {
  let orgId: string;
  let userId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId } = await seedUser(orgId, {
      email: `crm-${nanoid(6)}@qa.coheronconnect.io`,
      role: "admin",
      matrixRole: "admin",
    }));
    caller = crmRouter.createCaller(createMockContext(userId, orgId));
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function seedLead(overrides: Partial<typeof crmLeads.$inferInsert> = {}) {
    const [lead] = await testDb()
      .insert(crmLeads)
      .values({
        orgId,
        firstName: "Ada",
        lastName: "Lovelace",
        email: `ada-${nanoid(4)}@example.com`,
        phone: "+911234567890",
        title: "CTO",
        company: `Analytical Engines ${nanoid(4)}`,
        ownerId: userId,
        ...overrides,
      })
      .returning();
    return lead!;
  }

  it("upserts account + contact and carries both onto the deal", async () => {
    const lead = await seedLead();
    const deal = await caller.convertLead({ id: lead.id, dealTitle: "Big deal", dealValue: "500000" });

    expect(deal.accountId).toBeTruthy();
    expect(deal.contactId).toBeTruthy();

    const [account] = await testDb()
      .select()
      .from(crmAccounts)
      .where(eq(crmAccounts.id, deal.accountId!));
    expect(account!.name).toBe(lead.company);

    const [contact] = await testDb()
      .select()
      .from(crmContacts)
      .where(eq(crmContacts.id, deal.contactId!));
    expect(contact!.email).toBe(lead.email);
    expect(contact!.firstName).toBe("Ada");
    expect(contact!.accountId).toBe(deal.accountId);
  });

  it("flags the lead converted and back-links account/contact/deal", async () => {
    const lead = await seedLead();
    const deal = await caller.convertLead({ id: lead.id, dealTitle: "Deal", dealValue: "100000" });

    const [after] = await testDb().select().from(crmLeads).where(eq(crmLeads.id, lead.id));
    expect(after!.status).toBe("converted");
    expect(after!.convertedDealId).toBe(deal.id);
    expect(after!.accountId).toBe(deal.accountId);
    expect(after!.contactId).toBe(deal.contactId);
  });

  it("re-points open activities on the contact at the new deal", async () => {
    const lead = await seedLead();
    // Pre-create the contact and an open activity against it, then link the lead.
    const [contact] = await testDb()
      .insert(crmContacts)
      .values({ orgId, firstName: "Ada", lastName: "Lovelace", email: lead.email })
      .returning();
    await testDb().update(crmLeads).set({ contactId: contact!.id }).where(eq(crmLeads.id, lead.id));
    const [activity] = await testDb()
      .insert(crmActivities)
      .values({ orgId, type: "call", subject: "Discovery call", contactId: contact!.id, ownerId: userId })
      .returning();

    const deal = await caller.convertLead({ id: lead.id, dealTitle: "Deal", dealValue: "100000" });

    const [movedActivity] = await testDb()
      .select()
      .from(crmActivities)
      .where(eq(crmActivities.id, activity!.id));
    expect(movedActivity!.dealId).toBe(deal.id);
    expect(movedActivity!.accountId).toBe(deal.accountId);
  });

  it("is idempotent — a second convert returns the same deal, no duplicates", async () => {
    const lead = await seedLead();
    const first = await caller.convertLead({ id: lead.id, dealTitle: "Deal", dealValue: "100000" });
    const second = await caller.convertLead({ id: lead.id, dealTitle: "Deal again", dealValue: "999999" });

    expect(second.id).toBe(first.id);

    const deals = await testDb().select().from(crmDeals).where(eq(crmDeals.orgId, orgId));
    expect(deals.length).toBe(1);
    const accounts = await testDb().select().from(crmAccounts).where(eq(crmAccounts.orgId, orgId));
    expect(accounts.length).toBe(1);
  });

  it("reuses an existing account with the same name (no duplicate)", async () => {
    const companyName = `Reused Co ${nanoid(4)}`;
    const [existing] = await testDb()
      .insert(crmAccounts)
      .values({ orgId, name: companyName, ownerId: userId })
      .returning();
    const lead = await seedLead({ company: companyName });

    const deal = await caller.convertLead({ id: lead.id, dealTitle: "Deal", dealValue: "100000" });
    expect(deal.accountId).toBe(existing!.id);

    const accounts = await testDb()
      .select()
      .from(crmAccounts)
      .where(and(eq(crmAccounts.orgId, orgId), eq(crmAccounts.name, companyName)));
    expect(accounts.length).toBe(1);
  });

  it("nested sub-router path (leads.convert) is equally lossless", async () => {
    const lead = await seedLead();
    const deal = await caller.leads.convert({ id: lead.id, dealTitle: "Deal", dealValue: "100000" });
    expect(deal.accountId).toBeTruthy();
    expect(deal.contactId).toBeTruthy();

    const [after] = await testDb().select().from(crmLeads).where(eq(crmLeads.id, lead.id));
    expect(after!.status).toBe("converted");
    expect(after!.convertedDealId).toBe(deal.id);
  });
});
