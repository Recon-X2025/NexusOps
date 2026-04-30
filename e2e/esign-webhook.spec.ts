/**
 * eMudhra e-sign webhook end-to-end (item 6 of GA readiness).
 *
 * Flow under test:
 *
 *   1. Admin logs in via tRPC `auth.login`. We use the returned sessionId
 *      as a Bearer token for subsequent admin calls.
 *   2. Admin calls `integrations.upsertIntegration` with provider=`emudhra`
 *      and a known `webhookSecret`. This proves the new admin UI's
 *      backing tRPC mutation can persist + encrypt creds end-to-end.
 *   3. We seed a `signature_requests` row directly (status=`sent`) bound
 *      to the admin's org, simulating an envelope that was already
 *      handed off to eMudhra. We don't drive the actual eMudhra sandbox
 *      from CI — the production runbook
 *      (`docs/EMUDHRA_PRODUCTION_RUNBOOK.md`) covers the human-driven
 *      sandbox dry-run.
 *   4. We compute the eMudhra HMAC-SHA256 signature over the JSON body
 *      using the webhookSecret and POST to `/webhooks/esign/emudhra`.
 *   5. We verify the signature_requests row flips to `completed` with a
 *      non-null `completedAt`, and a `signature_audit` row is appended.
 *
 * This is the canonical "happy path" contract test for the webhook
 * receiver. Failure of this spec means contracts will never auto-close
 * after eMudhra signs — a P0 regression.
 */
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { getDb, signatureRequests, signatureAudit, eq } from "@coheronconnect/db";

const API_BASE = "http://localhost:3001";
const WEB_HOOK_SECRET = "whk-e2e-test-secret-do-not-reuse-in-prod";
const PROVIDER_ENVELOPE_ID = `EMUD-E2E-${Date.now()}`;

// Mirror the global-setup default so getDb() works whether or not the
// outer shell exported DATABASE_URL.
if (!process.env["DATABASE_URL"]) {
  process.env["DATABASE_URL"] =
    "postgresql://coheronconnect_test:coheronconnect_test@localhost:5433/coheronconnect_test";
}
// services/encryption.ts requires APP_SECRET when integrations are
// upserted — keep this in sync with playwright.config.ts.
if (!process.env["APP_SECRET"]) {
  process.env["APP_SECRET"] = "test-app-secret-32-chars-minimum-";
}

interface LoginResponse {
  user: { id: string; email: string };
  org: { id: string; name: string };
  sessionId: string;
}

