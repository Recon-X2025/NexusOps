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
 *
 * ── Encryption-at-rest (H-2) ──
 * The retained raw PAN is written ENCRYPTED via the KMS envelope facility
 * (services/encryption.ts): `panColumns` is async and stores an `v2:` envelope blob in the
 * `pan` column, never plaintext. Reads go through `decryptPan`, which decrypts an envelope
 * blob and passes any legacy pre-encryption plaintext PAN through unchanged (so existing rows
 * keep reading with no backfill). The `panMaskedHash` match key is derived from the *plaintext*
 * before encryption, so it stays deterministic and unaffected by the non-deterministic ciphertext.
 */
import { validatePAN, maskPAN } from "@coheronconnect/payroll-math";
import { peppatedHash } from "./pii-hash";
import { encryptSecretEnvelope, decryptSecretEnvelope, isEnvelope } from "../services/encryption";

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
 * The raw `pan` is stored ENCRYPTED (KMS envelope), so this is async.
 *
 *  - `raw` null/undefined/empty  → returns `{}` (no PAN supplied; leave all three columns unset).
 *  - `raw` invalid               → throws (caller should surface BAD_REQUEST).
 *  - `raw` valid                 → `{ pan, panMaskedHash, panMaskedDisplay }` with `pan` encrypted.
 *
 * Requires `PII_HASH_PEPPER` (throws via derivePan if unset).
 */
export async function panColumns(
  raw: string | null | undefined,
): Promise<PanColumns | Record<string, never>> {
  if (raw == null || raw.trim() === "") return {};
  const derived = derivePan(raw);
  if ("error" in derived) throw new Error(derived.error);
  const cleaned = raw.trim().toUpperCase();
  const encrypted = await encryptSecretEnvelope(cleaned);
  return { pan: encrypted, panMaskedHash: derived.hash, panMaskedDisplay: derived.masked };
}

/**
 * Tolerant PAN column builder for BULK / user-entered writes. Same as `panColumns`, but a
 * MALFORMED PAN degrades to storing the encrypted raw only (no hash/mask) rather than throwing
 * — so one bad value never aborts a create, an update, or a bulk import. The raw is still
 * ENCRYPTED (KMS envelope): PAN is NEVER stored in plaintext under any path. An empty/absent
 * PAN returns `{}` (leave the columns untouched). This is the single implementation shared by
 * `hr.employees.create` / `update` and `ingest.importVendors`, so they cannot drift.
 */
export async function panColumnsTolerant(
  raw: string | null | undefined,
): Promise<PanColumns | { pan: string } | Record<string, never>> {
  if (raw == null || raw.trim() === "") return {};
  try {
    return await panColumns(raw);
  } catch {
    return { pan: await encryptSecretEnvelope(raw.trim().toUpperCase()) };
  }
}

/**
 * Read boundary for a stored raw-PAN column. Decrypts an envelope blob back to the plaintext
 * PAN; passes a legacy pre-encryption plaintext PAN (bare `AAAAA9999A`, not an envelope) through
 * unchanged so existing rows keep reading with no backfill. Returns null/empty inputs as-is.
 */
export async function decryptPan(stored: string | null | undefined): Promise<string | null | undefined> {
  if (stored == null || stored === "") return stored;
  return isEnvelope(stored) ? decryptSecretEnvelope(stored) : stored;
}
