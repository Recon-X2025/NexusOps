/**
 * Tamper-evident audit hash chain (Sprint 0.4).
 *
 * Each audit_logs row is chained to the previous row for the same org:
 *
 *   entryHash = SHA-256( prevHash || canonicalPayload )
 *
 * where `canonicalPayload` is a deterministic JSON serialisation of the entry's
 * semantic fields. Because every hash depends on the one before it, editing,
 * deleting, or reordering any historical row invalidates every subsequent hash —
 * making silent tampering detectable via `verifyAuditChain`.
 *
 * The chain is appended inside a transaction that reads the org's current head
 * (latest `seq`) so concurrent writers cannot fork the chain.
 */
import { createHash } from "node:crypto";
import { auditLogs, eq, and, desc } from "@coheronconnect/db";

export interface AuditEntryInput {
  orgId: string;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  changes?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Stable, key-sorted JSON so hashing is deterministic regardless of key order. */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

/**
 * Compute the hash for an audit entry given the previous entry's hash. The
 * `seq` is included so a row cannot be re-indexed without detection.
 */
export function computeEntryHash(
  prevHash: string | null,
  seq: number,
  entry: AuditEntryInput,
): string {
  const payload = canonicalize({
    seq,
    orgId: entry.orgId,
    userId: entry.userId ?? null,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    changes: entry.changes ?? null,
  });
  return createHash("sha256")
    .update(`${prevHash ?? "GENESIS"}\n${payload}`)
    .digest("hex");
}

/**
 * Append an audit entry to the org's hash chain atomically. Returns the inserted
 * row's seq/hash. Any DB (or transaction handle) with the standard drizzle API works.
 */
export async function appendAuditEntry(db: any, entry: AuditEntryInput) {
  return db.transaction(async (tx: any) => {
    const [head] = await tx
      .select({ seq: auditLogs.seq, entryHash: auditLogs.entryHash })
      .from(auditLogs)
      .where(and(eq(auditLogs.orgId, entry.orgId)))
      .orderBy(desc(auditLogs.seq))
      .limit(1);

    const prevSeq = head?.seq ?? 0;
    const prevHash = head?.entryHash ?? null;
    const seq = prevSeq + 1;
    const entryHash = computeEntryHash(prevHash, seq, entry);

    const [row] = await tx
      .insert(auditLogs)
      .values({
        orgId: entry.orgId,
        userId: entry.userId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        changes: entry.changes ?? undefined,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        seq,
        prevHash,
        entryHash,
      })
      .returning({ id: auditLogs.id, seq: auditLogs.seq, entryHash: auditLogs.entryHash });

    return row;
  });
}

export interface ChainVerificationResult {
  ok: boolean;
  entries: number;
  /** seq of the first entry whose hash does not match; null when ok. */
  brokenAtSeq: number | null;
  reason?: string;
}

/**
 * Re-derive the chain for an org and confirm every stored hash matches. Detects
 * tampering (edited fields), deletions (seq gaps / broken prevHash link), and
 * reordering. Only considers chained rows (seq IS NOT NULL); legacy pre-chain
 * rows are ignored.
 */
export async function verifyAuditChain(
  db: any,
  orgId: string,
): Promise<ChainVerificationResult> {
  const rows = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.orgId, orgId))
    .orderBy(auditLogs.seq);

  const chained = rows.filter((r: any) => r.seq !== null && r.seq !== undefined);
  let prevHash: string | null = null;
  let expectedSeq = 1;

  for (const r of chained) {
    if (r.seq !== expectedSeq) {
      return {
        ok: false,
        entries: chained.length,
        brokenAtSeq: r.seq,
        reason: `seq gap: expected ${expectedSeq}, found ${r.seq}`,
      };
    }
    if ((r.prevHash ?? null) !== prevHash) {
      return {
        ok: false,
        entries: chained.length,
        brokenAtSeq: r.seq,
        reason: "prevHash does not match preceding entry",
      };
    }
    const recomputed = computeEntryHash(prevHash, r.seq, {
      orgId: r.orgId,
      userId: r.userId,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      changes: r.changes,
    });
    if (recomputed !== r.entryHash) {
      return {
        ok: false,
        entries: chained.length,
        brokenAtSeq: r.seq,
        reason: "entryHash mismatch (row was tampered with)",
      };
    }
    prevHash = r.entryHash;
    expectedSeq += 1;
  }

  return { ok: true, entries: chained.length, brokenAtSeq: null };
}
