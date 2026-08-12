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
});
