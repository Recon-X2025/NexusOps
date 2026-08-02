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
import {
  auditLogs,
  auditChainAnchors,
  eq,
  and,
  desc,
  sql,
  isNotNull,
} from "@coheronconnect/db";

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
 * Namespace key for the audit-chain advisory lock. `pg_advisory_xact_lock`
 * takes two int4 keys; the first namespaces this lock so it can never collide
 * with an advisory lock taken elsewhere in the codebase for a different purpose.
 * (Arbitrary constant — just needs to be stable and unique to audit appends.)
 */
const AUDIT_LOCK_NAMESPACE = 0x4155_4454 | 0; // "AUDT"

/** Max attempts to claim the next chain `seq` if the unique index still fires. */
const APPEND_MAX_ATTEMPTS = 5;

/**
 * Append an audit entry to the org's hash chain atomically. Returns the inserted
 * row's seq/hash. Any DB (or transaction handle) with the standard drizzle API works.
 *
 * Concurrency: the chain requires each entry to read the org's current head
 * (`seq`, `entryHash`) and then insert `head.seq + 1` hashing `head.entryHash`.
 * Two writers reading the same head both compute the same next `seq`, and the
 * loser's insert raises 23505 on `UNIQUE (org_id, seq)` — which previously
 * bubbled up and made the mutation-retry middleware re-run the caller's
 * (non-idempotent) handler (the MFA confirmEnroll "No pending enrollment" bug).
 *
 * To make appends collision-free we serialise them PER ORG with a
 * transaction-scoped advisory lock (`pg_advisory_xact_lock`). Writers for the
 * same org queue; writers for different orgs never contend. The lock is held
 * only for the head-read + insert and auto-releases at COMMIT/ROLLBACK, so it
 * cannot leak across pooled connections. A bounded retry on 23505 remains as a
 * defence-in-depth backstop.
 *
 * `ON CONFLICT` is deliberately NOT used: DO UPDATE would overwrite a prior
 * chain entry and DO NOTHING would drop this one — both break the tamper-evident
 * chain. The correct recovery is to advance to a fresh `seq`, which the lock
 * (and, as a backstop, the retry) guarantees.
 *
 * Each attempt runs in its own nested transaction — a real sub-transaction when
 * `db` is a pool handle, or a SAVEPOINT when `db` is an outer transaction handle
 * (e.g. the MFA enrollment update). Either way a 23505 rolls back only that
 * attempt, never poisoning the caller's surrounding transaction.
 */
