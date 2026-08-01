/**
 * R-4 — Money read-then-writes must be exactly-once under concurrency
 * (Phase 1 ratchet, root cause #2).
 *
 * Root cause #2 is the read-then-write with no lock: the code reads a value,
 * decides from it, then writes — and a second concurrent request slips between
 * the read and the write and makes the effect happen TWICE. On the money path
 * this silently corrupts the customer's real ledger, and a wrong ledger found
 * months later is the worst kind of unwind.
 *
 * `journal.post` (accounting.ts:327-356) has exactly this shape. It reads the
 * entry OUTSIDE the transaction, checks `status !== "draft"`, and only then
 * opens a tx to add each line's amount to the account balances and flip the
 * status to "posted". There is no row lock (SELECT ... FOR UPDATE). Two callers
 * that both pass the "still draft?" check before either writes will BOTH apply
 * the balances — the account moves by TWICE the entry's value, and both posts
 * "succeed". This is a genuine, user-visible, self-healing-proof double count:
 * unlike an auto-number collision (which the retry middleware quietly re-runs
 * and fixes), a double-applied balance is committed real money that nothing
 * unwinds.
 *
 * ─ Why this test forces the race deterministically ────────────────────────────
 * Firing the two posts with Promise.allSettled alone is NOT reliably red:
 * postgres.js runs each caller's queries on its own pooled connection, and a
 * handler's read+check tends to finish before the next handler's begins, so the
 * two rarely overlap and the bug hides (observed: the naive version passed ~4
 * runs in 5). A ratchet that only catches the defect when the OS scheduler
 * happens to interleave is worthless.
 *
 * So each racing caller is given its own instrumented `db` (via the ctx `db`
 * override) that HOLDS the caller for a short fixed delay the moment its FIRST
 * data SELECT resolves — i.e. right after it has done its "still draft?" read
 * but before it writes. Under the OLD unlocked code both callers' first reads
 * complete essentially immediately (nothing blocks a plain SELECT), both then
 * wait out the same delay while still reading "draft", and both proceed to write
 * off that stale read — the exact double-apply interleave the missing row lock
 * permits, every single run.
 *
 * Why a fixed DELAY and not a two-party barrier: a barrier that only releases
 * once BOTH first reads have resolved DEADLOCKS against the correct fix. With
 * `SELECT … FOR UPDATE`, the second caller's first read cannot resolve until the
 * first caller's transaction commits — but under a barrier the first caller is
 * parked waiting for exactly that second read, so neither proceeds. A per-caller
 * delay that does not depend on the other caller resolving avoids that: under
 * the lock, caller 2 simply blocks in Postgres at its read, caller 1 finishes
 * and commits "posted", caller 2 then wakes, reads "posted", and refuses.
 *
 * This probe is FAIR — it reveals a real defect, it does not manufacture one:
 * a correctly-locked post (`SELECT … FOR UPDATE` on the JE row) blocks the
 * second caller at its READ until the first tx commits, so it reads
 * status="posted" and refuses. Balance moves once, one post succeeds. Green.
 * Only the current unguarded read-then-write goes red under it.
 *
 * NOTE (Phase 2 — now GREEN): against the locked `journal.post` this test passes
 * (balance applied once, one post succeeds). It was RED against the pre-lock
 * read-then-write; the row lock added in A2 turns it green.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { chartOfAccounts, eq } from "@coheronconnect/db";

/** Fixed hold (ms) inserted after each caller's first read, before its writes. */
const READ_HOLD_MS = 300;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wrap a real drizzle db so that each racing caller is HELD for a short fixed
 * delay the moment its FIRST data SELECT resolves — the point right after the
 * handler's deciding read ("still draft?") and right before it writes. Because
 * the hold does not wait on the other caller, it forces the stale-read interleave
 * against the OLD unlocked code (both reads resolve, both wait, both write)
 * WITHOUT deadlocking against the correct fix (under `SELECT … FOR UPDATE` the
 * second caller blocks in Postgres at its read, the first commits, the second
 * then wakes and sees "posted").
 *
 * Implementation notes:
 *   • rlsTenant issues two setup `execute()`s (SET LOCAL org GUC + role) before
 *     the handler body; those are not data reads, so we gate on the first
 *     `select`, not on execute.
 *   • drizzle's select chain does NOT return `this` — `db.select().from()`
 *     yields a fresh PgSelectBase instance, `.where()`/`.limit()` another
 *     (verified). So we re-wrap the return value of every chained method to keep
 *     the proxy alive all the way to the terminal `.then` that awaits the query.
 *   • The handler also opens its own db.transaction() (nested SAVEPOINT); we
 *     wrap that recursively so the first SELECT inside it is the one gated.
 * A correctly-locked implementation blocks the 2nd caller at the DB (row lock)
 * so this gate simply reveals the existing race rather than manufacturing one.
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
          // Re-wrap any builder-like result so `.from().where().limit()` chains
          // stay proxied through to the terminal `.then`.
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

describe("R-4: money read-then-writes are exactly-once under concurrency", () => {
  let orgId: string;
  let adminId: string;
  let setupCaller: any;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    // A plain caller (real db) for one-time setup: seed the chart of accounts.
    setupCaller = accountingRouter.createCaller(createMockContext(adminId, orgId));
    await setupCaller.coa.seed();
  });

  it("two concurrent posts of one draft apply the balance exactly once", async () => {
    const db = testDb();
    const accounts = await setupCaller.coa.list({});
    const cash = accounts.find((a: any) => a.code === "1110");
    const sales = accounts.find((a: any) => a.code === "4100");
    expect(cash && sales).toBeTruthy();

    const ENTRY_AMOUNT = 1000;

    // One balanced draft: debit cash 1000 / credit sales 1000.
    const je = await setupCaller.journal.create({
      date: new Date(),
      description: "Concurrency probe",
      lines: [
        { accountId: cash.id, debitAmount: ENTRY_AMOUNT, creditAmount: 0 },
        { accountId: sales.id, debitAmount: 0, creditAmount: ENTRY_AMOUNT },
      ],
    });

    const [cashBefore] = await db
      .select({ bal: chartOfAccounts.currentBalance })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.id, cash.id));
    const balBefore = Number(cashBefore!.bal);

    // Two callers, each held a fixed delay right after its status-check read
    // (its first SELECT) before it writes — so under the old unlocked code both
    // read "draft" and then both write (double count), while under the row lock
    // the second caller blocks at its read and refuses. See gateReadThenWrite.
    const N = 2;
    const racers = Array.from({ length: N }, () =>
      accountingRouter.createCaller(
        createMockContext(adminId, orgId, {
          db: gateReadThenWrite(db) as any,
        }),
      ),
    );
    const results = await Promise.allSettled(
      racers.map((c) => c.journal.post({ id: je.id })),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;

    const [cashAfter] = await db
      .select({ bal: chartOfAccounts.currentBalance })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.id, cash.id));
    const applied = Number(cashAfter!.bal) - balBefore;

    expect(
      { appliedDelta: applied, postsThatSucceeded: fulfilled },
      `A draft journal entry of ${ENTRY_AMOUNT} was posted ${N}× concurrently, ` +
        `both callers passing the "still draft?" check before either wrote. Its ` +
        `debit must move the cash balance by exactly ${ENTRY_AMOUNT} (applied once) ` +
        `and only one post may succeed. Instead the balance moved by ${applied} ` +
        `across ${fulfilled} successful posts — the unguarded read-then-write ` +
        `double-counted (accounting.ts:327-356 needs a row lock).`,
    ).toEqual({ appliedDelta: ENTRY_AMOUNT, postsThatSucceeded: 1 });
  });
});
