import DOMPurify from 'isomorphic-dompurify';

// ── Prototype-pollution protection ────────────────────────────────────────────
//
// These three keys have special meaning in the JavaScript object model.
// Allowing them in parsed JSON payloads can:
//   - Pollute Object.prototype ("__proto__")
//   - Override a class's constructor reference ("constructor")
//   - Shadow the prototype chain ("prototype")
//
// We strip them recursively from every incoming request body before the
// payload reaches Zod or any router handler, so a malicious payload like
//   { "__proto__": { "isAdmin": true } }
// never reaches application code.
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Recursively removes prototype-pollution keys from an arbitrary value.
 * - Plain objects: dangerous keys are dropped, all other keys are recursed.
 * - Arrays: every element is recursed.
 * - Primitives / null: returned as-is (nothing to sanitize).
 *
 * The function is intentionally non-destructive: it returns a new object
 * tree rather than mutating the original, so it is safe to call on frozen
 * or shared objects.
 */
export function sanitizeInput<T>(value: T): T {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map(sanitizeInput) as unknown as T;
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as object)) {
      if (!DANGEROUS_KEYS.has(key)) {
        result[key] = sanitizeInput((value as Record<string, unknown>)[key]);
      }
    }
    return result as T;
  }

  // string / number / boolean / bigint / symbol — safe primitives
  return value;
}

export function sanitizeHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li',
                    'h1', 'h2', 'h3', 'a', 'code', 'pre', 'blockquote', 'table',
                    'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}

export function sanitizeText(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}
