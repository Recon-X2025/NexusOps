/**
 * DPDP Aadhaar minimisation (Phase 2).
 *
 * Aadhaar is the most sensitive government identifier we handle. Per the DPDP erasure
 * strategy we NEVER store raw Aadhaar: at the point of capture we derive a one-way keyed hash
 * (for any statutory match need) and a visual mask (`XXXX-XXXX-1234`) for UI/audit, and
 * discard the raw value. This mirrors the existing `esigners.aadhaarMaskedHash` pattern.
 *
 * The hash is a peppered HMAC-SHA256 (see lib/pii-hash.ts) — NOT a plain SHA-256. A 12-digit
 * Aadhaar is a small enough space that a plain hash is brute-forceable; the server-side pepper
 * makes the stored hash a real de-identifier while still being a deterministic within-tenant
 * match key. It is never reversible back to the raw Aadhaar and the raw value never leaves this
 * function.
 */
import { validateAadhaar, maskAadhaar } from "@coheronconnect/payroll-math";
import { peppatedHash } from "./pii-hash";

export interface DerivedAadhaar {
  /** Peppered HMAC-SHA256 (hex) of the normalised 12-digit Aadhaar. Never the raw value. */
  hash: string;
  /** Visual mask, e.g. `XXXX-XXXX-1234`. */
  masked: string;
}

/**
 * Validate a raw Aadhaar and derive its stored (masked-hash + display) representation.
 * Returns `{ error }` for an invalid Aadhaar so callers can surface a BAD_REQUEST. The raw
 * value is never returned or logged. Requires `PII_HASH_PEPPER` (throws if unset).
 */
export function deriveAadhaar(raw: string): DerivedAadhaar | { error: string } {
  const check = validateAadhaar(raw);
  if (!check.valid) return { error: check.error ?? "Invalid Aadhaar" };
  const cleaned = raw.replace(/\s|-/g, "");
  const hash = peppatedHash(cleaned);
  return { hash, masked: maskAadhaar(cleaned) };
}
