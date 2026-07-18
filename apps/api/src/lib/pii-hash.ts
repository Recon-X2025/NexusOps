/**
 * Peppered PII hashing primitive (DPDP minimisation).
 *
 * Government identifiers (Aadhaar, PAN) have small, fixed, highly-predictable formats. A plain
 * SHA-256 of such a value is trivially brute-forceable offline (enumerate the format, hash each
 * candidate, compare). That makes a plain hash a poor de-identifier for these fields.
 *
 * To make the stored hash a real match key that resists brute force, we use a KEYED hash —
 * HMAC-SHA256 with a server-side secret ("pepper"). Same input → same hash (so the value still
 * works as a de-dup / match key within the tenant), but without the pepper an attacker cannot
 * enumerate candidates, because they never see the key.
 *
 * SECRET MANAGEMENT — this is effectively a mini-KMS key:
 *   - `PII_HASH_PEPPER` MUST be set in the environment; there is NO silent fallback. Every hash
 *     call throws if it is missing, so a misconfigured deploy fails loudly rather than silently
 *     writing weak/plain hashes.
 *   - Rotating or losing the pepper ORPHANS every previously-stored hash (matches break), exactly
 *     like losing an encryption key. It must be backed up and treated as a long-lived secret.
 *   - This is the intended seam to fold into KMS later (see docs/DPDP_ERASURE_STRATEGY.md §1
 *     decision #3): a KMS-held key is a drop-in replacement for the env pepper.
 *
 * The pepper is read once at first use (not module-load) so tests can set it before the first
 * hash without import-order coupling.
 */
import { createHmac } from "node:crypto";

/** Env var holding the server-side pepper. Never stored in the DB. */
const PEPPER_ENV = "PII_HASH_PEPPER";

/**
 * Resolve the pepper from the environment. Throws if unset/empty so a misconfigured deployment
 * fails loudly instead of writing weak hashes.
 */
function getPepper(): string {
  const pepper = process.env[PEPPER_ENV];
  if (!pepper) {
    throw new Error(
      `${PEPPER_ENV} is not set. It is required to hash government identifiers (Aadhaar/PAN). ` +
        `Set it to a long random secret; rotating or losing it orphans all stored hashes.`,
    );
  }
  return pepper;
}

/**
 * Keyed HMAC-SHA256 (hex) of `value` under the server pepper. This is the single hashing
 * primitive for all minimised government identifiers. Deterministic for a fixed pepper, so it
 * doubles as a within-tenant match/de-dup key; brute-force-resistant because the key is secret.
 */
export function peppatedHash(value: string): string {
  return createHmac("sha256", getPepper()).update(value).digest("hex");
}

/** True when the pepper is configured. Callers/scripts can pre-flight before a bulk backfill. */
export function isPiiHashConfigured(): boolean {
  return Boolean(process.env[PEPPER_ENV]);
}

/**
 * Boot-time guard: throw if the pepper is missing so a misconfigured deploy is stopped at STARTUP,
 * never at a live org's first PII write. Call once during server bootstrap (before listen). The
 * caller decides how to react (log fatal + process.exit), mirroring the DATABASE_PROVIDER check.
 */
export function assertPiiHashConfigured(): void {
  if (!isPiiHashConfigured()) {
    throw new Error(
      `${PEPPER_ENV} is not set. The API refuses to start without it because government ` +
        `identifiers (Aadhaar/PAN) are hashed with a peppered HMAC — starting without the pepper ` +
        `would let the first PII write fail at runtime. Set ${PEPPER_ENV} to a long random secret ` +
        `(back it up; rotating or losing it orphans all stored hashes).`,
    );
  }
}
