/**
 * The supplier's GST state is DERIVED from its GSTIN, for every jurisdiction.
 *
 * `gstin_registry.stateCode` is the supplier side of every GST split:
 * `resolveOrgState` reads it and `computeGST` decides intra- vs inter-state from
 * it. It must be a 2-DIGIT GST code ("29"); `normaliseStateToCode` returns null
 * for anything else.
 *
 * What went wrong: the Setup Wizard asked for a "2-letter ISO 3166-2:IN code"
 * (placeholder "MH", default "KA") and wrote that value straight into this
 * column. `normaliseStateToCode("KA")` and `("MH")` both return **null**, so the
 * supplier had no state at all, `computeGST` compared "" against the buyer's
 * "29", and every sale was billed INTER-state IGST — the correct total with the
 * wrong split, on documents a customer claims input credit against.
 *
 * These tests pin the fix at COUNTRY level: the derivation is exercised across
 * every GST jurisdiction, not one convenient state.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { GSTIN_STATE_CODES, normaliseStateToCode } from "@coheronconnect/payroll-math";
import { gstinRegistry, eq } from "@coheronconnect/db";

/** A syntactically valid GSTIN in the given state. */
function gstinFor(stateCode: string, seq = "0001"): string {
  return `${stateCode}AABCC${seq}D1ZP`;
}

describe("GSTIN state derivation — every Indian jurisdiction", () => {
  let orgId: string;
  let adminId: string;
  let acc: ReturnType<typeof accountingRouter.createCaller>;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    acc = accountingRouter.createCaller(createMockContext(adminId, orgId));
  });

  /**
   * NO STATE LEFT OUT. All 39 GST jurisdictions — 01–24 and 26–38 (25 Daman &
   * Diu was merged into 26 in 2020), plus 97 Other Territory and 99 Centre
   * Jurisdiction. If a code is ever added or removed, this walks the real table
   * rather than a copy, so it cannot drift.
   */
  it("resolves a usable supplier state for all 39 GST jurisdictions", () => {
    const codes = Object.keys(GSTIN_STATE_CODES);
    expect(codes.length).toBe(39);
    for (const code of codes) {
      // Every code the product recognises must survive normalisation — this is
      // exactly what "KA" and "MH" failed to do.
      expect(normaliseStateToCode(code), `state code ${code} must normalise`).toBe(code);
      expect(GSTIN_STATE_CODES[code]).toBeTruthy();
    }
  });

  // All 39 registrations go in ONE org — a multi-state business legitimately
  // holds a GSTIN per state, which is what this registry is for. Seeding an org
  // per state instead took ~800ms each and blew the 30s timeout.
  it("derives the state code from the GSTIN when none is supplied, for every state", async () => {
    const codes = Object.keys(GSTIN_STATE_CODES);
    let seq = 1000;
    for (const code of codes) {
      const created = await acc.gstin.create({
        gstin: gstinFor(code, String(seq++)),
        legalName: `Branch in ${GSTIN_STATE_CODES[code]}`,
      });
      expect(created.stateCode, `GSTIN in ${code} must derive stateCode ${code}`).toBe(code);
      expect(created.stateName).toBe(GSTIN_STATE_CODES[code]);
      // And the stored value is one the GST engine can actually use.
      expect(normaliseStateToCode(created.stateCode)).toBe(code);
    }
  });

  it("rejects a state code that contradicts the GSTIN, naming both", async () => {
    await expect(
      acc.gstin.create({
        gstin: gstinFor("29"), // Karnataka
        legalName: "Contradiction Ltd",
        stateCode: "27", // Maharashtra
      }),
    ).rejects.toThrow(/contradicts GSTIN|Karnataka/i);
  });

  it("accepts a state code that agrees with the GSTIN", async () => {
    const created = await acc.gstin.create({
      gstin: gstinFor("27"),
      legalName: "Agreeing Ltd",
      stateCode: "27",
    });
    expect(created.stateCode).toBe("27");
    expect(created.stateName).toBe("Maharashtra");
  });

  /**
   * The regression proper: the exact value the wizard used to write. It must no
   * longer be storable, because it resolves to null and silently turns every
   * intra-state sale into IGST.
   */
  it("refuses the ISO code the Setup Wizard used to send", async () => {
    expect(normaliseStateToCode("KA")).toBeNull();
    await expect(
      acc.gstin.create({
        gstin: gstinFor("29"),
        legalName: "Wizard Ltd",
        stateCode: "KA",
      }),
    ).rejects.toThrow(/contradicts GSTIN/i);
  });

  it("stores a state the GST engine can resolve, so a local sale is not IGST", async () => {
    const created = await acc.gstin.create({
      gstin: gstinFor("29"),
      legalName: "Karnataka Supplier Ltd",
      isPrimary: true,
    });
    const [row] = await testDb()
      .select()
      .from(gstinRegistry)
      .where(eq(gstinRegistry.id, created.id));
    // Supplier "29" vs a Karnataka buyer "29" → same state → CGST + SGST.
    expect(normaliseStateToCode(row!.stateCode)).toBe("29");
    expect(normaliseStateToCode(row!.stateCode)).toBe(normaliseStateToCode("Karnataka"));
  });
});
