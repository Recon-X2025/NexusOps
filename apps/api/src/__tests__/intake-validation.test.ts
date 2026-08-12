/**
 * Intake validation (the "small batch", 2a) — server-side guards on the employee/leave
 * boundary, tested at the PROCEDURE / schema, not the form (a form-only rule is bypassable
 * by any tRPC caller — this repo has RBAC-MAP-DRIFT on record as exactly that failure).
 *
 * Covers: A1 leave end-before-start (consolidated schema), ADD-EMP-STRUCT (structure required),
 * TAX-REGIME-DEFAULT (regime required, no silent default), future/under-18 DOB, STATE-UNKNOWN,
 * IDENTITY-UNIQUE (duplicate PAN).
 */
// Local KMS derives its KEK from APP_SECRET; PAN encryption needs it (mirrors the pan tests).
process.env["APP_SECRET"] = process.env["APP_SECRET"] ?? "test-app-secret-for-pan-do-not-use-in-prod";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { hrRouter } from "../routers/hr";
import { CreateLeaveRequestSchema } from "@coheronconnect/types";
import { salaryStructures } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("Intake validation (2a) — server-side guards", () => {
  let orgId: string;
  let caller: ReturnType<typeof hrRouter.createCaller>;
  let structId: string;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    const { userId: adminId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" });
    caller = hrRouter.createCaller(makeContext(adminId, orgId));
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `S-${nanoid(4)}`, ctcAnnual: "600000", basicPercent: "50", daPercent: "0", effectiveFrom: new Date("2020-01-01") })
      .returning();
    structId = st!.id;
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  // A valid employee payload with all the now-required fields present.
  const validEmp = (over: Record<string, unknown> = {}) => ({
    userName: `E ${nanoid(4)}`,
    userEmail: `e-${nanoid(6)}@qa.coheronconnect.io`,
    salaryStructureId: structId,
    state: "Karnataka",
    taxRegime: "new" as const,
    ...over,
  });

  // ── A1: leave end-before-start (the consolidated types schema is the live guard) ──────────
  it("leave schema rejects a reversed range and accepts a valid one", () => {
    // "sick" is a member of the types LeaveTypeEnum (which the live leave.create path imports).
    expect(CreateLeaveRequestSchema.safeParse({ type: "sick", startDate: "2026-03-10", endDate: "2026-03-05" }).success).toBe(false);
    expect(CreateLeaveRequestSchema.safeParse({ type: "sick", startDate: "2026-03-05", endDate: "2026-03-10" }).success).toBe(true);
  });

  // ── ADD-EMP-STRUCT ───────────────────────────────────────────────────────────────────────
  it("rejects a structure-less employee at create", async () => {
    const { salaryStructureId: _drop, ...noStruct } = validEmp();
    await expect(caller.employees.create(noStruct as never)).rejects.toThrow();
  });

  // ── TAX-REGIME-DEFAULT ───────────────────────────────────────────────────────────────────
  it("rejects create with no tax regime (no silent default)", async () => {
    const { taxRegime: _drop, ...noRegime } = validEmp();
    await expect(caller.employees.create(noRegime as never)).rejects.toThrow();
  });

  // ── Future / under-age DOB ───────────────────────────────────────────────────────────────
  it("rejects a future date of birth", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
    await expect(caller.employees.create(validEmp({ dateOfBirth: future }))).rejects.toThrow(/future/i);
  });
  it("rejects a DOB under the policy minimum age", async () => {
    const tenYearsOld = new Date();
    tenYearsOld.setFullYear(tenYearsOld.getFullYear() - 10);
    await expect(caller.employees.create(validEmp({ dateOfBirth: tenYearsOld }))).rejects.toThrow(/at least 18/i);
  });

  // ── STATE-UNKNOWN ────────────────────────────────────────────────────────────────────────
  it("rejects a misspelled state and accepts a canonical one", async () => {
    await expect(caller.employees.create(validEmp({ state: "Karnatak" }))).rejects.toThrow();
    const ok = await caller.employees.create(validEmp({ state: "Karnataka" }));
    expect(ok.id).toBeTruthy();
  });

  // ── IDENTITY-UNIQUE ──────────────────────────────────────────────────────────────────────
  it("rejects a duplicate PAN within the org", async () => {
    await caller.employees.create(validEmp({ pan: "ABCDE1234F" }));
    await expect(caller.employees.create(validEmp({ pan: "ABCDE1234F" }))).rejects.toThrow(/PAN/i);
  });
});
