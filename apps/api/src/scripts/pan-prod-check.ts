/**
 * READ-ONLY employee PAN encryption audit.
 * ─────────────────────────────────────────────────────────────────────────────
 * Classifies every `employees` row that carries a PAN, to find rows that were DOUBLE-encrypted
 * by the pre-fix edit dialog (it displayed the stored ciphertext and re-encrypted it on Save).
 *
 * SAFETY CONTRACT (this output goes to a CI log):
 *   • READ ONLY — a single SELECT and in-memory decryption. No UPDATE, no repair, no writes.
 *   • It NEVER prints a PAN value (plaintext, decrypted, or masked). Counts + row identifiers only.
 *   • Reads DATABASE_URL / APP_SECRET / KMS_PROVIDER from the environment (no secret in this file).
 *   • Uses the app's real `decryptPan`, which already branches on KMS_PROVIDER (local vs aws), so
 *     this works against either provider without knowing which one prod uses.
 *   • A decrypt failure on one row is reported and the scan CONTINUES; it never aborts.
 *
 * Run (inside the api container, where the prod env already lives):
 *   node dist/scripts/pan-prod-check.mjs
 */

import { getDb, employees, isNotNull } from "@coheronconnect/db";
import { decryptPan } from "../lib/pan";

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

async function main() {
  const db = getDb();

  // Read-only: the only PAN we ever pull is to classify it in memory; it is never printed.
  const rows: Array<{ id: string; code: string | null; pan: string | null }> = await db
    .select({ id: employees.id, code: employees.employeeId, pan: employees.pan })
    .from(employees)
    .where(isNotNull(employees.pan));

  let plaintext = 0; // no v2: prefix — a bare stored value
  let encrypted = 0; // v2: envelope that decrypts to a valid PAN (correct)
  let doubleEncrypted = 0; // v2: envelope that decrypts to another v2: envelope (the bug)
  let undecryptable = 0; // v2: envelope whose decryption threw
  let unexpected = 0; // v2: envelope that decrypts to neither a PAN nor a v2: value
  let emptyStr = 0; // pan is "" (not really a PAN)

  const doubleRows: string[] = [];
  const undecRows: string[] = [];
  const unexpectedRows: string[] = [];

  for (const r of rows) {
    const pan = r.pan ?? "";
    const label = `${r.code ?? "(no-code)"} [${r.id}]`;

    if (pan === "") {
      emptyStr++;
      continue;
    }
    if (!pan.startsWith("v2:")) {
      plaintext++; // classified purely by prefix, per the spec; value is never inspected/printed
      continue;
    }
    // A v2: envelope — decrypt ONCE and classify by the shape of the result (never the value).
    try {
      const dec = await decryptPan(pan);
      if (typeof dec === "string" && dec.startsWith("v2:")) {
        doubleEncrypted++;
        doubleRows.push(label);
      } else if (typeof dec === "string" && PAN_RE.test(dec)) {
        encrypted++;
      } else {
        unexpected++;
        unexpectedRows.push(label);
      }
    } catch {
      undecryptable++;
      undecRows.push(label);
    }
  }

  console.log("── Employee PAN encryption audit (READ ONLY — no PAN values printed) ──");
  console.log(
    JSON.stringify(
      {
        rowsWithPan: rows.length,
        plaintext,
        correctlyEncrypted: encrypted,
        doubleEncrypted,
        undecryptable,
        unexpected,
        emptyString: emptyStr,
      },
      null,
      2,
    ),
  );
  console.log(`\nDOUBLE-ENCRYPTED rows (${doubleEncrypted}):`);
  console.log(doubleRows.length ? doubleRows.map((x) => "  - " + x).join("\n") : "  (none)");
  console.log(`\nUNDECRYPTABLE rows (${undecryptable}):`);
  console.log(undecRows.length ? undecRows.map((x) => "  - " + x).join("\n") : "  (none)");
  if (unexpected > 0) {
    console.log(`\nUNEXPECTED (decrypted to neither a PAN nor a v2: value) (${unexpected}):`);
    console.log(unexpectedRows.map((x) => "  - " + x).join("\n"));
  }
  console.log("\nDone. No rows were modified.");
  process.exit(0);
}

main().catch((err) => {
  console.error("PAN audit failed to run:", err instanceof Error ? err.message : err);
  process.exit(1);
});
