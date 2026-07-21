/**
 * KMS-backed envelope encryption tests (G15).
 *
 * Covers the secret-at-rest codec end-to-end without a DB:
 *   • Local provider (APP_SECRET-derived KEK): envelope round-trip for both
 *     integration configs and string secrets; the on-disk blob is the versioned
 *     "v2:" envelope, never the plaintext; a tampered ciphertext/DEK fails the
 *     AES-GCM auth tag.
 *   • Backward-compat: a legacy AES-256-CBC blob (pre-G15) still decrypts via the
 *     envelope reader, so no data migration is forced. The legacy sync readers
 *     refuse an envelope blob (they can't unwrap under async AWS KMS).
 *   • AWS provider: GenerateDataKey/Decrypt are driven against a stubbed KMS
 *     client — envelope round-trips, the wrapped DEK is the KMS CiphertextBlob,
 *     and a second decrypt of the same envelope is served from the DEK cache
 *     (no extra KMS Decrypt call).
 *   • Boot guard: KMS_PROVIDER=aws with no key id throws; local-in-prod without
 *     the opt-in throws; the happy paths don't.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";

process.env["APP_SECRET"] =
  process.env["APP_SECRET"] ?? "test-app-secret-for-kms-do-not-use-in-prod";

import {
  encryptIntegrationConfigEnvelope,
  decryptIntegrationConfigEnvelope,
  encryptSecretEnvelope,
  decryptSecretEnvelope,
  encryptIntegrationConfig,
  decryptIntegrationConfig,
  encryptSecret,
  decryptSecret,
  isEnvelope,
} from "../services/encryption";
import {
  getKmsProvider,
  resetKmsProviderForTests,
  assertKmsConfigured,
} from "../services/kms";

/** Snapshot + restore the env keys this suite mutates, per test. */
const ENV_KEYS = [
  "KMS_PROVIDER",
  "AWS_KMS_KEY_ID",
  "AWS_KMS_REGION",
  "AWS_REGION",
  "KMS_DEK_CACHE_TTL_MS",
  "NODE_ENV",
  "ALLOW_LOCAL_KMS_IN_PROD",
  "INTEGRATIONS_KMS_KEY_ID",
];