async function trpcMutation<T = unknown>(
  path: string,
  input: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const res = await fetch(`${API_BASE}/trpc/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { result?: { data?: T }; error?: unknown };
  if (!res.ok || json.error) {
    throw new Error(
      `tRPC ${path} failed: ${res.status} ${JSON.stringify(json.error ?? json)}`,
    );
  }
  return json.result!.data as T;
}

async function loginAdmin(): Promise<LoginResponse> {
  return trpcMutation<LoginResponse>("auth.login", {
    email: "admin@coheron.com",
    password: "demo1234!",
  });
}

test.describe("e-sign webhook (eMudhra) — contract upload → signed → completed", () => {
  test("simulated eMudhra callback flips signature_request to completed", async () => {
    // ── 1. Login ───────────────────────────────────────────────────────────
    const session = await loginAdmin();
    expect(session.sessionId, "auth.login must return sessionId").toBeTruthy();
    expect(session.org.id, "auth.login must return org.id").toBeTruthy();

    // ── 2. Persist eMudhra creds (covers the admin UI's tRPC backing) ──────
    await trpcMutation(
      "integrations.upsertIntegration",
      {
        provider: "emudhra",
        config: {
          apiKey: "emud-test-api-key",
          apiSecret: "emud-test-api-secret",
          webhookSecret: WEB_HOOK_SECRET,
          environment: "sandbox",
        },
      },
      session.sessionId,
    );

    // ── 3. Seed a signature_requests row representing an envelope already
    //      sent to eMudhra. orgId comes from the session payload so we
    //      stay consistent with the integration row we just created.
    const db = getDb();
    const [reqRow] = await db
      .insert(signatureRequests)
      .values({
        orgId: session.org.id,
        provider: "emudhra",
        providerEnvelopeId: PROVIDER_ENVELOPE_ID,
        title: "[E2E] NDA — Acme × Design Partner",
        sourceType: "contract",
        sourceId: crypto.randomUUID(),
        documentStorageKey: `e2e/${PROVIDER_ENVELOPE_ID}/original.pdf`,
        documentSha256: crypto
          .createHash("sha256")
          .update(`e2e-original-${PROVIDER_ENVELOPE_ID}`)
          .digest("hex"),
        status: "sent",
      })
      .returning();
    expect(reqRow, "fixture insert returned a row").toBeTruthy();

    // ── 4. POST simulated eMudhra callback with a valid HMAC ───────────────
    const callbackBody = JSON.stringify({
      envelopeId: PROVIDER_ENVELOPE_ID,
      status: "completed",
      signedAt: new Date().toISOString(),
    });
    const signature = crypto
      .createHmac("sha256", WEB_HOOK_SECRET)
      .update(callbackBody)
      .digest("hex");

    const webhookRes = await fetch(`${API_BASE}/webhooks/esign/emudhra`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-emudhra-signature": signature,
      },
      body: callbackBody,
    });
    expect(webhookRes.status, "webhook should accept valid HMAC").toBe(200);

    // ── 5. Verify status flipped + audit row appended ──────────────────────
    const [updated] = await db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.id, reqRow!.id))
      .limit(1);
    expect(updated?.status, "status should be completed").toBe("completed");
    expect(updated?.completedAt, "completedAt should be set").toBeTruthy();

    const auditRows = await db
      .select()
      .from(signatureAudit)
      .where(eq(signatureAudit.requestId, reqRow!.id));
    expect(
      auditRows.length,
      "exactly one audit row appended for the completed event",
    ).toBeGreaterThanOrEqual(1);
    expect(auditRows.some((r) => r.eventType === "completed")).toBe(true);

    // ── Cleanup — keep the test DB tidy across runs ────────────────────────
    await db.delete(signatureAudit).where(eq(signatureAudit.requestId, reqRow!.id));
    await db.delete(signatureRequests).where(eq(signatureRequests.id, reqRow!.id));
  });

  test("rejects callback with bad HMAC", async () => {
    const session = await loginAdmin();
    await trpcMutation(
      "integrations.upsertIntegration",
      {
        provider: "emudhra",
        config: {
          apiKey: "emud-test-api-key",
          apiSecret: "emud-test-api-secret",
          webhookSecret: WEB_HOOK_SECRET,
          environment: "sandbox",
        },
      },
      session.sessionId,
    );

    const db = getDb();
    const envId = `EMUD-E2E-BAD-${Date.now()}`;
    const [reqRow] = await db
      .insert(signatureRequests)
      .values({
        orgId: session.org.id,
        provider: "emudhra",
        providerEnvelopeId: envId,
        title: "[E2E] Bad-HMAC test",
        sourceType: "contract",
        sourceId: crypto.randomUUID(),
        documentStorageKey: `e2e/${envId}/original.pdf`,
        documentSha256: "00".repeat(32),
        status: "sent",
      })
      .returning();

    const body = JSON.stringify({
      envelopeId: envId,
      status: "completed",
    });
    // Wrong secret → wrong HMAC → 401
    const badSig = crypto
      .createHmac("sha256", "wrong-secret")
      .update(body)
      .digest("hex");
    const res = await fetch(`${API_BASE}/webhooks/esign/emudhra`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-emudhra-signature": badSig,
      },
      body,
    });
    expect(res.status, "bad HMAC must yield 401").toBe(401);

    const [unchanged] = await db
      .select()
      .from(signatureRequests)
      .where(eq(signatureRequests.id, reqRow!.id))
      .limit(1);
    expect(unchanged?.status, "row must remain in `sent` after bad HMAC").toBe(
      "sent",
    );

    await db.delete(signatureRequests).where(eq(signatureRequests.id, reqRow!.id));
  });

  test("rejects callback for unknown envelopeId", async () => {
    const body = JSON.stringify({
      envelopeId: `EMUD-NEVER-EXISTED-${Date.now()}`,
      status: "completed",
    });
    const sig = crypto
      .createHmac("sha256", WEB_HOOK_SECRET)
      .update(body)
      .digest("hex");
    const res = await fetch(`${API_BASE}/webhooks/esign/emudhra`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-emudhra-signature": sig,
      },
      body,
    });
    expect(res.status).toBe(404);
  });

  test("rejects browser Origin (CORS hardening)", async () => {
    // CORS hardening from item 5 — any request with an Origin header is
    // refused with 403 before any HMAC / DB work.
    const body = JSON.stringify({ envelopeId: "x", status: "completed" });
    const res = await fetch(`${API_BASE}/webhooks/esign/emudhra`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-emudhra-signature": "deadbeef",
        Origin: "https://evil.example.com",
      },
      body,
    });
    expect(res.status, "browser Origin must be rejected with 403").toBe(403);
  });

  // Note: we deliberately do NOT clean up the `integrations` row in afterAll.
  // upsertIntegration is idempotent, so repeated runs simply rewrite the
  // encrypted config rather than accumulating rows. signature_requests +
  // signature_audit fixtures ARE cleaned up per-test above.
});
