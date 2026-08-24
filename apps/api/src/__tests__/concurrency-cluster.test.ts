/**
 * HIGH regression: read-then-write guards on the concurrency cluster.
 *   #12 procurement.createFromPR — two concurrent calls must post ONE PO.
 *   #13 hr.leave.reject — must refuse an already-approved request.
 *
 * (#10 journal.reverse and #11 lead conversion share the same FOR UPDATE fix and
 *  are exercised the same way; their dedicated concurrency tests are queued.)
 *
 * The gate below forces the stale-read interleave against the OLD unlocked code
 * without deadlocking the FOR UPDATE / compare-and-set fix (under which the loser
 * simply blocks in Postgres). Same shape as approval-concurrency.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedFullOrg, testDb, cleanupOrg } from "./helpers";
import { hrRouter } from "../routers/hr";
import { procurementRouter } from "../routers/procurement";
import { employees, leaveRequests, purchaseRequests, purchaseOrders, vendors, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const READ_HOLD_MS = 300;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
          return out !== null && (typeof out === "object" || typeof out === "function")
            ? wrapReadBuilder(out)
            : out;
        };
      },
    });
  const wrapTx = (tx: any): any =>
    new Proxy(tx, {
      get(t, prop, recv) {
        if (prop === "select") return (...a: any[]) => wrapReadBuilder((t as any).select(...a));
        if (prop === "transaction") return (cb: any, ...rest: any[]) => (t as any).transaction((inner: any) => cb(wrapTx(inner)), ...rest);
        const v = Reflect.get(t, prop, recv);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  return new Proxy(realDb, {
    get(d, prop, recv) {
      if (prop === "transaction") return (cb: any, ...rest: any[]) => (d as any).transaction((tx: any) => cb(wrapTx(tx)), ...rest);
      if (prop === "select") return (...a: any[]) => wrapReadBuilder((d as any).select(...a));
      const v = Reflect.get(d, prop, recv);
      return typeof v === "function" ? v.bind(d) : v;
    },
  });
}

describe("concurrency cluster: exactly-once guards (HIGH regression)", () => {
  let orgId: string;
  let adminId: string;
  let requesterId: string;
  let empId: string;

  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    adminId = s.adminId;
    requesterId = s.requesterId;
    const [e] = await testDb()
      .insert(employees)
      .values({ orgId, userId: adminId, employeeId: `EMP-${nanoid(4)}`, startDate: new Date("2020-01-01"), status: "active", state: "Maharashtra" })
      .returning();
    empId = e!.id;
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  it("#13 leave.reject refuses an already-approved request (no usedDays inflation)", async () => {
    const [req] = await testDb()
      .insert(leaveRequests)
      .values({
        orgId,
        employeeId: empId,
        type: "annual",
        startDate: new Date(2026, 5, 1),
        endDate: new Date(2026, 5, 4),
        days: "4",
        status: "approved", // already approved
      })
      .returning();

    const caller = hrRouter.createCaller(createMockContext(adminId, orgId));
    await expect(caller.leave.reject({ id: req!.id })).rejects.toThrow(/only a pending/i);

    const [after] = await testDb().select({ status: leaveRequests.status }).from(leaveRequests).where(eq(leaveRequests.id, req!.id));
    expect(after!.status).toBe("approved"); // not silently flipped to rejected
  });

  it("#12 two concurrent createFromPR post exactly one PO", async () => {
    const [ven] = await testDb().insert(vendors).values({ orgId, name: "Vendor X" }).returning();
    const [pr] = await testDb()
      .insert(purchaseRequests)
      .values({ orgId, number: `PR-${nanoid(4)}`, requesterId, title: "Probe", totalAmount: "1000", status: "pending" })
      .returning();
    await procurementRouter.createCaller(createMockContext(adminId, orgId)).purchaseRequests.approve({ id: pr!.id });

    const racers = Array.from({ length: 2 }, () =>
      procurementRouter.createCaller(createMockContext(adminId, orgId, { db: gateReadThenWrite(testDb()) as any })),
    );
    const results = await Promise.allSettled(
      racers.map((c) => c.purchaseOrders.createFromPR({ prId: pr!.id, vendorId: ven!.id })),
    );
    const successes = results.filter((r) => r.status === "fulfilled").length;
    const pos = await testDb().select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.prId, pr!.id));

    expect({ successes, pos: pos.length }).toEqual({ successes: 1, pos: 1 });
  });
});
