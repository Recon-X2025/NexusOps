/**
 * MCA21 V3 filing tests (G4).
 *
 * Two layers:
 *   • Router (legal.mca21.prepare/submit/status/list) — a prepared e-Form row
 *     carries the {formCode, period, formData} payload; submit is idempotent once
 *     an SRN is present and refuses a record with no prepared payload.
 *   • Worker (processMca21FilingJob) — the MCA21 gateway round-trip:
 *       - a connected org gets a real gateway POST and the SRN + ack + `filed`
 *         status are persisted back;
 *       - an org with no MCA21 integration soft-fails once as `not_configured`;
 *       - a gateway rejection flips the row to `failed` and rethrows (retry);
 *       - the job is idempotent once the row carries an SRN;
 *       - a record with no/malformed payload is flagged `failed` without a POST;
 *       - tenant isolation — a row owned by another org is not processed.
 *
 * The gateway round-trip is exercised against a stubbed fetch (no live network).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// encryptIntegrationConfig reads APP_SECRET lazily; ensure it exists for tests.
process.env["APP_SECRET"] =
  process.env["APP_SECRET"] ?? "test-app-secret-for-mca21-do-not-use-in-prod";

import { seedFullOrg, testDb, createMockContext } from "./helpers";
import { processMca21FilingJob } from "../workflows/mca21FilingWorkflow";
import { legalRouter } from "../routers/legal";
import { encryptIntegrationConfig } from "../services/encryption";
import { mcaFilingRecords, integrations, eq, and } from "@coheronconnect/db";

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

describe("MCA21 V3 filing (G4)", () => {
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const connectMca21 = (over: Record<string, string> = {}) =>
    testDb().insert(integrations).values({
      orgId,
      provider: "mca21",
      status: "connected",
      configEncrypted: encryptIntegrationConfig({
        apiKey: "gw-key",
        cin: "U72900KA2020PTC123456",
        portalUser: "mcauser",
        ...over,
      }),
    });

  const mkFiling = async (over: Record<string, unknown> = {}) => {
    const [row] = await testDb()
      .insert(mcaFilingRecords)
      .values({
        orgId,
        formCode: "DPT-3",
        status: "prepared",
        payloadJson: {
          formCode: "DPT-3",
          period: "FY2025-26",
          formData: { netWorth: 1000000, particulars: "annual return of deposits" },
        },
        ...over,
      })
      .returning();
    return row!;
  };

  const rowFor = async (id: string) => {
    const [row] = await testDb()
      .select()
      .from(mcaFilingRecords)
      .where(and(eq(mcaFilingRecords.id, id), eq(mcaFilingRecords.orgId, orgId)));
    return row!;
  };

  // ── Router: prepare + submit ──────────────────────────────────────────────

  it("router prepares an e-Form record carrying the payload", async () => {
    const caller = legalRouter.createCaller(createMockContext(adminId, orgId));
    const row = await caller.mca21.prepare({
      formCode: "MSME-1",
      period: "H2-FY2025-26",
      formData: { outstandingDues: 250000 },
    });

    expect(row.formCode).toBe("MSME-1");
    expect(row.status).toBe("prepared");
    const payload = row.payloadJson as Record<string, unknown>;
    expect(payload.formCode).toBe("MSME-1");
    expect(payload.period).toBe("H2-FY2025-26");
    expect((payload.formData as Record<string, unknown>).outstandingDues).toBe(250000);
  });

  it("router submit refuses a record with no prepared payload", async () => {
    const bare = await mkFiling({ payloadJson: null });
    const caller = legalRouter.createCaller(createMockContext(adminId, orgId));
    await expect(caller.mca21.submit({ id: bare.id })).rejects.toThrow(/no prepared/i);
  });

  it("router submit is idempotent once an SRN is present", async () => {
    const filed = await mkFiling({ srn: "AA123456789", status: "filed" });
    const caller = legalRouter.createCaller(createMockContext(adminId, orgId));
    const res = await caller.mca21.submit({ id: filed.id });
    expect(res.queued).toBe(false);
    expect(res.srn).toBe("AA123456789");
  });

  it("router list returns the org's filing records", async () => {
    await mkFiling();
    await mkFiling({ formCode: "AOC-4" });
    const caller = legalRouter.createCaller(createMockContext(adminId, orgId));
    const rows = await caller.mca21.list();
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) expect(r.orgId).toBe(orgId);
  });

  // ── Worker: file ──────────────────────────────────────────────────────────

  it("pushes to the MCA21 gateway and persists the SRN + filed status", async () => {
    await connectMca21();
    const filing = await mkFiling();
    const calls = mockFetch({
      json: { srn: "AA987654321", challanRef: "CH-001", status: "SUBMITTED" },
    });

    const res = await processMca21FilingJob(testDb(), {
      mcaFilingRecordId: filing.id,
      orgId,
    });

    expect(res.status).toBe("filed");
    expect(res.detail).toBe("AA987654321");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/v1/eform/file");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.formCode).toBe("DPT-3");
    expect(body.cin).toBe("U72900KA2020PTC123456");

    const persisted = await rowFor(filing.id);
    expect(persisted.status).toBe("filed");
    expect(persisted.srn).toBe("AA987654321");
    expect(persisted.filedAt).not.toBeNull();
    expect(persisted.portalError).toBeNull();
    expect((persisted.ackJson as Record<string, unknown>).challanRef).toBe("CH-001");
  });

  it("soft-fails as not_configured when no MCA21 integration is connected", async () => {
    const filing = await mkFiling();
    const calls = mockFetch({ json: {} });

    const res = await processMca21FilingJob(testDb(), {
      mcaFilingRecordId: filing.id,
      orgId,
    });

    expect(res.status).toBe("not_configured");
    expect(calls).toHaveLength(0);
    const persisted = await rowFor(filing.id);
    expect(persisted.status).toBe("not_configured");
    expect(persisted.srn).toBeNull();
    expect(persisted.portalError).toMatch(/not connected/i);
  });

  it("marks failed and rethrows on a gateway rejection", async () => {
    await connectMca21();
    const filing = await mkFiling();
    mockFetch({ ok: false, status: 422, text: "DSC expired" });

    await expect(
      processMca21FilingJob(testDb(), { mcaFilingRecordId: filing.id, orgId }),
    ).rejects.toThrow(/MCA21 filing failed/i);

    const persisted = await rowFor(filing.id);
    expect(persisted.status).toBe("failed");
    expect(persisted.srn).toBeNull();
    expect(persisted.portalError).toMatch(/DSC expired/i);
  });

  it("is idempotent — skips a record already carrying an SRN", async () => {
    await connectMca21();
    const filing = await mkFiling({ srn: "AA555555555", status: "filed" });
    const calls = mockFetch({ json: { srn: "AA000000000" } });

    const res = await processMca21FilingJob(testDb(), {
      mcaFilingRecordId: filing.id,
      orgId,
    });

    expect(res.status).toBe("skipped");
    expect(calls).toHaveLength(0);
    const persisted = await rowFor(filing.id);
    expect(persisted.srn).toBe("AA555555555"); // untouched
  });

  it("flags failed without a POST when the payload is missing or malformed", async () => {
    await connectMca21();
    const filing = await mkFiling({ payloadJson: { period: "FY2025-26" } }); // no formCode
    const calls = mockFetch({ json: { srn: "AA111111111" } });

    const res = await processMca21FilingJob(testDb(), {
      mcaFilingRecordId: filing.id,
      orgId,
    });

    expect(res.status).toBe("failed");
    expect(calls).toHaveLength(0);
    const persisted = await rowFor(filing.id);
    expect(persisted.status).toBe("failed");
    expect(persisted.portalError).toMatch(/payload/i);
  });

  it("is tenant-scoped — a record owned by another org is not processed", async () => {
    await connectMca21();
    const other = await seedFullOrg();
    const [theirs] = await testDb()
      .insert(mcaFilingRecords)
      .values({
        orgId: other.orgId,
        formCode: "DPT-3",
        status: "prepared",
        payloadJson: { formCode: "DPT-3", formData: {} },
      })
      .returning();
    const calls = mockFetch({ json: { srn: "AA222222222" } });

    const res = await processMca21FilingJob(testDb(), {
      mcaFilingRecordId: theirs!.id,
      orgId, // our org
    });

    expect(res.status).toBe("skipped");
    expect(calls).toHaveLength(0);
  });
});
