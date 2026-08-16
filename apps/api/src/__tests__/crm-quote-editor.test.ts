/**
 * The quote line-item editor's server half.
 *
 * The engine (`buildQuoteTaxColumns` → `computeGST`) was always capable of a
 * correct GST split; nothing in the product reached it. The New Quote dialog sent
 * ONE hardcoded line at quantity 1 / unit price 0, so every quote the UI could
 * produce totalled ₹0 and carried ₹0 of tax while looking like a finished
 * document. `crm-quote-gst.test.ts` already covers the arithmetic. This suite
 * covers what the editor added:
 *
 *  - `previewTax` returns the same figures as `create` would write, plus enough
 *    context for the dialog to name the place of supply and warn when there is none.
 *  - A quote with no lines, or lines totalling zero, is REFUSED at the API — on
 *    the canonical path AND the deprecated one, so the hole did not just move.
 *  - Both party states are normalised to a 2-digit GST code BEFORE the compare.
 *    They were not: `computeGST` decides intra-vs-inter with a raw string compare,
 *    the org side arrives as a code from `gstin_registry` and `crm_accounts
 *    .state_code` is free text that may hold a NAME. "29" ≠ "karnataka", so a
 *    LOCAL sale was billed as inter-state IGST — right total, wrong split, on a
 *    document that looks correct.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { crmRouter } from "../routers/crm";
import { crmAccounts, crmDeals, gstinRegistry } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const money = (v: unknown) => Number(v);

describe("CRM quote line-item editor", () => {
  let orgId: string;
  let userId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId } = await seedUser(orgId, {
      email: `quote-${nanoid(6)}@qa.coheronconnect.io`,
      role: "admin",
      matrixRole: "admin",
    }));
    caller = crmRouter.createCaller(createMockContext(userId, orgId));
    // Supplier: Karnataka (29).
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

  async function seedDeal(stateCode: string | null, name = `Buyer ${nanoid(4)}`) {
    const [account] = await testDb().insert(crmAccounts)
      .values({ orgId, name, ownerId: userId, stateCode }).returning();
    const [deal] = await testDb().insert(crmDeals)
      .values({ orgId, title: "Deal", accountId: account!.id, ownerId: userId }).returning();
    return { account: account!, deal: deal! };
  }

  // ── previewTax ────────────────────────────────────────────────────────────
  describe("previewTax", () => {
    it("returns exactly what create would write — two lines at different GST rates", async () => {
      const { deal } = await seedDeal("29");
      const items = [
        { description: "Licence", quantity: 2, unitPrice: "10000", total: "20000", gstRate: 18 },
        { description: "Training", quantity: 1, unitPrice: "5000", total: "5000", gstRate: 5 },
      ];

      const preview = await caller.deals.quotes.previewTax({ dealId: deal.id, items, discountPct: "0" });
      const created = await caller.deals.quotes.create({ dealId: deal.id, items, discountPct: "0" });

      // 20000 @18% intra → 1800+1800; 5000 @5% intra → 125+125.
      expect(money(preview.subtotal)).toBe(25000);
      expect(money(preview.cgstAmount)).toBe(1925);
      expect(money(preview.sgstAmount)).toBe(1925);
      expect(money(preview.igstAmount)).toBe(0);
      expect(money(preview.total)).toBe(28850);

      // The whole point of previewing on the server: the editor's numbers and the
      // stored quote's numbers come from one implementation, so they cannot drift.
      expect(money(created.subtotal)).toBe(money(preview.subtotal));
      expect(money(created.cgstAmount)).toBe(money(preview.cgstAmount));
      expect(money(created.sgstAmount)).toBe(money(preview.sgstAmount));
      expect(money(created.igstAmount)).toBe(money(preview.igstAmount));
      expect(money(created.total)).toBe(money(preview.total));
      expect(created.isInterstate).toBe(preview.isInterstate);
    });

    it("names the resolved buyer state and the intra/inter outcome", async () => {
      const { deal } = await seedDeal("27", "Mumbai Buyer");
      const preview = await caller.deals.quotes.previewTax({
        dealId: deal.id,
        items: [{ description: "X", quantity: 1, unitPrice: "1000", total: "1000", gstRate: 18 }],
        discountPct: "0",
      });
      expect(preview.isInterstate).toBe(true);
      expect(preview.buyerStateCode).toBe("27");
      expect(preview.buyerStateName).toBe("Maharashtra");
      expect(preview.orgStateName).toBe("Karnataka");
      expect(preview.accountName).toBe("Mumbai Buyer");
      expect(preview.buyerStateMissing).toBe(false);
    });

    it("flags an account with NO state — the case that warns nowhere else", async () => {
      // An ABSENT state is treated by the engine as a legitimate unknown and logs
      // nothing at all, so this flag is the only signal a rep can ever get.
      const { deal } = await seedDeal(null, "Stateless Buyer");
      const preview = await caller.deals.quotes.previewTax({
        dealId: deal.id,
        items: [{ description: "X", quantity: 1, unitPrice: "1000", total: "1000", gstRate: 18 }],
        discountPct: "0",
      });
      expect(preview.buyerStateMissing).toBe(true);
      expect(preview.accountName).toBe("Stateless Buyer");
      // Still computes, and still defaults to intra-state — but no longer silently.
      expect(preview.isInterstate).toBe(false);
      expect(money(preview.taxTotal)).toBe(180);
    });

    it("flags a state that is set but unrecognised", async () => {
      const { deal } = await seedDeal("Maharastra"); // a typo, not a GST state
      const preview = await caller.deals.quotes.previewTax({
        dealId: deal.id,
        items: [{ description: "X", quantity: 1, unitPrice: "1000", total: "1000", gstRate: 18 }],
        discountPct: "0",
      });
      expect(preview.buyerStateUnrecognised).toBe(true);
      expect(preview.buyerStateRaw).toBe("Maharastra");
      expect(preview.buyerStateCode).toBeNull();
    });

    it("reports `creatable: false` for the exact inputs the API would refuse", async () => {
      const empty = await caller.deals.quotes.previewTax({ items: [], discountPct: "0" });
      expect(empty.creatable).toBe(false);

      const zero = await caller.deals.quotes.previewTax({
        items: [{ description: "Free", quantity: 1, unitPrice: "0", total: "0" }],
        discountPct: "0",
      });
      expect(zero.creatable).toBe(false);

      const real = await caller.deals.quotes.previewTax({
        items: [{ description: "Real", quantity: 1, unitPrice: "100", total: "100" }],
        discountPct: "0",
      });
      expect(real.creatable).toBe(true);
    });
  });

  // ── the zero-value guard ──────────────────────────────────────────────────
  describe("a quote must be worth something", () => {
    it("refuses a quote with no lines", async () => {
      await expect(caller.deals.quotes.create({ items: [], discountPct: "0" }))
        .rejects.toThrow(/at least one line item/i);
    });

    it("refuses a quote whose lines total zero — the exact payload the old dialog sent", async () => {
      await expect(caller.deals.quotes.create({
        items: [{ description: "CoheronConnect Enterprise License", quantity: 1, unitPrice: "0", total: "0" }],
        discountPct: "0",
      })).rejects.toThrow(/more than zero/i);
    });

    it("refuses on the DEPRECATED flat path too, so the hole did not just move", async () => {
      await expect(caller.createQuote({
        items: [{ description: "Anything", quantity: 1, unitPrice: "0", total: "0" }],
        discountPct: "0",
      })).rejects.toThrow(/more than zero/i);
    });

    it("refuses an UPDATE that would empty an existing quote to zero", async () => {
      const quote = await caller.deals.quotes.create({
        items: [{ description: "Real", quantity: 1, unitPrice: "1000", total: "1000", gstRate: 18 }],
        discountPct: "0",
      });
      await expect(caller.deals.quotes.update({
        id: quote.id,
        items: [{ description: "Real", quantity: 1, unitPrice: "0", total: "0", gstRate: 18 }],
      })).rejects.toThrow(/more than zero/i);
    });

    it("a status-only update still works — the guard fires only when lines are sent", async () => {
      const quote = await caller.deals.quotes.create({
        items: [{ description: "Real", quantity: 1, unitPrice: "1000", total: "1000", gstRate: 18 }],
        discountPct: "0",
      });
      const sent = await caller.deals.quotes.update({ id: quote.id, status: "sent" });
      expect(sent.status).toBe("sent");
      expect(money(sent.total)).toBe(1180);
    });
  });

  // ── state normalisation before the intra/inter compare ────────────────────
  describe("both party states are normalised before the compare", () => {
    it("a buyer state stored as a NAME in the same state is INTRA-state, not IGST", async () => {
      // The defect: org side "29" (a code, from gstin_registry) vs buyer side
      // "Karnataka" (a name, free text on crm_accounts). A raw compare made these
      // unequal and billed a Bengaluru-to-Bengaluru sale as inter-state IGST.
      const { deal } = await seedDeal("Karnataka");
      const quote = await caller.deals.quotes.create({
        dealId: deal.id,
        items: [{ description: "Local sale", quantity: 1, unitPrice: "10000", total: "10000", gstRate: 18 }],
        discountPct: "0",
      });
      expect(quote.isInterstate).toBe(false);
      expect(money(quote.cgstAmount)).toBe(900);
      expect(money(quote.sgstAmount)).toBe(900);
      expect(money(quote.igstAmount)).toBe(0);
      // The stored place of supply is the CODE, whichever form it arrived in.
      expect(quote.placeOfSupply).toBe("29");
    });

    it("a buyer state stored as a NAME in a different state is still INTER-state", async () => {
      const { deal } = await seedDeal("Maharashtra");
      const quote = await caller.deals.quotes.create({
        dealId: deal.id,
        items: [{ description: "Out of state", quantity: 1, unitPrice: "10000", total: "10000", gstRate: 18 }],
        discountPct: "0",
      });
      expect(quote.isInterstate).toBe(true);
      expect(money(quote.igstAmount)).toBe(1800);
      expect(quote.placeOfSupply).toBe("27");
    });
  });

  // ── per-line discount survives the round trip ─────────────────────────────
  it("stores the per-line discount and folds it into the line total", async () => {
    // The quote detail view has a "Discount %" column that could only ever render
    // 0, because `serializeQuote` hardcoded it. It reads the stored value now.
    const { deal } = await seedDeal("29");
    const quote = await caller.deals.quotes.create({
      dealId: deal.id,
      // 2 × 10000 less 10% = 18000.
      items: [{ description: "Discounted", quantity: 2, unitPrice: "10000", total: "18000", gstRate: 18, discountPct: 10 }],
      discountPct: "0",
    });
    expect(money(quote.subtotal)).toBe(18000);
    expect(quote.lineItems[0]!.discount).toBe(10);
    expect(money(quote.taxTotal)).toBe(3240); // 18000 @ 18%
  });
});
