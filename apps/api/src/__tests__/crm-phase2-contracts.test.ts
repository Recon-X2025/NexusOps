/**
 * CRM Phase 2 — the two contract changes, pinned.
 *
 * ITEM 4: a quote must name a deal.
 *   `deal_id` is a quote's ONLY relationship column, so a quote reaches its
 *   buyer transitively — quote -> deal -> account. Without a deal it has no
 *   buyer, no place of supply, and `buildQuoteTaxColumns` falls back to the
 *   org's own state and bills intra-state CGST/SGST on a sale whose destination
 *   nobody knows. The rule is asserted on the canonical procedure AND on the
 *   deprecated flat twin, because a rule added to one side only leaves the other
 *   as an open hole — this codebase's recurring defect.
 *
 *   The COLUMN stays nullable and nothing rewrites existing dealless rows. That
 *   is asserted too: the door is closed, the room is not swept.
 *
 * ITEM 5: a conversion always produces an account.
 *   `contacts.create` requires an accountId; `lead-convert` did not, so a lead
 *   with no company produced a contact with `account_id = NULL` — a contact
 *   `contacts.list({ accountId })` cannot return by construction, and therefore
 *   one that no account screen can show.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { crmRouter } from "../routers/crm";
import { crmQuotes, crmContacts, crmAccounts, crmDeals, crmLeads, eq, and } from "@coheronconnect/db";

const rnd = () => Math.random().toString(36).slice(2, 8);

describe("CRM Phase 2 — item 4: a quote must name a deal", () => {
  let orgId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;
  const line = [{ description: "Licence", quantity: 1, unitPrice: "10000", total: "10000", gstRate: 18 }];

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = crmRouter.createCaller(createMockContext(seeded.adminId!, orgId));
  });

  it("REFUSES a quote with no dealId on the canonical procedure", async () => {
    await expect(
      caller.deals.quotes.create({ items: line, discountPct: "0" } as never),
    ).rejects.toThrow(/dealId|required|invalid/i);
  });

  it("REFUSES it on the DEPRECATED flat twin too, so the hole did not just move", async () => {
    await expect(
      caller.createQuote({ items: line, discountPct: "0" } as never),
    ).rejects.toThrow(/dealId|required|invalid/i);
  });

  it("ACCEPTS a quote that names a deal", async () => {
    const [deal] = await testDb()
      .insert(crmDeals)
      .values({ orgId, title: `Deal ${rnd()}` } as never)
      .returning();
    const quote = await caller.deals.quotes.create({
      dealId: deal!.id,
      items: line,
      discountPct: "0",
    });
    expect(quote.dealId).toBe(deal!.id);
  });

  it("leaves the COLUMN nullable — a pre-existing dealless row still stores and reads", async () => {
    // The dealless rows on the dev/test databases are artifacts of
    // quote-document.spec.ts, which the owner has not authorised touching.
    // Nothing this round deletes or reassigns them; the PDF route's refusal is
    // what stops one being sent.
    const [row] = await testDb()
      .insert(crmQuotes)
      .values({
        orgId,
        quoteNumber: `QT-LEGACY-${rnd()}`,
        dealId: null,
        items: [],
        subtotal: "0",
        taxableValue: "0",
        taxTotal: "0",
        total: "0",
      } as never)
      .returning();
    expect(row!.dealId).toBeNull();

    const readBack = await testDb()
      .select()
      .from(crmQuotes)
      .where(and(eq(crmQuotes.id, row!.id), eq(crmQuotes.orgId, orgId)));
    expect(readBack).toHaveLength(1);
    expect(readBack[0]!.dealId).toBeNull();
  });
});

describe("CRM Phase 2 — item 5: converting a lead always produces an account", () => {
  let orgId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = crmRouter.createCaller(createMockContext(seeded.adminId!, orgId));
  });

  /** A convertible lead: conversion demands a value AND an expected close. */
  async function seedLead(company: string | null) {
    const [lead] = await testDb()
      .insert(crmLeads)
      .values({
        orgId,
        firstName: "Meera",
        lastName: `Iyer${rnd()}`,
        email: `meera.${rnd()}@example.com`,
        company,
        estimatedValue: "250000",
        expectedClose: new Date("2026-12-31"),
      } as never)
      .returning();
    return lead!;
  }

  it("a lead with NO company converts, and its contact gets an account named after the PERSON", async () => {
    const lead = await seedLead(null);

    const deal = await caller.leads.convert({ id: lead.id, dealTitle: "Individual buyer deal" });

    // The deal carries an account — it was left account-less before.
    expect(deal.accountId).toBeTruthy();

    const [account] = await testDb()
      .select()
      .from(crmAccounts)
      .where(eq(crmAccounts.id, deal.accountId!));
    expect(account!.name).toBe(`Meera ${lead.lastName}`);
    expect(account!.notes ?? "").toMatch(/individual buyer/i);

    // THE POINT: no account-less contact is produced.
    const contacts = await testDb()
      .select()
      .from(crmContacts)
      .where(and(eq(crmContacts.orgId, orgId), eq(crmContacts.email, lead.email!)));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.accountId).toBe(deal.accountId);
  });

  it("a lead WITH a company still uses the company name — existing behaviour unchanged", async () => {
    const company = `Kaveri Textiles ${rnd()}`;
    const lead = await seedLead(company);

    const deal = await caller.leads.convert({ id: lead.id, dealTitle: "Company deal" });

    const [account] = await testDb()
      .select()
      .from(crmAccounts)
      .where(eq(crmAccounts.id, deal.accountId!));
    expect(account!.name).toBe(company);
    // The provenance note belongs only to the person-derived case.
    expect(account!.notes ?? "").not.toMatch(/individual buyer/i);
  });

  it("leaves NO contact in the org without an account", async () => {
    await seedLead(null).then((l) => caller.leads.convert({ id: l.id, dealTitle: "A" }));
    await seedLead(`Co ${rnd()}`).then((l) => caller.leads.convert({ id: l.id, dealTitle: "B" }));

    const all = await testDb().select().from(crmContacts).where(eq(crmContacts.orgId, orgId));
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((c) => c.accountId === null)).toHaveLength(0);
  });
});
