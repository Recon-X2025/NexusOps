/**
 * CRM Phase 1 — activities tell the truth about what they belong to.
 *
 * Two defects, both of which made a screen show data that was not the record's:
 *
 * 1. `crm.activities.list` accepted only { dealId, leadId }. `crm_activities`
 *    carries FOUR independent nullable FKs and `create` populates any of them, so
 *    accountId/contactId were SILENTLY STRIPPED by zod and the procedure returned
 *    the whole org. The account page rendered that org-wide set as that account's
 *    "Recent Activity".
 *
 * 2. `lead-convert` re-pointed activities onto the new deal filtering on
 *    contact_id alone. Lead-logged activities carry lead_id with contact_id NULL,
 *    so they never matched: the deal showed zero and the history stayed stranded.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { crmRouter } from "../routers/crm";
import { crmActivities, crmAccounts, crmContacts, crmDeals, crmLeads, eq, and } from "@coheronconnect/db";

describe("FIX 1 — activities.list filters by all four associations", () => {
  let orgId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;
  let accountId: string;
  let contactId: string;
  let dealId: string;
  let leadId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = crmRouter.createCaller(createMockContext(seeded.adminId!, orgId));

    const [acct] = await testDb().insert(crmAccounts).values({ orgId, name: `Acct ${Math.random()}` } as never).returning();
    accountId = acct!.id;
    const [ct] = await testDb().insert(crmContacts).values({ orgId, accountId, firstName: "A", lastName: "B", email: `c${Math.random()}@x.com` } as never).returning();
    contactId = ct!.id;
    const [dl] = await testDb().insert(crmDeals).values({ orgId, title: "D", accountId, stage: "qualification", value: "1000" } as never).returning();
    dealId = dl!.id;
    const [ld] = await testDb().insert(crmLeads).values({ orgId, firstName: "Lead", lastName: "One", company: "L", email: `l${Math.random()}@x.com` } as never).returning();
    leadId = ld!.id;

    // One activity per link type, through the REAL create procedure.
    await caller.activities.create({ type: "call", subject: "on deal", dealId } as never);
    await caller.activities.create({ type: "call", subject: "on lead", leadId } as never);
    await caller.activities.create({ type: "call", subject: "on account", accountId } as never);
    await caller.activities.create({ type: "call", subject: "on contact", contactId } as never);
  });

  it("each filter returns ONLY its own rows", async () => {
    const all = await caller.activities.list({});
    const byDeal = await caller.activities.list({ dealId });
    const byLead = await caller.activities.list({ leadId });
    const byAccount = await caller.activities.list({ accountId });
    const byContact = await caller.activities.list({ contactId });

    // eslint-disable-next-line no-console
    console.log(`ROW COUNTS  all=${all.length} dealId=${byDeal.length} leadId=${byLead.length} accountId=${byAccount.length} contactId=${byContact.length}`);

    expect(all.length).toBe(4);
    expect(byDeal.length).toBe(1);
    expect(byDeal[0]!.subject).toBe("on deal");
    expect(byLead.length).toBe(1);
    expect(byLead[0]!.subject).toBe("on lead");
    // These two were the defect: 4 each, the whole org.
    expect(byAccount.length).toBe(1);
    expect(byAccount[0]!.subject).toBe("on account");
    expect(byContact.length).toBe(1);
    expect(byContact[0]!.subject).toBe("on contact");
  });

  it("an omitted filter still returns the org, so nothing else changed", async () => {
    expect((await caller.activities.list({ limit: 50 })).length).toBe(4);
  });
});

describe("FIX 3 — conversion carries the lead's history onto the deal", () => {
  let orgId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = crmRouter.createCaller(createMockContext(seeded.adminId!, orgId));
  });

  /** The defect path: activities attached by lead_id ONLY, contact_id NULL. */
  it("carries LEAD-attached activities (contact_id NULL) onto the new deal", async () => {
    const [ld] = await testDb().insert(crmLeads).values({
      orgId, firstName: "Ravi", lastName: "Kumar", company: "Lead Co", email: `ld${Math.random()}@x.com`,
      estimatedValue: "500000", expectedClose: new Date("2026-12-31"),
    } as never).returning();
    const leadId = ld!.id;

    await caller.activities.create({ type: "call", subject: "discovery call", leadId } as never);
    await caller.activities.create({ type: "email", subject: "sent pricing", leadId } as never);

    const before = await testDb().select().from(crmActivities).where(eq(crmActivities.leadId, leadId));
    // eslint-disable-next-line no-console
    console.log("BEFORE:", before.map(a => `${a.subject} | deal=${a.dealId ?? "NULL"} lead=${a.leadId ? "set" : "NULL"} contact=${a.contactId ?? "NULL"} account=${a.accountId ?? "NULL"}`));
    expect(before).toHaveLength(2);
    expect(before.every(a => a.dealId === null)).toBe(true);
    expect(before.every(a => a.contactId === null)).toBe(true);

    const res = await caller.leads.convert({ id: leadId, dealTitle: "Converted Deal" } as never);
    const newDealId = (res as { id: string }).id;

    const after = await testDb().select().from(crmActivities).where(eq(crmActivities.leadId, leadId));
    // eslint-disable-next-line no-console
    console.log("AFTER: ", after.map(a => `${a.subject} | deal=${a.dealId ? "SET" : "NULL"} lead=${a.leadId ? "set" : "NULL"} contact=${a.contactId ? "SET" : "NULL"} account=${a.accountId ? "SET" : "NULL"}`));

    const onDeal = await caller.activities.list({ dealId: newDealId });
    const onLead = await caller.activities.list({ leadId });
    // eslint-disable-next-line no-console
    console.log(`list({dealId:new}) = ${onDeal.length}   list({leadId}) = ${onLead.length}`);

    // The deal now has both — this was 0.
    expect(onDeal.length).toBe(2);
    // DECISION (a): lead_id left intact, so the lead page still shows its history.
    expect(onLead.length).toBe(2);
    // Account + contact set at the moment conversion established them, so the
    // account timeline shows pre-conversion history rather than starting blank.
    expect(after.every(a => a.accountId !== null)).toBe(true);
    expect(after.every(a => a.contactId !== null)).toBe(true);

    const acctId = after[0]!.accountId!;
    expect((await caller.activities.list({ accountId: acctId })).length).toBe(2);
  });

  /** The pre-existing path must keep working — extended, not replaced. */
  it("still re-points CONTACT-attached activities, as before", async () => {
    const [acct] = await testDb().insert(crmAccounts).values({ orgId, name: `Existing ${Math.random()}` } as never).returning();
    const [ct] = await testDb().insert(crmContacts).values({
      orgId, accountId: acct!.id, firstName: "Priya", lastName: "Menon", email: `p${Math.random()}@x.com`,
    } as never).returning();
    const [ld] = await testDb().insert(crmLeads).values({
      orgId, firstName: "Priya", lastName: "Menon", company: "Contact Co", email: `lc${Math.random()}@x.com`,
      estimatedValue: "250000", expectedClose: new Date("2026-12-31"),
      contactId: ct!.id, accountId: acct!.id,
    } as never).returning();

    await caller.activities.create({ type: "meeting", subject: "contact-attached", contactId: ct!.id } as never);

    const res = await caller.leads.convert({ id: ld!.id, dealTitle: "Contact Path Deal" } as never);
    const newDealId = (res as { id: string }).id;

    const onDeal = await caller.activities.list({ dealId: newDealId });
    // eslint-disable-next-line no-console
    console.log(`CONTACT PATH: list({dealId:new}) = ${onDeal.length}`);
    expect(onDeal.length).toBeGreaterThanOrEqual(1);
    expect(onDeal.some(a => a.subject === "contact-attached")).toBe(true);
  });
});