describe("KMS envelope encryption (G15)", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    // Default every test to the local provider unless it opts into aws.
    delete process.env["KMS_PROVIDER"];
    delete process.env["AWS_KMS_KEY_ID"];
    delete process.env["NODE_ENV"];
    delete process.env["ALLOW_LOCAL_KMS_IN_PROD"];
    resetKmsProviderForTests();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
    resetKmsProviderForTests();
    vi.restoreAllMocks();
  });

  // ── Local provider ─────────────────────────────────────────────────────────

  describe("local provider (APP_SECRET KEK)", () => {
    it("round-trips an integration config through the envelope", async () => {
      const cfg = { apiKey: "secret-123", host: "https://api.example.com", nested: "x" };
      const blob = await encryptIntegrationConfigEnvelope(cfg);

      expect(isEnvelope(blob)).toBe(true);
      expect(blob.startsWith("v2:")).toBe(true);
      // The plaintext secret must not appear anywhere in the stored blob.
      expect(blob).not.toContain("secret-123");
      expect(blob).not.toContain("api.example.com");

      const out = await decryptIntegrationConfigEnvelope(blob);
      expect(out).toEqual(cfg);
    });

    it("round-trips a plain string secret", async () => {
      const blob = await encryptSecretEnvelope("JBSWY3DPEHPK3PXP");
      expect(isEnvelope(blob)).toBe(true);
      expect(blob).not.toContain("JBSWY3DPEHPK3PXP");
      expect(await decryptSecretEnvelope(blob)).toBe("JBSWY3DPEHPK3PXP");
    });

    it("uses a fresh DEK per call — two encryptions of the same input differ", async () => {
      const a = await encryptSecretEnvelope("same");
      const b = await encryptSecretEnvelope("same");
      expect(a).not.toBe(b);
      expect(await decryptSecretEnvelope(a)).toBe("same");
      expect(await decryptSecretEnvelope(b)).toBe("same");
    });

    it("records the local KEK id in the envelope header", async () => {
      process.env["INTEGRATIONS_KMS_KEY_ID"] = "coheronconnect:test-kek";
      resetKmsProviderForTests();
      const blob = await encryptSecretEnvelope("v");
      const keyIdSeg = blob.split(":")[1]!;
      const keyId = Buffer.from(keyIdSeg, "base64url").toString("utf8");
      expect(keyId).toBe("coheronconnect:test-kek");
    });

    it("rejects a tampered ciphertext (AES-GCM auth-tag failure)", async () => {
      const blob = await encryptSecretEnvelope("do-not-tamper");
      const parts = blob.split(":");
      // Flip a byte in the ciphertext segment (last part).
      const ct = Buffer.from(parts[5]!, "base64");
      ct[0] = ct[0]! ^ 0xff;
      parts[5] = ct.toString("base64");
      await expect(decryptSecretEnvelope(parts.join(":"))).rejects.toThrow();
    });

    it("rejects a tampered wrapped-DEK", async () => {
      const blob = await encryptSecretEnvelope("dek-guard");
      const parts = blob.split(":");
      const wrapped = Buffer.from(parts[2]!, "base64");
      wrapped[0] = wrapped[0]! ^ 0xff;
      parts[2] = wrapped.toString("base64");
      await expect(decryptSecretEnvelope(parts.join(":"))).rejects.toThrow();
    });
  });

  // ── Backward-compat with legacy AES-256-CBC ─────────────────────────────────

  describe("legacy (pre-G15) compatibility", () => {
    it("the envelope reader still decrypts a legacy CBC config blob", async () => {
      const cfg = { apiKey: "legacy-key" };
      const legacy = encryptIntegrationConfig(cfg); // sync CBC path
      expect(isEnvelope(legacy)).toBe(false);
      expect(await decryptIntegrationConfigEnvelope(legacy)).toEqual(cfg);
    });

    it("the envelope reader still decrypts a legacy CBC secret blob", async () => {
      const legacy = encryptSecret("legacy-seed");
      expect(isEnvelope(legacy)).toBe(false);
      expect(await decryptSecretEnvelope(legacy)).toBe("legacy-seed");
    });

    it("the legacy sync reader refuses an envelope blob", async () => {
      const env = await encryptSecretEnvelope("x");
      expect(() => decryptSecret(env)).toThrow(/envelope/i);
      const cfgEnv = await encryptIntegrationConfigEnvelope({ a: "b" });
      expect(() => decryptIntegrationConfig(cfgEnv)).toThrow(/envelope/i);
    });

    it("legacy sync round-trip still works (unchanged callers)", () => {
      const cfg = { token: "abc" };
      expect(decryptIntegrationConfig(encryptIntegrationConfig(cfg))).toEqual(cfg);
      expect(decryptSecret(encryptSecret("s"))).toBe("s");
    });
  });

  // ── AWS provider (stubbed KMS client) ───────────────────────────────────────

  describe("aws provider (stubbed KMS)", () => {
    /**
     * Simulate AWS KMS: a DEK is a random 32-byte key; the "wrapped" form is that
     * key AES-256-CBC-sealed under a fixed test CMK, base64'd — so GenerateDataKey
     * and Decrypt are self-consistent and we can assert the wrapped blob really is
     * the KMS CiphertextBlob.
     */
    const CMK = crypto.createHash("sha256").update("test-cmk").digest();
    let decryptCalls = 0;

    function wrap(plain: Buffer): Buffer {
      const iv = crypto.randomBytes(16);
      const c = crypto.createCipheriv("aes-256-cbc", CMK, iv);
      return Buffer.concat([iv, c.update(plain), c.final()]);
    }
    function unwrap(blob: Buffer): Buffer {
      const iv = blob.subarray(0, 16);
      const d = crypto.createDecipheriv("aes-256-cbc", CMK, iv);
      return Buffer.concat([d.update(blob.subarray(16)), d.final()]);
    }

    beforeEach(() => {
      decryptCalls = 0;
      process.env["KMS_PROVIDER"] = "aws";
      process.env["AWS_KMS_KEY_ID"] = "arn:aws:kms:us-east-1:111122223333:key/abcd-1234";
      process.env["AWS_KMS_REGION"] = "us-east-1";
      resetKmsProviderForTests();

      // Stub the KMSClient.send to answer GenerateDataKey + Decrypt commands.
      const provider = getKmsProvider() as unknown as {
        client: { send: (cmd: unknown) => Promise<unknown> };
      };
      vi.spyOn(provider.client, "send").mockImplementation(async (cmd: any) => {
        const name = cmd?.constructor?.name;
        if (name === "GenerateDataKeyCommand") {
          const plaintext = crypto.randomBytes(32);
          return {
            KeyId: process.env["AWS_KMS_KEY_ID"],
            Plaintext: new Uint8Array(plaintext),
            CiphertextBlob: new Uint8Array(wrap(plaintext)),
          };
        }
        if (name === "DecryptCommand") {
          decryptCalls++;
          const blob = Buffer.from(cmd.input.CiphertextBlob);
          return { Plaintext: new Uint8Array(unwrap(blob)) };
        }
        throw new Error(`unexpected KMS command ${name}`);
      });
    });

    it("round-trips a config via KMS GenerateDataKey + Decrypt", async () => {
      const cfg = { apiKey: "aws-secret", region: "ap-south-1" };
      const blob = await encryptIntegrationConfigEnvelope(cfg);
      expect(isEnvelope(blob)).toBe(true);
      expect(blob).not.toContain("aws-secret");

      const out = await decryptIntegrationConfigEnvelope(blob);
      expect(out).toEqual(cfg);
      expect(decryptCalls).toBe(0); // first decrypt is served from the generate-side cache
    });

    it("embeds the real KMS key id in the envelope header", async () => {
      const blob = await encryptSecretEnvelope("v");
      const keyId = Buffer.from(blob.split(":")[1]!, "base64url").toString("utf8");
      expect(keyId).toBe("arn:aws:kms:us-east-1:111122223333:key/abcd-1234");
    });

    it("caches the unwrapped DEK across repeated decrypts of the same blob", async () => {
      const blob = await encryptSecretEnvelope("cache-me");
      resetKmsProviderForTests(); // drop the generate-side cache; force a Decrypt

      // Re-stub against the fresh provider instance.
      const provider = getKmsProvider() as unknown as {
        client: { send: (cmd: unknown) => Promise<unknown> };
      };
      vi.spyOn(provider.client, "send").mockImplementation(async (cmd: any) => {
        if (cmd?.constructor?.name === "DecryptCommand") {
          decryptCalls++;
          return { Plaintext: new Uint8Array(unwrap(Buffer.from(cmd.input.CiphertextBlob))) };
        }
        throw new Error("unexpected");
      });

      expect(await decryptSecretEnvelope(blob)).toBe("cache-me");
      expect(await decryptSecretEnvelope(blob)).toBe("cache-me");
      expect(decryptCalls).toBe(1); // second decrypt served from cache
    });
  });

  // ── Boot guard ───────────────────────────────────────────────────────────

  describe("assertKmsConfigured boot guard", () => {
    it("throws when KMS_PROVIDER=aws but no key id is set", () => {
      process.env["KMS_PROVIDER"] = "aws";
      delete process.env["AWS_KMS_KEY_ID"];
      resetKmsProviderForTests();
      expect(() => assertKmsConfigured()).toThrow(/AWS_KMS_KEY_ID/);
    });

    it("throws for local provider in production without the opt-in", () => {
      process.env["KMS_PROVIDER"] = "local";
      process.env["NODE_ENV"] = "production";
      delete process.env["ALLOW_LOCAL_KMS_IN_PROD"];
      resetKmsProviderForTests();
      expect(() => assertKmsConfigured()).toThrow(/production/i);
    });

    it("accepts local provider in production when explicitly opted in", () => {
      process.env["KMS_PROVIDER"] = "local";
      process.env["NODE_ENV"] = "production";
      process.env["ALLOW_LOCAL_KMS_IN_PROD"] = "true";
      resetKmsProviderForTests();
      expect(() => assertKmsConfigured()).not.toThrow();
    });

    it("accepts the local provider in dev (default)", () => {
      delete process.env["KMS_PROVIDER"];
      delete process.env["NODE_ENV"];
      resetKmsProviderForTests();
      expect(() => assertKmsConfigured()).not.toThrow();
      expect(getKmsProvider().kind).toBe("local");
    });

    it("accepts aws provider when a key id is present", () => {
      process.env["KMS_PROVIDER"] = "aws";
      process.env["AWS_KMS_KEY_ID"] = "alias/coheron-connect";
      resetKmsProviderForTests();
      expect(() => assertKmsConfigured()).not.toThrow();
      expect(getKmsProvider().kind).toBe("aws");
    });
  });
});
