/**
 * G8 — Shift resolution + punch derivation (pure unit).
 *
 * Locks the deterministic contract the self-service punch path relies on:
 *   - effective-shift precedence: assigned → org default → built-in,
 *   - late/half-day/present classification against a shift,
 *   - lateMinutes / overtimeMinutes / hoursWorked math, all clamped ≥ 0.
 * No DB — this is the money-math the e2e tests assume is correct.
 */
import { describe, it, expect } from "vitest";
import {
  resolveShift,
  derivePunch,
  localMinuteOfDay,
  BUILTIN_SHIFT,
  type ShiftDefinition,
} from "../lib/india/shift-schedule";

const NINE_TO_FIVE: ShiftDefinition = {
  startMinutes: 9 * 60,
  durationMinutes: 8 * 60,
  graceMinutes: 10,
};

/** Build a local Date at h:m today (derivePunch reads wall-clock minute). */
function at(h: number, m: number): Date {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

describe("resolveShift precedence", () => {
  const assigned: ShiftDefinition = { startMinutes: 600, durationMinutes: 480, graceMinutes: 5 };
  const orgDefault: ShiftDefinition = { startMinutes: 480, durationMinutes: 540, graceMinutes: 15 };

  it("prefers the assigned shift over everything", () => {
    expect(resolveShift(assigned, orgDefault)).toBe(assigned);
  });

  it("falls back to the org default when unassigned", () => {
    expect(resolveShift(null, orgDefault)).toBe(orgDefault);
    expect(resolveShift(undefined, orgDefault)).toBe(orgDefault);
  });

  it("falls back to the built-in baseline when neither exists", () => {
    expect(resolveShift(null, null)).toBe(BUILTIN_SHIFT);
    expect(resolveShift(undefined, undefined)).toBe(BUILTIN_SHIFT);
  });
});

describe("localMinuteOfDay", () => {
  it("reduces a timestamp to its wall-clock minute", () => {
    expect(localMinuteOfDay(at(9, 0))).toBe(540);
    expect(localMinuteOfDay(at(0, 0))).toBe(0);
    expect(localMinuteOfDay(at(23, 59))).toBe(1439);
  });
});

describe("derivePunch — open punch (checkIn only)", () => {
  it("on-time check-in is present with zero late", () => {
    const p = derivePunch(at(9, 0), null, NINE_TO_FIVE);
    expect(p.status).toBe("present");
    expect(p.lateMinutes).toBe(0);
    expect(p.hoursWorked).toBe("0.00");
  });

  it("within grace is still present but counts late minutes", () => {
    const p = derivePunch(at(9, 8), null, NINE_TO_FIVE); // 8 < grace 10
    expect(p.status).toBe("present");
    expect(p.lateMinutes).toBe(8);
  });

  it("past grace flips to late", () => {
    const p = derivePunch(at(9, 30), null, NINE_TO_FIVE); // 30 > grace 10
    expect(p.status).toBe("late");
    expect(p.lateMinutes).toBe(30);
  });

  it("early check-in never fabricates negative late", () => {
    const p = derivePunch(at(8, 30), null, NINE_TO_FIVE);
    expect(p.lateMinutes).toBe(0);
    expect(p.status).toBe("present");
  });
});

describe("derivePunch — closed punch (checkIn + checkOut)", () => {
  it("full day, on time → present with hours + no overtime", () => {
    const p = derivePunch(at(9, 0), at(17, 0), NINE_TO_FIVE);
    expect(p.status).toBe("present");
    expect(p.hoursWorked).toBe("8.00");
    expect(p.overtimeMinutes).toBe(0);
  });

  it("full day but late check-in → late", () => {
    const p = derivePunch(at(9, 30), at(17, 30), NINE_TO_FIVE);
    expect(p.status).toBe("late");
    expect(p.lateMinutes).toBe(30);
  });

  it("worked under half the shift → half_day (overrides lateness)", () => {
    const p = derivePunch(at(9, 30), at(12, 0), NINE_TO_FIVE); // 2.5h < 4h
    expect(p.status).toBe("half_day");
    expect(p.hoursWorked).toBe("2.50");
  });

  it("beyond the shift span accrues overtime", () => {
    const p = derivePunch(at(9, 0), at(19, 0), NINE_TO_FIVE); // 10h, 2h OT
    expect(p.status).toBe("present");
    expect(p.overtimeMinutes).toBe(120);
    expect(p.hoursWorked).toBe("10.00");
  });

  it("checkout before checkin never fabricates negative hours", () => {
    const p = derivePunch(at(17, 0), at(9, 0), NINE_TO_FIVE);
    expect(Number(p.hoursWorked)).toBe(0);
    expect(p.overtimeMinutes).toBe(0);
  });
});

describe("derivePunch — no checkIn", () => {
  it("is absent", () => {
    const p = derivePunch(null, null, NINE_TO_FIVE);
    expect(p.status).toBe("absent");
    expect(p.hoursWorked).toBe("0.00");
  });
});
