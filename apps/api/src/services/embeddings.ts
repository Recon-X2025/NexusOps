/**
 * embeddings.ts — lightweight, deterministic embeddings without external models.
 *
 * We intentionally avoid a heavy ML dependency in the core API. Instead we use a
 * feature-hashing ("hashing trick") vector that is:
 * - deterministic (stable across deploys)
 * - fast (pure JS, no network)
 * - good enough to power basic semantic-ish similarity until a proper embedding
 *   model is introduced behind a feature flag.
 *
 * Output is a unit-length float vector (L2 normalised).
 */
import crypto from "node:crypto";

export function embedTextHashing(text: string, dims = 256): number[] {
  const safeDims = Math.max(8, Math.floor(dims || 0));
  const cleaned = (text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const vec = new Array<number>(safeDims).fill(0);
  if (!cleaned) return vec;

  const tokens = cleaned.split(" ").filter(Boolean).slice(0, 2048);
  for (const tok of tokens) {
    // 32-bit hash via sha1(prefix) → read first 4 bytes.
    const h = crypto.createHash("sha1").update(tok).digest();
    const n = h.readUInt32BE(0);
    const idx = n % safeDims;
    const sign = (n & 1) === 0 ? 1 : -1;
    vec[idx] = (vec[idx] ?? 0) + sign;
  }

  // L2 normalise
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] ?? 0) / norm;
  return vec;
}

