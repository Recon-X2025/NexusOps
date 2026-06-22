/**
 * @coheronconnect/validators — HR Zod Schemas
 *
 * Single source of truth for Human Resources validation.
 */
import { z } from "zod";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const EmploymentTypeEnum = z.enum(["full_time", "part_time", "contract", "intern"]);
export type EmploymentType = z.infer<typeof EmploymentTypeEnum>;

export const PayFrequencyEnum = z.enum(["monthly", "bi_weekly", "weekly", "daily"]);
export type PayFrequency = z.infer<typeof PayFrequencyEnum>;

export const LeaveTypeEnum = z.enum([
  "annual", "sick", "casual", "maternity", "paternity",
  "bereavement", "compensatory", "unpaid",
]);
export type LeaveType = z.infer<typeof LeaveTypeEnum>;

export const LeaveStatusEnum = z.enum(["pending", "approved", "rejected", "cancelled"]);
export type LeaveStatus = z.infer<typeof LeaveStatusEnum>;

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

export const CreateLeaveRequestSchema = z.object({
  employeeId: z.string().uuid(),
  leaveType: LeaveTypeEnum,
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  reason: z.string().min(10, "Please provide a reason (min 10 characters)").max(500),
}).refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  { message: "End date must be on or after start date", path: ["endDate"] },
);
export type CreateLeaveRequestInput = z.infer<typeof CreateLeaveRequestSchema>;
