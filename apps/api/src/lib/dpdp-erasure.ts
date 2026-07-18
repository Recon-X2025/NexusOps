/**
 * DSR erasure executor (Phase 1.4).
 *
 * When an erasure-type DSR (DPDP §12) is fulfilled, the Data Fiduciary must
 * actually purge or anonymise the Data Principal's personal data across every
 * store that holds it. This module provides:
 *
 *   1. A declarative, per-table ERASURE_MAP describing WHERE a Principal's PII
 *      lives and HOW to remove it (anonymise columns vs. delete rows), keyed by
 *      how each table references the Principal.
 *   2. An executor that walks that map inside a single transaction, records an
 *      erasure summary, and stamps erasureExecutedAt on the DSR.
 *
 * SAFETY — this ships FLAG-OFF. Destructive erasure only runs when
 * DPDP_ERASURE_ENABLED === "true". Until Indian privacy counsel signs off on
 * the exact table/column map and on delete-vs-anonymise per table, every call
 * runs in DRY-RUN mode: it returns the plan it WOULD execute and mutates
 * nothing. This lets the state machine + evidence stamping be wired and tested
 * without risking real data loss ahead of legal review.
 *
 * The map below is deliberately CONSERVATIVE — it only touches data that is
 * unambiguously the DSR's own Principal-identifying fields plus notification
 * artifacts addressed to that Principal. Extending it to domain tables (CRM
 * contacts, HR records, etc.) is a follow-up that REQUIRES the sign-off above.
 */
import {
  and,
  eq,
  sql,
  dpdpDataSubjectRequests,
  dpdpNotificationArtifacts,
  type DbOrTx,
} from "@coheronconnect/db";

/** How a Principal is matched within a target table. */
type MatchKey =
  | { kind: "dsrId" } // rows keyed by the DSR's own id
  | { kind: "principalEmail" }; // rows matched by the Principal's email

/**
 * One entry per table that holds Principal PII. `action`:
 *  - "anonymise": overwrite the listed PII columns with a redaction tombstone.
 *  - "delete": remove matching rows entirely.
 */
export interface ErasureMapEntry {
  table: string;
  match: MatchKey;
  action: "anonymise" | "delete";
  /** Columns to redact when action === "anonymise". */
  columns?: string[];
  /**
   * Statutory retention-floor guard. When set, this table carries a
   * `retainUntilDate`-style column; rows whose retention window has not yet
   * elapsed are DEFERRED (never touched) even under live erasure. The row is
   * only eligible once `<retentionColumn> IS NULL OR <retentionColumn> <= now()`.
   * Reconciles DPDP §12 erasure with §8(7) statutory-retention exemptions
   * (RBI / Companies Act / Income Tax 8-year floor). See lib/retention.ts.
   */
  retentionColumn?: string;
  description: string;
}

/**
 * The conservative starting map. NOTE: this is intentionally minimal and MUST be
 * reviewed/extended by privacy counsel before enabling live erasure.
 */
export const ERASURE_MAP: ErasureMapEntry[] = [
  {
    table: "dpdp_data_subject_requests",
    match: { kind: "dsrId" },
    action: "anonymise",
    columns: ["principal_name", "principal_email", "principal_phone", "details"],
    description: "Redact the Principal's identifying fields on the DSR record itself.",
  },
  {
    table: "dpdp_notification_artifacts",
    match: { kind: "principalEmail" },
    action: "anonymise",
    columns: ["audience", "subject", "body"],
    description: "Redact any logged notices addressed to this Principal's email.",
  },
];

/** Redaction tombstone written into anonymised text columns. */
const REDACTED = "[erased]";

export interface ErasurePlanStep {
  table: string;
  action: "anonymise" | "delete";
  /** Rows eligible for erasure (retention window elapsed or no retention guard). */
  matched: number;
  /** Rows skipped because they are still inside their statutory retention window. */
  deferred: number;
  columns?: string[];
}

export interface ErasureResult {
  /** True when destructive execution actually ran; false for dry-run. */
  executed: boolean;
  /** Human-readable summary stamped onto the DSR. */
  summary: string;
  steps: ErasurePlanStep[];
}

/** True only when the destructive path is explicitly enabled via env flag. */
export function isErasureEnabled(): boolean {
  return process.env["DPDP_ERASURE_ENABLED"] === "true";
}

interface DsrRow {
  id: string;
  orgId: string;
  requestType: string;
  principalEmail: string | null;
}

/**
 * Build the WHERE predicate that matches a Principal's rows in `entry.table`.
 * Returns `null` when the entry can never match (e.g. principalEmail with no email).
 */
function matchCondition(entry: ErasureMapEntry, dsr: DsrRow): ReturnType<typeof sql> | null {
  if (entry.match.kind === "dsrId") {
    return sql`id = ${dsr.id} AND org_id = ${dsr.orgId}`;
  }
  // principalEmail
  if (!dsr.principalEmail) return null;
  return sql`org_id = ${dsr.orgId} AND related_type = 'dsr' AND related_id = ${dsr.id}`;
}

/**
 * Retention-floor predicate for a map entry. When the entry declares a
 * `retentionColumn`, a row is only ELIGIBLE once its retention window has
 * elapsed (`col IS NULL OR col <= now()`). Passing `eligible = false` inverts
 * it to count DEFERRED rows (still inside the window). Entries without a
 * retention column are unguarded → eligible = everything, deferred = nothing.
 */
function retentionPredicate(entry: ErasureMapEntry, eligible: boolean): ReturnType<typeof sql> | null {
  if (!entry.retentionColumn) return eligible ? null : sql`false`;
  const col = sql.identifier(entry.retentionColumn);
  return eligible ? sql`(${col} IS NULL OR ${col} <= now())` : sql`(${col} IS NOT NULL AND ${col} > now())`;
}

