/**
 * Employee bank account number — encrypted at rest.
 *
 * ── What is protected, and what deliberately is not ─────────────────────────
 * `employees.bank_account_number` is payment-instruction data and is stored
 * KMS-envelope-encrypted, the same mechanism `lib/pan.ts` uses for PAN.
 *
 * `employees.bank_ifsc` stays PLAINTEXT by decision. An IFSC identifies a BRANCH,
 * is published by the RBI, and is not a secret; encrypting it would add a decrypt
 * at the only read site for no confidentiality gain.
 *
 * There is deliberately NO peppered match hash here, unlike PAN. PAN needs one
 * because its fixed 10-character format is brute-forceable under a plain digest
 * and because de-identified MATCHING is a real requirement. Nothing in this
 * product matches on account numbers, so a hash would be cost without a consumer.
 *
 * ── Legacy rows ─────────────────────────────────────────────────────────────
 * `decryptBankAccount` follows `decryptPan`'s precedent exactly: an envelope blob
 * is decrypted, and a pre-encryption PLAINTEXT value is passed through unchanged.
 * That is what makes this shippable with no backfill — and both test databases
 * hold zero populated rows today, so this is the cheapest this change will ever be.
 */

import { encryptSecretEnvelope, decryptSecretEnvelope, isEnvelope } from "../services/encryption";

export interface BankAccountColumns {
  bankAccountNumber: string;
  bankAccountMaskedDisplay: string;
}

/**
 * Visual mask for storage/display: last four digits retained.
 * Mirrors `maskBank` in `payslip-view.ts`, which masks at render time; this is the
 * stored form so a screen can show something without a decrypt round-trip.
 */
export function maskAccountNumber(raw: string): string {
  const cleaned = raw.trim();
  if (cleaned.length <= 4) return "*".repeat(cleaned.length);
  return `${"*".repeat(cleaned.length - 4)}${cleaned.slice(-4)}`;
}

/**
 * Columns for a write. Returns `{}` for an absent value so the caller can spread
 * it and leave the stored columns untouched.
 *
 * NEVER re-encrypts an already-encrypted value: if the incoming raw is itself an
 * envelope — a form that displayed ciphertext and posted it back unchanged — this
 * treats it as "no change". The guard lives here rather than at the three call
 * sites so double-encryption, which would make the account unrecoverable, is
 * impossible regardless of caller. Same reasoning as `panColumnsTolerant`.
 */
export async function bankAccountColumns(
  raw: string | null | undefined,
): Promise<BankAccountColumns | Record<string, never>> {
  if (raw == null || raw.trim() === "") return {};
  const cleaned = raw.trim();
  if (isEnvelope(cleaned)) return {};
  return {
    bankAccountNumber: await encryptSecretEnvelope(cleaned),
    bankAccountMaskedDisplay: maskAccountNumber(cleaned),
  };
}

/**
 * Read boundary. Decrypts an envelope back to the account number; passes a legacy
 * plaintext value through unchanged so existing rows keep working with no backfill.
 */
export async function decryptBankAccount(
  stored: string | null | undefined,
): Promise<string | null | undefined> {
  if (stored == null || stored === "") return stored;
  return isEnvelope(stored) ? decryptSecretEnvelope(stored) : stored;
}
