import crypto from "node:crypto";

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
