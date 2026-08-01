/**
 * PAN encryption-at-rest (H-2) fairness test.
 *
 * The raw PAN is a statutory necessity (TDS / Form 16 / GSTR) so it is retained — but it must be
 * stored ENCRYPTED, never as plaintext. This pins the write/read boundary in `lib/pan.ts`:
 *
 *   • `panColumns` stamps the stored `pan` column as a KMS `v2:` envelope blob, NOT the plaintext.
 *   • The deterministic match aids (`panMaskedHash` / `panMaskedDisplay`) are derived from the
 *     *plaintext* before encryption, so equality/de-dup on the hash keeps working even though the
 *     ciphertext itself is non-deterministic (fresh DEK per call).
 *   • `decryptPan` reads an envelope blob back to the plaintext PAN, and passes a LEGACY
 *     pre-encryption plaintext PAN through unchanged — so existing rows read with no backfill.
 *
 * DB-free: exercises the codec boundary directly under the local KMS provider.
 */
import { describe, it, expect } from "vitest";

// derivePan needs the pepper; the local KMS provider needs APP_SECRET. Set both before import.
process.env["PII_HASH_PEPPER"] =
  process.env["PII_HASH_PEPPER"] ?? "test-pii-pepper-do-not-use-in-prod";
process.env["APP_SECRET"] =
  process.env["APP_SECRET"] ?? "test-app-secret-for-kms-do-not-use-in-prod";

import { panColumns, decryptPan } from "../lib/pan";
import { isEnvelope } from "../services/encryption";

const RAW_PAN = "ABCDE1234F";

describe("PAN encryption-at-rest (H-2)", () => {
  it("stores the raw PAN as a v2 envelope blob, never plaintext", async () => {
    const cols = await panColumns(RAW_PAN);
    expect("pan" in cols).toBe(true);
    const stored = (cols as { pan: string }).pan;

    // The stored value is the versioned KMS envelope, and the plaintext PAN must not appear in it.
    expect(isEnvelope(stored)).toBe(true);
    expect(stored.startsWith("v2:")).toBe(true);
    expect(stored).not.toContain(RAW_PAN);
  });

  it("keeps the match aids deterministic (derived from plaintext, not the ciphertext)", async () => {
    const a = await panColumns(RAW_PAN);
    const b = await panColumns(RAW_PAN.toLowerCase()); // normalised to upper before hashing

    // Fresh DEK per call → the two ciphertexts differ …
    expect((a as { pan: string }).pan).not.toBe((b as { pan: string }).pan);
    // … but the hash + display mask are stable, so equality/de-dup on the hash still works.
    expect((a as { panMaskedHash: string }).panMaskedHash).toBe(
      (b as { panMaskedHash: string }).panMaskedHash,
    );
    expect((a as { panMaskedDisplay: string }).panMaskedDisplay).toBe(
      (b as { panMaskedDisplay: string }).panMaskedDisplay,
    );
  });

  it("decryptPan round-trips an envelope blob back to the plaintext PAN", async () => {
    const cols = await panColumns(RAW_PAN);
    const stored = (cols as { pan: string }).pan;
    expect(await decryptPan(stored)).toBe(RAW_PAN);
  });

  it("reads a legacy pre-encryption plaintext PAN through unchanged (no backfill needed)", async () => {
    // A row written before H-2 holds a bare plaintext PAN, not an envelope.
    expect(isEnvelope(RAW_PAN)).toBe(false);
    expect(await decryptPan(RAW_PAN)).toBe(RAW_PAN);
  });

  it("passes null / empty stored values through untouched", async () => {
    expect(await decryptPan(null)).toBe(null);
    expect(await decryptPan(undefined)).toBe(undefined);
    expect(await decryptPan("")).toBe("");
  });

  it("returns no columns for an absent PAN", async () => {
    expect(await panColumns(null)).toEqual({});
    expect(await panColumns(undefined)).toEqual({});
    expect(await panColumns("  ")).toEqual({});
  });
});
