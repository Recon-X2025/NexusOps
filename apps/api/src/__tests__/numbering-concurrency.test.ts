/**
 * B2 — Every "next number" is minted by the atomic per-(org, entity) counter,
 * so concurrent creates get distinct numbers WITHOUT relying on a unique-violation
 * retry (Phase 2, root cause bucket B).
 *
 * Before B2, journal numbers came from `count(existing) + 1` computed inside the
 * create transaction with no lock (accounting.ts). Two creates firing together both
 * read the same count and both mint the SAME number (e.g. JE-2026-00001); the unique
 * index `je_org_number_idx` rejects the loser with Postgres 23505 (unique_violation),
 * and `retryMutation` re-runs the loser, which re-reads the now-incremented count and
 * lands on the next number. So the old code DID reach distinct numbers — but only via
 * a wasted transaction + a round-trip 23505 + a retry. Under a burst that exceeds the
 * retry budget (MAX_ATTEMPTS), the loser surfaces a raw unique-violation to the user.
 *
 * B2 routes these paths through the atomic allocator (getNextYearScopedSeq →
 * INSERT … ON CONFLICT DO UPDATE SET current_value = current_value + 1 RETURNING),
 * which Postgres serialises on the counter row: each concurrent caller receives a
 * DISTINCT consecutive sequence with no collision. The acceptance criterion is
 * therefore NOT merely "the numbers differ" (the old code already achieved that via
 * the retry) but that "the 23505 collision never reaches the DB" — i.e. the retry
 * never has to fire.
 *
 * ─ How this test observes the retry NOT firing ───────────────────────────────
 * `logWarn("MUTATION_RETRY", …)` is a no-op in tests (logger.ts: `if (isTest) return`),
 * so the middleware retry is not observable via console. Instead we observe at the DB
 * layer: each racing caller is given an instrumented `db` that records any transaction
 * throwing pg code 23505. Crucially the create handler opens its OWN nested transaction
 * (a SAVEPOINT) and the loser's duplicate insert raises 23505 THERE — a nested-SAVEPOINT
 * rollback does not re-throw that code out to the outer rlsTenant transaction, so the
 * instrument records at BOTH the nested and outer tx levels (deduped). Under the old
 * count()+1 code the loser's insert raises 23505 (recorded); under the atomic counter
 * each caller draws a distinct sequence so no 23505 is ever raised.
 *
 * ─ Forcing the race deterministically (a two-party barrier, NOT a fixed delay) ─
 * A plain Promise.allSettled rarely interleaves each caller's numbering-read with the
 * other's insert: postgres.js gives each caller its own pooled connection, and under
 * the OLD count()+1 code caller 1's whole transaction (read count → insert → commit)
 * tends to finish before caller 2's begins, so caller 2 reads the already-incremented
 * count and mints the next number — no collision, the bug hides. A fixed per-caller
 * delay does NOT fix this: it holds each caller AFTER its read, but the two reads still
 * happen at different times, so the second still reads the incremented count.
 *
 * The defect only surfaces when BOTH callers read the SAME count BEFORE either inserts.
 * So we use a two-party BARRIER: the instant a caller's FIRST data read resolves, it
 * parks until the OTHER caller's first read has also resolved, then both proceed. Under
 * the OLD count()+1 code both reads return the same count, the barrier releases, and
 * both insert the same number → the loser raises 23505, every run.
 *
 * Why the barrier is SAFE here (unlike R-4, where it would deadlock): a plain count()
 * SELECT holds NO row lock, so caller 1 parking at the barrier does not block caller 2's
 * read. And under the atomic counter the "numbering read" is the single-statement
 * INSERT … ON CONFLICT DO UPDATE +1 increment (via db.execute) — each caller's increment
 * COMMITS its own +1 independently and resolves, so both reach the barrier already
 * holding DISTINCT sequences, release, and insert distinct numbers → no 23505. (Contrast
 * R-4's SELECT … FOR UPDATE, which holds a row lock across the read: a barrier there
 * parks caller 1 while caller 2 blocks in Postgres on that very lock → deadlock. That is
 * why R-4 needed a fixed delay and B2 needs a barrier.)
 *
 * This probe is FAIR: it reveals the real reliance-on-retry, it does not manufacture a
 * collision. A correctly-allocated create hands out distinct sequences at the counter,
 * so no 23505 is raised regardless of interleaving — the barrier only lines the two
 * reads up; it cannot force distinct atomic increments to collide.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { getNextYearScopedSeq } from "../lib/auto-number";
import { extractPgCode } from "../lib/db-retry";
import { journalEntries, eq, and } from "@coheronconnect/db";

/**
 * A two-party barrier: N callers each call `arrive()`; every call blocks until all N
 * have arrived, then all resolve together. This lines up both callers' first reads at
 * the same instant so — under the old count()+1 code — both read the SAME count before
 * either inserts. A safety timeout releases the barrier if a party never arrives (e.g.
 * under the atomic counter, where a caller's increment may commit and let it proceed
 * before the barrier even matters), so a correct implementation never hangs.
 */
