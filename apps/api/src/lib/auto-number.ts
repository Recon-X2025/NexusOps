import { sql, type DbOrTx } from "@coheronconnect/db";

// ── Entity → table mapping for counter sync ───────────────────────────────────
//
// Every entry here describes one auto-numbered entity:
//   entity  – key stored in org_counters (must match what routers pass to
//             getNextSeq / getNextNumber)
//   table   – DB table that holds the numbered records
//   column  – column that stores the formatted number string
//
// The sync logic extracts the trailing digits from the number string
// (e.g. "TKT-0042" → 42, "WO0000007" → 7) so the format does not matter.

const COUNTER_SPECS: ReadonlyArray<{
  entity: string;
  table:  string;
  column: string;
}> = [
  { entity: "TKT",  table: "tickets",            column: "number"          },
  { entity: "CHG",  table: "change_requests",    column: "number"          },
  { entity: "PRB",  table: "problems",           column: "number"          },
  { entity: "CNTR", table: "contracts",          column: "contract_number" },
  { entity: "QT",   table: "crm_quotes",         column: "quote_number"    },
  { entity: "RK",   table: "risks",              column: "number"          },
  { entity: "MAT",  table: "legal_matters",      column: "matter_number"   },
  { entity: "PRJ",  table: "projects",           column: "number"          },
  { entity: "SEC",  table: "security_incidents", column: "number"          },
  { entity: "WO",   table: "work_orders",        column: "number"          },
  { entity: "PR",   table: "purchase_requests",  column: "number"          },
  { entity: "PO",   table: "purchase_orders",    column: "po_number"       },
  { entity: "HRC",  table: "hr_cases",           column: "number"          },
  { entity: "CTL",  table: "risk_controls",      column: "control_number"  },
  { entity: "FND",  table: "audit_findings",     column: "finding_number"  },
] as const;

/**
 * Atomically allocates the next sequence value for a given (org, entity) pair.
 *
 * Mechanism — single atomic SQL statement, no advisory locks needed:
 *
 *   INSERT INTO org_counters (org_id, entity, current_value)
 *   VALUES ($orgId, $entity, 1)
 *   ON CONFLICT (org_id, entity)
 *   DO UPDATE SET current_value = org_counters.current_value + 1
 *   RETURNING current_value;
 *
 * Postgres serialises the UPDATE on a conflicting row at the storage level,
 * making this safe under 800+ simultaneous requests on the same org without
 * any advisory locks, explicit transactions, or MAX() table scans.
 *
 * @param db     - Drizzle db instance (or a tx handle inside a transaction)
 * @param orgId  - Organisation UUID
 * @param entity - Counter key, conventionally the module prefix (e.g. "TKT")
 * @returns      The next integer sequence value (1-based)
 */
export async function getNextSeq(
  db: DbOrTx,
  orgId: string,
  entity: string,
): Promise<number> {
  // postgres.js execute() returns an array of row objects for DML with RETURNING.
  type CounterRow = { current_value: string | number };
  const rows = await db.execute(sql`
    INSERT INTO org_counters (org_id, entity, current_value)
    VALUES (${orgId}, ${entity}, 1)
    ON CONFLICT (org_id, entity)
    DO UPDATE SET current_value = org_counters.current_value + 1
    RETURNING current_value
  `) as CounterRow[] | { rows: CounterRow[] };

  const row = Array.isArray(rows) ? rows[0] : rows.rows[0];
  return Number(row?.current_value ?? 1);
}

/**
 * Convenience wrapper that allocates the next sequence and returns a formatted
 * identifier string such as "TKT-0042".
 *
 * @param db      - Drizzle db instance
 * @param orgId   - Organisation UUID
 * @param entity  - Counter key AND prefix (e.g. "TKT" → "TKT-0001")
 * @param prefix  - Override prefix when it differs from the entity key
 * @param padding - Zero-pad width (default 4)
 */
export async function getNextNumber(
  db: DbOrTx,
  orgId: string,
  entity: string,
  prefix?: string,
  padding = 4,
): Promise<string> {
  const seq = await getNextSeq(db, orgId, entity);
  return `${prefix ?? entity}-${String(seq).padStart(padding, "0")}`;
}

