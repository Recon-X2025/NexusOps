/**
 * HR Ops workbench payload.
 *
 * Aggregator across:
 *   • employees       — recently joined / about to exit (lifecycle stages)
 *   • hrCases         — open employee relations / onboarding cases
 *   • leaveRequests   — pending leave approvals
 *
 * Primary visual: employee journey strip (hire → onboard → leave → exit).
 */

import { and, asc, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import {
  employees,
  hrCases,
  leaveRequests,
  users,
} from "@coheronconnect/db";
import {
  envelope,
  runPanel,
  type ActionQueueItem,
  type Panel,
  type WorkbenchEnvelope,
} from "./_shared";

export interface JourneyBucket {
  stage: "joining_soon" | "onboarding" | "active_leave" | "exit_30d";
  count: number;
  /** A few representative employees for tooltip / drill. */
  examples: { employeeId: string; name: string; date: string | null }[];
}

export interface HrCaseRow {
  id: string;
  caseType: string;
  priority: string;
  assigneeName: string | null;
  createdAt: string;
}

export interface LeaveRow {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  days: string;
  employeeName: string | null;
}

export interface HrOpsPayload extends WorkbenchEnvelope {
  journey: Panel<JourneyBucket[]>;
  cases: Panel<HrCaseRow[]>;
  leaves: Panel<LeaveRow[]>;
}

export async function buildHrOpsPayload({
  db,
  orgId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string;
}): Promise<HrOpsPayload> {
  const now = new Date();
  const in14d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const past14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const journey = await runPanel<JourneyBucket[]>("hr-ops.journey", async () => {
    const joiningSoon = await db
      .select({ id: employees.id, employeeId: employees.employeeId, startDate: employees.startDate, userName: users.name })
      .from(employees)
      .leftJoin(users, eq(users.id, employees.userId))
      .where(
        and(
          eq(employees.orgId, orgId),
          gte(employees.startDate, now),
          lte(employees.startDate, in14d),
        ),
      )
      .limit(10);

    const onboarding = await db
      .select({ id: employees.id, employeeId: employees.employeeId, startDate: employees.startDate, userName: users.name })
      .from(employees)
      .leftJoin(users, eq(users.id, employees.userId))
      .where(
        and(
          eq(employees.orgId, orgId),
          gte(employees.startDate, past14d),
          lte(employees.startDate, now),
        ),
      )
      .limit(10);

    const exit30 = await db
      .select({ id: employees.id, employeeId: employees.employeeId, endDate: employees.endDate, userName: users.name })
      .from(employees)
      .leftJoin(users, eq(users.id, employees.userId))
      .where(
        and(
          eq(employees.orgId, orgId),
          isNotNull(employees.endDate),
          gte(employees.endDate, now),
          lte(employees.endDate, in30d),
        ),
      )
      .limit(10);

    const activeLeave = await db
      .select({ id: leaveRequests.id, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.orgId, orgId),
          eq(leaveRequests.status, "approved"),
          lte(leaveRequests.startDate, now),
          gte(leaveRequests.endDate, now),
        ),
      )
      .limit(10);

    const buckets: JourneyBucket[] = [
      {
        stage: "joining_soon",
        count: joiningSoon.length,
        examples: joiningSoon.slice(0, 3).map((e: { id: string; employeeId: string; userName: string | null; startDate: Date | null }) => ({
          employeeId: e.id,
          name: e.userName ?? e.employeeId,
          date: e.startDate ? e.startDate.toISOString() : null,
        })),
      },
      {
        stage: "onboarding",
        count: onboarding.length,
        examples: onboarding.slice(0, 3).map((e: { id: string; employeeId: string; userName: string | null; startDate: Date | null }) => ({
          employeeId: e.id,
          name: e.userName ?? e.employeeId,
          date: e.startDate ? e.startDate.toISOString() : null,
        })),
      },
      {
        stage: "active_leave",
        count: activeLeave.length,
        examples: [],
      },
      {
        stage: "exit_30d",
        count: exit30.length,
        examples: exit30.slice(0, 3).map((e: { id: string; employeeId: string; userName: string | null; endDate: Date | null }) => ({
          employeeId: e.id,
          name: e.userName ?? e.employeeId,
          date: e.endDate ? e.endDate.toISOString() : null,
        })),
      },
    ];
    if (buckets.every((b) => b.count === 0)) return null;
    return buckets;
  });

  const cases = await runPanel<HrCaseRow[]>("hr-ops.cases", async () => {
    const rows = await db
      .select({
        id: hrCases.id,
        caseType: hrCases.caseType,
        priority: hrCases.priority,
        assigneeName: users.name,
        createdAt: hrCases.createdAt,
      })
      .from(hrCases)
      .leftJoin(users, eq(users.id, hrCases.assigneeId))
      .where(eq(hrCases.orgId, orgId))
      .orderBy(desc(hrCases.createdAt))
      .limit(15);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; caseType: string; priority: string;
      assigneeName: string | null; createdAt: Date;
    }): HrCaseRow => ({
      id: r.id,
      caseType: r.caseType,
      priority: r.priority,
      assigneeName: r.assigneeName,
      createdAt: r.createdAt.toISOString(),
    }));
  });

  const leaves = await runPanel<LeaveRow[]>("hr-ops.leaves", async () => {
    const rows = await db
      .select({
        id: leaveRequests.id,
        type: leaveRequests.type,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        days: leaveRequests.days,
      })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.status, "pending")))
      .orderBy(asc(leaveRequests.startDate))
      .limit(15);
    if (!rows.length) return null;
    return rows.map((r: {
      id: string; type: string; startDate: Date; endDate: Date; days: string;
    }): LeaveRow => ({
      id: r.id,
      type: r.type,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      days: r.days,
      employeeName: null,
    }));
  });

  const actions: ActionQueueItem[] = [];
  if (leaves.state === "ok" && leaves.data) {
    for (const l of leaves.data.slice(0, 3)) {
      actions.push({
        id: `leave:${l.id}`,
        label: `Leave approval pending — ${l.type}`,
        hint: `${l.days} days starting ${new Date(l.startDate).toLocaleDateString()}`,
        severity: "warn",
        href: "/app/hr/leave",
      });
    }
  }
  if (cases.state === "ok" && cases.data) {
    const high = cases.data.filter((c) => c.priority === "high" || c.priority === "urgent").slice(0, 2);
    for (const c of high) {
      actions.push({
        id: `case:${c.id}`,
        label: `${c.caseType} case — ${c.priority}`,
        severity: "watch",
        href: `/app/hr/cases/${c.id}`,
      });
    }
  }

  return {
    ...envelope("hr-ops", actions),
    journey,
    cases,
    leaves,
  };
}