export async function appendAuditEntry(db: any, entry: AuditEntryInput) {
  // Stable per-org signed int4 key from the org UUID (first 8 hex chars).
  // `| 0` coerces to a signed 32-bit int so it fits Postgres int4 (advisory
  // lock keys are int4); an unsigned value would overflow (22003).
  const orgKey = parseInt(entry.orgId.replace(/-/g, "").slice(0, 8), 16) | 0;

  let lastErr: unknown;
  for (let attempt = 0; attempt < APPEND_MAX_ATTEMPTS; attempt++) {
    try {
      return await db.transaction(async (tx: any) => {
        // Serialise appends for this org; auto-released at tx end.
        await tx.execute(
          sql`select pg_advisory_xact_lock(${AUDIT_LOCK_NAMESPACE}, ${orgKey})`,
        );

        // Head = the org's highest CHAINED entry. `seq IS NOT NULL` is essential:
        // some paths (e.g. command_center.view) write audit rows directly with a
        // NULL seq, and Postgres sorts NULLs FIRST under `ORDER BY seq DESC`, so
        // without this filter the head-read returns a NULL-seq row → prevSeq=0 →
        // seq=1 → a permanent 23505 collision with the real chain head. (That was
        // the deterministic MFA confirmEnroll "No pending enrollment" failure.)
        const [head] = await tx
          .select({ seq: auditLogs.seq, entryHash: auditLogs.entryHash })
          .from(auditLogs)
          .where(and(eq(auditLogs.orgId, entry.orgId), isNotNull(auditLogs.seq)))
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
          .returning({
            id: auditLogs.id,
            seq: auditLogs.seq,
            entryHash: auditLogs.entryHash,
          });

        // Advance the org's head anchor in the SAME advisory-locked transaction.
        // This is the independent record of "how long the chain should be": a later
        // tail-truncation leaves a shorter-but-internally-consistent chain that the
        // re-derivation walk cannot catch, but `verifyAuditChain` compares the live
        // head against this anchor and flags the shortfall. Because we hold the
        // per-org lock and seq advances monotonically, maxSeq only ever grows.
        // A fresh insert leaves status at its 'ok' default; an append never blesses
        // a broken chain (a break is only ever recorded by the backfill or the
        // scheduled verifier flipping status to 'broken').
        await tx
          .insert(auditChainAnchors)
          .values({ orgId: entry.orgId, maxSeq: seq, headHash: entryHash })
          .onConflictDoUpdate({
            target: auditChainAnchors.orgId,
            set: { maxSeq: seq, headHash: entryHash, updatedAt: new Date() },
          });

        return row;
      });
    } catch (err) {
      // Only a seq race (unique_violation) is retryable; re-read head next loop.
      // Any other error (or the final attempt) surfaces to the caller.
      const pgCode =
        (err as { code?: string })?.code ??
        (err as { cause?: { code?: string } })?.cause?.code;
      if (pgCode === "23505" && attempt < APPEND_MAX_ATTEMPTS - 1) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  // Unreachable in practice (the loop returns or throws); satisfies the type checker.
  throw lastErr ?? new Error("appendAuditEntry: exhausted attempts");
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
 *
 * Tail truncation (deleting entries off the END of the chain) leaves a shorter
 * but internally-consistent chain — contiguous seqs, valid prevHash links,
 * matching hashes — so the re-derivation walk alone returns ok. To catch it we
 * compare the live head against the independent per-org anchor
 * (`audit_chain_anchors`): if the anchor's `maxSeq`/`headHash` are ahead of the
 * live head, entries were removed from the tail. An anchor already flagged
 * `status = 'broken'` (by the backfill's structural check, or a prior verifier
 * run that caught hash-tamper) also fails. Orgs with no anchor row (legacy
 * pre-anchor chains) skip the anchor check and are judged on re-derivation alone.
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

  const chained = rows.filter(
    (r: any) => r.seq !== null && r.seq !== undefined,
  );
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

  // The re-derivation walk above passed: what remains is internally consistent.
  // Now check the independent anchor to catch tail truncation and honour a
  // previously-recorded break. `liveMaxSeq`/`liveHeadHash` describe the current
  // head; the anchor records where the head SHOULD be.
  const liveMaxSeq = expectedSeq - 1; // 0 when there are no chained rows
  const liveHeadHash = prevHash; // null when there are no chained rows

  const [anchor] = await db
    .select({
      maxSeq: auditChainAnchors.maxSeq,
      headHash: auditChainAnchors.headHash,
      status: auditChainAnchors.status,
    })
    .from(auditChainAnchors)
    .where(eq(auditChainAnchors.orgId, orgId))
    .limit(1);

  if (anchor) {
    if (anchor.status === "broken") {
      return {
        ok: false,
        entries: chained.length,
        brokenAtSeq: liveMaxSeq || null,
        reason: "anchor marked broken (structural break or prior tamper)",
      };
    }
    if (liveMaxSeq < anchor.maxSeq) {
      return {
        ok: false,
        entries: chained.length,
        brokenAtSeq: liveMaxSeq || null,
        reason: `tail truncated: anchor head seq ${anchor.maxSeq}, live head seq ${liveMaxSeq}`,
      };
    }
    // Same length but a different head hash means the head row was rewritten in
    // place (the per-row walk would normally catch this, but the anchor is a
    // second, independent witness).
    if (liveMaxSeq === anchor.maxSeq && liveHeadHash !== anchor.headHash) {
      return {
        ok: false,
        entries: chained.length,
        brokenAtSeq: liveMaxSeq || null,
        reason: "head hash does not match anchor",
      };
    }
  }

  return { ok: true, entries: chained.length, brokenAtSeq: null };
}
