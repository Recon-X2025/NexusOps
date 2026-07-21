/**
 * Professional-tax (PT) challan portal push tests (G2).
 *
 * `processPtChallanJob` closes the compute→file loop for a state PT challan: it
 * loads a generated challan record, resolves the org's `pt_challan` GSP
 * integration, pushes the PT line body and persists the returned challan
 * number. Verifies:
 *   • a connected org gets a real GSP POST and the challan number + `submitted`
 *     status are persisted back onto the challan row;
 *   • an org with no PT integration soft-fails once as `not_configured`
 *     (no throw, no endless retry);
 *   • a portal rejection flips the row to `failed` with the error and rethrows
 *     (so BullMQ retries), and the ack is never stamped;
 *   • the job is idempotent — a second run on an already-filed challan skips;
 *   • tenant isolation — a challan belonging to another org is not processed.
 *
 * The GSP round-trip is exercised against a stubbed fetch (no live network).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// encryptIntegrationConfig reads APP_SECRET lazily; ensure it exists for tests.
process.env["APP_SECRET"] =
  process.env["APP_SECRET"] ?? "test-app-secret-for-filing-do-not-use-in-prod";

import { seedFullOrg, testDb } from "./helpers";
import { processPtChallanJob } from "../workflows/ptChallanWorkflow";
import { encryptIntegrationConfig } from "../services/encryption";
import { ptChallanRecords, integrations, eq, and } from "@coheronconnect/db";

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

describe("PT challan portal push (G2)", () => {
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const connectPt = (over: Record<string, string> = {}) =>
    testDb().insert(integrations).values({
      orgId,
      provider: "pt_challan",
      status: "connected",
      configEncrypted: encryptIntegrationConfig({
        apiKey: "gsp-key",
        ptRegistrationNumber: "27PT-1234567",
        ...over,
      }),
    });

  const mkRecord = async (over: Record<string, unknown> = {}) => {
    const [row] = await testDb()
      .insert(ptChallanRecords)
      .values({
        orgId,
        stateCode: "MAHARASHTRA",
        month: 4,
        year: 2026,
        totalEmployees: 3,
        totalPtDeducted: "600",
        ...over,
      })
      .returning();
    return row!;
  };

  const rowFor = async (id: string) => {
    const [row] = await testDb()
      .select()
      .from(ptChallanRecords)
      .where(and(eq(ptChallanRecords.id, id), eq(ptChallanRecords.orgId, orgId)));
    return row!;
  };

  it("pushes to the GSP and persists the challan + submitted status", async () => {
    await connectPt();
    const rec = await mkRecord();
    const calls = mockFetch({ json: { challanNumber: "PT-2026-0001", status: "accepted" } });

    const res = await processPtChallanJob(testDb(), {
      ptChallanId: rec.id,
      orgId,
      ptLines: "emp1#~#emp2#~#emp3",
    });

    expect(res.status).toBe("filed");
    expect(res.detail).toBe("PT-2026-0001");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/v1/pt/challan");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.ptRegistrationNumber).toBe("27PT-1234567");
    expect(body.stateCode).toBe("MAHARASHTRA");
    expect(body.period).toBe("04-2026");
    expect(body.lines).toBe("emp1#~#emp2#~#emp3");

    const persisted = await rowFor(rec.id);
    expect(persisted.status).toBe("submitted");
    expect(persisted.challanNumber).toBe("PT-2026-0001");
    expect(persisted.submittedAt).not.toBeNull();
    expect(persisted.portalError).toBeNull();
  });

  it("soft-fails as not_configured when no PT integration is connected", async () => {
    const rec = await mkRecord();
    const calls = mockFetch({ json: {} });

    const res = await processPtChallanJob(testDb(), {
      ptChallanId: rec.id,
      orgId,
      ptLines: "x",
    });

    expect(res.status).toBe("not_configured");
    expect(calls).toHaveLength(0); // never hit the portal
    const persisted = await rowFor(rec.id);
    expect(persisted.status).toBe("not_configured");
    expect(persisted.challanNumber).toBeNull();
    expect(persisted.portalError).toMatch(/not connected/i);
  });

  it("marks failed and rethrows on a portal rejection", async () => {
    await connectPt();
    const rec = await mkRecord();
    mockFetch({ ok: false, status: 400, text: "bad pt format" });

    await expect(
      processPtChallanJob(testDb(), { ptChallanId: rec.id, orgId, ptLines: "x" }),
    ).rejects.toThrow(/PT challan upload failed/i);

    const persisted = await rowFor(rec.id);
    expect(persisted.status).toBe("failed");
    expect(persisted.challanNumber).toBeNull();
    expect(persisted.portalError).toMatch(/bad pt format/i);
  });

  it("is idempotent — skips a challan that already carries a challan number", async () => {
    await connectPt();
    const rec = await mkRecord({ challanNumber: "PT-ALREADY", status: "submitted" });
    const calls = mockFetch({ json: { challanNumber: "PT-NEW" } });

    const res = await processPtChallanJob(testDb(), {
      ptChallanId: rec.id,
      orgId,
      ptLines: "x",
    });

    expect(res.status).toBe("skipped");
    expect(calls).toHaveLength(0);
    const persisted = await rowFor(rec.id);
    expect(persisted.challanNumber).toBe("PT-ALREADY"); // untouched
  });

  it("is tenant-scoped — a challan owned by another org is not processed", async () => {
    await connectPt();
    const other = await seedFullOrg();
    const [theirs] = await testDb()
      .insert(ptChallanRecords)
      .values({ orgId: other.orgId, stateCode: "MAHARASHTRA", month: 4, year: 2026 })
      .returning();
    const calls = mockFetch({ json: { challanNumber: "PT-X" } });

    // Our worker, scoped to our orgId, cannot see their challan.
    const res = await processPtChallanJob(testDb(), {
      ptChallanId: theirs!.id,
      orgId,
      ptLines: "x",
    });

    expect(res.status).toBe("skipped");
    expect(calls).toHaveLength(0);
  });
});
