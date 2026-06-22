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
export const LeaveTypeEnum = z.enum(["vacation", "sick", "parental", "bereavement", "unpaid", "other"]);
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

export const CreateLeaveRequestSchema = z.object({
  type: LeaveTypeEnum,
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().max(1000).optional(),
});
