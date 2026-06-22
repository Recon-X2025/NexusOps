import { sql } from "@coheronconnect/db";

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
  db: any,
  orgId: string,
  entity: string,
): Promise<number> {
  const rows = await db.execute(sql`
    INSERT INTO org_counters (org_id, entity, current_value)
    VALUES (${orgId}, ${entity}, 1)
    ON CONFLICT (org_id, entity)
    DO UPDATE SET current_value = org_counters.current_value + 1
    RETURNING current_value
  `);

  // postgres.js returns an array of row objects; handle both the direct-array
  // shape and the {rows:[]} shape that some Drizzle adapters may produce.
  const row = Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0];
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
  db: any,
  orgId: string,
  entity: string,
  prefix?: string,
  padding = 4,
): Promise<string> {
  const seq = await getNextSeq(db, orgId, entity);
  return `${prefix ?? entity}-${String(seq).padStart(padding, "0")}`;
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
export async function syncOrgCounters(db: any): Promise<{
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
      // postgres.js: result is an array of row objects; its .count property
      // (if present) is the number of rows affected by the DML statement.
      const rowsAffected =
        typeof (result as any)?.count === "number"
          ? (result as any).count
          : Array.isArray(result)
            ? result.length
            : 0;
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
