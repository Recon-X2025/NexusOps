/**
 * User-facing identifier columns must be unique PER ORGANISATION.
 *
 * Nine tables generated a value shown to a user as that record's identifier — a
 * case number, an expense report number, an audit finding number, an SLA display
 * id — with no unique index behind it. Two records could carry the same
 * identifier, which makes "case CSM-0042" ambiguous in a support conversation and
 * a filing reference wrong.
 *
 * Two generators were minting values by `Math.random()` and three by `count(*)+1`.
 * A unique index over a racing generator turns a silent duplicate into a
 * user-facing 500, so the generators were moved onto `org_counters` (atomic
 * INSERT … ON CONFLICT DO UPDATE … RETURNING) in the same change. The concurrency
 * tests below are what prove that half of the work landed.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nanoid } from "nanoid";
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import {
  csmCases, expenseReports, auditFindings, slaDefinitions,
  jobRequisitions, boardMeetings, boardResolutions, surveys, threatIntelligence,
  auditPlans, securityIncidents,
  eq, and,
} from "@coheronconnect/db";
import { expensesRouter } from "../routers/expenses";
import { recruitmentRouter } from "../routers/recruitment";

/** (table, identifier column, a sample value) for the direct-insert constraint tests. */
const TABLES = [
  { name: "csm_cases", table: csmCases, col: "number" as const, value: "CSM-0001" },
  { name: "expense_reports", table: expenseReports, col: "number" as const, value: "EXP-0001" },
  { name: "audit_findings", table: auditFindings, col: "findingNumber" as const, value: "AF-0001" },
  { name: "sla_definitions", table: slaDefinitions, col: "displayId" as const, value: "SLA-P1-0001" },
  { name: "job_requisitions", table: jobRequisitions, col: "number" as const, value: "REQ-0001" },
  { name: "board_meetings", table: boardMeetings, col: "number" as const, value: "BM-2026-001" },
  { name: "board_resolutions", table: boardResolutions, col: "number" as const, value: "BR-2026-0001" },
  { name: "surveys", table: surveys, col: "number" as const, value: "SURV-0001" },
  { name: "threat_intelligence", table: threatIntelligence, col: "number" as const, value: "TI-0001" },
];

/**
 * Minimum NOT NULL payload per table (derived from information_schema, not guessed).
 * `threat_intelligence.incident_id` is NOT NULL, so that table needs a parent
 * security incident — supplied by the caller.
 */
function payload(
  name: string, orgId: string, userId: string,
  parents: { planId: string; incidentId: string },
): Record<string, unknown> {
  const { planId, incidentId } = parents;
  switch (name) {
    case "csm_cases": return { orgId, title: "T", requesterId: userId };
    case "expense_reports": return { orgId, title: "T", submittedById: userId };
    case "audit_findings": return {
      orgId, auditPlanId: planId, title: "T",
      criteria: "c", condition: "c", cause: "c", effect: "e",
    };
    case "sla_definitions": return {
      orgId, name: `T-${nanoid(4)}`, priority: `p-${nanoid(4)}`,
      responseMinutes: 30, resolveMinutes: 60,
    };
    case "job_requisitions": return { orgId, title: "T", department: "Eng" };
    case "board_meetings": return { orgId, title: "T", scheduledAt: new Date() };
    case "board_resolutions": return { orgId, title: "T", body: "b" };
    case "surveys": return { orgId, title: "T" };
    case "threat_intelligence": return { orgId, incidentId };
    default: return { orgId };
  }
}

describe("identifier uniqueness (per organisation)", () => {
  let orgId: string;
  let userId: string;
  /** Parents for the two tables whose FK columns are NOT NULL. */
  let parents: { planId: string; incidentId: string };

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" }));
    const [plan] = await testDb().insert(auditPlans)
      .values({ orgId, title: "Plan" } as never).returning({ id: auditPlans.id });
    const [inc] = await testDb().insert(securityIncidents)
      .values({ orgId, number: `SEC-${nanoid(6)}`, title: "Inc" } as never)
      .returning({ id: securityIncidents.id });
    parents = { planId: plan!.id, incidentId: inc!.id };
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  describe.each(TABLES)("$name.$col", ({ name, table, col, value }) => {
    it("rejects a duplicate identifier within the SAME org", async () => {
      const base = payload(name, orgId, userId, parents);
      await testDb().insert(table).values({ ...base, [col]: value } as never);
      await expect(
        testDb().insert(table).values({ ...base, [col]: value } as never),
      ).rejects.toThrow();
    });

    it("PERMITS the same identifier in a DIFFERENT org", async () => {
      const { orgId: otherOrgId } = await seedTestOrg();
      const { userId: otherUserId } = await seedUser(otherOrgId, { role: "admin", matrixRole: "admin" });
      try {
        await testDb().insert(table).values({ ...payload(name, orgId, userId, parents), [col]: value } as never);
        const [oPlan] = await testDb().insert(auditPlans)
          .values({ orgId: otherOrgId, title: "Plan" } as never).returning({ id: auditPlans.id });
        const [oInc] = await testDb().insert(securityIncidents)
          .values({ orgId: otherOrgId, number: `SEC-${nanoid(6)}`, title: "Inc" } as never)
          .returning({ id: securityIncidents.id });
        // Same identifier, other tenant — must be allowed; numbering restarts per org.
        await expect(
          testDb().insert(table).values({
            ...payload(name, otherOrgId, otherUserId, { planId: oPlan!.id, incidentId: oInc!.id }),
            [col]: value,
          } as never),
        ).resolves.toBeDefined();
      } finally {
        await cleanupOrg(otherOrgId);
      }
    });
  });

  describe("generators are collision-safe under concurrency", () => {
    it("expense reports: 20 concurrent creates produce 20 distinct numbers", async () => {
      const caller = expensesRouter.createCaller(createMockContext(userId, orgId));
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          caller.createReport({ title: `Trip ${i}`, businessPurpose: "client visit" } as never),
        ),
      );
      const rows = await testDb()
        .select({ number: expenseReports.number })
        .from(expenseReports)
        .where(eq(expenseReports.orgId, orgId));
      expect(rows).toHaveLength(20);
      expect(new Set(rows.map((r) => r.number)).size).toBe(20);
    }, 120_000);

    it("job requisitions: 20 concurrent creates produce 20 distinct numbers", async () => {
      const caller = recruitmentRouter.createCaller(createMockContext(userId, orgId));
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          caller.requisitions.create({ title: `Engineer ${i}`, department: "Eng" } as never),
        ),
      );
      const rows = await testDb()
        .select({ number: jobRequisitions.number })
        .from(jobRequisitions)
        .where(eq(jobRequisitions.orgId, orgId));
      expect(rows).toHaveLength(20);
      expect(new Set(rows.map((r) => r.number)).size).toBe(20);
    }, 120_000);

    it("no expense number is the old random EXP-<year>-<4 digits> shape", async () => {
      const caller = expensesRouter.createCaller(createMockContext(userId, orgId));
      await caller.createReport({ title: "One", businessPurpose: "p" } as never);
      const [row] = await testDb()
        .select({ number: expenseReports.number })
        .from(expenseReports)
        .where(and(eq(expenseReports.orgId, orgId)));
      // Sequential, not random: EXP-0001.
      expect(row!.number).toMatch(/^EXP-\d{4}$/);
    }, 60_000);
  });
});
