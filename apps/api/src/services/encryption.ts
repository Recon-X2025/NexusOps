import crypto from "node:crypto";

/**
 * Encrypts integration config to AES-256-CBC using APP_SECRET-derived key.
 * Format: <ivHex>:<dataHex> — matches decryptIntegrationConfig.
 *
 * In production this should wrap a per-tenant DEK with a KMS key — that path
 * is already plumbed via integrations.kmsKeyId / dekWrappedB64. The local
 * AES path remains for dev / sandbox.
 */
export function encryptIntegrationConfig(config: Record<string, unknown>): string {
  const appSecret = process.env["APP_SECRET"];
  if (!appSecret) throw new Error("APP_SECRET is not configured");
  const key = crypto.createHash("sha256").update(appSecret).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const data = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(config), "utf8")),
    cipher.final(),
  ]);
  return `${iv.toString("hex")}:${data.toString("hex")}`;
}

export function decryptIntegrationConfig(encrypted: string): Record<string, string> {
  const appSecret = process.env["APP_SECRET"];
  if (!appSecret) throw new Error("APP_SECRET is not configured");
  const key = crypto.createHash("sha256").update(appSecret).digest();
  const [ivHex, dataHex] = encrypted.split(":");
  if (!ivHex || !dataHex) throw new Error("Invalid encrypted config format");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as Record<string, string>;
}

/**
 * Constant-time compare of an HMAC signature header against the body.
 * Used by webhook receivers (WhatsApp, Razorpay, eMudhra).
 */
export function verifyHmac(secret: string, body: string, signatureHex: string): boolean {
  const computed = crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (computed.length !== signatureHex.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(signatureHex, "hex"));
}
