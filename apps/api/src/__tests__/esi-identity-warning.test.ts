/**
 * C6 — ESI member missing a mandatory identity number → run warning.
 * ─────────────────────────────────────────────────────────────────────────────
 * The ESI establishment number (org) and ESI IP number (employee) are settable but not
 * required at intake — not every org is ESI-registered. So an org that IS registered, or an
 * employee the engine has made an ESI member, can reach a payroll run with a blank number that
 * would print on a statutory payslip. Following the F-PT-NIL / PT-period-cause pattern, the run
 * flags it per ESI-member employee, naming WHOSE number is missing (org-level vs employee-level,
 * because the fix differs). A NON-member with no IP number is correct and must NOT be flagged.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computePayrollRunTotals } from "../services/payroll-run-aggregates";
import { seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { employees, salaryStructures, organizations, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const YEAR = 2026;
const MONTH = 4; // April — an ESI contribution-period boundary; membership assessed from gross.

// gross ≈ ctc / 12. 240000 → ₹20,000/mo ≤ ₹21,000 ⇒ ESI member. 780000 → ₹65,000 ⇒ non-member.
const ESI_MEMBER_CTC = "240000";
const NON_MEMBER_CTC = "780000";

const ORG_RE = /organisation has no ESI establishment number/i;
const EMP_RE = /no ESI IP number on their record/i;

describe("ESI member missing an identity number is flagged on the run", () => {
  let orgId: string;

  async function setOrgEsi(value: string | null) {
    await testDb().update(organizations).set({ esiEstablishmentNumber: value }).where(eq(organizations.id, orgId));
  }

  async function seedEmp(opts: { ctc: string; esiIpNumber: string | null }): Promise<string> {
    const { userId } = await seedUser(orgId, { email: `esi-${nanoid(6)}@qa.coheronconnect.io` });
    const [struct] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: "Std", ctcAnnual: opts.ctc, basicPercent: "40", effectiveFrom: new Date("2015-01-01") })
      .returning();
    const [emp] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: struct!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Karnataka", // monthly PT — keeps ESI the only variable
        esiIpNumber: opts.esiIpNumber,
      })
      .returning();
    return emp!.id;
  }

  const esiWarnings = (errs: Array<{ employeeId: string; message: string }>) =>
    errs.filter((e) => ORG_RE.test(e.message) || EMP_RE.test(e.message));

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  it("ESI member + org missing the establishment number → org-level warning", async () => {
    await setOrgEsi(null); // org not set
    const empId = await seedEmp({ ctc: ESI_MEMBER_CTC, esiIpNumber: "3100123456" }); // IP present

    const totals = await computePayrollRunTotals(testDb(), orgId, MONTH, YEAR);
    const orgWarn = totals.errors.find((e) => ORG_RE.test(e.message));
    expect(orgWarn).toBeTruthy();
    expect(orgWarn!.employeeId).toBe(empId);
    // Only the org-level cause — the employee's IP is present.
    expect(totals.errors.some((e) => EMP_RE.test(e.message))).toBe(false);
  });

  it("ESI member + employee missing the IP number → employee-level warning", async () => {
    await setOrgEsi("12000123450000999"); // org set
    const empId = await seedEmp({ ctc: ESI_MEMBER_CTC, esiIpNumber: null }); // IP absent

    const totals = await computePayrollRunTotals(testDb(), orgId, MONTH, YEAR);
    const empWarn = totals.errors.find((e) => EMP_RE.test(e.message));
    expect(empWarn).toBeTruthy();
    expect(empWarn!.employeeId).toBe(empId);
    // Only the employee-level cause — the org number is present.
    expect(totals.errors.some((e) => ORG_RE.test(e.message))).toBe(false);
  });

  it("ESI member + both present → no ESI warning", async () => {
    await setOrgEsi("12000123450000999");
    await seedEmp({ ctc: ESI_MEMBER_CTC, esiIpNumber: "3100123456" });

    const totals = await computePayrollRunTotals(testDb(), orgId, MONTH, YEAR);
    expect(esiWarnings(totals.errors)).toHaveLength(0);
  });

  it("NON-member with no IP number → no warning (proves the check is scoped to members)", async () => {
    await setOrgEsi(null); // even with nothing set...
    await seedEmp({ ctc: NON_MEMBER_CTC, esiIpNumber: null }); // gross ₹65,000 ⇒ not an ESI member

    const totals = await computePayrollRunTotals(testDb(), orgId, MONTH, YEAR);
    expect(esiWarnings(totals.errors)).toHaveLength(0);
  });
});
