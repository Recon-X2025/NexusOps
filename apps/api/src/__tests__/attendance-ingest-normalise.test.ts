/**
 * G8 — pure unit tests for the external attendance-ingest normaliser (no DB).
 */
import { describe, it, expect } from "vitest";
import {
  deriveStatus,
  normaliseFeedRow,
  normaliseFeed,
  DEFAULT_SHIFT_MINUTES,
  type RawAttendanceFeedRow,
} from "../lib/india/attendance-ingest";

const DAY = new Date(2026, 4, 10);
const shiftStart = new Date(2026, 4, 10, 9, 0, 0); // 09:00

describe("G8: deriveStatus", () => {
  it("no check-in → absent", () => {
    expect(deriveStatus(null, null, shiftStart, DEFAULT_SHIFT_MINUTES)).toBe("absent");
  });

  it("check-in without check-out (on time) → present (open shift)", () => {
    const ci = new Date(2026, 4, 10, 9, 0, 0);
    expect(deriveStatus(ci, null, shiftStart, DEFAULT_SHIFT_MINUTES)).toBe("present");
  });

  it("late check-in beyond grace → late", () => {
    const ci = new Date(2026, 4, 10, 9, 30, 0); // 30m late > 10m grace
    const co = new Date(2026, 4, 10, 18, 0, 0);
    expect(deriveStatus(ci, co, shiftStart, DEFAULT_SHIFT_MINUTES)).toBe("late");
  });

  it("worked less than half the shift → half_day", () => {
    const ci = new Date(2026, 4, 10, 9, 0, 0);
    const co = new Date(2026, 4, 10, 12, 0, 0); // 3h < 4h (half of 8h)
    expect(deriveStatus(ci, co, shiftStart, DEFAULT_SHIFT_MINUTES)).toBe("half_day");
  });

  it("full on-time shift → present", () => {
    const ci = new Date(2026, 4, 10, 9, 5, 0); // within 10m grace
    const co = new Date(2026, 4, 10, 18, 0, 0);
    expect(deriveStatus(ci, co, shiftStart, DEFAULT_SHIFT_MINUTES)).toBe("present");
  });
});

describe("G8: normaliseFeedRow", () => {
  it("computes hoursWorked, lateMinutes, overtimeMinutes", () => {
    const raw: RawAttendanceFeedRow = {
      employeeCode: "EMP-0001",
      date: DAY,
      checkIn: new Date(2026, 4, 10, 9, 30, 0),
      checkOut: new Date(2026, 4, 10, 19, 30, 0), // 10h
      shiftStart,
      shiftMinutes: DEFAULT_SHIFT_MINUTES,
    };
    const n = normaliseFeedRow(raw);
    expect(n.hoursWorked).toBe("10.00");
    expect(n.lateMinutes).toBe(30);
    expect(n.overtimeMinutes).toBe(120); // 10h − 8h
    expect(n.status).toBe("late");
  });

  it("honours an explicit status verbatim (device-marked holiday)", () => {
    const n = normaliseFeedRow({ employeeCode: "EMP-0001", date: DAY, status: "holiday" });
    expect(n.status).toBe("holiday");
    expect(n.hoursWorked).toBe("0.00");
  });

  it("clamps negatives (clock-skewed device never fabricates negatives)", () => {
    const n = normaliseFeedRow({
      employeeCode: "EMP-0001",
      date: DAY,
      checkIn: new Date(2026, 4, 10, 8, 0, 0), // 1h before shiftStart
      checkOut: new Date(2026, 4, 10, 12, 0, 0), // 4h worked < 8h shift
      shiftStart,
    });
    expect(n.lateMinutes).toBe(0); // early, not late
    expect(n.overtimeMinutes).toBe(0); // under shift
  });

  it("normalises date to date-only (midnight)", () => {
    const n = normaliseFeedRow({
      employeeCode: "EMP-0001",
      date: new Date(2026, 4, 10, 14, 30, 0),
    });
    expect(n.date.getHours()).toBe(0);
    expect(n.date.getMinutes()).toBe(0);
  });
});

describe("G8: normaliseFeed (dedupe)", () => {
  it("de-duplicates same (employeeCode, date) with last-write-wins", () => {
    const rows = normaliseFeed([
      { employeeCode: "EMP-0001", date: DAY, status: "absent" },
      { employeeCode: "EMP-0001", date: DAY, status: "present" }, // wins
      { employeeCode: "EMP-0002", date: DAY, status: "present" },
    ]);
    expect(rows).toHaveLength(2);
    const emp1 = rows.find((r) => r.employeeCode === "EMP-0001")!;
    expect(emp1.status).toBe("present");
  });
});
