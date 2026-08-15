/**
 * A1 — an issued API key must actually authenticate.
 *
 * `integrations.createApiKey` minted keys prefixed "nxk_" while the auth
 * middleware only entered the API-key branch for tokens starting "nxo_", so no
 * key ever issued by the product could authenticate: every request fell through
 * to the unauthenticated context. Both sides now import API_KEY_PREFIX from
 * @coheronconnect/types.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { API_KEY_PREFIX } from "@coheronconnect/types";
import { seedTestOrg, seedUser, cleanupOrg, createMockContext } from "./helpers";
import { integrationsRouter } from "../routers/integrations";
import { createContext } from "../middleware/auth";

function reqWithBearer(token: string) {
  return {
    headers: { authorization: `Bearer ${token}`, "user-agent": "CoheronConnect-QA-Test/1.0" },
    ip: "127.0.0.1",
    cookies: {},
  } as never;
}

describe("API keys — issued prefix matches the prefix the auth middleware accepts", () => {
  let orgId: string;
  let userId: string;
  let caller: ReturnType<typeof integrationsRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" }));
    caller = integrationsRouter.createCaller(createMockContext(userId, orgId));
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  it("mints keys with the shared API_KEY_PREFIX", async () => {
    const created = await caller.createApiKey({ name: "CI key", permissions: {} });
    const raw = created.keyOnce;
    expect(raw.startsWith(API_KEY_PREFIX)).toBe(true);
  });

  it("authenticates a request made with a freshly created key (the defect: it did not)", async () => {
    const created = await caller.createApiKey({ name: "Auth key", permissions: {} });
    const raw = created.keyOnce;

    const ctx = await createContext(reqWithBearer(raw));

    // Before the fix this was null — the token never entered the API-key branch.
    expect(ctx.user).not.toBeNull();
    expect(ctx.user!.id).toBe(userId);
    expect(ctx.org).not.toBeNull();
    expect(ctx.org!.id).toBe(orgId);
  });

  it("still rejects a token bearing the old, unissuable prefix", async () => {
    const ctx = await createContext(reqWithBearer("nxk_" + "0".repeat(64)));
    expect(ctx.user).toBeNull();
  });
});
