import crypto from "node:crypto";
import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from "@aws-sdk/client-kms";

/**
 * KMS abstraction for envelope encryption (G15).
 *
 * The platform encrypts integration secrets / TOTP seeds with a per-payload
 * 256-bit Data Encryption Key (DEK). The DEK is never persisted in the clear:
 * it is *wrapped* (encrypted) by a Key-Encryption-Key (KEK) that lives in the
 * KMS provider, and only the wrapped form is stored alongside the ciphertext.
 * Decryption asks the provider to unwrap the DEK, then AES-GCM-decrypts locally.
 *
 * Two providers, selected by `KMS_PROVIDER`:
 *   - "local"  (default) — the KEK is derived from `APP_SECRET`; DEK wrapping is
 *                a local AES-256-GCM key-wrap. Requires no cloud credentials, so
 *                dev / test / self-hosted deployments work out of the box and
 *                stay fully offline.
 *   - "aws"    — the KEK is a real AWS KMS CMK (`AWS_KMS_KEY_ID`). DEKs are
 *                minted via KMS GenerateDataKey and unwrapped via KMS Decrypt.
 *                Unwrapped DEKs are cached in-process (TTL-bounded) so a burst
 *                of decrypts doesn't hit KMS once per row.
 *
 * Both providers return the same shape, so the envelope codec in
 * `services/encryption.ts` is provider-agnostic.
 */

export interface DataKey {
  /** 32-byte plaintext DEK for AES-256-GCM. Never persisted. */
  plaintext: Buffer;
  /** Provider-wrapped DEK (base64) — safe to persist next to the ciphertext. */
  wrapped: string;
  /** Logical key id the DEK was wrapped under (for audit + rotation). */
  keyId: string;
}

export interface KmsProvider {
  readonly kind: "local" | "aws";
  /** The KEK id this provider wraps under (audit / envelope header). */
  keyId(): string;
  /** Mint a fresh 256-bit DEK + its wrapped form. */
  generateDataKey(): Promise<DataKey>;
  /** Unwrap a previously-wrapped DEK back to its 32-byte plaintext. */
  unwrapDataKey(wrapped: string, keyId: string): Promise<Buffer>;
}

// ── Local provider (APP_SECRET-derived KEK) ──────────────────────────────────

/**
 * Wraps DEKs with an AES-256-GCM key derived from APP_SECRET. The wrapped blob
 * is `iv(12) || tag(16) || ciphertext(32)` base64-encoded. This is a real
 * authenticated key-wrap (not a fingerprint), so a tampered wrapped-DEK fails
 * to unwrap rather than silently yielding garbage.
 */
class LocalKmsProvider implements KmsProvider {
  readonly kind = "local" as const;
  private readonly kekId: string;

  constructor(kekId: string) {
    this.kekId = kekId;
  }

  private kek(): Buffer {
    const appSecret = process.env["APP_SECRET"];
    if (!appSecret) throw new Error("APP_SECRET is not configured");
    // Domain-separate the KEK from any other APP_SECRET-derived key.
    return crypto.createHash("sha256").update(`kms-kek:${appSecret}`).digest();
  }

  keyId(): string {
    return this.kekId;
  }