/**
 * Atomically allocates the next sequence for a YEAR-SCOPED counter, seeding the
 * counter from any pre-existing rows for that org+year on the very first use.
 *
 * Why this exists (vs plain getNextSeq): the numbering it backs — journal entries
 * (`JE-YYYY-NNNNN`), DPDP DSR (`DSR-YYYY-NNNN`), breach (`BR-YYYY-NNNN`) — restarts
 * at 1 each calendar year, so the counter key is year-qualified (e.g. "JE-2026").
 * That key is DYNAMIC, so the static COUNTER_SPECS startup sync cannot cover it. To
 * keep "the counter and the table agree at cutover", the FIRST allocation for a
 * given (org, "<PREFIX>-<year>") counter seeds the counter from the max sequence
 * already stored for that org in that year, then increments — all in one atomic
 * INSERT … ON CONFLICT DO UPDATE. Every subsequent call is a pure atomic +1.
 *
 * Seeding is correct because:
 *   • The seed sub-select scans ONLY rows for this org whose number begins
 *     `<PREFIX>-<year>-`, so a different year's rows never bias this counter.
 *   • The sequence digits are extracted from the group IMMEDIATELY AFTER the
 *     `<PREFIX>-<year>-` boundary — SUBSTRING(col FROM '^<PREFIX>-<year>-0*([0-9]+)')
 *     — so it reads the same 5-/4-pad number the writer formatted and is UNAFFECTED
 *     by any trailing suffix (`JE-2026-00042` → 42 and `JE-2026-00042-REV` → 42 both
 *     yield 42, because the match stops at the first non-digit after the sequence).
 *   • The seed only runs when the counter row is ABSENT (WHERE NOT EXISTS), so the
 *     scan happens once per (org, year) — never on the hot path — and a live counter
 *     is never rolled back by a late scan. The subsequent increment is the same
 *     single-statement atomic +1 as getNextSeq.
 *
 * Concurrency: two callers hitting a brand-new (org, year) counter simultaneously
 * both attempt the seed INSERT; the unique (org_id, entity) constraint lets exactly
 * one win and the other's ON CONFLICT DO NOTHING no-ops, so the row is created once.
 * Both then run the atomic UPDATE … +1, which Postgres serialises on the row, so they
 * receive distinct consecutive values with no lost update.
 *
 * NOTE: because a fresh org has no rows, the seed max is 0 and the first number is 1
 * — identical to today's count()+1. The seed matters only for a cutover org that
 * already holds numbered rows (no such production org exists yet).
 *
 * @param db      - Drizzle db instance (or tx handle)
 * @param orgId   - Organisation UUID
 * @param prefix  - The number prefix (e.g. "JE", "DSR", "BR")
 * @param year    - The calendar year the number is scoped to
 * @param table   - Source table holding the formatted number (for the cutover seed)
 * @param column  - Column that stores the formatted number string
 * @returns         The next integer sequence value (1-based, restarts each year)
 */
export async function getNextYearScopedSeq(
  db: DbOrTx,
  orgId: string,
  prefix: string,
  year: number,
  table: string,
  column: string,
): Promise<number> {
  const entity = `${prefix}-${year}`;
  const numPrefix = `${prefix}-${year}-`;

  // Step 1 (one-time per org+year): seed the counter to the max sequence already
  // stored for this org in this year, but ONLY if the counter row does not yet
  // exist. WHERE NOT EXISTS keeps the table scan off the hot path — once the row
  // exists this INSERT selects no rows and does nothing. ON CONFLICT DO NOTHING
  // makes it safe if two first-callers race. The regex anchors to the exact
  // "<PREFIX>-<year>-" boundary, strips leading pad zeros, and captures the digit
  // run (stopping at the first non-digit) so a "-REV" suffix does not corrupt it.
  await db.execute(sql`
    INSERT INTO org_counters (org_id, entity, current_value)
    SELECT
      ${orgId},
      ${entity},
      COALESCE(
        (
          SELECT MAX(
            CAST(
              SUBSTRING("${sql.raw(column)}" FROM ${`^${numPrefix}0*([0-9]+)`}) AS BIGINT
            )
          )
          FROM "${sql.raw(table)}"
          WHERE org_id = ${orgId}
            AND "${sql.raw(column)}" LIKE ${numPrefix + "%"}
        ),
        0
      )
    WHERE NOT EXISTS (
      SELECT 1 FROM org_counters
      WHERE org_id = ${orgId} AND entity = ${entity}
    )
    ON CONFLICT (org_id, entity) DO NOTHING
  `);

  // Step 2 (every call): atomic +1 on the now-guaranteed-present counter row.
  return getNextSeq(db, orgId, entity);
}

