/** Fields that must never appear in audit change logs. */
const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "password_hash",
  "token",
  "secret",
  "key",
  "apiKey",
  "api_key",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
]);

/** Recursively redact sensitive keys for audit_logs.changes JSON. */
export function sanitizeForAudit(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForAudit(item));
  }
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) {
      sanitized[k] = "[REDACTED]";
    } else if (v && typeof v === "object") {
      sanitized[k] = sanitizeForAudit(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}
