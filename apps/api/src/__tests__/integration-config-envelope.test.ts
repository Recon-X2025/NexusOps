/**
 * Integration-config envelope end-to-end (G15).
 *
 * Proves the *router* write path — not just the codec — seals integration
 * secrets with KMS envelope encryption:
 *   • upsertIntegration stores a "v2:" envelope in configEncrypted (never the
 *     plaintext webhook URL) and stamps kmsKeyId + dekWrappedB64 for audit.
 *   • The stored blob round-trips back to the original config via the envelope
 *     reader.
 *   • A legacy CBC row seeded directly still decrypts through the same reader,
 *     so pre-G15 integrations keep working after the rollout.
 */
import { describe, it, expect, beforeEach } from "vitest";

process.env["APP_SECRET"] =
  process.env["APP_SECRET"] ?? "test-app-secret-for-kms-e2e-do-not-use-in-prod";

import { seedFullOrg, testDb, createMockContext } from "./helpers";
import { integrationsRouter } from "../routers/integrations";
import {
  decryptIntegrationConfigEnvelope,
  encryptIntegrationConfig,
  isEnvelope,
} from "../services/encryption";
import { integrations, eq, and } from "@coheronconnect/db";

describe("Integration config envelope (G15)", () => {
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
  });

  const rowFor = async (provider: string) => {
    const [row] = await testDb()
      .select()
      .from(integrations)
      .where(and(eq(integrations.orgId, orgId), eq(integrations.provider, provider)));
    return row!;
  };

  it("upsertIntegration seals the config as a KMS envelope, not plaintext", async () => {
    const caller = integrationsRouter.createCaller(createMockContext(adminId, orgId));
    const webhookUrl = "https://hooks.slack.com/services/T000/B000/secret-token-xyz";

    await caller.upsertIntegration({
      provider: "slack",
      config: { webhookUrl, defaultChannel: "#alerts" },
    });

    const row = await rowFor("slack");
    expect(row.status).toBe("connected");
    expect(row.configEncrypted).toBeTruthy();
    expect(isEnvelope(row.configEncrypted!)).toBe(true);
    // The plaintext secret must never appear in the stored ciphertext.
    expect(row.configEncrypted!).not.toContain("secret-token-xyz");
    // Audit columns are stamped.
    expect(row.kmsKeyId).toBeTruthy();
    expect(row.dekWrappedB64).toBeTruthy();

    const decrypted = await decryptIntegrationConfigEnvelope(row.configEncrypted!);
    expect(decrypted.webhookUrl).toBe(webhookUrl);
    expect(decrypted.defaultChannel).toBe("#alerts");
  });

  it("re-upserting rewraps with a fresh envelope (new DEK)", async () => {
    const caller = integrationsRouter.createCaller(createMockContext(adminId, orgId));
    await caller.upsertIntegration({ provider: "slack", config: { webhookUrl: "https://a.example" } });
    const first = (await rowFor("slack")).configEncrypted!;

    await caller.upsertIntegration({ provider: "slack", config: { webhookUrl: "https://b.example" } });
    const second = (await rowFor("slack")).configEncrypted!;

    expect(second).not.toBe(first);
    expect(await decryptIntegrationConfigEnvelope(second)).toEqual({ webhookUrl: "https://b.example" });
  });

  it("still decrypts a legacy (pre-G15) CBC row through the envelope reader", async () => {
    const legacyBlob = encryptIntegrationConfig({ webhookUrl: "https://legacy.example" });
    expect(isEnvelope(legacyBlob)).toBe(false);
    await testDb()
      .insert(integrations)
      .values({ orgId, provider: "teams", status: "connected", configEncrypted: legacyBlob });

    const row = await rowFor("teams");
    const decrypted = await decryptIntegrationConfigEnvelope(row.configEncrypted!);
    expect(decrypted.webhookUrl).toBe("https://legacy.example");
  });
});
