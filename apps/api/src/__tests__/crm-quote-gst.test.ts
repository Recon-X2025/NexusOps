/**
 * G7 — CPQ tax/GST on quotes.
 *
 * Before G7, `crm_quotes` had no tax column — `total = subtotal − discount`.
 * A quote for an Indian buyer must carry GST. These tests prove:
 *   - intra-state supply splits CGST+SGST (50/50),
 *   - inter-state supply charges IGST,
 *   - discount is applied BEFORE tax,
 *   - per-line gstRate is honoured and rolled up (mixed rates),
 *   - a quote with no linked account defaults to intra-state at the org state,
 *   - update re-computes tax when line items / discount change,
 *   - flat (deprecated) createQuote scores identically to the nested path.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { crmRouter } from "../routers/crm";
import { crmAccounts, crmDeals, gstinRegistry } from "@coheronconnect/db";
import { nanoid } from "nanoid";

/** Postgres numeric columns read back as e.g. "900.00"; compare by value. */
const money = (v: unknown) => Number(v);

describe("G7: CPQ tax/GST on quotes", () => {
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
    // Org supplier state = Karnataka (29).
    await testDb().insert(gstinRegistry).values({
      orgId,
      gstin: `29ABCDE${nanoid(4)}Z1`,
      legalName: "Supplier Co",
      stateCode: "29",
      isPrimary: true,
      isActive: true,
    });
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function seedDealWithAccount(stateCode: string | null) {
    const [account] = await testDb()
      .insert(crmAccounts)
      .values({ orgId, name: `Buyer ${nanoid(4)}`, ownerId: userId, stateCode })
      .returning();
    const [deal] = await testDb()
      .insert(crmDeals)
      .values({ orgId, title: "Deal", accountId: account!.id, ownerId: userId })
      .returning();
    return { account: account!, deal: deal! };
  }

  it("intra-state supply splits CGST + SGST", async () => {
    const { deal } = await seedDealWithAccount("29"); // same state as org
    const quote = await caller.deals.quotes.create({
      dealId: deal.id,
      items: [{ description: "Widget", quantity: 1, unitPrice: "10000", total: "10000", gstRate: 18 }],
      discountPct: "0",
    });
    // taxable 10000 @ 18% intra: cgst 900 + sgst 900, igst 0.
    expect(quote.isInterstate).toBe(false);
    expect(money(quote.taxableValue)).toBe(10000);
    expect(money(quote.cgstAmount)).toBe(900);
    expect(money(quote.sgstAmount)).toBe(900);
    expect(money(quote.igstAmount)).toBe(0);
    expect(money(quote.taxTotal)).toBe(1800);
    expect(money(quote.total)).toBe(11800);
  });

  it("inter-state supply charges IGST", async () => {
    const { deal } = await seedDealWithAccount("27"); // Maharashtra ≠ org 29
    const quote = await caller.deals.quotes.create({
      dealId: deal.id,
      items: [{ description: "Widget", quantity: 1, unitPrice: "10000", total: "10000", gstRate: 18 }],
      discountPct: "0",
    });
    expect(quote.isInterstate).toBe(true);
    expect(money(quote.cgstAmount)).toBe(0);
    expect(money(quote.sgstAmount)).toBe(0);
    expect(money(quote.igstAmount)).toBe(1800);
    expect(money(quote.taxTotal)).toBe(1800);
    expect(money(quote.total)).toBe(11800);
  });

  it("applies discount before tax", async () => {
    const { deal } = await seedDealWithAccount("29");
    const quote = await caller.deals.quotes.create({
      dealId: deal.id,
      items: [{ description: "Widget", quantity: 1, unitPrice: "10000", total: "10000", gstRate: 18 }],
      discountPct: "10",
    });
    // subtotal 10000; discounted taxable 9000; @18% intra: cgst 810 + sgst 810.
    expect(money(quote.subtotal)).toBe(10000);
    expect(money(quote.taxableValue)).toBe(9000);
    expect(money(quote.cgstAmount)).toBe(810);
    expect(money(quote.sgstAmount)).toBe(810);
    expect(money(quote.taxTotal)).toBe(1620);
    expect(money(quote.total)).toBe(10620);
  });

  it("honours per-line gstRate and rolls up mixed rates", async () => {
    const { deal } = await seedDealWithAccount("29");
    const quote = await caller.deals.quotes.create({
      dealId: deal.id,
      items: [
        { description: "5% line", quantity: 1, unitPrice: "1000", total: "1000", gstRate: 5 },
        { description: "18% line", quantity: 1, unitPrice: "1000", total: "1000", gstRate: 18 },
      ],
      discountPct: "0",
    });
    // line1: taxable 1000 @5% intra → cgst 25 + sgst 25 = 50
    // line2: taxable 1000 @18% intra → cgst 90 + sgst 90 = 180
    expect(money(quote.taxableValue)).toBe(2000);
    expect(money(quote.cgstAmount)).toBe(115); // 25 + 90
    expect(money(quote.sgstAmount)).toBe(115);
    expect(money(quote.taxTotal)).toBe(230);
    expect(money(quote.total)).toBe(2230);
  });

  it("defaults to org state (intra) when no account/state is linked", async () => {
    const quote = await caller.deals.quotes.create({
      items: [{ description: "Widget", quantity: 1, unitPrice: "10000", total: "10000", gstRate: 18 }],
      discountPct: "0",
    });
    expect(quote.isInterstate).toBe(false);
    expect(money(quote.cgstAmount)).toBe(900);
    expect(money(quote.igstAmount)).toBe(0);
  });

  it("uses the default 18% rate when a line omits gstRate", async () => {
    const { deal } = await seedDealWithAccount("29");
    const quote = await caller.deals.quotes.create({
      dealId: deal.id,
      items: [{ description: "Widget", quantity: 1, unitPrice: "10000", total: "10000" }],
      discountPct: "0",
    });
    expect(money(quote.taxTotal)).toBe(1800);
  });

  it("re-computes tax on update when items change", async () => {
    const { deal } = await seedDealWithAccount("29");
    const quote = await caller.deals.quotes.create({
      dealId: deal.id,
      items: [{ description: "Widget", quantity: 1, unitPrice: "10000", total: "10000", gstRate: 18 }],
      discountPct: "0",
    });
    expect(money(quote.total)).toBe(11800);

    const updated = await caller.deals.quotes.update({
      id: quote.id,
      items: [{ description: "Widget", quantity: 2, unitPrice: "10000", total: "20000", gstRate: 18 }],
    });
    expect(money(updated.taxableValue)).toBe(20000);
    expect(money(updated.taxTotal)).toBe(3600);
    expect(money(updated.total)).toBe(23600);
  });

  it("flat createQuote applies GST identically", async () => {
    const { deal } = await seedDealWithAccount("27");
    const quote = await caller.createQuote({
      dealId: deal.id,
      items: [{ description: "Widget", quantity: 1, unitPrice: "10000", total: "10000", gstRate: 18 }],
      discountPct: "0",
    });
    expect(quote.isInterstate).toBe(true);
    expect(money(quote.igstAmount)).toBe(1800);
    expect(money(quote.total)).toBe(11800);
  });
});
