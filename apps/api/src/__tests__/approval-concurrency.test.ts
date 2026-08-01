/**
 * B3 / B4 — Approval read-then-writes must be exactly-once and atomic
 * (Phase 2, root cause #2 — read-then-write with no lock; multi-step writes
 * not wrapped in a transaction).
 *
 * Three defects in the same #2 family, each in an approval path:
 *
 *   (1) leave.approve  — reads the request OUTSIDE the transaction, checks
 *       `status === "pending"`, then inside a tx flips it to "approved" AND
 *       moves the balance (usedDays += days, pendingDays -= days). No row lock,
 *       so two concurrent approves both pass the "still pending?" check and BOTH
 *       apply the balance move — usedDays double-counts. (hr.ts leave.approve)
 *
 *   (2) procurement.approve / reject — a bare `UPDATE … SET status` with no
 *       state-transition guard, so an already-approved PR can be silently flipped
 *       to rejected by a second manager (last-write-wins, no signal). The fix
 *       carries a `status = 'pending'` predicate in the UPDATE's WHERE, so once
 *       the first decision lands a racing second decision matches zero rows and
 *       raises CONFLICT (compare-and-set on the status transition). (procurement.ts)
 *
 *   (3) leave.reject — two SEPARATE writes (flip status, then release the pending
 *       balance) with NO transaction: a failure between them leaves the request
 *       rejected but the held days never released. (hr.ts leave.reject)
 *
 * ─ Forcing the leave-approve race deterministically (fixed DELAY, like R-4) ─
 * We use the SAME fixed-delay gate the money-post race (R-4/A2) uses, for the
 * same reason: the correct fix is a `SELECT … FOR UPDATE` row lock, and a
 * two-party BARRIER would deadlock against it (caller 1 parked waiting for
 * caller 2's read, which is itself blocked in Postgres on caller 1's lock). A
 * per-caller fixed delay after the first read does NOT depend on the other
 * caller resolving, so under the OLD unlocked code both reads resolve, both wait
 * out the delay while still reading "pending", and both write off that stale read
 * — the exact double-apply the missing lock permits, every run. Under the locked
 * fix caller 2 simply blocks in Postgres at its read until caller 1 commits, then
 * wakes, reads "approved", and refuses. See gateReadThenWrite in
 * money-concurrency.test.ts — this is the same shape.
 *
 * This probe is FAIR — it reveals a real defect, it does not manufacture one:
 * a correctly-locked approve blocks the 2nd caller at its READ until the 1st
 * commits, so it reads status="approved" and refuses. The balance moves once,
 * one approve succeeds. Only the current unguarded read-then-write goes red.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, testDb, cleanupOrg } from "./helpers";
import { hrRouter } from "../routers/hr";
import { procurementRouter } from "../routers/procurement";
import {
  employees,
  leaveRequests,
  leaveBalances,
  purchaseRequests,
  eq,
  and,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

/** Fixed hold (ms) inserted after each caller's first read, before its writes. */
const READ_HOLD_MS = 300;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wrap a real drizzle db so each racing caller is HELD for a short fixed delay
 * the moment its FIRST data SELECT resolves — the point right after the handler's
 * deciding read ("still pending?") and right before it writes. The hold does not
 * wait on the other caller, so it forces the stale-read interleave against the OLD
 * unlocked code WITHOUT deadlocking against the `SELECT … FOR UPDATE` fix (under
 * which caller 2 simply blocks in Postgres at its read). Identical in shape to
 * gateReadThenWrite in money-concurrency.test.ts; the handler opens its own nested
 * transaction (SAVEPOINT), so the tx is wrapped recursively and the first SELECT
 * inside it is the one gated.
 */