  async generateDataKey(): Promise<DataKey> {
    const plaintext = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.kek(), iv);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const wrapped = Buffer.concat([iv, tag, ct]).toString("base64");
    return { plaintext, wrapped, keyId: this.kekId };
  }

  async unwrapDataKey(wrapped: string): Promise<Buffer> {
    const blob = Buffer.from(wrapped, "base64");
    if (blob.length !== 12 + 16 + 32) {
      throw new Error("Invalid wrapped DEK length");
    }
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const ct = blob.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.kek(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}

// ── AWS provider (real KMS CMK) ──────────────────────────────────────────────

interface CacheEntry {
  plaintext: Buffer;
  expiresAt: number;
}

class AwsKmsProvider implements KmsProvider {
  readonly kind = "aws" as const;
  private readonly kmsKeyId: string;
  private readonly client: KMSClient;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;

  constructor(kmsKeyId: string, region: string, cacheTtlMs: number) {
    this.kmsKeyId = kmsKeyId;
    this.client = new KMSClient({ region });
    this.cacheTtlMs = cacheTtlMs;
  }

  keyId(): string {
    return this.kmsKeyId;
  }

  async generateDataKey(): Promise<DataKey> {
    const res = await this.client.send(
      new GenerateDataKeyCommand({ KeyId: this.kmsKeyId, KeySpec: "AES_256" }),
    );
    if (!res.Plaintext || !res.CiphertextBlob) {
      throw new Error("AWS KMS GenerateDataKey returned no key material");
    }
    const plaintext = Buffer.from(res.Plaintext);
    const wrapped = Buffer.from(res.CiphertextBlob).toString("base64");
    // Cache an independent COPY keyed by the wrapped ciphertext so decrypts of
    // the same envelope are free. The copy matters: the caller (envelope codec)
    // zeroes the returned plaintext after use, so the cache must not share the
    // same backing buffer or the cached key would be scrubbed too.
    this.cache.set(wrapped, {
      plaintext: Buffer.from(plaintext),
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    return { plaintext, wrapped, keyId: res.KeyId ?? this.kmsKeyId };
  }

  async unwrapDataKey(wrapped: string): Promise<Buffer> {
    const hit = this.cache.get(wrapped);
    // Hand back a copy so the caller scrubbing its DEK doesn't wipe the cache.
    if (hit && hit.expiresAt > Date.now()) return Buffer.from(hit.plaintext);
    if (hit) this.cache.delete(wrapped);

    const res = await this.client.send(
      new DecryptCommand({ CiphertextBlob: Buffer.from(wrapped, "base64") }),
    );
    if (!res.Plaintext) throw new Error("AWS KMS Decrypt returned no plaintext");
    const plaintext = Buffer.from(res.Plaintext);
    this.cache.set(wrapped, {
      plaintext: Buffer.from(plaintext),
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    return plaintext;
  }
}

// ── Provider resolution + boot guard ─────────────────────────────────────────

let cachedProvider: KmsProvider | null = null;

function defaultLocalKeyId(): string {
  return process.env["INTEGRATIONS_KMS_KEY_ID"] ?? "coheronconnect:local-dev-kek";
}

/**
 * Build (and memoise) the configured KMS provider. `KMS_PROVIDER=aws` requires
 * `AWS_KMS_KEY_ID` (+ region); anything else falls back to the local provider.
 */
export function getKmsProvider(): KmsProvider {
  if (cachedProvider) return cachedProvider;

  const kind = (process.env["KMS_PROVIDER"] ?? "local").toLowerCase();
  if (kind === "aws") {
    const keyId = process.env["AWS_KMS_KEY_ID"];
    if (!keyId) {
      throw new Error(
        "KMS_PROVIDER=aws requires AWS_KMS_KEY_ID (the CMK key id / ARN / alias)",
      );
    }
    const region =
      process.env["AWS_KMS_REGION"] ?? process.env["AWS_REGION"] ?? "us-east-1";
    const ttl = Number(process.env["KMS_DEK_CACHE_TTL_MS"] ?? 300_000);
    cachedProvider = new AwsKmsProvider(keyId, region, Number.isFinite(ttl) ? ttl : 300_000);
    return cachedProvider;
  }

  cachedProvider = new LocalKmsProvider(defaultLocalKeyId());
  return cachedProvider;
}

/** Test hook — drop the memoised provider so env changes take effect. */
export function resetKmsProviderForTests(): void {
  cachedProvider = null;
}

/**
 * Boot guard (mirrors assertPiiHashConfigured). In production a misconfigured
 * KMS provider must fail the process at startup, not at the first encrypt call.
 */
export function assertKmsConfigured(): void {
  const kind = (process.env["KMS_PROVIDER"] ?? "local").toLowerCase();
  if (kind === "aws" && !process.env["AWS_KMS_KEY_ID"]) {
    throw new Error(
      "KMS_PROVIDER=aws but AWS_KMS_KEY_ID is not set. The API refuses to start " +
        "without a KMS key id to wrap data-encryption keys.",
    );
  }
  if (kind === "local" && process.env["NODE_ENV"] === "production") {
    // Local KEK in prod is allowed only when explicitly opted in — otherwise a
    // real KMS provider is expected for a production deployment.
    if (process.env["ALLOW_LOCAL_KMS_IN_PROD"] !== "true") {
      throw new Error(
        "KMS_PROVIDER=local in production. Set KMS_PROVIDER=aws with AWS_KMS_KEY_ID, " +
          "or set ALLOW_LOCAL_KMS_IN_PROD=true to accept APP_SECRET-derived key wrapping.",
      );
    }
  }
  // Force construction so an invalid config throws here, at boot.
  getKmsProvider();
}
