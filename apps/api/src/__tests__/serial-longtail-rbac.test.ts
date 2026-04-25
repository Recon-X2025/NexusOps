/**
 * Long-tail routers (Seq 25–26, 34 C6 sample) — `projects` / `workflows` / `devops` write gates.
 * @see docs/QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md §0 · `ITSM_GRADE_SERIAL_V1_CLOSURE_REGISTER.md` (Class P)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Serial long-tail RBAC sample (Seq 24–43 C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let requesterToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    requesterToken = await createSession(orgCtx.requesterId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("requester cannot projects.create (projects:write)", async () => {
    const caller = await authedCaller(requesterToken);
    await expect(caller.projects.create({ name: "Denied project" })).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("requester cannot workflows.create (flows:write)", async () => {
    const caller = await authedCaller(requesterToken);
    await expect(
      caller.workflows.create({
        name: "Denied wf",
        triggerType: "manual",
        triggerConfig: {},
      }),
    ).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("requester cannot devops.createPipelineRun (projects:write)", async () => {
    const caller = await authedCaller(requesterToken);
    await expect(
      caller.devops.createPipelineRun({ pipelineName: "denied-pipeline" }),
    ).rejects.toThrow(/FORBIDDEN|permission/i);
  });
});
