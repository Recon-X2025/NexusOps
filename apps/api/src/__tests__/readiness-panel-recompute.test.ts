/**
 * READINESS-PANEL recompute (C1).
 * ─────────────────────────────────────────────────────────────────────────────
 * The run's readiness "Errors" are stored on the run at payslip generation. The org-level
 * "no ESI establishment number" error goes STALE once the number is later set in Organisation
 * Settings → Statutory Identity (a different code path that never touches the run). runs.get
 * now re-derives that one org condition live and drops the resolved error, while KEEPING
 * employee-level errors (e.g. a missing ESI IP number) that are still true. Not "clear the panel".
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { payrollRuns, organizations, eq } from "@coheronconnect/db";

const ORG_MSG =
  "Employee is an ESI member this period, but the ORGANISATION has no ESI establishment number — " +
  "a mandatory payslip field would print blank. Set it in Organisation Settings → Statutory Identity (org-level fix).";
const EMP_MSG =
  "Employee is an ESI member this period, but has no ESI IP number on their record — a mandatory payslip " +
  "field would print blank. Set the employee's ESI IP number (employee-record fix).";

describe("READINESS-PANEL recompute", () => {
  let orgId: string;
  let caller: ReturnType<typeof payrollRouter.createCaller>;
  let runId: string;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    const { userId: adminId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" });
    caller = payrollRouter.createCaller(makeContext(adminId, orgId));
    await testDb().update(organizations).set({ esiEstablishmentNumber: null }).where(eq(organizations.id, orgId));
    const [run] = await testDb()
      .insert(payrollRuns)
      .values({
        orgId,
        month: 4,
        year: 2026,
        runNumber: 1,
        status: "draft",
        workflowMetadata: { errors: [{ employeeId: "e1", message: ORG_MSG }, { employeeId: "e1", message: EMP_MSG }], approvals: [] },
      } as never)
      .returning();
    runId = run!.id;
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  const messages = async () => {
    const run = await caller.runs.get({ id: runId });
    return (run.errors as Array<{ message: string }>).map((e) => e.message);
  };

  it("shows both errors while the org ESI establishment number is unset", async () => {
    const msgs = await messages();
    expect(msgs.some((m) => /ORGANISATION has no ESI establishment/i.test(m))).toBe(true);
    expect(msgs.some((m) => /no ESI IP number/i.test(m))).toBe(true);
  });

  it("clears the stale org error once the ESI number is set, and keeps the still-true employee error", async () => {
    await testDb().update(organizations).set({ esiEstablishmentNumber: "12000123450000999" }).where(eq(organizations.id, orgId));
    const msgs = await messages();
    expect(msgs.some((m) => /ORGANISATION has no ESI establishment/i.test(m))).toBe(false); // stale → cleared
    expect(msgs.some((m) => /no ESI IP number/i.test(m))).toBe(true); // still true → kept
  });
});
