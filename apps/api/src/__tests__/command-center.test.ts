import { describe, it, expect } from "vitest";
import { detectRoleViewKey } from "../lib/command-center-role";
import {
  buildDeterministicNarrative,
  buildCommandCenterPayload,
} from "../services/command-center-payload";
import type { CommandCenterPayload } from "@nexusops/metrics";

describe("command center role detection", () => {
  it("maps admin to CEO lens", () => {
    expect(detectRoleViewKey({ role: "admin", matrixRole: null })).toBe("ceo");
  });

  it("maps finance_manager matrix role to CFO lens", () => {
    expect(detectRoleViewKey({ role: "member", matrixRole: "finance_manager" })).toBe("cfo");
  });

  it("maps itil_admin to CIO lens", () => {
    expect(detectRoleViewKey({ role: "member", matrixRole: "itil_admin" })).toBe("cio");
  });
});

describe("command center narrative fallback", () => {
  it("buildDeterministicNarrative returns two sentences", () => {
    const heatmap: CommandCenterPayload["heatmap"] = [];
    const text = buildDeterministicNarrative("ceo", 72, "watch", heatmap);
    expect(text.split(".").length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildCommandCenterPayload (smoke, no DB)", () => {
  it("assembles CEO payload with mock db proxy", async () => {
    /** Minimal thenable query chain for Drizzle-style `await db.select()...`. */
    const emptyThenable = {
      select: () => emptyThenable,
      from: () => emptyThenable,
      where: () => emptyThenable,
      innerJoin: () => emptyThenable,
      groupBy: () => emptyThenable,
      orderBy: () => emptyThenable,
      limit: () => emptyThenable,
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve([]).then(resolve);
      },
    };
    const mockDb = {
      select: () => emptyThenable,
      insert: () => ({ values: () => ({ catch: () => Promise.resolve() }) }),
      execute: () => Promise.resolve([]),
    };

    const payload = await buildCommandCenterPayload({
      role: "ceo",
      detectedRole: "ceo",
      canOverride: true,
      tenantId: "00000000-0000-0000-0000-000000000099",
      userId: "00000000-0000-0000-0000-000000000088",
      range: {
        start: new Date("2026-01-01"),
        end: new Date("2026-04-01"),
        granularity: "week",
      },
      db: mockDb,
    });

    expect(payload.role).toBe("ceo");
    expect(payload.heatmap).toHaveLength(8);
    expect(payload.bullets.length).toBeLessThanOrEqual(5);
    expect(payload.trends.length).toBeLessThanOrEqual(6);
  });
});