/**
 * Atomically allocate the next EMPLOYEE sequence for an org, returning the formatted
 * `EMP-NNNN` identifier. This replaces the old `count(*) + 1` allocation, which was
 * neither delete-proof nor concurrency-safe: after any employee delete the count drops
 * and the next allocation collides with a surviving `EMP-NNNN` (they share the unique
 * `employees_org_employee_id_idx`), and two simultaneous creates could both read the same
 * count. Deletes and re-imports of a bad batch happen routinely during onboarding, so this
 * matters for the bulk importer AND the single-record create — both call this, so they
 * cannot drift apart into a shared-number collision.
 *
 * Mechanism mirrors `getNextYearScopedSeq`: a one-time seed (WHERE NOT EXISTS) sets the
 * counter to the max `EMP-` sequence already stored for the org — so a cutover org that was
 * numbered by the old count() path continues without a gap or a collision — then every call
 * is the same single-statement atomic `+1`. The counter only ever moves FORWARD, so a
 * deleted number is never handed out again.
 *
 * The seed regex `^EMP-0*([0-9]+)` captures the digit run after the `EMP-` prefix (stripping
 * pad zeros); a non-numeric legacy id (e.g. a test's `EMP-a1b2`) yields NULL and is ignored
 * by MAX rather than erroring.
 */
export async function getNextEmployeeNumber(db: DbOrTx, orgId: string): Promise<string> {
  // Step 1 (one-time per org): seed the counter to the highest EMP number already stored.
  await db.execute(sql`
    INSERT INTO org_counters (org_id, entity, current_value)
    SELECT
      ${orgId},
      'EMP',
      COALESCE(
        (
          SELECT MAX(CAST(SUBSTRING(employee_id FROM '^EMP-0*([0-9]+)') AS BIGINT))
          FROM employees
          WHERE org_id = ${orgId} AND employee_id LIKE 'EMP-%'
        ),
        0
      )
    WHERE NOT EXISTS (
      SELECT 1 FROM org_counters WHERE org_id = ${orgId} AND entity = 'EMP'
    )
    ON CONFLICT (org_id, entity) DO NOTHING
  `);

  // Step 2 (every call): atomic +1 on the now-present counter row.
  const seq = await getNextSeq(db, orgId, "EMP");
  return `EMP-${String(seq).padStart(4, "0")}`;
}

/**
 * Startup sync — ensures every org_counters row is at least as large as the
 * highest number already stored in the source table.
 *
 * This must run once at API startup (before any requests are served) to guard
 * against the counter drifting below the actual DB state — which causes
 * duplicate key violations when org_counters was initialised mid-flight or
 * reset while the source tables already had records.
 *
 * Safety properties:
 *   • Uses GREATEST(current, new) so counters only ever move forward.
 *   • Each entity is synced independently; a missing table or column logs a
 *     warning and processing continues for all remaining entities.
 *   • The whole function is non-transactional by design: each UPSERT is atomic
 *     on its own row, and partial success is better than a startup failure.
 *   • Safe to call concurrently — the ON CONFLICT DO UPDATE guarantees
 *     last-writer-wins with GREATEST, so no value is ever lost.
 *
 * @returns Summary of entities checked, rows upserted, and any per-entity errors.
 */
export async function syncOrgCounters(db: DbOrTx): Promise<{
  checked: number;
  upserted: number;
  errors: Array<{ entity: string; message: string }>;
}> {
  let checked = 0;
  let upserted = 0;
  const errors: Array<{ entity: string; message: string }> = [];

  for (const { entity, table, column } of COUNTER_SPECS) {
    try {
      // Single atomic statement per entity:
      //   1. Scan the source table for MAX trailing-digit value grouped by org.
      //   2. UPSERT into org_counters, advancing the counter only if the scanned
      //      max is higher than what's already stored (GREATEST).
      //
      // SUBSTRING(col FROM '[0-9]+$') extracts the trailing numeric digits from
      // any prefix format — "TKT-0042" → "0042", "WO0000007" → "0000007", etc.
      const rawSql = `
        INSERT INTO org_counters (org_id, entity, current_value)
        SELECT
          org_id,
          '${entity}',
          COALESCE(
            MAX(CAST(SUBSTRING("${column}" FROM '[0-9]+$') AS BIGINT)),
            0
          )
        FROM "${table}"
        GROUP BY org_id
        ON CONFLICT (org_id, entity)
        DO UPDATE SET current_value = GREATEST(
          org_counters.current_value,
          EXCLUDED.current_value
        )
      `;
      const result = await db.execute(sql.raw(rawSql));
      // postgres.js: result is an array of rows; its length === rows affected by the DML.
      const rowsAffected = Array.isArray(result) ? result.length : 0;
      upserted += rowsAffected;
      checked++;
    } catch (err) {
      errors.push({
        entity,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { checked, upserted, errors };
}
