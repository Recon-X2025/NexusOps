/**
 * Metric reachability (H6).
 *
 * Both devops metrics shipped with `appearsIn: []`, so `getMetricsForRole`
 * never included them in any role's set and the CIO attention rule
 * `devops.deploy_success_rate → state_is_stressed` was permanently inert — a
 * deploy-failure alert that could never fire. These tests lock the fix and
 * guard the whole class it fell into.
 */

import { describe, it, expect } from "vitest";
import { getAllMetricDefinitions, getAllRoles, getMetricsForRole } from "@coheronconnect/metrics";

describe("devops metrics reach the CIO board (H6)", () => {
  it("both devops metrics appear in the CIO metric set", () => {
    const ids = getMetricsForRole("cio").map((m) => m.id);
    expect(ids).toContain("devops.deploy_success_rate");
    expect(ids).toContain("devops.deploys_production_30d");
  });
});

describe("metric-registry invariants", () => {
  it("every attention rule references a metric reachable by that role (no inert rules)", () => {
    const offenders: string[] = [];
    for (const role of getAllRoles()) {
      const reachable = new Set(getMetricsForRole(role.key).map((m) => m.id));
      for (const rule of role.attentionRules) {
        if (!reachable.has(rule.metricId)) {
          offenders.push(`${role.key} → ${rule.metricId}`);
        }
      }
    }
    expect(offenders, `inert attention rules: ${offenders.join(", ")}`).toHaveLength(0);
  });

  it("no registered metric ships with an empty appearsIn (would be unreachable)", () => {
    const unreachable = getAllMetricDefinitions()
      .filter((m) => m.appearsIn.length === 0)
      .map((m) => m.id);
    expect(unreachable, `unreachable metrics: ${unreachable.join(", ")}`).toHaveLength(0);
  });
});