function makeBarrier(parties: number, timeoutMs = 2000) {
  let arrived = 0;
  const waiters: Array<() => void> = [];
  const release = () => {
    while (waiters.length) waiters.shift()!();
  };
  return function arrive(): Promise<void> {
    arrived += 1;
    if (arrived >= parties) {
      release();
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waiters.push(resolve);
      setTimeout(() => resolve(), timeoutMs);
    });
  };
}

/**
 * Wrap a real drizzle db so that (a) each racing caller PARKS AT A BARRIER the moment
 * its FIRST data read resolves — releasing only once the other caller's first read has
 * also resolved, so both read the same count before either inserts — and (b) any
 * transaction that throws a Postgres 23505 (unique_violation) records the code into
 * `seen23505`. The proxy re-wraps every chained builder method so the barrier survives
 * to the terminal `.then`, and wraps the nested transaction recursively.
 *
 * (The select-chain re-wrap + tx-recursion mirror gateReadThenWrite in
 * money-concurrency.test.ts; here we swap the fixed delay for a barrier and additionally
 * intercept the transaction promise to capture a 23505 the loser's insert would raise
 * under the old count()+1 code.)
 */
function gateAndCaptureUniqueViolations(
  realDb: any,
  seen23505: string[],
  arriveAtBarrier: () => Promise<void>,
) {
  let readGated = false;
  const gateAfterFirstRead = async () => {
    if (readGated) return;
    readGated = true;
    await arriveAtBarrier();
  };

  // Record a 23505 exactly once (a single collision may surface at both the nested
  // SAVEPOINT and the outer tx as it unwinds — we only want to count the event).
  const record23505 = (err: unknown) => {
    if (extractPgCode(err) === "23505" && seen23505.length === 0) seen23505.push("23505");
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
          // The handler opens its OWN nested transaction (a SAVEPOINT). Under the
          // old count()+1 code the loser's insert raises 23505 HERE — and a nested
          // SAVEPOINT rollback swallows that error at the outer tx, so we must
          // record it at THIS level, not only at the outer transaction.
          return (cb: any, ...rest: any[]) =>
            (t as any)
              .transaction((inner: any) => cb(wrapTx(inner)), ...rest)
              .catch((err: unknown) => {
                record23505(err);
                throw err;
              });
        }
        const v = Reflect.get(t, prop, recv);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });

  return new Proxy(realDb, {
    get(d, prop, recv) {
      if (prop === "transaction") {
        return (cb: any, ...rest: any[]) =>
          (d as any)
            .transaction((tx: any) => cb(wrapTx(tx)), ...rest)
            .catch((err: unknown) => {
              record23505(err);
              throw err;
            });
      }
      if (prop === "select") {
        return (...args: any[]) => wrapReadBuilder((d as any).select(...args));
      }
      const v = Reflect.get(d, prop, recv);
      return typeof v === "function" ? v.bind(d) : v;
    },
  });
}