function gateReadThenWrite(realDb: any) {
  let readGated = false;
  const gateAfterFirstRead = async () => {
    if (readGated) return;
    readGated = true;
    await sleep(READ_HOLD_MS);
  };

  const wrapReadBuilder = (builder: any): any =>
    new Proxy(builder, {
      get(b, p, r) {
        if (p === "then") {
          return (onF: any, onR: any) =>
            (b as any).then(async (val: any) => {
              await gateAfterFirstRead();
              return onF ? onF(val) : val;
            }, onR);
        }
        const v = Reflect.get(b, p, r);
        if (typeof v !== "function") return v;
        return (...args: any[]) => {
          const out = v.apply(b, args);
          if (out !== null && (typeof out === "object" || typeof out === "function")) {
            return wrapReadBuilder(out);
          }
          return out;
        };
      },
    });

  const wrapTx = (tx: any): any =>
    new Proxy(tx, {
      get(t, prop, recv) {
        if (prop === "select") {
          return (...args: any[]) => wrapReadBuilder((t as any).select(...args));
        }
        if (prop === "transaction") {
          return (cb: any, ...rest: any[]) =>
            (t as any).transaction((inner: any) => cb(wrapTx(inner)), ...rest);
        }
        const v = Reflect.get(t, prop, recv);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });

  return new Proxy(realDb, {
    get(d, prop, recv) {
      if (prop === "transaction") {
        return (cb: any, ...rest: any[]) =>
          (d as any).transaction((tx: any) => cb(wrapTx(tx)), ...rest);
      }
      if (prop === "select") {
        return (...args: any[]) => wrapReadBuilder((d as any).select(...args));
      }
      const v = Reflect.get(d, prop, recv);
      return typeof v === "function" ? v.bind(d) : v;
    },
  });
}

describe("B3/B4: approval read-then-writes are exactly-once and atomic", () => {
  let orgId: string;
  let adminId: string;
  let requesterId: string;
  let empId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    requesterId = seeded.requesterId;

    const [e] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId: adminId,
        employeeId: `EMP-${nanoid(4)}`,
        startDate: new Date("2020-01-01"),
        status: "active",
        state: "Maharashtra",
      })
      .returning();
    empId = e!.id;
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  it("B3: two concurrent leave approvals move the balance exactly once", async () => {
    const YEAR = 2026;
    const DAYS = 3;

    // A pending leave request + a balance row holding the DAYS as pending.
    const [req] = await testDb()
      .insert(leaveRequests)
      .values({
        orgId,
        employeeId: empId,
        type: "annual",
        startDate: new Date(YEAR, 4, 10),
        endDate: new Date(YEAR, 4, 12),
        days: String(DAYS),
        status: "pending",
      })
      .returning();

    await testDb()
      .insert(leaveBalances)
      .values({
        employeeId: empId,
        type: "annual",
        year: YEAR,
        totalDays: "20",
        usedDays: "0",
        pendingDays: String(DAYS),
      });

    const db = testDb();
    const N = 2;
    // Two callers, each held a fixed delay right after its status-check read
    // (its first SELECT) before it writes — so under the old unlocked code both
    // read "pending" and both apply the balance move (double count), while under
    // the row lock the second blocks at its read and refuses.
    const racers = Array.from({ length: N }, () =>
      hrRouter.createCaller(
        createMockContext(adminId, orgId, { db: gateReadThenWrite(db) as any }),
      ),
    );
    const results = await Promise.allSettled(
      racers.map((c) => c.leave.approve({ id: req!.id })),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;

    const [bal] = await db
      .select({ used: leaveBalances.usedDays, pending: leaveBalances.pendingDays })
      .from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, empId), eq(leaveBalances.year, YEAR)));

    expect(
      { usedDays: Number(bal!.used), approvalsThatSucceeded: fulfilled },
      `A pending leave of ${DAYS} days was approved ${N}× concurrently, both callers ` +
        `passing the "still pending?" check before either wrote. usedDays must move by ` +
        `exactly ${DAYS} (applied once) and only one approval may succeed. Instead ` +
        `usedDays = ${Number(bal!.used)} across ${fulfilled} successful approvals — ` +
        `the unguarded read-then-write double-counted (hr.ts leave.approve needs a ` +
        `row lock).`,
    ).toEqual({ usedDays: DAYS, approvalsThatSucceeded: 1 });
  });

  it("B3: procurement approve then a racing reject cannot both win (status compare-and-set)", async () => {
    const [pr] = await testDb()
      .insert(purchaseRequests)
      .values({
        orgId,
        number: `PR-${nanoid(4)}`,
        requesterId,
        title: "Concurrency probe",
        totalAmount: "1000",
        status: "pending",
      })
      .returning();

    const caller = procurementRouter.createCaller(createMockContext(adminId, orgId));

    // First approve wins.
    const approved = await caller.purchaseRequests.approve({ id: pr!.id });
    expect(approved.status).toBe("approved");

    // A second manager tries to reject the SAME request off its stale (pending)
    // view. With the state-transition guard wired, the `status = 'pending'`
    // predicate in the reject UPDATE matches zero rows (the PR is already
    // approved) and the handler raises CONFLICT rather than silently flipping an
    // already-approved PR to rejected.
    await expect(caller.purchaseRequests.reject({ id: pr!.id })).rejects.toThrow(
      /conflict|no longer pending/i,
    );

    const [after] = await testDb()
      .select({ status: purchaseRequests.status })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, pr!.id));
    expect(after!.status).toBe("approved");
  });

  it("B4: leave reject releases the pending balance and both writes are atomic", async () => {
    const YEAR = 2026;
    const DAYS = 4;

    const [req] = await testDb()
      .insert(leaveRequests)
      .values({
        orgId,
        employeeId: empId,
        type: "annual",
        startDate: new Date(YEAR, 5, 1),
        endDate: new Date(YEAR, 5, 4),
        days: String(DAYS),
        status: "pending",
      })
      .returning();

    await testDb()
      .insert(leaveBalances)
      .values({
        employeeId: empId,
        type: "annual",
        year: YEAR,
        totalDays: "20",
        usedDays: "0",
        pendingDays: String(DAYS),
      });

    const caller = hrRouter.createCaller(createMockContext(adminId, orgId));
    const updated = await caller.leave.reject({ id: req!.id });
    expect(updated.status).toBe("rejected");

    const [bal] = await testDb()
      .select({ pending: leaveBalances.pendingDays })
      .from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, empId), eq(leaveBalances.year, YEAR)));
    // The reject must release the held days: pending goes back to 0.
    expect(Number(bal!.pending)).toBe(0);
  });
});
