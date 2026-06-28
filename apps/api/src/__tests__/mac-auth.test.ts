/**
 * Functional auth tests for the MAC (platform super-admin) surface
 * (Phase 1 / Item 5).
 *
 * Verifies the end-to-end contract:
 *   1. With MAC_ENABLED unset, the surface is invisible (NOT_FOUND) — even login.
 *   2. With MAC_ENABLED=true but no/invalid operator token, privileged
 *      procedures reject (UNAUTHORIZED).
 *   3. login issues a MAC_JWT_SECRET-signed token that the gate accepts.
 *   4. A token signed with the wrong secret is rejected.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { appRouter } from "../routers";
import type { Context } from "../lib/trpc";
import { testDb } from "./helpers";

const MAC_SECRET = "test-mac-secret-please-rotate";
const MAC_EMAIL = "operator@platform.test";
const MAC_PASSWORD = "Sup3r-Secret-Op!";

function ctxWith(macToken: string | null): Context {
  return {
    db: testDb(),
    mongoDb: null,
    databaseProvider: "postgres",
    user: null,
    org: null,
    orgId: null,
    sessionId: null,
    requestId: null,
    ipAddress: "127.0.0.1",
    userAgent: "vitest-mac",
    idempotencyKey: null,
    macToken,
  };
}

function callerWith(macToken: string | null) {
  return appRouter.createCaller(ctxWith(macToken));
}

const savedEnv = {
  MAC_ENABLED: process.env["MAC_ENABLED"],
  MAC_JWT_SECRET: process.env["MAC_JWT_SECRET"],
  MAC_OPERATOR_EMAIL: process.env["MAC_OPERATOR_EMAIL"],
  MAC_OPERATOR_PASSWORD: process.env["MAC_OPERATOR_PASSWORD"],
};

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("Item 5: MAC surface authentication", () => {
  describe("when MAC_ENABLED is unset", () => {
    beforeEach(() => {
      delete process.env["MAC_ENABLED"];
      process.env["MAC_JWT_SECRET"] = MAC_SECRET;
      process.env["MAC_OPERATOR_EMAIL"] = MAC_EMAIL;
      process.env["MAC_OPERATOR_PASSWORD"] = MAC_PASSWORD;
    });

    it("hides privileged procedures (NOT_FOUND)", async () => {
      await expect(callerWith(null).mac.stats()).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("hides login too (NOT_FOUND)", async () => {
      await expect(
        callerWith(null).mac.login({ email: MAC_EMAIL, password: MAC_PASSWORD }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("when MAC_ENABLED=true", () => {
    beforeEach(() => {
      process.env["MAC_ENABLED"] = "true";
      process.env["MAC_JWT_SECRET"] = MAC_SECRET;
      process.env["MAC_OPERATOR_EMAIL"] = MAC_EMAIL;
      process.env["MAC_OPERATOR_PASSWORD"] = MAC_PASSWORD;
    });

    it("rejects a privileged procedure with no operator token", async () => {
      await expect(callerWith(null).mac.stats()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("rejects an invalid/wrong-secret token", async () => {
      const forged = jwt.sign({ role: "mac_operator" }, "the-wrong-secret", { expiresIn: "8h" });
      await expect(callerWith(forged).mac.stats()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("rejects a valid-signature token that lacks the operator role", async () => {
      const wrongRole = jwt.sign({ role: "tenant_user" }, MAC_SECRET, { expiresIn: "8h" });
      await expect(callerWith(wrongRole).mac.stats()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("login rejects bad credentials", async () => {
      await expect(
        callerWith(null).mac.login({ email: MAC_EMAIL, password: "wrong" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("login issues a token the gate accepts for privileged procedures", async () => {
      const { token } = await callerWith(null).mac.login({ email: MAC_EMAIL, password: MAC_PASSWORD });
      expect(typeof token).toBe("string");

      const stats = await callerWith(token).mac.stats();
      expect(typeof stats.orgs).toBe("number");
      expect(typeof stats.users).toBe("number");
    });
  });
});
