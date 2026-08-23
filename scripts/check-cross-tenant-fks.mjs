#!/usr/bin/env node
/**
 * Cross-tenant foreign-key scan.
 *
 * Finds rows where a foreign key crosses a tenant boundary — the damage class
 * that every other gate is blind to. RLS ACCEPTS these rows: a child stamped
 * with the caller's own org_id, pointing at a parent owned by someone else, is
 * legitimately the caller's row as far as Postgres is concerned. Typecheck
 * cannot see it. E2E would never construct one.
 *
 * READ-ONLY BY CONSTRUCTION: everything runs inside BEGIN TRANSACTION READ ONLY,
 * so the server itself rejects any write this script could ever attempt.
 *
 *   DATABASE_URL=postgresql://… node scripts/check-cross-tenant-fks.mjs
 *
 * Exit 0 = clean, 1 = cross-tenant rows found, 2 = the scan could not be trusted.
 *
 * TWO SHAPES ARE CHECKED
 *
 *   direct   child.org_id <> parent.org_id, where both carry org_id.
 *
 *   bridge   a child with NO org_id and TWO OR MORE parents, whose parents
 *            resolve to different orgs. A no-org_id child with a single parent
 *            cannot express a cross-tenant row — there is nothing on the row to
 *            disagree with — so single-parent tables are reported as skipped
 *            rather than silently counted as clean.
 *
 * THE CONTROL IS NOT OPTIONAL. A scan that reports "0 cross-tenant rows" is
 * indistinguishable from a scan that matched nothing at all. For every check we
 * also run its inverse (org_ids EQUAL), which must return a non-zero total. If
 * it does not, the scan exits 2 and reports itself untrustworthy rather than
 * clean. This project has lost analyses to exactly that failure — a detector
 * returning zero because it was broken, not because the defect was absent.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const URL_ = process.env["DATABASE_URL"];
if (!URL_) {
  console.error("DATABASE_URL is not set. Refusing to guess a database.");
  process.exit(2);
}

const redacted = URL_.replace(/:\/\/([^:]+):[^@]*@/, "://$1:***@");
const MAX_SAMPLES = 5;

const pgPath = require.resolve("postgres", { paths: [join(__dirname, "../packages/db")] });
const { default: postgres } = await import(pathToFileURL(pgPath).href);
const sql = postgres(URL_, { max: 1, onnotice: () => {} });

const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';

try {
  console.log(`\ncross-tenant FK scan — ${redacted}\n${"=".repeat(72)}`);

  await sql.unsafe("BEGIN TRANSACTION READ ONLY");

  const [{ n: tenants }] = await sql.unsafe(`SELECT count(*)::int n FROM organizations`);
  console.log(`organisations in this database: ${tenants}`);
  if (tenants < 2) {
    console.log(
      "NOTE: with fewer than two tenants a cross-tenant row is impossible by\n" +
      "      construction. A clean result here proves the scan RUNS; it proves\n" +
      "      nothing about the product. Run this against production.",
    );
  }

  const orgTables = new Set(
    (await sql.unsafe(
      `SELECT table_name t FROM information_schema.columns
        WHERE table_schema='public' AND column_name='org_id'`,
    )).map((r) => r.t),
  );

  const fks = await sql.unsafe(
    `SELECT cl.relname AS child, att.attname AS col, pl.relname AS parent
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_class pl ON pl.oid = con.confrelid
       JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
      WHERE con.contype = 'f' AND array_length(con.conkey, 1) = 1
        AND pl.relname <> 'organizations'
      ORDER BY 1, 2`,
  );

  // ── direct: both sides carry org_id ────────────────────────────────────────
  const direct = fks.filter((f) => orgTables.has(f.child) && orgTables.has(f.parent));

  // ── bridge: child has no org_id and ≥2 parents that resolve to an org ──────
  const noOrgChildren = new Map();
  for (const f of fks) {
    if (orgTables.has(f.child)) continue;
    if (!orgTables.has(f.parent)) continue; // only one hop resolved; see skipped
    if (!noOrgChildren.has(f.child)) noOrgChildren.set(f.child, []);
    noOrgChildren.get(f.child).push(f);
  }
  const bridges = [...noOrgChildren.entries()].filter(([, cols]) => cols.length >= 2);
  const singleParent = [...noOrgChildren.entries()].filter(([, cols]) => cols.length < 2);

  console.log(
    `\nFK constraints considered: ${fks.length}` +
    `\n  direct checks   ${direct.length} constraints (both sides carry org_id)` +
    `\n  bridge tables   ${bridges.length} tables with >=2 org-resolved parents` +
    `\n  skipped         ${singleParent.length} tables — no org_id and a single parent,` +
    ` so no cross-tenant row is expressible on the row itself\n`,
  );

  const findings = [];
  let controlTotal = 0;

  for (const f of direct) {
    const where = `c.org_id IS NOT NULL AND p.org_id IS NOT NULL AND c.${q(f.col)} IS NOT NULL`;
    const join = `FROM ${q(f.child)} c JOIN ${q(f.parent)} p ON c.${q(f.col)} = p.id WHERE ${where}`;
    const [{ n }] = await sql.unsafe(`SELECT count(*)::int n ${join} AND c.org_id <> p.org_id`);
    const [{ n: ctl }] = await sql.unsafe(`SELECT count(*)::int n ${join} AND c.org_id = p.org_id`);
    controlTotal += ctl;
    if (n > 0) {
      const rows = await sql.unsafe(
        `SELECT c.id::text id, c.org_id::text child_org, p.org_id::text parent_org
           ${join} AND c.org_id <> p.org_id LIMIT ${MAX_SAMPLES}`,
      );
      findings.push({ kind: "direct", rel: `${f.child}.${f.col} -> ${f.parent}`, n, rows });
    }
  }

  for (const [child, cols] of bridges) {
    for (let i = 0; i < cols.length; i++) {
      for (let j = i + 1; j < cols.length; j++) {
        const a = cols[i], b = cols[j];
        const join =
          `FROM ${q(child)} c` +
          ` JOIN ${q(a.parent)} pa ON c.${q(a.col)} = pa.id` +
          ` JOIN ${q(b.parent)} pb ON c.${q(b.col)} = pb.id` +
          ` WHERE pa.org_id IS NOT NULL AND pb.org_id IS NOT NULL`;
        const [{ n }] = await sql.unsafe(`SELECT count(*)::int n ${join} AND pa.org_id <> pb.org_id`);
        const [{ n: ctl }] = await sql.unsafe(`SELECT count(*)::int n ${join} AND pa.org_id = pb.org_id`);
        controlTotal += ctl;
        if (n > 0) {
          const rows = await sql.unsafe(
            `SELECT c.id::text id, pa.org_id::text child_org, pb.org_id::text parent_org
               ${join} AND pa.org_id <> pb.org_id LIMIT ${MAX_SAMPLES}`,
          );
          findings.push({
            kind: "bridge",
            rel: `${child}: ${a.col}->${a.parent} vs ${b.col}->${b.parent}`,
            n, rows,
          });
        }
      }
    }
  }

  await sql.unsafe("COMMIT");

  // ── the control ────────────────────────────────────────────────────────────
  console.log(`control (rows where the two org_ids AGREE): ${controlTotal}`);
  if (controlTotal === 0) {
    console.error(
      "\nFAIL: the control matched nothing, so the scan proved nothing. Either the\n" +
      "database is empty or the join conditions are wrong. A zero finding here is\n" +
      "NOT a clean result. Exiting 2.",
    );
    process.exit(2);
  }
  console.log("control is non-zero — the scan genuinely executed.\n");

  if (findings.length === 0) {
    console.log(`RESULT: no cross-tenant foreign keys found.`);
    if (tenants < 2) console.log("        (expected — this database has a single tenant)");
    process.exit(0);
  }

  console.error(`RESULT: ${findings.length} relationship(s) hold cross-tenant rows.\n`);
  for (const f of findings) {
    console.error(`  [${f.kind}] ${f.rel} — ${f.n} row(s)`);
    for (const r of f.rows) console.error(`      id=${r.id}  ${r.child_org} <> ${r.parent_org}`);
  }
  console.error("\nThese rows already crossed a tenant boundary. Do not delete them before");
  console.error("establishing which tenant each belongs to — see docs/PLAN-*.md.");
  process.exit(1);
} catch (err) {
  console.error("\nscan failed:", err?.message ?? err);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
