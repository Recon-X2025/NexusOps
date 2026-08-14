import { describe, it, expect } from "vitest";
import { leaveTypeLabel, LEAVE_TYPE_PICKER_OPTIONS, LEAVE_TYPE_LABELS } from "../leave-labels";

describe("leave-labels", () => {
  it("relabels vacation → Annual Leave and sick → Sick / Casual Leave (labels diverge from stored values)", () => {
    expect(leaveTypeLabel("vacation")).toBe("Annual Leave");
    expect(leaveTypeLabel("sick")).toBe("Sick / Casual Leave");
  });

  it("still renders a legacy `other` row honestly even though it is hidden from the picker", () => {
    // Hidden from the picker…
    expect(LEAVE_TYPE_PICKER_OPTIONS.some((o) => o.value === "other")).toBe(false);
    // …but the renderer maps it to an honest label (not blank, not a crash).
    expect(leaveTypeLabel("other")).toBe("Other");
  });

  it("renders every stored enum value (incl. primary/annual) with a label", () => {
    for (const v of ["primary", "annual", "vacation", "sick", "parental", "bereavement", "unpaid", "other"]) {
      expect(LEAVE_TYPE_LABELS[v]).toBeTruthy();
      expect(leaveTypeLabel(v)).not.toBe("—");
    }
  });

  it("falls back to a humanized form for an unknown value and — for empty/nullish", () => {
    expect(leaveTypeLabel("some_new_type")).toBe("some new type");
    expect(leaveTypeLabel("")).toBe("—");
    expect(leaveTypeLabel(null)).toBe("—");
  });

  // LEAVE-TYPES — the four new types the deployed dropdown was missing.
  it("offers Maternity, Paternity, Marriage and Compensatory Off in the picker", () => {
    const byValue = Object.fromEntries(LEAVE_TYPE_PICKER_OPTIONS.map((o) => [o.value, o.label]));
    expect(byValue.maternity).toBe("Maternity Leave"); // the success condition of this unit
    expect(byValue.paternity).toBe("Paternity Leave");
    expect(byValue.marriage).toBe("Marriage Leave");
    expect(byValue.compensatory_off).toBe("Compensatory Off");
  });

  it("keeps the original five options (parental retained, nothing removed)", () => {
    for (const v of ["vacation", "sick", "parental", "bereavement", "unpaid"]) {
      expect(LEAVE_TYPE_PICKER_OPTIONS.some((o) => o.value === v)).toBe(true);
    }
  });

  it("renders the new stored values with a direct label (no divergence)", () => {
    for (const v of ["maternity", "paternity", "marriage", "compensatory_off"]) {
      expect(leaveTypeLabel(v)).not.toBe("—");
      expect(leaveTypeLabel(v)).not.toBe(v.replace(/_/g, " ")); // has an explicit mapping, not the fallback
    }
  });
});
