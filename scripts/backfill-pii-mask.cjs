#!/usr/bin/env node
/*
 * DPDP PII masking backfill.
 *
 * Derives the masked/hashed representations of government identifiers for EXISTING rows, so the
 * new columns are populated before the raw Aadhaar column is dropped (migration 0037) and so
 * legacy PAN rows gain a match hash.
 *
 *   - Aadhaar (employees, directors): derive aadhaar_masked_hash + aadhaar_masked_display from
 *     the raw `aadhaar`, ONLY where the hash is still NULL. (Raw is dropped later by 0037.)
 *   - PAN (organizations, employees, vendors, directors, company_directors, share_capital):
 *     derive pan_masked_hash + pan_masked_display from raw `pan`, ONLY where the hash is NULL.
 *
 * The hash is a PEPPERED HMAC-SHA256 — identical primitive to apps/api/src/lib/pii-hash.ts. The
 * pepper comes from PII_HASH_PEPPER; the script refuses to run without it (a plain hash would be
 * brute-forceable and would NOT match app-derived hashes).
 *
 * Idempotent: re-running only touches rows whose masked hash is still NULL. Invalid raw values
 * are skipped and reported (never written as a bad hash).
 *
 * Usage:
 *   DATABASE_URL=postgres://... PII_HASH_PEPPER=... node scripts/backfill-pii-mask.cjs [--dry-run]
 */
const postgres = require("postgres");
const { createHmac } = require("node:crypto");

// ── Config ────────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
const PEPPER = process.env.PII_HASH_PEPPER;
const DRY_RUN = process.argv.includes("--dry-run");

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
if (!PEPPER) {
  console.error(
    "PII_HASH_PEPPER is required. It must match the app's pepper so backfilled hashes equal " +
      "app-derived hashes. A plain (unpeppered) hash would be brute-forceable — refusing to run.",
  );
  process.exit(1);
}

// ── PII primitives (mirror apps/api lib: pii-hash.ts, aadhaar.ts, pan.ts, payroll-math) ───────
const AADHAAR_REGEX = /^\d{12}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

function peppatedHash(value) {
  return createHmac("sha256", PEPPER).update(value).digest("hex");
}

function deriveAadhaar(raw) {
  const cleaned = String(raw).replace(/\s|-/g, "");
  if (!AADHAAR_REGEX.test(cleaned)) return null;
  return { hash: peppatedHash(cleaned), masked: `XXXX-XXXX-${cleaned.slice(-4)}` };
}

function derivePan(raw) {
  const cleaned = String(raw).trim().toUpperCase();
  if (!PAN_REGEX.test(cleaned)) return null;
  return { cleaned, hash: peppatedHash(cleaned), masked: `XXXXXX${cleaned.slice(-4)}` };
}

// ── Backfill ──────────────────────────────────────────────────────────────────
const sql = postgres(DATABASE_URL);

/** Tables carrying a raw `pan` that gets a match hash + masked display (raw retained). */
const PAN_TABLES = [
  "organizations",
  "employees",
  "vendors",
  "directors",
  "company_directors",
  "share_capital",
];

/** Tables carrying a raw `aadhaar` to minimise (hash + display, raw dropped by 0037). */
const AADHAAR_TABLES = ["employees", "directors"];

async function backfillAadhaar(table) {
  const rows = await sql`
    SELECT "id", "aadhaar" FROM ${sql(table)}
    WHERE "aadhaar" IS NOT NULL AND "aadhaar_masked_hash" IS NULL`;
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const derived = deriveAadhaar(row.aadhaar);
    if (!derived) {
      skipped += 1;
      continue;
    }
    if (!DRY_RUN) {
      await sql`
        UPDATE ${sql(table)}
        SET "aadhaar_masked_hash" = ${derived.hash},
            "aadhaar_masked_display" = ${derived.masked}
        WHERE "id" = ${row.id}`;
    }
    updated += 1;
  }
  console.log(`  aadhaar/${table}: ${updated} updated, ${skipped} skipped (invalid), ${rows.length} candidate(s)`);
  return { updated, skipped };
}

async function backfillPan(table) {
  const rows = await sql`
    SELECT "id", "pan" FROM ${sql(table)}
    WHERE "pan" IS NOT NULL AND "pan_masked_hash" IS NULL`;
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const derived = derivePan(row.pan);
    if (!derived) {
      skipped += 1;
      continue;
    }
    if (!DRY_RUN) {
      await sql`
        UPDATE ${sql(table)}
        SET "pan" = ${derived.cleaned},
            "pan_masked_hash" = ${derived.hash},
            "pan_masked_display" = ${derived.masked}
        WHERE "id" = ${row.id}`;
    }
    updated += 1;
  }
  console.log(`  pan/${table}: ${updated} updated, ${skipped} skipped (invalid), ${rows.length} candidate(s)`);
  return { updated, skipped };
}

async function main() {
  console.log(`PII mask backfill${DRY_RUN ? " (DRY-RUN — no writes)" : ""}`);
  let totalUpdated = 0;
  let totalSkipped = 0;

  console.log("Aadhaar minimisation:");
  for (const t of AADHAAR_TABLES) {
    const { updated, skipped } = await backfillAadhaar(t);
    totalUpdated += updated;
    totalSkipped += skipped;
  }

  console.log("PAN match hash:");
  for (const t of PAN_TABLES) {
    const { updated, skipped } = await backfillPan(t);
    totalUpdated += updated;
    totalSkipped += skipped;
  }

  console.log(
    `Done. ${totalUpdated} row(s) ${DRY_RUN ? "would be " : ""}updated, ${totalSkipped} skipped (invalid raw value).`,
  );
  if (totalSkipped > 0) {
    console.log(
      "NOTE: skipped rows have a malformed raw value and were left untouched. For Aadhaar these " +
        "will BLOCK migration 0037 (its guard refuses to drop raw while an unbackfilled row exists) " +
        "— clean or clear those raw values before applying 0037.",
    );
  }
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
