import crypto from "node:crypto";
import { getKmsProvider } from "./kms";

/**
 * Secret-at-rest encryption for integration configs + TOTP seeds.
 *
 * Two on-disk formats coexist, distinguished by their prefix so decrypt can
 * auto-detect and existing rows keep working across the KMS rollout (G15):
 *
 *   • Envelope (current):  "v2:" <keyId> ":" <wrappedDekB64> ":" <ivB64> ":"
 *                          <tagB64> ":" <ctB64>
 *       A fresh 256-bit DEK (minted + wrapped by the KMS provider) AES-256-GCM
 *       encrypts the payload; only the *wrapped* DEK is stored. This is the path
 *       every write now takes (see the *Envelope helpers below).
 *
 *   • Legacy (pre-G15):    "<ivHex>:<dataHex>"  — AES-256-CBC under an
 *       APP_SECRET-derived key. Still *readable* so no data migration is forced;
 *       the sync encrypt* functions below also still emit it for callers that
 *       have not moved to the async envelope API.
 *
 * The KMS provider (local APP_SECRET-derived KEK, or real AWS KMS) is selected
 * by env — see services/kms.ts.
 */

const ENVELOPE_PREFIX = "v2";

// ── Legacy AES-256-CBC (APP_SECRET) — retained for read-compat + sync callers ─

function legacyKey(): Buffer {
  const appSecret = process.env["APP_SECRET"];
  if (!appSecret) throw new Error("APP_SECRET is not configured");
  return crypto.createHash("sha256").update(appSecret).digest();
}

function legacyEncrypt(plain: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", legacyKey(), iv);
  const data = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
  return `${iv.toString("hex")}:${data.toString("hex")}`;
}

function legacyDecrypt(encrypted: string): string {
  const [ivHex, dataHex] = encrypted.split(":");
  if (!ivHex || !dataHex) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", legacyKey(), iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** True when a stored blob is the KMS envelope format rather than legacy CBC. */
export function isEnvelope(encrypted: string): boolean {
  return encrypted.startsWith(`${ENVELOPE_PREFIX}:`);
}

// ── Envelope (KMS DEK + AES-256-GCM) ─────────────────────────────────────────

/**
 * Mint a DEK from the KMS provider, AES-256-GCM the plaintext under it, and
 * serialise the envelope. Only the wrapped DEK is embedded — the plaintext DEK
 * never leaves this process.
 */
async function envelopeEncrypt(plain: string): Promise<string> {
  const dek = await getKmsProvider().generateDataKey();
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", dek.plaintext, iv);
    const ct = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      ENVELOPE_PREFIX,
      encodeSegment(dek.keyId),
      dek.wrapped,
      iv.toString("base64"),
      tag.toString("base64"),
      ct.toString("base64"),
    ].join(":");
  } finally {
    dek.plaintext.fill(0); // scrub the plaintext DEK from memory
  }
}

async function envelopeDecrypt(encrypted: string): Promise<string> {
  const parts = encrypted.split(":");
  if (parts.length !== 6 || parts[0] !== ENVELOPE_PREFIX) {
    throw new Error("Invalid envelope format");
  }
  const [, keyIdEnc, wrapped, ivB64, tagB64, ctB64] = parts;
  const keyId = decodeSegment(keyIdEnc!);
  const dek = await getKmsProvider().unwrapDataKey(wrapped!, keyId);
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      dek,
      Buffer.from(ivB64!, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
    const out = Buffer.concat([
      decipher.update(Buffer.from(ctB64!, "base64")),
      decipher.final(),
    ]);
    return out.toString("utf8");
  } finally {
    dek.fill(0);
  }
}

/** keyId may contain ':' (e.g. an ARN) — url-safe-base64 it so the ':' split is unambiguous. */
function encodeSegment(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
function decodeSegment(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

// ── Public API: integration config ───────────────────────────────────────────

/**
 * Envelope-encrypt an integration config (KMS-wrapped DEK + AES-GCM).
 * Preferred write path for integration secrets.
 */
export async function encryptIntegrationConfigEnvelope(
  config: Record<string, unknown>,
): Promise<string> {
  return envelopeEncrypt(JSON.stringify(config));
}

/**
 * Decrypt an integration config, transparently handling both the envelope and
 * the legacy CBC format so pre-G15 rows keep decrypting.
 */
export async function decryptIntegrationConfigEnvelope(
  encrypted: string,
): Promise<Record<string, string>> {
  const json = isEnvelope(encrypted) ? await envelopeDecrypt(encrypted) : legacyDecrypt(encrypted);
  return JSON.parse(json) as Record<string, string>;
}

/** Envelope-encrypt a plain string secret (e.g. a TOTP base32 seed). */
export async function encryptSecretEnvelope(plain: string): Promise<string> {
  return envelopeEncrypt(plain);
}

/** Decrypt a string secret, handling both envelope and legacy formats. */
export async function decryptSecretEnvelope(encrypted: string): Promise<string> {
  return isEnvelope(encrypted) ? envelopeDecrypt(encrypted) : legacyDecrypt(encrypted);
}

// ── Legacy sync API (kept for read-compat + any sync caller) ─────────────────

/**
 * Legacy synchronous AES-256-CBC encrypt. Retained so callers that cannot be
 * async still function; new code should prefer encryptIntegrationConfigEnvelope.
 */
export function encryptIntegrationConfig(config: Record<string, unknown>): string {
  return legacyEncrypt(JSON.stringify(config));
}

/** Legacy synchronous decrypt. Auto-detects envelope blobs is NOT possible here
 * (envelope unwrap can be async under AWS KMS); use the *Envelope variant for
 * blobs that may be envelope-format. Kept for legacy CBC rows + tests. */
export function decryptIntegrationConfig(encrypted: string): Record<string, string> {
  if (isEnvelope(encrypted)) {
    throw new Error(
      "decryptIntegrationConfig received an envelope blob; use decryptIntegrationConfigEnvelope",
    );
  }
  return JSON.parse(legacyDecrypt(encrypted)) as Record<string, string>;
}

export function encryptSecret(plain: string): string {
  return legacyEncrypt(plain);
}

export function decryptSecret(encrypted: string): string {
  if (isEnvelope(encrypted)) {
    throw new Error("decryptSecret received an envelope blob; use decryptSecretEnvelope");
  }
  return legacyDecrypt(encrypted);
}

// ── HMAC verify (unchanged) ──────────────────────────────────────────────────

/**
 * Constant-time compare of an HMAC signature header against the body.
 * Used by webhook receivers (WhatsApp, Razorpay, eMudhra).
 */
export function verifyHmac(secret: string, body: string, signatureHex: string): boolean {
  const computed = crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (computed.length !== signatureHex.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(signatureHex, "hex"));
}
