/**
 * Central leave-type display labels.
 *
 * ⚠️ Display labels DELIBERATELY DIVERGE from the stored enum values. The database `leave_type`
 * enum still stores `vacation`, `sick`, `other`, etc. (see packages/db/src/schema/hr.ts); the
 * destructive rename to `annual` / `sick_casual` is the deferred LEAVE-ENUM-REBUILD, blocked on
 * prod row counts. Until then the UI shows business-correct labels over the old stored values:
 *   - `vacation`  → "Annual Leave"
 *   - `sick`      → "Sick / Casual Leave"
 *   - `other`     → hidden from pickers, but still rendered honestly where it already exists.
 *
 * DO NOT "fix" these labels back to match the stored values — the divergence is intentional.
 */

// Every stored value maps to an honest label so existing rows (incl. `other`, `primary`, `annual`)
// always render — hiding a value from the picker is not the same as removing it from the renderer.
export const LEAVE_TYPE_LABELS: Record<string, string> = {
  primary: "Primary Leave",
  annual: "Annual Leave",
  vacation: "Annual Leave", // stored value diverges from label (see header)
  sick: "Sick / Casual Leave",
  parental: "Parental Leave",
  bereavement: "Bereavement Leave",
  unpaid: "Unpaid Leave",
  other: "Other",
};

/** Human label for a stored leave-type value; falls back to a humanized form for anything unmapped. */
export function leaveTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return LEAVE_TYPE_LABELS[value] ?? value.replace(/_/g, " ");
}

// The options a picker offers for a NEW/edited request. `other` is hidden (kept only for legacy
// rows); the offered stored values are unchanged — only their labels are business-correct.
export const LEAVE_TYPE_PICKER_OPTIONS: { value: string; label: string }[] = [
  { value: "vacation", label: "Annual Leave" },
  { value: "sick", label: "Sick / Casual Leave" },
  { value: "parental", label: "Parental Leave" },
  { value: "bereavement", label: "Bereavement Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
];
