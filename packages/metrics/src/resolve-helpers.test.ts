import { describe, it, expect } from "vitest";
import { stateFromFlowSeries, stateFromTrend } from "./resolve-helpers";

const series = (...vals: number[]) => vals.map((v, i) => ({ t: `b${i}`, v }));

describe("stateFromFlowSeries", () => {
  it("reads a STEADY flow as healthy (the bug read it as stressed)", () => {
    // 7 monthly buckets, all 50. The old code passed the range TOTAL (350) to
    // stateFromTrend, giving deviation = (350-50)/50 = 6 → 'stressed' on a
    // perfectly flat business. Judged latest-vs-trailing it is healthy.
    const s = series(50, 50, 50, 50, 50, 50, 50);
    expect(stateFromFlowSeries(s, "lower_is_better")).toBe("healthy");
    expect(stateFromFlowSeries(s, "higher_is_better")).toBe("healthy");

    // Prove the old miscall really did misfire, so this test documents WHY the
    // helper exists rather than just what it returns.
    const total = s.reduce((a, p) => a + p.v, 0);
    expect(stateFromTrend(total, s, "lower_is_better")).toBe("stressed");
  });

  it("flags a latest-period spike for a lower-is-better flow", () => {
    // e.g. tickets created jumps this month.
    expect(stateFromFlowSeries(series(50, 50, 50, 50, 50, 50, 100), "lower_is_better")).toBe("stressed");
  });

  it("flags a latest-period collapse for a higher-is-better flow", () => {
    // e.g. invoices paid falls off this month.
    expect(stateFromFlowSeries(series(50, 50, 50, 50, 50, 50, 20), "higher_is_better")).toBe("stressed");
  });

  it("marks a mild latest-period drift as watch, not stressed", () => {
    // latest 57 vs baseline 50 → +14% for a lower-is-better metric.
    expect(stateFromFlowSeries(series(50, 50, 50, 50, 50, 50, 57), "lower_is_better")).toBe("watch");
  });

  it("returns healthy when there is no series to judge from", () => {
    expect(stateFromFlowSeries([], "lower_is_better")).toBe("healthy");
    expect(stateFromFlowSeries(undefined, "higher_is_better")).toBe("healthy");
    // A single bucket has no trailing baseline → healthy, never a false alarm.
    expect(stateFromFlowSeries(series(999), "lower_is_better")).toBe("healthy");
  });
});