describe("B2: auto-numbers are minted atomically (no unique-violation retry under concurrency)", () => {
  let orgId: string;
  let adminId: string;
  let setupCaller: any;
  let cashId: string;
  let salesId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    setupCaller = accountingRouter.createCaller(createMockContext(adminId, orgId));
    await setupCaller.coa.seed();
    const accounts = await setupCaller.coa.list({});
    cashId = accounts.find((a: any) => a.code === "1110").id;
    salesId = accounts.find((a: any) => a.code === "4100").id;
    expect(cashId && salesId).toBeTruthy();
  });

  const balancedLines = () => [
    { accountId: cashId, debitAmount: 100, creditAmount: 0 },
    { accountId: salesId, debitAmount: 0, creditAmount: 100 },
  ];

  it("two concurrent journal creates get distinct numbers with NO 23505 reaching the DB", async () => {
    const seen23505: string[] = [];
    const N = 2;
    // One barrier shared by both racers: each parks the instant its first read
    // (the count() SELECT under old code) resolves, releasing only once BOTH have
    // read — so both mint off the same count. Under the atomic counter no SELECT
    // precedes the insert, so a caller may never reach the barrier; the barrier's
    // internal timeout then releases and the correct path proceeds green.
    const arrive = makeBarrier(N);
    const racers = Array.from({ length: N }, () =>
      accountingRouter.createCaller(
        createMockContext(adminId, orgId, {
          db: gateAndCaptureUniqueViolations(testDb(), seen23505, arrive) as any,
        }),
      ),
    );

    const results = await Promise.allSettled(
      racers.map((c, i) =>
        c.journal.create({
          date: new Date("2026-03-15"),
          description: `Concurrent create ${i}`,
          lines: balancedLines(),
        }),
      ),
    );

    // Both creates must succeed (no caller left holding a raw unique-violation).
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(
      fulfilled.length,
      `Both concurrent journal.create calls must succeed. Rejections: ` +
        JSON.stringify(
          results
            .filter((r) => r.status === "rejected")
            .map((r) => String((r as PromiseRejectedResult).reason)),
        ),
    ).toBe(N);

    // The two numbers are distinct...
    const numbers = fulfilled.map((r) => (r as PromiseFulfilledResult<any>).value.number);
    expect(new Set(numbers).size).toBe(N);

    // ...and CRITICALLY the distinctness came from the atomic counter, not from a
    // unique-violation + retry: no 23505 was ever raised at the DB.
    expect(
      seen23505,
      `A journal.create race must NOT reach the DB with a duplicate number. The old ` +
        `count()+1 path let both creates mint the same number and relied on the unique ` +
        `index raising 23505 + retryMutation re-running the loser; B2 routes numbering ` +
        `through the atomic org_counters allocator so each caller draws a distinct ` +
        `sequence and no collision ever occurs. Instead ${seen23505.length} unique-` +
        `violation(s) hit the DB. Numbers minted: [${numbers.join(", ")}].`,
    ).toEqual([]);

    // Both persisted, one row each, contiguous JE-2026-000NN sequence.
    const rows = await testDb()
      .select({ number: journalEntries.number })
      .from(journalEntries)
      .where(eq(journalEntries.orgId, orgId))
      .orderBy(journalEntries.number);
    expect(rows).toHaveLength(N);
    expect(rows.every((r) => /^JE-2026-\d{5}$/.test(r.number))).toBe(true);
  });

  it("cutover seed reads the sequence from JE-YYYY-NNNNN and JE-YYYY-NNNNN-REV alike", async () => {
    // A brand-new org has no JE counter row yet. Manually plant two pre-existing
    // journal rows for 2026 as if migrated from a legacy count()+1 system: a plain
    // entry at 00041 and a REVERSAL at 00042 (the -REV suffix is the exact case the
    // trailing-digit approach would misread). The first atomic allocation for this
    // org+year must seed from MAX(41, 42) = 42 and therefore hand out 43 — proving the
    // digit extraction anchors after "JE-2026-" and stops at the first non-digit, so
    // "JE-2026-00042-REV" yields 42, not a corrupted value.
    const other = await seedFullOrg();
    const db = testDb();
    await db.insert(journalEntries).values([
      {
        orgId: other.orgId,
        number: "JE-2026-00041",
        date: new Date("2026-02-01"),
        type: "manual",
        status: "draft",
        description: "legacy plain",
        currency: "INR",
        totalDebit: "0",
        totalCredit: "0",
        createdById: other.adminId,
        financialYear: "2025-2026",
        period: 2,
      },
      {
        orgId: other.orgId,
        number: "JE-2026-00042-REV",
        date: new Date("2026-02-02"),
        type: "reversal",
        status: "posted",
        description: "legacy reversal",
        currency: "INR",
        totalDebit: "0",
        totalCredit: "0",
        createdById: other.adminId,
        financialYear: "2025-2026",
        period: 2,
      },
    ]);

    const seq = await getNextYearScopedSeq(
      db,
      other.orgId,
      "JE",
      2026,
      "journal_entries",
      "number",
    );
    expect(
      seq,
      `The cutover seed must read the max existing 2026 sequence from BOTH ` +
        `"JE-2026-00041" (→41) and "JE-2026-00042-REV" (→42, the -REV suffix must not ` +
        `corrupt the digit extraction), giving MAX=42, so the next allocation is 43. ` +
        `Got ${seq}.`,
    ).toBe(43);

    // A different year is unaffected: its counter seeds independently at 0 → 1.
    const seq2027 = await getNextYearScopedSeq(
      db,
      other.orgId,
      "JE",
      2027,
      "journal_entries",
      "number",
    );
    expect(seq2027, "A new year restarts the counter at 1.").toBe(1);
  });

  it("the counter, not the row count, drives the number (a deleted row does not rewind it)", async () => {
    // Create two entries, delete the first, create a third. Under count()+1 the third
    // would reuse the freed number (count is back to 1 → seq 2 collides / rewinds);
    // the atomic counter never rewinds, so numbers keep climbing.
    const caller = accountingRouter.createCaller(createMockContext(adminId, orgId));
    const a = await caller.journal.create({
      date: new Date("2026-03-15"),
      description: "first",
      lines: balancedLines(),
    });
    const b = await caller.journal.create({
      date: new Date("2026-03-15"),
      description: "second",
      lines: balancedLines(),
    });
    expect(a.number).toBe("JE-2026-00001");
    expect(b.number).toBe("JE-2026-00002");

    await testDb()
      .delete(journalEntries)
      .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.number, "JE-2026-00001")));

    const c = await caller.journal.create({
      date: new Date("2026-03-15"),
      description: "third",
      lines: balancedLines(),
    });
    // count()+1 would have produced 00002 again (a duplicate of b); the atomic counter
    // gives 00003.
    expect(
      c.number,
      `After deleting JE-2026-00001, the next create must NOT rewind to a used number. ` +
        `A count()+1 scheme would recompute count()+1 and collide; the atomic counter ` +
        `keeps climbing. Got ${c.number}.`,
    ).toBe("JE-2026-00003");
  });

  /**
   * Regression for the AR/AP half of this invariant (audit-finance-ar-ap.md HIGH-1).
   *
   * `journal.create` drew from the atomic counter while every posting in
   * `lib/invoice-journal.ts` numbered itself with `count(*) + 1` — two allocators
   * over ONE unique namespace (`je_org_number_idx`). The counter only self-seeds
   * from `MAX(...)` when its row does not yet exist, so once an invoice posting
   * minted a number above the counter, the counter never caught up and the next
   * manual entry walked straight into a duplicate key.
   *
   * This test would fail on the old code at the third step with a 23505.
   */
  it("invoice GL postings and manual journal creates share ONE counter and never collide", async () => {
    const { postInvoiceJournalEntry } = await import("../lib/invoice-journal");
    const caller = accountingRouter.createCaller(createMockContext(adminId, orgId));
    const date = new Date("2026-06-10");

    // 1. Two manual entries advance the atomic counter to 2.
    const a = await caller.journal.create({ date, description: "manual one", lines: balancedLines() });
    const b = await caller.journal.create({ date, description: "manual two", lines: balancedLines() });
    expect([a.number, b.number]).toEqual(["JE-2026-00001", "JE-2026-00002"]);

    // 2. An invoice posts its GL entry. Under count()+1 this minted JE-2026-00003
    //    WITHOUT advancing the counter, which stayed at 2.
    const invoiceJeId = await testDb().transaction(async (tx) =>
      postInvoiceJournalEntry(tx, {
        orgId,
        createdById: adminId,
        invoiceFlow: "receivable",
        invoiceNumber: `INV-NUMBERING-${Date.now()}`,
        date,
        taxableValue: 1000,
        cgstAmount: 90,
        sgstAmount: 90,
        igstAmount: 0,
        isInterstate: false,
        grossTotal: 1180,
        financialYear: "2026-2027",
      }),
    );
    expect(invoiceJeId, "The invoice GL entry must post.").toBeTruthy();

    // 3. The next manual entry. On the old code the counter returned 3 → JE-2026-00003,
    //    which the invoice posting had already taken → duplicate key violation.
    const c = await caller.journal.create({ date, description: "manual three", lines: balancedLines() });

    const rows = await testDb()
      .select({ number: journalEntries.number })
      .from(journalEntries)
      .where(eq(journalEntries.orgId, orgId));
    const numbers = rows.map((r) => r.number);

    expect(
      new Set(numbers).size,
      `Every JE number in an org must be unique. Invoice postings and manual entries ` +
        `must draw from the SAME atomic counter. Got: ${numbers.sort().join(", ")}`,
    ).toBe(numbers.length);

    expect(
      c.number,
      `The manual entry after an invoice posting must continue past it, not collide ` +
        `with it. Got ${c.number} against ${numbers.sort().join(", ")}.`,
    ).toBe("JE-2026-00004");
  });

  /**
   * `trialBalance.asOfDate` was DECLARED and ignored — every line came from the
   * `currentBalance` snapshot, so asking for a past date returned today's numbers
   * with no error. It now derives from posted movements, like `balanceSheet`.
   */
  it("trialBalance honours asOfDate — a later entry is excluded from an earlier date", async () => {
    const caller = accountingRouter.createCaller(createMockContext(adminId, orgId));

    // Both paths read POSTED entries only — `journal.create` leaves a draft, which
    // moves neither `currentBalance` nor the movement sum. Post them.
    const inRange = await caller.journal.create({
      date: new Date("2026-03-10"),
      description: "in range",
      lines: balancedLines(),
    });
    await caller.journal.post({ id: inRange.id });

    const later = await caller.journal.create({
      date: new Date("2026-09-20"),
      description: "after the as-of date",
      lines: balancedLines(),
    });
    await caller.journal.post({ id: later.id });

    const asOfMarch = await caller.trialBalance({ asOfDate: new Date("2026-03-31T23:59:59.999Z") });
    const snapshot = await caller.trialBalance({});

    // Each entry moves 100 through cash. March sees one; the snapshot sees both.
    expect(
      asOfMarch.totalDebit,
      `An as-at-March trial balance must exclude a September entry. If this equals the ` +
        `snapshot total (${snapshot.totalDebit}), asOfDate is being ignored again.`,
    ).toBeCloseTo(100, 2);
    expect(snapshot.totalDebit).toBeCloseTo(200, 2);
    expect(asOfMarch.isBalanced).toBe(true);
  });
});
