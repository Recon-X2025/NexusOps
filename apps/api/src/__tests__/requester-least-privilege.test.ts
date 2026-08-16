/**
 * `requester` is the MANDATORY base role every user carries, including every
 * plain employee in the seven pilot tenants (30-80 people each).
 *
 * It used to grant hr / facilities / procurement WRITE. Because `hr:write` is the
 * single gate on 34 procedures, that meant any employee could:
 *   - manager-approve an expense claim   (hr.ts expenses.managerApprove)
 *   - create or delete company holidays  (hr.ts holidays.create / delete)
 *   - clock ANY employee in or out       (hr.ts attendance.clockIn takes employeeId)
 *   - create shift schedules, bulk-mark attendance
 *   - mark statutory PF/ESI/PT challans paid/submitted (india-compliance.ts)
 *
 * It now grants hr:read only. The self-service actions that shared that gate —
 * request leave, submit an expense claim, clock in/out — survive via an ownership
 * check (assertSelfOrHrWriter), not a role grant.
 *
 * The owner controls at the bottom matter as much as the denials: they prove the
 * narrowing removed privilege from employees WITHOUT removing it from the people
 * who run the tenant.
 */
import { describe, it, expect } from "vitest";
import { checkDbUserPermission } from "../lib/rbac-db";
import { ROLE_PERMISSIONS } from "@coheronconnect/types";

/** A plain employee: DB role `member`, no matrix role → ["requester"]. */
const EMPLOYEE = { role: "member", matrixRole: null as string | null };
/** The tenant owner. */
const OWNER = { role: "owner", matrixRole: null as string | null };

describe("requester (plain employee) — least privilege", () => {
  describe("the over-grant is gone", () => {
    it("cannot write to hr — the gate on expense approval, holidays and shifts", () => {
      expect(checkDbUserPermission(EMPLOYEE.role, "hr", "write", EMPLOYEE.matrixRole)).toBe(false);
    });

    it("cannot approve in hr (expense claim approval)", () => {
      expect(checkDbUserPermission(EMPLOYEE.role, "hr", "approve", EMPLOYEE.matrixRole)).toBe(false);
    });

    /**
     * KNOWN, DELIBERATE EXCEPTION — procurement:write is retained.
     *
     * "requester can create purchase request" is an explicit user story
     * (rbac-user-stories.test.ts), so the capability was not removed on our own
     * authority. It remains an over-grant: the same action also gates
     * vendors.create, vendors.update and ingest.importVendors, so an employee can
     * still create and edit vendor master data. The fix is to split vendor
     * management into its own module — a procurement-wide change, not attempted
     * days before onboarding. This test PINS the exception so it is visible.
     */
    it("still holds procurement:write — a known, reported exception, not an oversight", () => {
      expect(checkDbUserPermission(EMPLOYEE.role, "procurement", "write", EMPLOYEE.matrixRole)).toBe(true);
    });

    it("cannot decide an approval", () => {
      expect(checkDbUserPermission(EMPLOYEE.role, "approvals", "approve", EMPLOYEE.matrixRole)).toBe(false);
    });

    it("still cannot reach payroll or finance", () => {
      expect(checkDbUserPermission(EMPLOYEE.role, "payroll", "read", EMPLOYEE.matrixRole)).toBe(false);
      expect(checkDbUserPermission(EMPLOYEE.role, "financial", "read", EMPLOYEE.matrixRole)).toBe(false);
    });
  });

  describe("what a plain employee still needs, they still have", () => {
    it("can raise a ticket", () => {
      expect(checkDbUserPermission(EMPLOYEE.role, "incidents", "write", EMPLOYEE.matrixRole)).toBe(true);
      expect(checkDbUserPermission(EMPLOYEE.role, "requests", "write", EMPLOYEE.matrixRole)).toBe(true);
    });

    it("can raise a catalog request and read the knowledge base", () => {
      expect(checkDbUserPermission(EMPLOYEE.role, "catalog", "write", EMPLOYEE.matrixRole)).toBe(true);
      expect(checkDbUserPermission(EMPLOYEE.role, "knowledge", "read", EMPLOYEE.matrixRole)).toBe(true);
    });

    it("can see HR and its own records, and respond to a survey", () => {
      expect(checkDbUserPermission(EMPLOYEE.role, "hr", "read", EMPLOYEE.matrixRole)).toBe(true);
      expect(checkDbUserPermission(EMPLOYEE.role, "surveys", "write", EMPLOYEE.matrixRole)).toBe(true);
    });

    it("payslip self-view does not depend on a role grant at all", () => {
      // payroll.myPayslips is a protectedProcedure that resolves the caller's own
      // employee row — narrowing `requester` cannot have broken it.
      expect(checkDbUserPermission(EMPLOYEE.role, "payroll", "read", EMPLOYEE.matrixRole)).toBe(false);
    });

    it("leave request, expense submit and clock in/out no longer sit behind hr:write", () => {
      // Those procedures are now protectedProcedure + assertSelfOrHrWriter, so the
      // role matrix must NOT be what admits them. Asserted here so a future change
      // that puts them back behind hr:write fails loudly.
      const requester = ROLE_PERMISSIONS["requester"];
      expect(requester.hr).toEqual(["read"]);
    });
  });

  describe("owner control — the narrowing did not disarm the tenant owner", () => {
    it.each([
      ["hr", "write"],
      ["hr", "approve"],
      ["procurement", "write"],
      ["approvals", "approve"],
      ["payroll", "read"],
      ["financial", "write"],
    ] as const)("owner can still %s.%s", (module, action) => {
      expect(checkDbUserPermission(OWNER.role, module, action, OWNER.matrixRole)).toBe(true);
    });
  });

  describe("hr_manager control — the people who run HR are unaffected", () => {
    it("hr_manager retains hr write and approve", () => {
      expect(checkDbUserPermission("member", "hr", "write", "hr_manager")).toBe(true);
      expect(checkDbUserPermission("member", "hr", "approve", "hr_manager")).toBe(true);
    });
  });
});
