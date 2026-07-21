/**
 * G8 — External daily-attendance ingest endpoint (end-to-end).
 *
 * Proves the biometric/HRMS feed path:
 *   - a raw feed keyed by human employeeCode resolves to the UUID and upserts,
 *   - unknown/foreign codes are skipped and reported (never mis-attributed),
 *   - re-sending the same batch is idempotent (upsert, no duplicate rows),
 *   - a later feed corrects an earlier day (last state wins),
 *   - ingested `absent` days flow into payroll LOP and reduce gross.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, testDb, cleanupOrg } from "./helpers";
import { hrRouter } from "../routers/hr";
import { computeAttendanceLopForPeriod } from "../lib/india/attendance-lop";
import {
  employees,
  salaryStructures,
  attendanceRecords,
  eq,
  and,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

const YEAR = 2026;
const MONTH = 5; // May 2026

describe("G8: attendance ingest endpoint (end-to-end)", () => {
  let caller: any;
  let orgId: string;
  let empId: string;
  let empCode: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = hrRouter.createCaller(createMockContext(seeded.adminId, orgId));

    const [s] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: "Std",
        ctcAnnual: "780000",
        basicPercent: "40",
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();

    empCode = `EMP-${nanoid(4)}`;
    const [e] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId: seeded.adminId,
        employeeId: empCode,
        salaryStructureId: s!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Maharashtra",
      })
      .returning();
    empId = e!.id;
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  async function attendance() {
    return testDb()
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.orgId, orgId), eq(attendanceRecords.employeeId, empId)));
  }

  it("resolves employeeCode → UUID and upserts derived rows", async () => {
    const res = await caller.attendance.ingest({
      records: [
        {
          employeeCode: empCode,
          date: new Date(YEAR, MONTH - 1, 4),
          checkIn: new Date(YEAR, MONTH - 1, 4, 9, 30, 0),
          checkOut: new Date(YEAR, MONTH - 1, 4, 19, 30, 0),
          shiftStart: new Date(YEAR, MONTH - 1, 4, 9, 0, 0),
        },
      ],
    });
    expect(res.ingested).toBe(1);
    expect(res.skipped).toEqual([]);

    const rows = await attendance();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("late");
    expect(rows[0]!.hoursWorked).toBe("10.00");
    expect(rows[0]!.lateMinutes).toBe(30);
    expect(rows[0]!.overtimeMinutes).toBe(120);
  });

  it("skips unknown/foreign employee codes and reports them", async () => {
    const res = await caller.attendance.ingest({
      records: [
        { employeeCode: empCode, date: new Date(YEAR, MONTH - 1, 6), status: "present" },
        { employeeCode: "EMP-NOPE", date: new Date(YEAR, MONTH - 1, 6), status: "present" },
      ],
    });
    expect(res.ingested).toBe(1);
    expect(res.skipped).toEqual(["EMP-NOPE"]);

    const rows = await attendance();
    expect(rows).toHaveLength(1);
  });

  it("is idempotent: re-sending the same batch does not duplicate rows", async () => {
    const batch = {
      records: [
        { employeeCode: empCode, date: new Date(YEAR, MONTH - 1, 7), status: "present" as const },
      ],
    };
    await caller.attendance.ingest(batch);
    await caller.attendance.ingest(batch);

    const rows = await attendance();
    expect(rows).toHaveLength(1);
  });

  it("a later feed corrects an earlier day (last state wins)", async () => {
    const day = new Date(YEAR, MONTH - 1, 8);
    await caller.attendance.ingest({
      records: [{ employeeCode: empCode, date: day, status: "absent" }],
    });
    await caller.attendance.ingest({
      records: [{ employeeCode: empCode, date: day, status: "present" }],
    });

    const rows = await attendance();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("present");
  });

  it("ingested absent days flow into payroll LOP", async () => {
    await caller.attendance.ingest({
      records: [
        { employeeCode: empCode, date: new Date(YEAR, MONTH - 1, 2), status: "absent" },
        { employeeCode: empCode, date: new Date(YEAR, MONTH - 1, 3), status: "absent" },
        { employeeCode: empCode, date: new Date(YEAR, MONTH - 1, 4), status: "half_day" },
      ],
    });

    const lopMap = await computeAttendanceLopForPeriod(testDb(), orgId, MONTH, YEAR);
    const lop = lopMap.get(empId)!;
    expect(lop.lopDays).toBe(2.5); // 1 + 1 + 0.5
  });
});
