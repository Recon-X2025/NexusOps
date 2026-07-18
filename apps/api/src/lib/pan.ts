/**
 * DPDP PAN minimisation aid.
 *
 * Unlike Aadhaar, PAN is NOT removed from storage: the raw PAN is a statutory necessity for
 * TDS / Form 16 / GSTR filing, so it is retained (guarded by the retention floor for the
 * person-PAN tables). What we add is a de-identifying MATCH hash + a visual mask, stored
 * ALONGSIDE the raw value — never in place of it.
 *
 * The hash is a peppered HMAC-SHA256 (see lib/pii-hash.ts). A PAN's fixed 10-char format
 * (`AAAAA9999A`) makes a plain SHA-256 brute-forceable; the server-side pepper makes the hash
 * a real de-identifier while staying a deterministic within-tenant match/de-dup key.
 */
import { validatePAN, maskPAN } from "@coheronconnect/payroll-math";
import { peppatedHash } from "./pii-hash";

export interface DerivedPan {
  /** Peppered HMAC-SHA256 (hex) of the normalised PAN. A match key, never the raw value. */
  hash: string;
  /** Visual mask, e.g. `XXXXXX234A`. */
  masked: string;
}

/**
 * Validate a raw PAN and derive its stored (masked-hash + display) representation. Returns
 * `{ error }` for an invalid PAN so callers can surface a BAD_REQUEST. Callers keep the raw
 * PAN for filing and store these derived columns alongside it. Requires `PII_HASH_PEPPER`
 * (throws if unset).
 */
export function derivePan(raw: string): DerivedPan | { error: string } {
  const check = validatePAN(raw);
  if (!check.valid) return { error: check.error ?? "Invalid PAN" };
  const cleaned = raw.trim().toUpperCase();
  const hash = peppatedHash(cleaned);
  return { hash, masked: maskPAN(cleaned) };
}

/** The three stored PAN columns: raw (kept for filing) + the two derived match aids. */
export interface PanColumns {
  pan: string;
  panMaskedHash: string;
  panMaskedDisplay: string;
}

/**
 * Build the PAN column set for a write. Spread the result into a `.values({...})` / `.set({...})`
 * so every PAN write stamps `panMaskedHash` + `panMaskedDisplay` alongside the retained raw `pan`.
 *
 *  - `raw` null/undefined/empty  → returns `{}` (no PAN supplied; leave all three columns unset).
 *  - `raw` invalid               → throws (caller should surface BAD_REQUEST).
 *  - `raw` valid                 → `{ pan, panMaskedHash, panMaskedDisplay }`.
 *
 * Requires `PII_HASH_PEPPER` (throws via derivePan if unset).
 */
export function panColumns(raw: string | null | undefined): PanColumns | Record<string, never> {
  if (raw == null || raw.trim() === "") return {};
  const derived = derivePan(raw);
  if ("error" in derived) throw new Error(derived.error);
  return { pan: raw.trim().toUpperCase(), panMaskedHash: derived.hash, panMaskedDisplay: derived.masked };
}
