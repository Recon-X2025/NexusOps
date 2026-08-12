/**
 * @coheronconnect/validators — HR Zod Schemas
 *
 * Single source of truth for Human Resources validation.
 */
import { z } from "zod";
// Single source of truth: the HR enums live in `@coheronconnect/types` (which mirrors the db enums).
// These used to be hand-maintained duplicates here and had drifted (EmploymentType "contract" vs the
// db's "contractor"; a LeaveType set with casual/maternity/… the db rejects). Re-exported now so there
// is exactly one definition. PayFrequencyEnum stays local — it has no `types`/db counterpart.
import { EmploymentTypeEnum, LeaveTypeEnum, LeaveStatusEnum } from "@coheronconnect/types";

// ── Enums ─────────────────────────────────────────────────────────────────────

export { EmploymentTypeEnum, LeaveTypeEnum, LeaveStatusEnum };
export type EmploymentType = z.infer<typeof EmploymentTypeEnum>;
export type LeaveType = z.infer<typeof LeaveTypeEnum>;
export type LeaveStatus = z.infer<typeof LeaveStatusEnum>;

export const PayFrequencyEnum = z.enum(["monthly", "bi_weekly", "weekly", "daily"]);
export type PayFrequency = z.infer<typeof PayFrequencyEnum>;

// ── Employee Schemas ──────────────────────────────────────────────────────────

export const CreateEmployeeSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Must be a valid work email"),
  phone: z.string().optional(),
  designation: z.string().min(1, "Designation is required").max(200),
  department: z.string().optional(),
  employmentType: EmploymentTypeEnum.default("full_time"),
  startDate: z.string().min(1, "Start date is required"),
  salary: z.string().optional(),
  currency: z.string().length(3).default("INR"),
  managerId: z.string().uuid().optional(),
});
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;

// ── Leave Request Schemas ─────────────────────────────────────────────────────
// CreateLeaveRequestSchema is canonical in `@coheronconnect/types` (packages/types/src/hr.ts),
// which is the copy `leave.create` actually imports. A duplicate lived here with a date-order
// refine the live path never applied — removed to end the drift. Do NOT re-add a second copy;
// extend the types one. (Note: `LeaveTypeEnum` still diverges across validators/types/db — a
// separate consolidation, out of this change's scope.)
