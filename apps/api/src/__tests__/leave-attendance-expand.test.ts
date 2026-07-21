/**
 * G8 — pure unit tests for the leave→attendance expansion (no DB).
 */
import { describe, it, expect } from "vitest";
import {
  attendanceStatusForLeave,
  expandLeaveToAttendance,
} from "../lib/india/leave-attendance";

describe("G8: attendanceStatusForLeave", () => {
  it("maps unpaid → absent (LOP)", () => {
    expect(attendanceStatusForLeave("unpaid")).toBe("absent");
  });

  it("maps every other type → on_leave (paid)", () => {
    for (const t of ["primary", "annual", "vacation", "sick", "parental", "bereavement", "other"] as const) {
      expect(attendanceStatusForLeave(t)).toBe("on_leave");
    }
  });
});

describe("G8: expandLeaveToAttendance", () => {
  it("emits one row per inclusive calendar day", () => {
    const rows = expandLeaveToAttendance(
      "emp-1",
      "annual",
      new Date(2026, 4, 10),
      new Date(2026, 4, 12),
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.date.getDate())).toEqual([10, 11, 12]);
    expect(rows.every((r) => r.status === "on_leave")).toBe(true);
    expect(rows.every((r) => r.employeeId === "emp-1")).toBe(true);
  });

  it("normalises to date-only (midnight)", () => {
    const rows = expandLeaveToAttendance(
      "emp-1",
      "unpaid",
      new Date(2026, 4, 10, 14, 30, 0),
      new Date(2026, 4, 10, 9, 0, 0),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date.getHours()).toBe(0);
    expect(rows[0]!.date.getMinutes()).toBe(0);
    expect(rows[0]!.status).toBe("absent");
  });

  it("handles a single-day leave", () => {
    const d = new Date(2026, 4, 15);
    const rows = expandLeaveToAttendance("emp-1", "sick", d, d);
    expect(rows).toHaveLength(1);
  });

  it("returns [] for an inverted range", () => {
    const rows = expandLeaveToAttendance(
      "emp-1",
      "annual",
      new Date(2026, 4, 12),
      new Date(2026, 4, 10),
    );
    expect(rows).toEqual([]);
  });

  it("spans a month boundary correctly", () => {
    const rows = expandLeaveToAttendance(
      "emp-1",
      "annual",
      new Date(2026, 4, 30),
      new Date(2026, 5, 2),
    );
    // May 30, May 31, Jun 1, Jun 2
    expect(rows).toHaveLength(4);
    expect(rows[0]!.date.getDate()).toBe(30);
    expect(rows[3]!.date.getMonth()).toBe(5);
    expect(rows[3]!.date.getDate()).toBe(2);
  });
});
