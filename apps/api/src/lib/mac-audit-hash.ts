/**
 * Platform-global tamper-evident audit chain for the MAC (cross-tenant
 * super-admin) surface.
 *
 * This mirrors the per-org chain in `audit-hash.ts` but is scoped to the whole
 * platform rather than a single org: MAC operators have no org, so their
 * privileged cross-tenant actions (org create/suspend, session revocation,
 * impersonation, bulk feature-flag rollout, deploy triggers, and every login
 * attempt) cannot live in the per-org `audit_logs` chain.
 *
 * The chain is a SINGLE global sequence:
 *
 *   entryHash = SHA-256( prevHash || "\n" || canonicalPayload )
 *
 * Each row's hash depends on the previous row's, so editing, deleting, or
 * reordering any historical row invalidates every subsequent hash — detectable
 * via `verifyMacAuditChain`. The head (latest `seq`) is read inside the same
 * transaction as the insert so concurrent writers cannot fork the chain.
 */
import { createHash } from "node:crypto";
import { macAuditLogs, desc, type Db } from "@coheronconnect/db";
import { canonicalize } from "./audit-hash";

/** Every MAC operator action that is recorded to the platform audit chain. */
export type MacAuditAction =
  | "operator_login"
  | "org_created"
  | "org_suspended"
  | "org_resumed"
  | "sessions_revoked"
  | "user_impersonated"
  | "feature_flag_set"
  | "feature_flag_bulk_set"
  | "billing_updated"
  | "deploy_triggered"
  | "legal_recorded";

export interface MacAuditEntryInput {
  operatorEmail: string;
  action: MacAuditAction;
  /** Plain uuid (no FK) of the affected org, when the action targets one. */
  targetOrgId?: string | null;
  targetOrgName?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Compute the hash for a MAC audit entry given the previous entry's hash. The
 * `seq` is included so a row cannot be re-indexed without detection. Only the
 * semantic fields are hashed (ip/userAgent are metadata and excluded, matching
 * the per-org chain).
 */
export function computeMacEntryHash(
  prevHash: string | null,
  seq: number,
  entry: MacAuditEntryInput,
): string {
  const payload = canonicalize({
    seq,
    operatorEmail: entry.operatorEmail,
    action: entry.action,
    targetOrgId: entry.targetOrgId ?? null,
    targetOrgName: entry.targetOrgName ?? null,
    details: entry.details ?? null,
  });
  return createHash("sha256")
    .update(`${prevHash ?? "GENESIS"}\n${payload}`)
    .digest("hex");
}

/**
 * Append an entry to the global MAC audit chain atomically. Reads the current
 * head (max seq) inside the transaction, then inserts the next link. Returns the
 * inserted row's seq/hash.
 */
export async function appendMacAuditEntry(db: Db, entry: MacAuditEntryInput) {
  return db.transaction(async (tx) => {
    const [head] = await tx
      .select({ seq: macAuditLogs.seq, entryHash: macAuditLogs.entryHash })
      .from(macAuditLogs)
      .orderBy(desc(macAuditLogs.seq))
      .limit(1);

    const prevSeq = head?.seq ?? 0;
    const prevHash = head?.entryHash ?? null;
    const seq = prevSeq + 1;
    const entryHash = computeMacEntryHash(prevHash, seq, entry);

    const [row] = await tx
      .insert(macAuditLogs)
      .values({
        operatorEmail: entry.operatorEmail,
        action: entry.action,
        targetOrgId: entry.targetOrgId ?? null,
        targetOrgName: entry.targetOrgName ?? null,
        details: entry.details ?? undefined,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        seq,
        prevHash,
        entryHash,
      })
      .returning({
        id: macAuditLogs.id,
        seq: macAuditLogs.seq,
        entryHash: macAuditLogs.entryHash,
      });

    return row;
  });
}

export interface MacChainVerificationResult {
  ok: boolean;
  entries: number;
  /** seq of the first entry whose hash does not match; null when ok. */
  brokenAtSeq: number | null;
  reason?: string;
}

/**
 * Re-derive the whole MAC chain and confirm every stored hash matches. Detects
 * tampering (edited fields), deletions (seq gaps / broken prevHash link), and
 * reordering. Only considers chained rows (seq IS NOT NULL).
 */
export async function verifyMacAuditChain(
  db: Db,
): Promise<MacChainVerificationResult> {
  const rows = await db
    .select()
    .from(macAuditLogs)
    .orderBy(macAuditLogs.seq);

  const chained = rows.filter(
    (r) => r.seq !== null && r.seq !== undefined,
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
    const recomputed = computeMacEntryHash(prevHash, r.seq!, {
      operatorEmail: r.operatorEmail,
      action: r.action as MacAuditAction,
      targetOrgId: r.targetOrgId,
      targetOrgName: r.targetOrgName,
      details: r.details,
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
