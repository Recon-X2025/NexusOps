/**
 * Tamper-evident audit hash chain tests (Sprint 0.4).
 *
 * Every audit_logs row is chained to the previous row for the same org via
 * entryHash = SHA-256(prevHash || canonicalPayload). Editing, deleting, or
 * reordering any historical row must break the chain and be detected by
 * verifyAuditChain.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { seedFullOrg, testDb } from "./helpers";
import {
  appendAuditEntry,
  verifyAuditChain,
  computeEntryHash,
} from "../lib/audit-hash";
import { auditLogs, eq, and, gt } from "@coheronconnect/db";

describe("Audit hash chain (Sprint 0.4)", () => {
  let orgId: string;
  let userId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    userId = seeded.adminId;
  });

  async function append(action: string, resourceId: string) {
    return appendAuditEntry(testDb(), {
      orgId,
      userId,
      action,
      resourceType: "test",
      resourceId,
      changes: { action },
    });
  }

  it("links entries into a verifiable chain (seq increments, prevHash links)", async () => {
    const a = await append("create", "r1");
    const b = await append("update", "r2");
    const c = await append("delete", "r3");

    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    expect(c.seq).toBe(3);

    const rows = await testDb()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.orgId, orgId))
      .orderBy(auditLogs.seq);

    expect(rows[0]!.prevHash).toBeNull(); // genesis
    expect(rows[1]!.prevHash).toBe(rows[0]!.entryHash);
    expect(rows[2]!.prevHash).toBe(rows[1]!.entryHash);

    const result = await verifyAuditChain(testDb(), orgId);
    expect(result.ok).toBe(true);
    expect(result.entries).toBe(3);
    expect(result.brokenAtSeq).toBeNull();
  });

  it("detects tampering when a historical row's fields are edited", async () => {
    await append("create", "r1");
    const b = await append("update", "r2");
    await append("delete", "r3");

    // Silently edit the middle row's action WITHOUT recomputing the hash.
    await testDb()
      .update(auditLogs)
      .set({ action: "escalate_privileges" })
      .where(eq(auditLogs.orgId, orgId))
      .then(() => undefined);

    const result = await verifyAuditChain(testDb(), orgId);
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).not.toBeNull();
    expect(result.reason).toMatch(/tampered|mismatch/i);
    void b;
  });

  it("detects deletion of a historical row (seq gap)", async () => {
    await append("create", "r1");
    await append("update", "r2");
    await append("delete", "r3");

    // Delete the middle entry (seq 2), leaving a gap 1,3.
    await testDb().delete(auditLogs).where(eq(auditLogs.seq, 2));

    const result = await verifyAuditChain(testDb(), orgId);
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(3);
    expect(result.reason).toMatch(/gap|prevHash/i);
  });

  it("concurrent appends never collide on seq (regression: MFA confirmEnroll 23505)", async () => {
    // Fire many appends at once. Before the seq-safe retry, two writers reading
    // the same head both computed the same next seq; the loser raised 23505
    // (unique on org_id,seq), which bubbled up and made retryMutation re-run the
    // caller's non-idempotent handler (confirmEnroll → "No pending enrollment").
    const N = 16;
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => append("race", `r${i}`)),
    );
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected, JSON.stringify(rejected.map((r) => (r as PromiseRejectedResult).reason?.code))).toHaveLength(0);

    const rows = await testDb()
      .select({ seq: auditLogs.seq })
      .from(auditLogs)
      .where(eq(auditLogs.orgId, orgId))
      .orderBy(auditLogs.seq);
    const seqs = rows.map((r) => r.seq);
    // All N landed at distinct, contiguous seqs 1..N — no duplicates, no gaps.
    expect(seqs).toHaveLength(N);
    expect(new Set(seqs).size).toBe(N);
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));

    const result = await verifyAuditChain(testDb(), orgId);
    expect(result.ok).toBe(true);
    expect(result.entries).toBe(N);
  });

  it("computeEntryHash is deterministic and order-independent for changes keys", () => {
    const base = {
      orgId,
      userId,
      action: "update",
      resourceType: "test",
      resourceId: "r1",
    };
    const h1 = computeEntryHash("prev", 5, {
      ...base,
      changes: { a: 1, b: 2 },
    });
    const h2 = computeEntryHash("prev", 5, {
      ...base,
      changes: { b: 2, a: 1 },
    });
    expect(h1).toBe(h2);
    // Different prevHash → different entry hash.
    expect(
      computeEntryHash("other", 5, { ...base, changes: { a: 1 } }),
    ).not.toBe(computeEntryHash("prev", 5, { ...base, changes: { a: 1 } }));
  });
});

/**
 * R-5 — The audit-chain verifier must detect TAIL-TRUNCATION
 * (Phase 1 ratchet, theme / B5).
 *
 * The audit log is tamper-evident: each row's entryHash chains it to the row
 * before, so editing a row (its hash stops matching) or deleting a row from the
 * MIDDLE (a seq gap / broken prevHash link) is caught by `verifyAuditChain`.
 * The existing tests above prove both of those.
 *
 * There is one attack shape the chain does NOT catch, and it is the most natural
 * cover-up of all: deleting the MOST RECENT entries — the tail. When you remove
 * rows off the END of the chain, whatever remains (seqs 1..k) is still a
 * perfectly valid, unbroken chain: contiguous seqs, every prevHash links, every
 * entryHash recomputes. `verifyAuditChain` walks 1..k, finds nothing wrong, and
 * returns ok:true. The rows an attacker most wants gone — their latest actions —
 * are exactly the ones it cannot notice are missing.
 *
 * The root cause: the verifier has no independent record of how long the chain
 * SHOULD be. It re-derives the chain purely from the rows still present, so a
 * shorter-but-internally-consistent chain looks healthy. Detecting truncation
 * needs an external anchor (a persisted head high-water-mark — max seq / last
 * entryHash — kept outside the audit table and compared on verify), which does
 * not exist yet.
 *
 * This probe is FAIR — it reveals a real gap, it does not manufacture one:
 *   • Editing a row, or deleting a middle row, both still go red via the existing
 *     detectors — so the verifier is not "blind to everything", only to the tail.
 *   • Once an external head-anchor exists, truncating the tail leaves the stored
 *     head ahead of the table's max seq and verification fails — green.
 * Only the current anchorless verifier goes red under it.
 *
 * NOTE (expected RED until Phase 2/B5): this test fails against the current code
 * because the anchorless verifier reports ok:true on a truncated tail. That red
 * is the proof the ratchet works; the head-anchor fix turns it green. Per the
 * Phase-1 rule this ratchet is test-only and stays red — the verifier is NOT
 * modified here, and wiring it into a scheduled sweep is deferred to Phase 2/3.
 */
