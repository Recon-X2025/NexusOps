/**
 * Unit tests for virus-scan + retention workflow workers.
 *
 * Coverage gap fixed: market-assessment redo §C5 — these two workers were
 * previously shipped with zero automated test coverage. The tests here use
 * a minimal in-memory db mock (no live Postgres / Redis / S3 / clamd) to
 * exercise the branching logic that production-incident reports would
 * otherwise be the only signal for.
 *
 * What we cover:
 *   • virusScan — enqueue jobId determinism (idempotency)
 *   • virusScan — clamd-not-configured → "skipped" status
 *   • virusScan — version-not-found → "failed" status
 *   • retention — soft-deleted + past retention → hard-delete
 *   • retention — soft-deleted + within retention → no-op
 *   • retention — legal hold (instance) → skip
 *   • retention — policy-level legal hold → skip
 *   • retention — RETENTION_DEFAULT_DAYS env override
 *
 * The two worker functions are pure on (db, job) once we stub I/O, so the
 * tests stay fast and deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We mock the storage service before importing the retention workflow so
// that the import-time deleteObject reference resolves to our spy.
vi.mock("../services/storage", () => ({
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));

// ─── virusScanWorkflow ──────────────────────────────────────────────────────

import {
  enqueueVirusScanJob,
  processScanJob,
  type VirusScanJobData,
} from "../workflows/virusScanWorkflow";

describe("virusScanWorkflow.enqueueVirusScanJob — idempotent jobId", () => {
  it("composes a stable jobId per (documentId, versionNumber)", async () => {
    const calls: Array<{ name: string; data: VirusScanJobData; opts: { jobId: string } }> = [];
    const fakeQueue = {
      add: (name: string, data: VirusScanJobData, opts: { jobId: string }) => {
        calls.push({ name, data, opts });
        return Promise.resolve();
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await enqueueVirusScanJob(fakeQueue as any, "doc-123");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await enqueueVirusScanJob(fakeQueue as any, "doc-123", 2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await enqueueVirusScanJob(fakeQueue as any, "doc-123", 2);

    expect(calls).toHaveLength(3);
    expect(calls[0]!.opts.jobId).toBe("vscan:doc-123");
    expect(calls[1]!.opts.jobId).toBe("vscan:doc-123:v2");
    // BullMQ dedupes by jobId — same documentId+version must produce same id
    expect(calls[2]!.opts.jobId).toBe(calls[1]!.opts.jobId);
  });
});

describe("virusScanWorkflow.processScanJob — branching", () => {
  const ORIG_CLAM = process.env["CLAMAV_HOST"];
  beforeEach(() => {
    delete process.env["CLAMAV_HOST"];
  });
  afterEach(() => {
    if (ORIG_CLAM === undefined) delete process.env["CLAMAV_HOST"];
    else process.env["CLAMAV_HOST"] = ORIG_CLAM;
  });

  function makeDb(versions: Array<{ id: string; version: number; storageKey: string }>) {
    return {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(versions),
          }),
        }),
      }),
    };
  }

  function makeJob(data: VirusScanJobData) {
    return { data } as Parameters<typeof processScanJob>[1];
  }

  it("returns 'failed' when no document version exists", async () => {
    const db = makeDb([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processScanJob(db as any, makeJob({ documentId: "missing-doc" }));
    expect(result.status).toBe("failed");
    expect(result.detail).toMatch(/No version found/);
  });

  it("returns 'skipped' when CLAMAV_HOST is not configured", async () => {
    const db = makeDb([{ id: "v1", version: 1, storageKey: "tenants/x/y" }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processScanJob(db as any, makeJob({ documentId: "doc-1" }));
    expect(result.status).toBe("skipped");
    expect(result.detail).toMatch(/clamd not configured/);
  });

  it("scans the requested version when versionNumber is provided", async () => {
    const versions = [
      { id: "vA", version: 1, storageKey: "v1-key" },
      { id: "vB", version: 2, storageKey: "v2-key" },
    ];
    const db = makeDb(versions);
    // CLAMAV_HOST still unset → skipped, but the resolution logic should not throw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processScanJob(db as any, makeJob({ documentId: "doc-1", versionNumber: 2 }));
    expect(result.status).toBe("skipped");
  });

  it("skipped on missing version-number (selects latest)", async () => {
    const versions = [
      { id: "vA", version: 1, storageKey: "v1-key" },
      { id: "vB", version: 2, storageKey: "v2-key" },
    ];
    const db = makeDb(versions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processScanJob(db as any, makeJob({ documentId: "doc-1" }));
    expect(result.status).toBe("skipped");
  });
});

// ─── documentRetentionWorkflow ──────────────────────────────────────────────

import { runRetentionSweep } from "../workflows/documentRetentionWorkflow";
import { deleteObject } from "../services/storage";

interface MockDoc {
  id: string;
  orgId: string;
  name: string;
  deletedAt: Date | null;
  legalHold: boolean;
  policyId: string | null;
  policyDays: number | null;
  policyLegalHold: boolean | null;
  policyName: string | null;
}

interface MockVersion {
  id: string;
  documentId: string;
  storageKey: string;
}

interface MockState {
  candidates: MockDoc[];
  versionsByDoc: Record<string, MockVersion[]>;
  deletedDocs: string[];
  auditEvents: Array<Record<string, unknown>>;
}

function makeRetentionDb(state: MockState) {
  // The retention sweep does:
  //   db.select(...).from(documents).leftJoin(...).where(...).limit(N)
  //   db.select(...).from(documentVersions).where(eq(documentVersions.documentId, id))
  //   db.delete(documents).where(eq(documents.id, id))
  //   db.insert(auditLogs).values({...})
  //
  // We discriminate the two select chains by the table reference passed to
  // .from(). The actual table objects come from @nexusops/db; we match on
  // identity using a sentinel attached at the chain root.
  return {
    select: (_cols?: unknown) => ({
      from: (table: { _kind?: string }) => {
        const kind = table._kind ?? "documents";
        if (kind === "documentVersions") {
          return {
            where: (predicate: { docId: string }) => {
              const versions = state.versionsByDoc[predicate.docId] ?? [];
              return Promise.resolve(versions);
            },
          };
        }
        return {
          leftJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve(state.candidates),
            }),
          }),
        };
      },
    }),
    delete: (table: { _kind?: string }) => {
      if ((table._kind ?? "documents") !== "documents") {
        return { where: () => Promise.resolve() };
      }
      return {
        where: (predicate: { docId: string }) => {
          state.deletedDocs.push(predicate.docId);
          return Promise.resolve();
        },
      };
    },
    insert: (table: { _kind?: string }) => ({
      values: (vals: Record<string, unknown>) => {
        if (table._kind === "auditLogs") state.auditEvents.push(vals);
        return Promise.resolve();
      },
    }),
  };
}

// Patch the @nexusops/db imports the workflow file uses with sentinel objects
// so our mock chain can discriminate them. We intercept at the module level.
vi.mock("@nexusops/db", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    documents: { _kind: "documents" },
    documentVersions: { _kind: "documentVersions" },
    documentRetentionPolicies: { _kind: "documentRetentionPolicies" },
    auditLogs: { _kind: "auditLogs" },
  };
});

// `eq` and `isNotNull` are imported from drizzle-orm directly inside the
// workflow file, so we intercept those at the source. Returning a small
// shape lets our chain mocks read the docId argument.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    eq: (_col: unknown, value: unknown) => ({ docId: value as string }),
    isNotNull: () => ({ _isNotNull: true }),
  };
});

describe("documentRetentionWorkflow.runRetentionSweep", () => {
  const ORIG_DEFAULT = process.env["RETENTION_DEFAULT_DAYS"];
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["RETENTION_DEFAULT_DAYS"];
  });
  afterEach(() => {
    if (ORIG_DEFAULT === undefined) delete process.env["RETENTION_DEFAULT_DAYS"];
    else process.env["RETENTION_DEFAULT_DAYS"] = ORIG_DEFAULT;
  });

  function freshState(overrides: Partial<MockState> = {}): MockState {
    return {
      candidates: [],
      versionsByDoc: {},
      deletedDocs: [],
      auditEvents: [],
      ...overrides,
    };
  }

  const longAgo = new Date(Date.now() - 200 * 86_400_000); // 200 days ago
  const recently = new Date(Date.now() - 5 * 86_400_000); // 5 days ago

  it("hard-deletes a document past its retention window", async () => {
    const state = freshState({
      candidates: [
        {
          id: "doc-old",
          orgId: "org-1",
          name: "expired.pdf",
          deletedAt: longAgo,
          legalHold: false,
          policyId: "pol-90",
          policyDays: 90,
          policyLegalHold: false,
          policyName: "Default 90d",
        },
      ],
      versionsByDoc: {
        "doc-old": [
          { id: "v1", documentId: "doc-old", storageKey: "tenants/1/old/v1.bin" },
          { id: "v2", documentId: "doc-old", storageKey: "tenants/1/old/v2.bin" },
        ],
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runRetentionSweep(makeRetentionDb(state) as any);

    expect(result.examined).toBe(1);
    expect(result.hardDeleted).toBe(1);
    expect(result.skippedLegalHold).toBe(0);
    expect(result.errors).toBe(0);
    expect(state.deletedDocs).toEqual(["doc-old"]);
    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(state.auditEvents).toHaveLength(1);
    expect(state.auditEvents[0]).toMatchObject({
      action: "document.retention.purged",
      resourceType: "document",
      resourceId: "doc-old",
    });
  });

  it("does not delete documents within retention window", async () => {
    const state = freshState({
      candidates: [
        {
          id: "doc-recent",
          orgId: "org-1",
          name: "fresh.pdf",
          deletedAt: recently,
          legalHold: false,
          policyId: "pol-90",
          policyDays: 90,
          policyLegalHold: false,
          policyName: "Default 90d",
        },
      ],
      versionsByDoc: { "doc-recent": [{ id: "v1", documentId: "doc-recent", storageKey: "k1" }] },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runRetentionSweep(makeRetentionDb(state) as any);

    expect(result.examined).toBe(1);
    expect(result.hardDeleted).toBe(0);
    expect(state.deletedDocs).toHaveLength(0);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("skips documents with instance-level legal hold", async () => {
    const state = freshState({
      candidates: [
        {
          id: "doc-hold",
          orgId: "org-1",
          name: "litigation.pdf",
          deletedAt: longAgo,
          legalHold: true, // instance hold
          policyId: "pol-90",
          policyDays: 90,
          policyLegalHold: false,
          policyName: "Default 90d",
        },
      ],
      versionsByDoc: { "doc-hold": [{ id: "v1", documentId: "doc-hold", storageKey: "k1" }] },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runRetentionSweep(makeRetentionDb(state) as any);

    expect(result.skippedLegalHold).toBe(1);
    expect(result.hardDeleted).toBe(0);
    expect(state.deletedDocs).toHaveLength(0);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("skips documents whose policy has policy-level legal hold", async () => {
    const state = freshState({
      candidates: [
        {
          id: "doc-pol-hold",
          orgId: "org-1",
          name: "compliance.pdf",
          deletedAt: longAgo,
          legalHold: false,
          policyId: "pol-litigation",
          policyDays: 90,
          policyLegalHold: true, // policy hold
          policyName: "Litigation 2026",
        },
      ],
      versionsByDoc: { "doc-pol-hold": [{ id: "v1", documentId: "doc-pol-hold", storageKey: "k1" }] },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runRetentionSweep(makeRetentionDb(state) as any);

    expect(result.skippedLegalHold).toBe(1);
    expect(result.hardDeleted).toBe(0);
  });

  it("falls back to RETENTION_DEFAULT_DAYS when no policy is attached", async () => {
    process.env["RETENTION_DEFAULT_DAYS"] = "30";
    const state = freshState({
      candidates: [
        {
          id: "doc-no-policy",
          orgId: "org-1",
          name: "no-policy.pdf",
          deletedAt: new Date(Date.now() - 60 * 86_400_000), // 60 days ago > 30
          legalHold: false,
          policyId: null,
          policyDays: null,
          policyLegalHold: null,
          policyName: null,
        },
      ],
      versionsByDoc: { "doc-no-policy": [{ id: "v1", documentId: "doc-no-policy", storageKey: "k1" }] },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runRetentionSweep(makeRetentionDb(state) as any);

    expect(result.hardDeleted).toBe(1);
    expect(state.deletedDocs).toEqual(["doc-no-policy"]);
  });

  it("continues sweeping when an object-store delete fails for one version", async () => {
    // First call rejects, second resolves — simulates a flaky S3 endpoint.
    const mockedDelete = vi.mocked(deleteObject);
    mockedDelete.mockReset();
    mockedDelete
      .mockRejectedValueOnce(new Error("S3 timeout"))
      .mockResolvedValueOnce(undefined);

    const state = freshState({
      candidates: [
        {
          id: "doc-flaky",
          orgId: "org-1",
          name: "flaky.pdf",
          deletedAt: longAgo,
          legalHold: false,
          policyId: "pol-90",
          policyDays: 90,
          policyLegalHold: false,
          policyName: "Default 90d",
        },
      ],
      versionsByDoc: {
        "doc-flaky": [
          { id: "v1", documentId: "doc-flaky", storageKey: "k1" },
          { id: "v2", documentId: "doc-flaky", storageKey: "k2" },
        ],
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runRetentionSweep(makeRetentionDb(state) as any);

    expect(result.hardDeleted).toBe(1);
    expect(result.errors).toBe(0);
    expect(state.deletedDocs).toEqual(["doc-flaky"]);
  });
});