/** AND two optional predicates, dropping nulls. */
function andSql(
  a: ReturnType<typeof sql> | null,
  b: ReturnType<typeof sql> | null,
): ReturnType<typeof sql> | null {
  if (a && b) return sql`${a} AND ${b}`;
  return a ?? b;
}

/**
 * Count how many rows a given map entry matches for this DSR/org, split into
 * rows eligible for erasure now vs. rows deferred by the retention floor. Uses
 * raw SQL so the map can reference tables generically without importing every
 * schema.
 */
async function countMatches(
  db: DbOrTx,
  entry: ErasureMapEntry,
  dsr: DsrRow,
): Promise<{ matched: number; deferred: number }> {
  // postgres.js execute() returns an array of row objects; some drivers wrap it
  // as { rows }. Handle both shapes (mirrors auto-number.ts).
  type CountRow = { n: string | number };
  const readCount = (res: CountRow[] | { rows: CountRow[] }): number => {
    const row = Array.isArray(res) ? res[0] : res.rows[0];
    return Number(row?.n ?? 0);
  };

  const base = matchCondition(entry, dsr);
  if (!base) return { matched: 0, deferred: 0 };

  const runCount = async (where: ReturnType<typeof sql>): Promise<number> => {
    const res = (await db.execute(
      sql`SELECT count(*)::int AS n FROM ${sql.identifier(entry.table)} WHERE ${where}`,
    )) as unknown as CountRow[] | { rows: CountRow[] };
    return readCount(res);
  };

  const eligibleWhere = andSql(base, retentionPredicate(entry, true));
  const matched = eligibleWhere ? await runCount(eligibleWhere) : 0;

  let deferred = 0;
  if (entry.retentionColumn) {
    const deferredWhere = andSql(base, retentionPredicate(entry, false));
    deferred = deferredWhere ? await runCount(deferredWhere) : 0;
  }

  return { matched, deferred };
}

/**
 * Execute (or plan) erasure for a single fulfilled erasure DSR.
 *
 * @param opts.force  Bypass the env flag (used only by tests that assert the
 *                    destructive path). Production callers never set this.
 */
export async function executeErasureForDsr(
  db: DbOrTx,
  orgId: string,
  dsrId: string,
  opts: { force?: boolean } = {},
): Promise<ErasureResult> {
  const [dsr] = await db
    .select({
      id: dpdpDataSubjectRequests.id,
      orgId: dpdpDataSubjectRequests.orgId,
      requestType: dpdpDataSubjectRequests.requestType,
      principalEmail: dpdpDataSubjectRequests.principalEmail,
    })
    .from(dpdpDataSubjectRequests)
    .where(and(eq(dpdpDataSubjectRequests.id, dsrId), eq(dpdpDataSubjectRequests.orgId, orgId)))
    .limit(1);

  if (!dsr) throw new Error(`DSR ${dsrId} not found for org ${orgId}`);
  if (dsr.requestType !== "erasure") {
    throw new Error(`DSR ${dsrId} is a '${dsr.requestType}' request, not 'erasure'`);
  }

  const enabled = opts.force === true || isErasureEnabled();

  // Build the plan (match counts) first — this is safe in both modes.
  const steps: ErasurePlanStep[] = [];
  for (const entry of ERASURE_MAP) {
    const { matched, deferred } = await countMatches(db, entry, dsr as DsrRow);
    steps.push({ table: entry.table, action: entry.action, matched, deferred, columns: entry.columns });
  }

  const totalDeferred = steps.reduce((n, s) => n + s.deferred, 0);
  const deferralNote =
    totalDeferred > 0 ? ` ${totalDeferred} row(s) deferred by retention floor.` : "";

  if (!enabled) {
    return {
      executed: false,
      summary: `DRY-RUN (DPDP_ERASURE_ENABLED not set): would erase across ${steps.length} table(s): ${steps
        .map((s) => `${s.table}(${s.matched})`)
        .join(", ")}.${deferralNote}`,
      steps,
    };
  }

  // Destructive path — run every map entry, then stamp evidence, atomically.
  // Every statement AND-s in the retention-floor predicate so rows still inside
  // their statutory window are never touched, even under live erasure.
  await db.transaction(async (tx) => {
    for (const entry of ERASURE_MAP) {
      const where = andSql(matchCondition(entry, dsr as DsrRow), retentionPredicate(entry, true));
      if (!where) continue; // entry can never match this DSR (e.g. no principal email)

      if (entry.action === "anonymise") {
        const setClause = (entry.columns ?? [])
          .map((c) => sql`${sql.identifier(c)} = ${REDACTED}`)
          .reduce((acc, cur, i) => (i === 0 ? cur : sql`${acc}, ${cur}`));
        await tx.execute(
          sql`UPDATE ${sql.identifier(entry.table)} SET ${setClause} WHERE ${where}`,
        );
      } else {
        await tx.execute(sql`DELETE FROM ${sql.identifier(entry.table)} WHERE ${where}`);
      }
    }

    const summary = `Erased Principal data across ${steps.length} table(s): ${steps
      .map((s) => `${s.table}(${s.matched} ${s.action})`)
      .join(", ")}.${deferralNote}`;

    await tx
      .update(dpdpDataSubjectRequests)
      .set({ erasureExecutedAt: new Date(), erasureSummary: summary, updatedAt: new Date() })
      .where(eq(dpdpDataSubjectRequests.id, dsr.id));
  });

  const summary = `Erased Principal data across ${steps.length} table(s): ${steps
    .map((s) => `${s.table}(${s.matched} ${s.action})`)
    .join(", ")}.${deferralNote}`;
  return { executed: true, summary, steps };
}
