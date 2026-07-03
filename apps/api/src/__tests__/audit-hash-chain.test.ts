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
import { appendAuditEntry, verifyAuditChain, computeEntryHash } from "../lib/audit-hash";
import { auditLogs, eq } from "@coheronconnect/db";

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

  it("computeEntryHash is deterministic and order-independent for changes keys", () => {
    const base = {
      orgId,
      userId,
      action: "update",
      resourceType: "test",
      resourceId: "r1",
    };
    const h1 = computeEntryHash("prev", 5, { ...base, changes: { a: 1, b: 2 } });
    const h2 = computeEntryHash("prev", 5, { ...base, changes: { b: 2, a: 1 } });
    expect(h1).toBe(h2);
    // Different prevHash → different entry hash.
    expect(computeEntryHash("other", 5, { ...base, changes: { a: 1 } })).not.toBe(
      computeEntryHash("prev", 5, { ...base, changes: { a: 1 } }),
    );
  });
});
