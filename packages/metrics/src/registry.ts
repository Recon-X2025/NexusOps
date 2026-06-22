import type { FunctionKey, MetricDefinition, MetricSurface, RoleView, RoleViewKey } from "./types";
import { ROLE_VIEWS } from "./roles";

const metricsById = new Map<string, MetricDefinition>();

export function registerMetric(def: MetricDefinition): void {
  if (metricsById.has(def.id)) {
    console.warn(`[metrics] duplicate registration ignored: ${def.id}`);
    return;
  }
  metricsById.set(def.id, def);
}

export function getMetric(id: string): MetricDefinition | undefined {
  return metricsById.get(id);
}

export function getAllMetricDefinitions(): MetricDefinition[] {
  return [...metricsById.values()];
}

export function getMetricsForRole(role: RoleViewKey): MetricDefinition[] {
  const seen = new Set<string>();
  const out: MetricDefinition[] = [];
  for (const m of metricsById.values()) {
    if (m.appearsIn.some((a) => a.role === role) && !seen.has(m.id)) {
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}

export function getMetricsForSurface(role: RoleViewKey, surface: MetricSurface): MetricDefinition[] {
  return getAllMetricDefinitions()
    .filter((m) => m.appearsIn.some((a) => a.role === role && a.surface === surface))
    .sort((a, b) => {
      const pa = Math.min(...a.appearsIn.filter((x) => x.role === role && x.surface === surface).map((x) => x.priority));
      const pb = Math.min(...b.appearsIn.filter((x) => x.role === role && x.surface === surface).map((x) => x.priority));
      return pa - pb;
    });
}

/**
 * Hub-scoped metric lookup. Returns every metric whose `function` matches
 * `fn`, optionally narrowed to those that appear on a given visual surface
 * (e.g. "bullet", "trend", "risk", "heatmap") for any role. Sorted by best
 * (lowest) priority across all roles so hub dashboards reuse the same
 * priority ordering operators see in role-scoped Command Center views.
 */
export function getMetricsForFunction(
  fn: FunctionKey,
  surface?: MetricSurface,
): MetricDefinition[] {
  const matches = getAllMetricDefinitions().filter((m) => m.function === fn);
  if (!surface) return matches;
  return matches
    .filter((m) => m.appearsIn.some((a) => a.surface === surface))
    .sort((a, b) => {
      const pa = Math.min(...a.appearsIn.filter((x) => x.surface === surface).map((x) => x.priority));
      const pb = Math.min(...b.appearsIn.filter((x) => x.surface === surface).map((x) => x.priority));
      return pa - pb;
    });
}

export function getAllRoles(): RoleView[] {
  return ROLE_VIEWS;
}

export function getRoleView(key: RoleViewKey): RoleView | undefined {
  return ROLE_VIEWS.find((r) => r.key === key);
}

/** @internal */
export function __resetMetricRegistryForTests(): void {
  metricsById.clear();
}
