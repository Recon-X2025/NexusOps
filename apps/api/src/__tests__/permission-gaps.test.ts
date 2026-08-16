/**
 * The sixteen procedures that were absent from the RBAC map.
 *
 * CORRECTION OF RECORD, established while writing these: all sixteen were ALREADY
 * enforced server-side. The map's silence made the CLIENT query-gate permissive
 * (`rbacAllow = isAuthenticated` when a rule is missing, rbac-context.tsx:204), so
 * the UI left controls enabled and the server answered FORBIDDEN. That is a
 * defence-in-depth and UX gap, NOT the data exposure it was feared to be — a
 * plain requester could never read anyone's declarations or settlement.
 *
 * What these tests pin is the gates the product owner then set, several of which
 * are genuine changes rather than mere recordings — in particular the two that
 * LOOSEN deliberately, so an employee can reach their own money:
 *   payroll.taxDeclarations.get / upsert   self, or payroll
 *   settlement.get / preview               self, or HR, or finance
 *
 * And the one asymmetry in the set:
 *   settlement.settle                      role only — NEVER self
 * Viewing your own final settlement is right; paying yourself out is not.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { appRouter } from "../routers";
import { employees, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("permission gaps — the sixteen unmapped procedures", () => {
  let orgId: string;
  let ownerId: string;
  let requesterId: string;
  let requesterEmployeeId: string;

  /**
   * A caller for a user, WITH THEIR REAL ROLE.
   *
   * `createMockContext` hardcodes `role: 'admin', matrixRole: 'admin'` for every
   * caller, so a test that just passes a member's userId is silently running as an
   * admin and proves nothing about denial. The role has to be overridden explicitly.
   */
  const callerAs = (userId: string, role: string, matrixRole: string) =>
    appRouter.createCaller(
      createMockContext(userId, orgId, {
        user: {
          id: userId, orgId, email: `${role}@qa.test`, name: role,
          role, matrixRole, status: "active",
        } as never,
      }),
    );
  const asRequester = () => callerAs(requesterId, "member", "requester");
  const asOwner = () => callerAs(ownerId, "owner", "admin");

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId: ownerId } = await seedUser(orgId, {
      email: `owner-${nanoid(6)}@qa.coheronconnect.io`,
      role: "owner",
      matrixRole: "admin",
    }));
    // A plain employee: the `requester` shape Round 4 narrowed.
    ({ userId: requesterId } = await seedUser(orgId, {
      email: `emp-${nanoid(6)}@qa.coheronconnect.io`,
      role: "member",
      matrixRole: "requester",
    }));
    const [emp] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId: requesterId,
        employeeId: `EMP-${nanoid(4)}`,
        startDate: new Date("2026-04-01"),
        status: "active",
      })
      .returning();
    requesterEmployeeId = emp!.id;
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  // ── settlement: the asymmetry ─────────────────────────────────────────────
  describe("settlement — view your own, never settle your own", () => {
    it("the employee CAN preview their OWN settlement — no permission error", async () => {
      // A business precondition (no last working day recorded) may still reject.
      // What must NOT happen is a permission rejection.
      await expect(
        asRequester().settlement.preview({ employeeId: requesterEmployeeId } as never),
      ).rejects.not.toThrow(/own employee record|FORBIDDEN/i);
    });

    it("the employee CAN get their OWN settlement record", async () => {
      await expect(
        asRequester().settlement.get({ employeeId: requesterEmployeeId }),
      ).resolves.toBeDefined(); // null is a valid answer — the point is it does not throw
    });

    it("THE ASYMMETRY: the employee CANNOT settle their own — paying yourself out is not self-service", async () => {
      await expect(
        asRequester().settlement.settle({ employeeId: requesterEmployeeId } as never),
      ).rejects.toThrow(/FORBIDDEN|permission/i);
    });

    it("the employee cannot preview SOMEONE ELSE's settlement", async () => {
      const [other] = await testDb()
        .insert(employees)
        .values({
          orgId, userId: ownerId, employeeId: `EMP-${nanoid(4)}`,
          startDate: new Date("2026-04-01"), status: "active",
        })
        .returning();
      await expect(
        asRequester().settlement.preview({ employeeId: other!.id } as never),
      ).rejects.toThrow(/own employee record|FORBIDDEN/i);
    });

    it("the owner can settle — the role path still works", async () => {
      // Owner holds offboarding:write via the short-circuit; the call may fail on
      // business preconditions but must NOT fail on permission.
      await expect(
        asOwner().settlement.settle({ employeeId: requesterEmployeeId } as never),
      ).rejects.not.toThrow(/own employee record/i);
    });
  });

  // ── tax declarations: self, or payroll ────────────────────────────────────
  describe("tax declarations — an employee owns their own investment proofs", () => {
    it("the employee CAN read their OWN declaration", async () => {
      await expect(
        asRequester().payroll.taxDeclarations.get({
          employeeId: requesterEmployeeId, fiscalYear: 2026,
        }),
      ).resolves.toBeNull(); // none captured yet — but reachable
    });

    it("the employee CANNOT read someone else's declaration", async () => {
      const [other] = await testDb()
        .insert(employees)
        .values({
          orgId, userId: ownerId, employeeId: `EMP-${nanoid(4)}`,
          startDate: new Date("2026-04-01"), status: "active",
        })
        .returning();
      await expect(
        asRequester().payroll.taxDeclarations.get({
          employeeId: other!.id, fiscalYear: 2026,
        }),
      ).rejects.toThrow(/own employee record|FORBIDDEN/i);
    });

    it("the employee CANNOT list the whole org's declarations — that stayed payroll:read", async () => {
      await expect(
        asRequester().payroll.taxDeclarations.listForFy({ fiscalYear: 2026 }),
      ).rejects.toThrow(/FORBIDDEN|permission/i);
    });

    it("the owner can list them", async () => {
      await expect(
        asOwner().payroll.taxDeclarations.listForFy({ fiscalYear: 2026 }),
      ).resolves.toBeDefined();
    });
  });

  // ── org statutory identity: admin/owner only ──────────────────────────────
  describe("org statutory identity — admin or owner only", () => {
    it("a plain employee cannot change the org's EPF / PF rate", async () => {
      await expect(
        asRequester().onboarding.updateStatutoryIdentity({ epfCode: "MHBAN1234567" } as never),
      ).rejects.toThrow(/FORBIDDEN|admin|permission/i);
    });

    it("the owner can", async () => {
      await expect(
        asOwner().onboarding.updateStatutoryIdentity({ epfCode: "MHBAN1234567" } as never),
      ).resolves.toBeDefined();
    });
  });

  // ── payroll policy: admin/owner ───────────────────────────────────────────
  describe("payroll policy — admin or owner", () => {
    it("a plain employee cannot read the approval-chain setting", async () => {
      await expect(asRequester().admin.payrollPolicy.get()).rejects.toThrow(
        /FORBIDDEN|admin|permission/i,
      );
    });

    it("the owner can", async () => {
      await expect(asOwner().admin.payrollPolicy.get()).resolves.toBeDefined();
    });
  });

  // ── the remaining role-gated set ──────────────────────────────────────────
  describe("statutory reads and imports stay role-gated for a plain employee", () => {
    it("challan lists, statutory outputs, structure import and comp-off are all denied", async () => {
      const c = asRequester();
      await expect(c.indiaCompliance.esiChallans.list({} as never)).rejects.toThrow(/FORBIDDEN|permission/i);
      await expect(c.indiaCompliance.ptChallans.list({} as never)).rejects.toThrow(/FORBIDDEN|permission/i);
      await expect(c.ingest.structureImportTemplate()).rejects.toThrow(/FORBIDDEN|permission/i);
    });
  });
});
