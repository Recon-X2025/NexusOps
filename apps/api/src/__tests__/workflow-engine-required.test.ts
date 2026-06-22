import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from "vitest";
import * as temporal from "../lib/temporal";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  cleanupOrg,
  createSession,
} from "./helpers";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: docker compose -f docker-compose.test.yml up -d && source .env.test",
    );
  }
});

describe.sequential("Workflow publish when engine required", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;

  beforeAll(async () => {
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    adminToken = await createSession(orgCtx.adminId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEXUSOPS_WORKFLOW_ENGINE_REQUIRED;
    delete process.env.WORKFLOW_ENGINE_REQUIRED;
  });

  it("rolls back activation and fails with PRECONDITION_FAILED when Temporal errors", async () => {
    process.env.NEXUSOPS_WORKFLOW_ENGINE_REQUIRED = "true";
    vi.spyOn(temporal, "getTemporalClient").mockRejectedValue(new Error("ECONNREFUSED test"));

    const caller = await authedCaller(adminToken);
    const wf = (await caller.workflows.create({
      name: "Temporal required test",
      triggerType: "manual",
    })) as { id: string };

    await expect(caller.workflows.publish({ id: wf.id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });

    const detail = (await caller.workflows.get({ id: wf.id })) as {
      workflow: { isActive: boolean };
    };
    expect(detail.workflow.isActive).toBe(false);

    const runs = await caller.workflows.runs.list({ workflowId: wf.id, limit: 5 });
    const last = runs[0] as { status: string; error: string | null };
    expect(last.status).toBe("failed");
    expect(last.error).toBeTruthy();
  });
});
