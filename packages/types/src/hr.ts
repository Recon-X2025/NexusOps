import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────────────
export const EmploymentTypeEnum = z.enum(["full_time", "part_time", "contractor", "intern"]);
export const EmployeeStatusEnum = z.enum(["active", "on_leave", "offboarded"]);
export const HRCaseTypeEnum = z.enum([
  "onboarding",
  "offboarding",
  "leave",
  "policy",
  "benefits",
  "workplace",
  "equipment",
]);
// Single source of truth for the leave-type set — mirrors the db `leaveTypeEnum`
// (packages/db/src/schema/hr.ts) exactly, which is the enforced list. `@coheronconnect/validators`
// and the API's leave-accrual router re-export/import this rather than keeping their own copies.
// NOTE: display labels deliberately diverge from these stored values in the web UI (e.g. `vacation`
// renders as "Annual Leave", `sick` as "Sick / Casual Leave") — see the web leave-label map. Do not
// "correct" the labels back to the stored values; the taxonomy rename is the deferred LEAVE-ENUM-REBUILD.
export const LeaveTypeEnum = z.enum([
  "primary", "annual", "vacation", "sick", "parental", "bereavement", "unpaid", "other",
  // LEAVE-MODEL additions — must track leaveTypeEnum in packages/db (schema/hr.ts).
  "casual", "maternity", "paternity", "marriage", "compensatory_off",
]);
export const LeaveStatusEnum = z.enum(["pending", "approved", "rejected", "cancelled"]);

export type EmployeeStatus = z.infer<typeof EmployeeStatusEnum>;
export type HRCaseType = z.infer<typeof HRCaseTypeEnum>;
export type LeaveStatus = z.infer<typeof LeaveStatusEnum>;

// ── Employee ───────────────────────────────────────────────────────────────
export const EmployeeSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  employeeId: z.string(), // e.g. "EMP-0001"
  department: z.string().max(100).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  employmentType: EmploymentTypeEnum.default("full_time"),
  location: z.string().max(200).nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  status: EmployeeStatusEnum.default("active"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Employee = z.infer<typeof EmployeeSchema>;

// ── Leave Request ──────────────────────────────────────────────────────────
export const LeaveRequestSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  employeeId: z.string().uuid(),
  type: LeaveTypeEnum,
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  days: z.coerce.number().positive(),
  status: LeaveStatusEnum.default("pending"),
  reason: z.string().max(1000).optional(),
  approvedById: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type LeaveRequest = z.infer<typeof LeaveRequestSchema>;

export const CreateLeaveRequestSchema = z
  .object({
    type: LeaveTypeEnum,
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().max(1000).optional(),
  })
  // A reversed range makes `days` negative and moves the leave balance the wrong way
  // (pendingDays += negative) at create time, before any approval. Guard it here, on the
  // schema the live `leave.create` path actually imports (was only on an orphan copy).
  .refine((data) => data.endDate.getTime() >= data.startDate.getTime(), {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });
