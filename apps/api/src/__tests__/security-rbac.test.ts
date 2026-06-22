/**
 * Security router (Seq 12) — C6: `security:*` / `vulnerabilities:*` gated by matrix.
 * @see docs/QA_SECURITY_ITSM_E2E_TEST_PACK.md Part II
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
} from "./helpers";

describe("Security router RBAC (Seq 12 C6)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let requesterToken: string;
  let securityToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL not set for security-rbac tests");
    }
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    requesterToken = await createSession(orgCtx.requesterId);
    securityToken = await createSession(orgCtx.securityAnalystId);
  });

  afterAll(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  it("requester cannot createIncident (security:write)", async () => {
    const caller = await authedCaller(requesterToken);
    await expect(
      caller.security.createIncident({ title: "Should deny", severity: "low" }),
    ).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("requester cannot createVulnerability (vulnerabilities:write)", async () => {
    const caller = await authedCaller(requesterToken);
    await expect(
      caller.security.createVulnerability({ title: "Should deny", severity: "low" }),
    ).rejects.toThrow(/FORBIDDEN|permission/i);
  });

  it("security_analyst can createIncident + listIncidents (sanity)", async () => {
    const caller = await authedCaller(securityToken);
    const inc = (await caller.security.createIncident({
      title: "RBAC analyst smoke",
      severity: "medium",
    })) as { id: string };
    expect(inc.id).toBeDefined();
    const list = (await caller.security.listIncidents({ limit: 20 })) as { items: { id: string }[] };
    expect(list.items.some((r) => r.id === inc.id)).toBe(true);
  });
});
