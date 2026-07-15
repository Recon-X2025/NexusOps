import crypto from "node:crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import bcrypt from "bcrypt";

/**
 * Pure, testable TOTP helpers backed by otplib + qrcode.
 *
 * The TOTP secret produced here is base32; callers are responsible for
 * encrypting it at rest (see services/encryption.ts `encryptSecret`).
 * Backup codes are returned in plaintext ONCE at generation time and stored
 * only as bcrypt hashes.
 */

const ISSUER = "CoheronConnect";

// ±1 step (30s) drift tolerance on verification.
authenticator.options = { window: 1 };

export interface TotpSecret {
  /** base32 TOTP secret (encrypt before persisting). */
  secret: string;
  /** otpauth:// URI to encode in a QR / enter manually. */
  otpauthUri: string;
}

/** Generate a fresh TOTP secret + otpauth URI for a given account label. */
export function generateTotpSecret(accountLabel: string): TotpSecret {
  const secret = authenticator.generateSecret();
  const otpauthUri = authenticator.keyuri(accountLabel, ISSUER, secret);
  return { secret, otpauthUri };
}

/** Render an otpauth URI as a PNG data URL for display in the enrollment UI. */
export function buildQrDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri);
}

/** Verify a 6-digit TOTP code against a base32 secret (±30s drift). */
export function verifyTotp(secret: string, code: string): boolean {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  try {
    return authenticator.verify({ token: clean, secret });
  } catch {
    return false;
  }
}

export interface BackupCodes {
  /** Human-readable codes returned to the user exactly once. */
  plaintext: string[];
  /** bcrypt hashes to persist (one per plaintext code, same order). */
  hashes: string[];
}

/** A single backup code: 10 hex chars, grouped as XXXXX-XXXXX for readability. */
function makeBackupCode(): string {
  const raw = crypto.randomBytes(5).toString("hex"); // 10 hex chars
  return `${raw.slice(0, 5)}-${raw.slice(5)}`.toLowerCase();
}

/** Generate `count` one-time backup codes plus their bcrypt hashes. */
export async function generateBackupCodes(count = 10): Promise<BackupCodes> {
  const plaintext = Array.from({ length: count }, () => makeBackupCode());
  const hashes = await Promise.all(plaintext.map((c) => bcrypt.hash(normalizeBackupCode(c), 12)));
  return { plaintext, hashes };
}

/** Normalize a user-supplied backup code for comparison (strip spaces, lowercase). */
export function normalizeBackupCode(code: string): string {
  return code.replace(/\s+/g, "").toLowerCase();
}

/**
 * Try to consume one backup code from a list of bcrypt hashes.
 * Returns the index of the matched hash, or -1 if none match.
 */
export async function matchBackupCode(code: string, hashes: string[]): Promise<number> {
  const candidate = normalizeBackupCode(code);
  if (!candidate) return -1;
  for (let i = 0; i < hashes.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await bcrypt.compare(candidate, hashes[i]!);
    if (ok) return i;
  }
  return -1;
}