describe("R-5: audit-chain verifier detects tail-truncation", () => {
  let orgId: string;
  let userId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    userId = seeded.adminId;
  });

  async function append(action: string, resourceId: string) {
    return appendAuditEntry(testDb(), {
      orgId,
      userId,
      action,
      resourceType: "test",
      resourceId,
      changes: { action },
    });
  }

  it("flags a chain whose most recent entries were deleted from the end", async () => {
    // Build a clean 5-entry chain (seqs 1..5) and confirm it verifies.
    await append("create", "r1");
    await append("update", "r2");
    await append("read", "r3");
    await append("update", "r4");
    const last = await append("delete", "r5");
    expect(last.seq).toBe(5);

    const before = await verifyAuditChain(testDb(), orgId);
    expect(before.ok).toBe(true);
    expect(before.entries).toBe(5);

    // Attacker removes their two latest tracks: delete seqs 4 and 5 off the END.
    // What remains (seqs 1,2,3) is still a contiguous, hash-consistent chain.
    await testDb()
      .delete(auditLogs)
      .where(and(eq(auditLogs.orgId, orgId), gt(auditLogs.seq, 3)));

    const remaining = await testDb()
      .select({ seq: auditLogs.seq })
      .from(auditLogs)
      .where(eq(auditLogs.orgId, orgId))
      .orderBy(auditLogs.seq);
    // Precondition: the tail really is gone (only 1,2,3 left), so this is a
    // genuine truncation, not a middle-gap the existing detector would catch.
    expect(remaining.map((r) => r.seq)).toEqual([1, 2, 3]);

    const after = await verifyAuditChain(testDb(), orgId);
    expect(
      { ok: after.ok, entries: after.entries },
      `The two most recent audit entries (seq 4 and 5) were deleted from the END ` +
        `of the chain, leaving a shorter but internally-consistent chain (seq 1,2,3). ` +
        `A tamper-evident log must flag that its tail is missing — otherwise deleting ` +
        `your latest tracks is undetectable. verifyAuditChain reported ok=${after.ok} ` +
        `over ${after.entries} entries, i.e. it did NOT notice seq 4,5 vanished ` +
        `(the verifier has no external head-anchor to compare against — B5).`,
    ).toEqual({ ok: false, entries: 3 });
  });
});
