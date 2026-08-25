import { describe, it, expect } from "vitest";
import { detectRoleViewKey } from "../lib/command-center-role";
import {
  buildDeterministicNarrative,
  buildCommandCenterPayload,
} from "../services/command-center-payload";
import type { CommandCenterPayload } from "@coheronconnect/metrics";

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

describe("command center strips finance for callers denied financials (H7)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emptyThenable: any = {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockDb: any = {
    select: () => emptyThenable,
    insert: () => ({ values: () => ({ catch: () => Promise.resolve() }) }),
    execute: () => Promise.resolve([]),
  };
  const base = {
    role: "ceo" as const,
    detectedRole: "ceo" as const,
    canOverride: true,
    tenantId: "00000000-0000-0000-0000-000000000099",
    userId: "00000000-0000-0000-0000-000000000088",
    range: { start: new Date("2026-01-01"), end: new Date("2026-04-01"), granularity: "week" as const },
    db: mockDb,
  };

  it("marks the finance heatmap row not-in-scope and emits no finance metric when denied", async () => {
    const p = await buildCommandCenterPayload({ ...base, canReadFinancial: false });
    expect(p.heatmap.find((h) => h.function === "finance")?.inScope).toBe(false);
    expect(p.bullets.every((b) => b.function !== "finance")).toBe(true);
    expect(p.trends.every((t) => t.function !== "finance")).toBe(true);
    expect(p.risks.every((r) => r.function !== "finance")).toBe(true);
    expect(p.flow.every((f) => f.function !== "finance")).toBe(true);
  });

  it("keeps the finance row in scope when the caller may read financials", async () => {
    const p = await buildCommandCenterPayload({ ...base, canReadFinancial: true });
    expect(p.heatmap.find((h) => h.function === "finance")?.inScope).toBe(true);
  });
});
