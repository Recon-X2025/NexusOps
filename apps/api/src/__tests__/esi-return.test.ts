/**
 * ESIC monthly-return portal push tests (G2).
 *
 * `processEsiReturnJob` closes the compute→file loop for the ESIC monthly
 * contribution (MC) return: it loads a generated challan record, resolves the
 * org's `esic_return` GSP integration, pushes the MC body and persists the
 * returned challan number. Verifies:
 *   • a connected org gets a real GSP POST and the challan number + `submitted`
 *     status are persisted back onto the challan row;
 *   • an org with no ESIC integration soft-fails once as `not_configured`
 *     (no throw, no endless retry);
 *   • a portal rejection flips the row to `failed` with the error and rethrows
 *     (so BullMQ retries), and the ack is never stamped;
 *   • the job is idempotent — a second run on an already-filed return skips;
 *   • tenant isolation — a challan belonging to another org is not processed.
 *
 * The GSP round-trip is exercised against a stubbed fetch (no live network).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// encryptIntegrationConfig reads APP_SECRET lazily; ensure it exists for tests.
process.env["APP_SECRET"] =
  process.env["APP_SECRET"] ?? "test-app-secret-for-filing-do-not-use-in-prod";

import { seedFullOrg, testDb } from "./helpers";
import { processEsiReturnJob } from "../workflows/esiReturnWorkflow";
import { encryptIntegrationConfig } from "../services/encryption";
import { esiChallanRecords, integrations, eq, and } from "@coheronconnect/db";

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

describe("ESIC return portal push (G2)", () => {
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const connectEsic = (over: Record<string, string> = {}) =>
    testDb().insert(integrations).values({
      orgId,
      provider: "esic_return",
      status: "connected",
      configEncrypted: encryptIntegrationConfig({
        apiKey: "gsp-key",
        employerCode: "12345678901234567",
        ...over,
      }),
    });

  const mkRecord = async (over: Record<string, unknown> = {}) => {
    const [row] = await testDb()
      .insert(esiChallanRecords)
      .values({
        orgId,
        month: 4,
        year: 2026,
        totalEmployees: 2,
        totalEmployeeContribution: "150",
        totalEmployerContribution: "650",
        ...over,
      })
      .returning();
    return row!;
  };

  const rowFor = async (id: string) => {
    const [row] = await testDb()
      .select()
      .from(esiChallanRecords)
      .where(and(eq(esiChallanRecords.id, id), eq(esiChallanRecords.orgId, orgId)));
    return row!;
  };

  it("pushes to the GSP and persists the challan + submitted status", async () => {
    await connectEsic();
    const rec = await mkRecord();
    const calls = mockFetch({ json: { challanNumber: "ESIC-2026-0001", status: "accepted" } });

    const res = await processEsiReturnJob(testDb(), {
      esiChallanId: rec.id,
      orgId,
      mcLines: "ip1#~#ip2",
    });

    expect(res.status).toBe("filed");
    expect(res.detail).toBe("ESIC-2026-0001");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/v1/mc/upload");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.employerCode).toBe("12345678901234567");
    expect(body.contributionMonth).toBe("04-2026");
    expect(body.mc).toBe("ip1#~#ip2");

    const persisted = await rowFor(rec.id);
    expect(persisted.status).toBe("submitted");
    expect(persisted.challanNumber).toBe("ESIC-2026-0001");
    expect(persisted.submittedAt).not.toBeNull();
    expect(persisted.portalError).toBeNull();
  });

  it("soft-fails as not_configured when no ESIC integration is connected", async () => {
    const rec = await mkRecord();
    const calls = mockFetch({ json: {} });

    const res = await processEsiReturnJob(testDb(), {
      esiChallanId: rec.id,
      orgId,
      mcLines: "x",
    });

    expect(res.status).toBe("not_configured");
    expect(calls).toHaveLength(0); // never hit the portal
    const persisted = await rowFor(rec.id);
    expect(persisted.status).toBe("not_configured");
    expect(persisted.challanNumber).toBeNull();
    expect(persisted.portalError).toMatch(/not connected/i);
  });

  it("marks failed and rethrows on a portal rejection", async () => {
    await connectEsic();
    const rec = await mkRecord();
    mockFetch({ ok: false, status: 400, text: "bad mc format" });

    await expect(
      processEsiReturnJob(testDb(), { esiChallanId: rec.id, orgId, mcLines: "x" }),
    ).rejects.toThrow(/ESIC return upload failed/i);

    const persisted = await rowFor(rec.id);
    expect(persisted.status).toBe("failed");
    expect(persisted.challanNumber).toBeNull();
    expect(persisted.portalError).toMatch(/bad mc format/i);
  });

  it("is idempotent — skips a return that already carries a challan", async () => {
    await connectEsic();
    const rec = await mkRecord({ challanNumber: "ESIC-ALREADY", status: "submitted" });
    const calls = mockFetch({ json: { challanNumber: "ESIC-NEW" } });

    const res = await processEsiReturnJob(testDb(), {
      esiChallanId: rec.id,
      orgId,
      mcLines: "x",
    });

    expect(res.status).toBe("skipped");
    expect(calls).toHaveLength(0);
    const persisted = await rowFor(rec.id);
    expect(persisted.challanNumber).toBe("ESIC-ALREADY"); // untouched
  });

  it("is tenant-scoped — a return owned by another org is not processed", async () => {
    await connectEsic();
    const other = await seedFullOrg();
    const [theirs] = await testDb()
      .insert(esiChallanRecords)
      .values({ orgId: other.orgId, month: 4, year: 2026 })
      .returning();
    const calls = mockFetch({ json: { challanNumber: "ESIC-X" } });

    // Our worker, scoped to our orgId, cannot see their challan.
    const res = await processEsiReturnJob(testDb(), {
      esiChallanId: theirs!.id,
      orgId,
      mcLines: "x",
    });

    expect(res.status).toBe("skipped");
    expect(calls).toHaveLength(0);
  });
});
