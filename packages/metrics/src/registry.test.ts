import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerMetric,
  getMetric,
  getMetricsForRole,
  __resetMetricRegistryForTests,
} from "./registry";
import type { MetricDefinition } from "./types";

beforeEach(() => {
  __resetMetricRegistryForTests();
});

function stubDef(id: string, role: "ceo" | "coo"): MetricDefinition {
  return {
    id,
    label: id,
    function: "strategy",
    dimension: "volume",
    direction: "higher_is_better",
    resolve: async () => ({
      current: 1,
      series: [],
      state: "healthy",
      lastUpdated: new Date(),
    }),
    appearsIn: [{ role, surface: "bullet", priority: 10 }],
  };
}

describe("metric registry", () => {
  it("registerMetric, getMetric, getMetricsForRole", () => {
    registerMetric(stubDef("m1", "ceo"));
    registerMetric(stubDef("m2", "ceo"));
    registerMetric(stubDef("m3", "coo"));

    expect(getMetric("m1")?.id).toBe("m1");
    const ceo = getMetricsForRole("ceo").map((m) => m.id).sort();
    expect(ceo).toEqual(["m1", "m2"]);
    expect(getMetricsForRole("cio").length).toBe(0);
  });

  it("dedupes by id (warns and ignores duplicate)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerMetric(stubDef("dup", "ceo"));
    registerMetric({ ...stubDef("dup", "ceo"), label: "second" });
    expect(getMetric("dup")?.label).toBe("dup");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
