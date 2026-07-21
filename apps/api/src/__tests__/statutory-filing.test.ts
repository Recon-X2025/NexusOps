/**
 * Statutory filing portal push tests (G2).
 *
 * `processStatutoryFilingJob` closes the compute→file loop for EPFO ECR: it
 * loads a generated return, resolves the org's `epfo_ecr` GSP integration,
 * pushes the ECR body and persists the returned TRRN. Verifies:
 *   • a connected org gets a real GSP POST and the TRRN + `submitted` status
 *     are persisted back onto the submission row;
 *   • an org with no EPFO integration soft-fails once as `not_configured`
 *     (no throw, no endless retry);
 *   • a portal rejection flips the row to `failed` with the error and rethrows
 *     (so BullMQ retries), and the ack is never stamped;
 *   • the job is idempotent — a second run on an already-filed return skips;
 *   • tenant isolation — a return belonging to another org is not processed.
 *
 * The GSP round-trip is exercised against a stubbed fetch (no live network).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// encryptIntegrationConfig reads APP_SECRET lazily; ensure it exists for tests.
process.env["APP_SECRET"] =
  process.env["APP_SECRET"] ?? "test-app-secret-for-filing-do-not-use-in-prod";

import { seedFullOrg, testDb } from "./helpers";
import { processStatutoryFilingJob } from "../workflows/statutoryFilingWorkflow";
import { encryptIntegrationConfig } from "../services/encryption";
import { epfoEcrSubmissions, integrations, eq, and } from "@coheronconnect/db";

function mockFetch(response: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.json ?? {},
      text: async () => response.text ?? JSON.stringify(response.json ?? {}),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

describe("Statutory filing portal push (G2)", () => {
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const connectEpfo = (over: Record<string, string> = {}) =>
    testDb().insert(integrations).values({
      orgId,
      provider: "epfo_ecr",
      status: "connected",
      configEncrypted: encryptIntegrationConfig({
        apiKey: "gsp-key",
        establishmentId: "MH/BAN/1234567/000",
        ...over,
      }),
    });

  const mkSubmission = async (over: Record<string, unknown> = {}) => {
    const [row] = await testDb()
      .insert(epfoEcrSubmissions)
      .values({
        orgId,
        month: 4,
        year: 2026,
        totalEmployeeContribution: "1800",
        totalEmployerContribution: "1800",
        totalEpsContribution: "1250",
        totalEpfContribution: "550",
        ...over,
      })
      .returning();
    return row!;
  };

  const rowFor = async (id: string) => {
    const [row] = await testDb()
      .select()
      .from(epfoEcrSubmissions)
      .where(and(eq(epfoEcrSubmissions.id, id), eq(epfoEcrSubmissions.orgId, orgId)));
    return row!;
  };

  it("pushes to the GSP and persists the TRRN + submitted status", async () => {
    await connectEpfo();
    const sub = await mkSubmission();
    const calls = mockFetch({ json: { trrn: "TRRN-2026-0001", status: "accepted" } });

    const res = await processStatutoryFilingJob(testDb(), {
      ecrSubmissionId: sub.id,
      orgId,
      ecrBody: "line1#~#line2",
    });

    expect(res.status).toBe("filed");
    expect(res.detail).toBe("TRRN-2026-0001");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/v1/ecr/upload");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.establishmentId).toBe("MH/BAN/1234567/000");
    expect(body.wageMonth).toBe("04-2026");
    expect(body.ecr).toBe("line1#~#line2");

    const persisted = await rowFor(sub.id);
    expect(persisted.submissionStatus).toBe("submitted");
    expect(persisted.epfoAckNumber).toBe("TRRN-2026-0001");
    expect(persisted.submittedAt).not.toBeNull();
    expect(persisted.portalError).toBeNull();
  });

  it("soft-fails as not_configured when no EPFO integration is connected", async () => {
    const sub = await mkSubmission();
    const calls = mockFetch({ json: {} });

    const res = await processStatutoryFilingJob(testDb(), {
      ecrSubmissionId: sub.id,
      orgId,
      ecrBody: "x",
    });

    expect(res.status).toBe("not_configured");
    expect(calls).toHaveLength(0); // never hit the portal
    const persisted = await rowFor(sub.id);
    expect(persisted.submissionStatus).toBe("not_configured");
    expect(persisted.epfoAckNumber).toBeNull();
    expect(persisted.portalError).toMatch(/not connected/i);
  });

  it("marks failed and rethrows on a portal rejection", async () => {
    await connectEpfo();
    const sub = await mkSubmission();
    mockFetch({ ok: false, status: 400, text: "bad ecr format" });

    await expect(
      processStatutoryFilingJob(testDb(), { ecrSubmissionId: sub.id, orgId, ecrBody: "x" }),
    ).rejects.toThrow(/EPFO ECR upload failed/i);

    const persisted = await rowFor(sub.id);
    expect(persisted.submissionStatus).toBe("failed");
    expect(persisted.epfoAckNumber).toBeNull();
    expect(persisted.portalError).toMatch(/bad ecr format/i);
  });

  it("is idempotent — skips a return that already carries an ack", async () => {
    await connectEpfo();
    const sub = await mkSubmission({ epfoAckNumber: "TRRN-ALREADY", submissionStatus: "submitted" });
    const calls = mockFetch({ json: { trrn: "TRRN-NEW" } });

    const res = await processStatutoryFilingJob(testDb(), {
      ecrSubmissionId: sub.id,
      orgId,
      ecrBody: "x",
    });

    expect(res.status).toBe("skipped");
    expect(calls).toHaveLength(0);
    const persisted = await rowFor(sub.id);
    expect(persisted.epfoAckNumber).toBe("TRRN-ALREADY"); // untouched
  });

  it("is tenant-scoped — a return owned by another org is not processed", async () => {
    await connectEpfo();
    const other = await seedFullOrg();
    const [theirs] = await testDb()
      .insert(epfoEcrSubmissions)
      .values({ orgId: other.orgId, month: 4, year: 2026 })
      .returning();
    const calls = mockFetch({ json: { trrn: "TRRN-X" } });

    // Our worker, scoped to our orgId, cannot see their submission.
    const res = await processStatutoryFilingJob(testDb(), {
      ecrSubmissionId: theirs!.id,
      orgId,
      ecrBody: "x",
    });

    expect(res.status).toBe("skipped");
    expect(calls).toHaveLength(0);
  });
});
