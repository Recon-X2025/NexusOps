import {
  ALL_FUNCTION_KEYS,
  ALL_METRIC_DIMENSIONS,
  getMetricsForRole,
  getMetricsForSurface,
  getMetricsForFunction,
  getRoleView,
  formatMetricNumber,
  emptyMetricValue,
  type MetricDefinition,
  type MetricResolveCtx,
  type MetricValue,
  type RoleViewKey,
  type FunctionKey,
  type MetricDimension,
  type MetricSurface,
  type CommandCenterPayload,
  type AttentionItem,
  type BulletMetric,
  type TrendMetric,
  type FlowItem,
  type RiskItem,
} from "@coheronconnect/metrics";

const RESOLVER_TIMEOUT_MS = 3000;

function dedupedAppend(acc: MetricDefinition[], add: MetricDefinition[], cap: number): MetricDefinition[] {
  const seen = new Set(acc.map((d) => d.id));
  for (const d of add) {
    if (acc.length >= cap) break;
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    acc.push(d);
  }
  return acc;
}

function withResolverTimeout(def: MetricDefinition, ctx: MetricResolveCtx): Promise<MetricValue> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`command_center_metric_timeout:${def.id}`)),
      RESOLVER_TIMEOUT_MS,
    );
    def
      .resolve(ctx)
      .then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
  });
}

async function resolveMetricsSafe(defs: MetricDefinition[], ctx: MetricResolveCtx): Promise<MetricValue[]> {
  const results = await Promise.allSettled(defs.map((d) => withResolverTimeout(d, ctx)));
  return results.map((r, i) => {
    const def = defs[i]!;
    if (r.status === "fulfilled") return r.value;
    const reason = r.reason;
    console.warn(`[command-center] metric ${def.id} resolver failed:`, reason);
    return { ...emptyMetricValue("no_data"), lastUpdated: new Date() };
  });
}

const STATE_SCORE: Record<MetricValue["state"], number> = {
  healthy: 100,
  watch: 50,
  stressed: 0,
  no_data: 0, // No data doesn't contribute positively
};

function toCellState(def: MetricDefinition, value: MetricValue): MetricCellState {
  if (value.state === "no_data") return { kind: "no_data" };
  const val = value.current;
  const target = def.target ?? value.target;
  const kind = value.state === "stressed" ? "unhealthy" : value.state === "watch" ? "watch" : "healthy";
  return { kind, value: val, target };
}

function drillForMetric(def: MetricDefinition, tenantId: string): string | undefined {
  if (!def.drillUrl) return undefined;
  return typeof def.drillUrl === "function" ? def.drillUrl({ tenantId } as never) : def.drillUrl;
}

function compositeScore(values: MetricValue[]): { 
  score: number; 
  scoreState: CommandCenterPayload["scoreState"];
  domainsReporting: number;
  totalDomains: number;
} {
  const dataPoints = values.filter(v => v.state !== 'no_data');
  const totalDomains = ALL_FUNCTION_KEYS.length;
  // We'll calculate domainsReporting later in buildCommandCenterPayload
  
  if (dataPoints.length === 0) {
    return { score: 0, scoreState: "awaiting_data", domainsReporting: 0, totalDomains };
  }

  const s = Math.round(dataPoints.reduce((a, v) => a + STATE_SCORE[v.state], 0) / dataPoints.length);
  const scoreState = s >= 90 ? "healthy" : s >= 40 ? "watch" : "stressed";
  return { score: Math.min(100, Math.max(0, s)), scoreState, domainsReporting: 0, totalDomains };
}

/**
 * Trailing-average target synthesis for hub bullets.
 *
 * Used in `buildHubPayload` when a metric definition doesn't carry an
 * explicit target — we still want the "Key targets" panel to render
 * something useful. The synthesized target is direction-aware:
 *   - higher_is_better -> aim 10% above trailing average ("stretch up")
 *   - lower_is_better  -> aim 15% below trailing average ("squeeze down")
 *
 * If the metric has no series, fall back to the current value with the
 * same direction-adjusted factor so the bullet always has SOMETHING to
 * compare against. Returns `undefined` only when neither series nor a
 * meaningful current value is available — caller should then leave the
 * target empty rather than fabricating a number from zero.
 */
function synthesizeTarget(def: MetricDefinition, value: MetricValue): number | undefined {
  if (def.target !== undefined) return def.target;
  if (value.target !== undefined) return value.target;

  const series = value.series ?? [];
  // Use the trailing window (excluding the most recent point — that's the
  // "current" we're comparing against).
  const trailing = series.length > 1 ? series.slice(0, -1) : series;
  const baseline =
    trailing.length > 0
      ? trailing.reduce((a, p) => a + p.v, 0) / trailing.length
      : value.state === "no_data"
      ? null
      : value.current;
  if (baseline == null || !Number.isFinite(baseline)) return undefined;
  if (Math.abs(baseline) < 0.0001) return undefined;
  const factor = def.direction === "higher_is_better" ? 1.1 : 0.85;
  const t = baseline * factor;
  return Math.round(t * 100) / 100;
}

/**
 * "Worst-N" risk fallback. Computes a non-negative penalty per metric
 * that captures how far it is from healthy:
 *   - lower_is_better: penalty = max(0, current - target)/|target|
 *   - higher_is_better: penalty = max(0, target - current)/|target|
 *   - if no target: penalty = |current - trailing_mean|/|trailing_mean|
 * Stressed/watch states also contribute a flat penalty so live posture
 * still wins when present. Used to seed Risks when no metric is
 * currently stressed/watch.
 */
function riskPenalty(def: MetricDefinition, value: MetricValue): number {
  if (value.state === "stressed") return 1.5;
  if (value.state === "watch") return 0.75;
  const target = def.target ?? value.target;
  const cur = value.current;
  if (target !== undefined && Math.abs(target) > 0.0001) {
    const breach =
      def.direction === "higher_is_better"
        ? Math.max(0, target - cur)
        : Math.max(0, cur - target);
    return breach / Math.abs(target);
  }
  const series = value.series ?? [];
  if (series.length > 1) {
    const trailing = series.slice(0, -1);
    const mean = trailing.reduce((a, p) => a + p.v, 0) / trailing.length;
    if (Math.abs(mean) < 0.0001) return 0;
    const drift = def.direction === "higher_is_better" ? mean - cur : cur - mean;
    return Math.max(0, drift / Math.abs(mean));
  }
  return 0;
}

function pickHeatmapMetric(
  role: RoleViewKey,
  fn: FunctionKey,
  dim: MetricDimension,
  defs: MetricDefinition[],
): MetricDefinition | undefined {
  const candidates = defs.filter(
    (m) =>
      m.function === fn &&
      m.dimension === dim &&
      m.appearsIn.some((a) => a.role === role && a.surface === "heatmap"),
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, cur) => {
    const p = Math.min(...cur.appearsIn.filter((a) => a.role === role && a.surface === "heatmap").map((a) => a.priority));
    const bp = Math.min(...best.appearsIn.filter((a) => a.role === role && a.surface === "heatmap").map((a) => a.priority));
    return p <= bp ? cur : best;
  });
}

function buildAttention(
  role: RoleViewKey,
  view: ReturnType<typeof getRoleView>,
  byId: Record<string, MetricValue>,
  defs: MetricDefinition[],
  tenantId: string,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const seen = new Set<string>();

  for (const m of defs) {
    if (!m.appearsIn.some((a) => a.role === role && a.surface === "attention")) continue;
    const v = byId[m.id];
    if (!v) continue;
    if (v.state === "stressed" || v.state === "watch") {
      items.push({
        metricId: m.id,
        function: m.function,
        label: m.label,
        severity: v.state === "stressed" ? "high" : "watch",
        message: `${m.label} is ${v.state.replace("_", " ")}.`,
        displayValue: formatMetricNumber(v.current, m.unit, v.state),
      drillUrl: drillForMetric(m, tenantId),
      });
      seen.add(m.id);
    }
  }

  if (view) {
    for (const rule of view.attentionRules) {
      if (seen.has(rule.metricId)) continue;
      const v = byId[rule.metricId];
      const def = defs.find((d) => d.id === rule.metricId);
      if (!v || !def) continue;
      let hit = false;
      if (rule.when === "state_is_stressed" && v.state === "stressed") hit = true;
      if (rule.when === "state_is_watch" && v.state === "watch") hit = true;
      if (rule.when === "breached_target" && def.target !== undefined && v.state !== "no_data") {
        if (def.direction === "higher_is_better" && v.current < def.target) hit = true;
        if (def.direction === "lower_is_better" && v.current > def.target) hit = true;
      }
      if (hit) {
        items.push({
          metricId: rule.metricId,
          function: def.function,
          label: def.label,
          severity: rule.severity,
          message: `${def.label} triggered ${rule.when.replace(/_/g, " ")}.`,
          drillUrl: drillForMetric(def, tenantId),
        });
        seen.add(rule.metricId);
      }
    }
  }

  return items.slice(0, 5);
}

function worstFunctionFromHeatmap(
  heatmap: CommandCenterPayload["heatmap"],
): { fn: FunctionKey | null; state: CommandCenterPayload["scoreState"] } {
  let worstFn: FunctionKey | null = null;
  let worstScore = 101;
  for (const row of heatmap) {
    if (!row.inScope) continue;
    for (const dim of ALL_METRIC_DIMENSIONS) {
      const cell = row.cells[dim];
      const s = STATE_SCORE[cell.state];
      if (s < worstScore) {
        worstScore = s;
        worstFn = row.function;
      }
    }
  }
  const state: CommandCenterPayload["scoreState"] =
    worstScore <= 40 ? "stressed" : worstScore < 90 ? "watch" : "healthy";
  return { fn: worstFn, state };
}

export function buildDeterministicNarrative(
  role: RoleViewKey,
  score: number,
  scoreState: CommandCenterPayload["scoreState"],
  heatmap: CommandCenterPayload["heatmap"],
): string {
  const view = getRoleView(role);
  const { fn, state: fnState } = worstFunctionFromHeatmap(heatmap);
  const isDataEmpty = score === 0 && heatmap.every(r => Object.values(r.cells).every(c => c.state === 'no_data'));
  
  if (isDataEmpty) {
    return "The command center is currently awaiting data. Please ingest records into your modules to begin generating live operational and financial insights.";
  }

  const intro =
    view?.narrativeTemplate ??
    "This lens summarizes operational and financial signals for your organization.";
  const s1 = `Overall posture is ${scoreState} with a composite score of ${score}. ${intro}`;
  const s2 = fn
    ? `The weakest functional row right now is ${fn.replace("_", " ")} (${fnState}).`
    : "No single functional row is materially off trend versus peers in this lens.";
  return `${s1} ${s2}`;
}

export async function buildCommandCenterPayload(input: {
  role: RoleViewKey;
  detectedRole: RoleViewKey;
  canOverride: boolean;
  tenantId: string;
  userId: string;
  range: MetricResolveCtx["range"];
  db: unknown;
}): Promise<CommandCenterPayload> {
  const { role, detectedRole, canOverride, tenantId, userId, range, db } = input;
  const ctx: MetricResolveCtx = { tenantId, userId, range, services: { db } };

  const defs = getMetricsForRole(role);
  const uniqueDefs = [...new Map(defs.map((d) => [d.id, d])).values()];
  const resolvedList = await resolveMetricsSafe(uniqueDefs, ctx);
  const byId: Record<string, MetricValue> = {};
  uniqueDefs.forEach((d, i) => {
    byId[d.id] = resolvedList[i]!;
  });

  const { score: rawScore, scoreState: rawScoreState } = compositeScore(resolvedList);
  const totalDomains = ALL_FUNCTION_KEYS.length;

  const view = getRoleView(role);
  const heatmap: CommandCenterPayload["heatmap"] = ALL_FUNCTION_KEYS.map((fn) => {
    const inScope = view?.scopedFunctions.includes(fn) ?? true;
    const cells = {} as CommandCenterPayload["heatmap"][number]["cells"];
    for (const dim of ALL_METRIC_DIMENSIONS) {
      if (!inScope) {
        cells[dim] = { state: "no_data", value: null, label: "—", cellState: { kind: "not_applicable" } };
        continue;
      }
      const m = pickHeatmapMetric(role, fn, dim, uniqueDefs);
      if (!m) {
        cells[dim] = { state: "no_data", value: null, label: "—", cellState: { kind: "not_applicable" } };
        continue;
      }
      const v = byId[m.id]!;
      cells[dim] = {
        state: v.state,
        cellState: toCellState(m, v),
        value: v.state === "no_data" ? null : v.current,
        label: m.label,
        unit: m.unit,
        displayValue: formatMetricNumber(v.current, m.unit, v.state),
        drillUrl: drillForMetric(m, tenantId),
      };
    }
    return { function: fn, cells, inScope };
  });

  const domainsReporting = heatmap.filter(row => {
    if (!row.inScope) return false;
    const fn = row.function;
    const metricsForFn = uniqueDefs.filter(d => d.function === fn);
    return metricsForFn.some(d => {
      const v = byId[d.id];
      if (!v || v.state === 'no_data') return false;
      // If it's a "Healthy 0", check if there's any non-zero history in the series
      if (v.state === 'healthy' && (v.current === 0 || v.current === null)) {
        return (v.series && v.series.length > 0 && v.series.some(s => (s.value ?? 0) > 0)) ?? false;
      }
      return true;
    });
  }).length;

  const scoreState = domainsReporting === 0 ? 'awaiting_data' : rawScoreState;
  const score = domainsReporting === 0 ? 0 : rawScore;

  const scoreSubtext = scoreState === 'awaiting_data' 
    ? "Awaiting module data"
    : domainsReporting < totalDomains
    ? `Composite of ${domainsReporting} of ${totalDomains} domains`
    : undefined;

  const bulletDefs = getMetricsForSurface(role, "bullet").slice(0, 5);
  const bullets: BulletMetric[] = bulletDefs.map((m) => {
    const v = byId[m.id]!;
    return {
      metricId: m.id,
      function: m.function,
      dimension: m.dimension,
      label: m.label,
      unit: m.unit,
      current: v.current,
      target: m.target ?? v.target,
      state: v.state,
      cellState: toCellState(m, v),
      direction: m.direction,
      displayValue: formatMetricNumber(v.current, m.unit, v.state),
      drillUrl: drillForMetric(m, tenantId),
    };
  });

  // Trend selection: Prioritize alerting metrics that carry timeseries data
  const explicitTrends = getMetricsForSurface(role, "trend");
  const alertingTrends = uniqueDefs.filter(
    (d) => (byId[d.id]?.series.length ?? 0) >= 1 && (byId[d.id]?.state === "stressed" || byId[d.id]?.state === "watch")
  );
  const seriesCarriers = uniqueDefs.filter((d) => (byId[d.id]?.series.length ?? 0) >= 1);

  const trendDefs = dedupedAppend(
    dedupedAppend(dedupedAppend([], explicitTrends, 6), alertingTrends, 6),
    seriesCarriers,
    6
  );

  const trends: TrendMetric[] = trendDefs.map((m) => {
    const v = byId[m.id]!;
    return {
      metricId: m.id,
      function: m.function,
      label: m.label,
      current: v.current,
      previous: v.previous,
      unit: m.unit,
      state: v.state,
      cellState: toCellState(m, v),
      direction: m.direction,
      series: v.series,
      displayValue: formatMetricNumber(v.current, m.unit, v.state),
      drillUrl: drillForMetric(m, tenantId),
    };
  });

  // Risk register selection: Prioritize live alerting states (stressed/watch) from the heatmap pool
  const explicitRisks = getMetricsForSurface(role, "risk");
  const liveStress = uniqueDefs.filter(
    (d) => byId[d.id]?.state === "stressed" || byId[d.id]?.state === "watch",
  );
  const worstByPenalty = [...uniqueDefs]
    .map((d) => ({ d, p: riskPenalty(d, byId[d.id]!) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p)
    .map((x) => x.d);

  const riskDefs = dedupedAppend(
    dedupedAppend(dedupedAppend([], explicitRisks, 8), liveStress, 8),
    worstByPenalty,
    8,
  );

  const risks: RiskItem[] = riskDefs
    .map((m) => ({ m, v: byId[m.id]! }))
    .filter(({ v }) => v.state === "stressed" || v.state === "watch")
    .map(({ m, v }) => ({
      metricId: m.id,
      function: m.function,
      label: m.label,
      severity: v.state === "stressed" ? "high" : "watch",
      detail: `${m.label}: ${formatMetricNumber(v.current, m.unit, v.state)}`,
      displayValue: formatMetricNumber(v.current, m.unit, v.state),
      drillUrl: drillForMetric(m, tenantId),
    }));

  const flow: FlowItem[] = [];
  const globalFlowFunctions: FunctionKey[] = ["it_services", "customer", "devops"];
  
  for (const fn of globalFlowFunctions) {
    const seeds = HUB_FLOW_SEEDS[fn] ?? [];
    if (seeds.length === 0) continue;
    const seed = seeds[0]!; // Take the primary flow for the global view
    const createdVal = byId[seed.createdId];
    if (!createdVal) continue;

    const created = createdVal.current ?? 0;
    let resolved = 0;
    if (seed.resolvedRateId) {
      const rate = byId[seed.resolvedRateId]?.current ?? 0;
      resolved = Math.round(created * (rate / 100));
    } else if (seed.resolvedId) {
      resolved = byId[seed.resolvedId]?.current ?? 0;
    }
    
    flow.push({ 
      function: fn, 
      label: seed.label, 
      created, 
      resolved 
    });
  }

  const attention = buildAttention(role, view, byId, uniqueDefs, tenantId);

  const narrative = buildDeterministicNarrative(role, score, scoreState, heatmap);

  return {
    role,
    detectedRole,
    canOverride,
    asOf: new Date().toISOString(),
    score,
    scoreState,
    scoreSubtext,
    domainsReporting,
    totalDomains,
    narrative,
    attention,
    heatmap,
    bullets,
    trends,
    flow,
    risks,
  };
}

/**
 * Per-hub flow seeds. The Command Center flow panel reads these metric ids
 * to draw "created → resolved" throughput. Each hub has a different pair
 * because the underlying systems differ; missing entries simply hide the
 * flow panel for that hub instead of showing a fabricated zero/zero card.
 */
type FlowSeed = {
  label: string;
  createdId: string;
  resolvedId?: string;
  /** When set, resolved is created * (rate%/100). Used for `success_rate` style metrics. */
  resolvedRateId?: string;
};

/**
 * Per-function flow rows. Each function may declare multiple flow rows
 * (so the "Throughput" panel shows several lines instead of one). When
 * the function's metric pool can't supply paired created/resolved IDs,
 * `buildHubPayload` backfills additional rows from any `volume`
 * dimension metrics that resolved with non-zero values, treating
 * `current` as created and `previous` (if any) as resolved. This is the
 * most honest signal we can produce given the current registry — we
 * never fabricate IDs that don't exist.
 */
const HUB_FLOW_SEEDS: Partial<Record<FunctionKey, FlowSeed[]>> = {
  it_services: [
    {
      label: "Tickets",
      createdId: "tickets.throughput_created",
      resolvedId: "tickets.throughput_resolved",
    },
  ],
  customer: [
    {
      label: "Support cases",
      createdId: "csm.cases_created_period",
      resolvedId: "csm.cases_resolved_period",
    },
    {
      label: "New leads",
      createdId: "crm.new_leads",
    },
  ],
  devops: [
    {
      label: "Deploys",
      createdId: "devops.deploys_production_30d",
      resolvedId: "devops.deploys_production_30d",
      resolvedRateId: "devops.deploy_success_rate",
    },
  ],
  security: [
    {
      label: "Incidents",
      createdId: "security.incidents_open_total",
      resolvedId: "security.incidents_open_total",
    },
  ],
  finance: [
    {
      label: "Cash burn",
      createdId: "financial.burn_rate",
      resolvedId: "financial.burn_rate",
    },
  ],
};

/**
 * Builds a Command Center payload narrowed to a single hub (FunctionKey).
 *
 * Unlike `buildCommandCenterPayload` which selects bullets/trends/risks
 * from the global top-N for the active role, this function pulls top-N
 * **within the hub's own metric pool** so panels stay populated even when
 * a hub only owns a handful of metrics. The result has the same payload
 * shape as the org rollup so existing CommandCenter* visual primitives
 * render unchanged.
 */
export async function buildHubPayload(input: {
  fn: FunctionKey;
  tenantId: string;
  userId: string;
  range: MetricResolveCtx["range"];
  db: unknown;
}): Promise<CommandCenterPayload> {
  const { fn, tenantId, userId, range, db } = input;
  const ctx: MetricResolveCtx = { tenantId, userId, range, services: { db } };

  const hubDefs = getMetricsForFunction(fn);
  const uniqueDefs = [...new Map(hubDefs.map((d) => [d.id, d])).values()];

  // Resolve every hub metric once. With ~5–15 metrics per hub the
  // resolver fan-out is well below the org rollup's ~50.
  const resolvedList = await resolveMetricsSafe(uniqueDefs, ctx);
  const byId: Record<string, MetricValue> = {};
  uniqueDefs.forEach((d, i) => {
    byId[d.id] = resolvedList[i]!;
  });

  // Score / posture from the hub's own metrics — not the org composite.
  const { score: rawScore, scoreState: rawScoreState } = compositeScore(resolvedList);
  const totalDomains = 1;

  // Single-row heatmap with a cell per dimension. We pick the
  // best-priority metric registered on **any** role's heatmap surface so
  // hubs without explicit heatmap mappings still surface a value when
  // there is one to surface.
  const cells = {} as CommandCenterPayload["heatmap"][number]["cells"];
  for (const dim of ALL_METRIC_DIMENSIONS) {
    const candidates = getMetricsForFunction(fn, "heatmap").filter((m) => m.dimension === dim);
    const m = candidates[0];
    if (!m) {
      // Fall back to any metric in this dim — a value is more useful than "—".
      const fallback = uniqueDefs.find((d) => d.dimension === dim);
      if (!fallback) {
        cells[dim] = { state: "no_data", value: null, label: "—", cellState: { kind: "not_applicable" } };
        continue;
      }
      const v = byId[fallback.id]!;
      cells[dim] = {
        state: v.state,
        cellState: toCellState(fallback, v),
        value: v.state === "no_data" ? null : v.current,
        label: fallback.label,
        unit: fallback.unit,
        drillUrl: drillForMetric(fallback, tenantId),
      };
      continue;
    }
    const v = byId[m.id]!;
    cells[dim] = {
      state: v.state,
      cellState: toCellState(m, v),
      value: v.state === "no_data" ? null : v.current,
      label: m.label,
      unit: m.unit,
      displayValue: formatMetricNumber(v.current, m.unit, v.state),
      drillUrl: drillForMetric(m, tenantId),
    };
  }
  const heatmap: CommandCenterPayload["heatmap"] = [{ function: fn, cells, inScope: true }];

  const domainsReporting = heatmap.filter(row => {
    const metricsForFn = uniqueDefs.filter(d => d.function === fn);
    return metricsForFn.some(d => {
      const v = byId[d.id];
      if (!v || v.state === 'no_data') return false;
      if (v.state === 'healthy' && (v.current === 0 || v.current === null)) {
        return (v.series && v.series.length > 0 && v.series.some(s => (s.value ?? 0) > 0)) ?? false;
      }
      return true;
    });
  }).length;

  const scoreState = domainsReporting === 0 ? 'awaiting_data' : rawScoreState;
  const score = domainsReporting === 0 ? 0 : rawScore;

  const scoreSubtext = scoreState === 'awaiting_data' 
    ? "Awaiting data"
    : undefined;

  // Bullets / trends / risks come from this hub's own surface assignments
  // (any role). The metrics registry was tuned for the org rollup so most
  // hubs only have one or two explicit `bullet` / `trend` assignments —
  // we backfill from the hub's general metric pool so the panels stay
  // populated.
  const bestPriority = (m: MetricDefinition, surface?: MetricSurface) => {
    const matching = surface ? m.appearsIn.filter((a) => a.surface === surface) : m.appearsIn;
    return matching.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...matching.map((a) => a.priority));
  };
  const sortByOwnPriority = (defs: MetricDefinition[]) =>
    [...defs].sort((a, b) => bestPriority(a) - bestPriority(b));


  const explicitBullets = getMetricsForFunction(fn, "bullet");
  // Bullets benefit from a target. Backfill with any hub metric that has a
  // numeric target (meaningful "is the dial green?" signal).
  const targetCarriers = sortByOwnPriority(uniqueDefs.filter((d) => d.target !== undefined));
  const filler = sortByOwnPriority(uniqueDefs);
  const bulletDefs = dedupedAppend(
    dedupedAppend(dedupedAppend([], explicitBullets, 5), targetCarriers, 5),
    filler,
    5,
  );
  const bullets: BulletMetric[] = bulletDefs.map((m) => {
    const v = byId[m.id]!;
    // Synthesize target from trailing average if the metric definition
    // doesn't carry one. This stops "Key targets" from going empty for
    // hubs where most metrics are observational rather than targeted.
    const target = synthesizeTarget(m, v);
    return {
      metricId: m.id,
      function: m.function,
      dimension: m.dimension,
      label: m.label,
      unit: m.unit,
      current: v.current,
      target,
      state: v.state,
      cellState: toCellState(m, v),
      direction: m.direction,
      displayValue: formatMetricNumber(v.current, m.unit, v.state),
      drillUrl: drillForMetric(m, tenantId),
    };
  });

  const explicitTrends = getMetricsForFunction(fn, "trend");
  // Trends need timeseries — any hub metric whose resolver returned a
  // non-trivial series is a valid trend card.
  const seriesCarriers = sortByOwnPriority(uniqueDefs.filter((d) => (byId[d.id]?.series.length ?? 0) >= 1));
  const trendDefs = dedupedAppend(dedupedAppend([], explicitTrends, 6), seriesCarriers, 6);
  const trends: TrendMetric[] = trendDefs.map((m) => {
    const v = byId[m.id]!;
    return {
      metricId: m.id,
      function: m.function,
      dimension: m.dimension,
      label: m.label,
      current: v.current,
      previous: v.previous,
      unit: m.unit,
      state: v.state,
      cellState: toCellState(m, v),
      direction: m.direction,
      series: v.series,
      displayValue: formatMetricNumber(v.current, m.unit, v.state),
      drillUrl: drillForMetric(m, tenantId),
    };
  });

  const explicitRisks = getMetricsForFunction(fn, "risk");
  // Risk register layering:
  //   1. Anything explicitly tagged as a `risk` surface for this hub.
  //   2. Anything currently in stressed/watch state (live posture).
  //   3. Worst-N by `riskPenalty` — gap to target / drift from mean —
  //      so the panel still reflects "least healthy" items on a green
  //      day instead of going blank.
  const liveStress = sortByOwnPriority(
    uniqueDefs.filter((d) => byId[d.id]?.state === "stressed" || byId[d.id]?.state === "watch"),
  );
  const worstByPenalty = [...uniqueDefs]
    .map((d) => ({ d, p: riskPenalty(d, byId[d.id]!) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p)
    .map((x) => x.d);
  const riskDefs = dedupedAppend(
    dedupedAppend(dedupedAppend([], explicitRisks, 8), liveStress, 8),
    worstByPenalty,
    8,
  );
  const risks: RiskItem[] = riskDefs
    .map((m) => ({ m, v: byId[m.id]! }))
    .filter(({ v }) => v.state === "stressed" || v.state === "watch")
    .map(({ m, v }) => ({
      metricId: m.id,
      function: m.function,
      label: m.label,
      severity: v.state === "stressed" ? "high" : "watch",
      detail: `${m.label}: ${formatMetricNumber(v.current, m.unit, v.state)}`,
      displayValue: formatMetricNumber(v.current, m.unit, v.state),
      drillUrl: drillForMetric(m, tenantId),
    }));

  // Attention rail: any hub metric currently in stressed/watch state.
  const attention: AttentionItem[] = uniqueDefs
    .map((m) => ({ m, v: byId[m.id]! }))
    .filter(({ v }) => v.state === "stressed" || v.state === "watch")
    .slice(0, 6)
    .map(({ m, v }) => ({
      metricId: m.id,
      function: m.function,
      label: m.label,
      severity: v.state === "stressed" ? "high" : "watch",
      message: `${m.label} is ${v.state.replace("_", " ")}.`,
      drillUrl: drillForMetric(m, tenantId),
    }));

  // Throughput / flow rows. Strategy:
  //   1. Use the per-function HUB_FLOW_SEEDS list to populate explicit
  //      created/resolved pairs (real metric IDs only — never fabricated).
  //   2. Backfill with up to 3 additional rows from any `volume` dimension
  //      metric that resolved with a non-zero current value, treating
  //      `current` as created and `previous` as resolved (so the bar
  //      still has shape). This stops the Throughput panel from
  //      showing a single line for hubs whose flow seeds are sparse.
  const flow: FlowItem[] = [];
  const usedFlowIds = new Set<string>();
  const seeds = HUB_FLOW_SEEDS[fn] ?? [];
  for (const seed of seeds) {
    const createdVal = byId[seed.createdId];
    if (!createdVal) continue;
    const created = createdVal.current ?? 0;
    let resolved = 0;
    if (seed.resolvedRateId) {
      const rate = byId[seed.resolvedRateId]?.current ?? 0;
      resolved = Math.round(created * (rate / 100));
    } else if (seed.resolvedId) {
      resolved = byId[seed.resolvedId]?.current ?? 0;
    }
    flow.push({ function: fn, label: seed.label, created, resolved });
    usedFlowIds.add(seed.createdId);
    if (seed.resolvedId) usedFlowIds.add(seed.resolvedId);
  }
  if (flow.length < 3) {
    const volumeMetrics = uniqueDefs
      .filter((d) => d.dimension === "volume" && !usedFlowIds.has(d.id))
      .map((d) => ({ d, v: byId[d.id]! }))
      .filter(({ v }) => v.state !== "no_data" && Math.abs(v.current ?? 0) > 0)
      .sort((a, b) => Math.abs(b.v.current ?? 0) - Math.abs(a.v.current ?? 0))
      .slice(0, 3 - flow.length);
    for (const { d, v } of volumeMetrics) {
      const created = Math.round(v.current);
      const resolved = v.previous != null ? Math.round(v.previous) : Math.round(v.current);
      flow.push({ function: fn, label: d.label, created, resolved });
    }
  }

  // Reuse the deterministic narrative generator so the hub view's
  // narrative panel is populated even before the AI mutation completes.
  const narrative = buildDeterministicNarrative("ceo", score, scoreState, heatmap);

  return {
    role: "ceo",
    detectedRole: "ceo",
    canOverride: false,
    asOf: new Date().toISOString(),
    score,
    scoreState,
    scoreSubtext,
    domainsReporting,
    totalDomains,
    narrative,
    attention,
    heatmap,
    bullets,
    trends,
    flow,
    risks,
  };
}

export function narrativePromptForAi(input: {
  role: RoleViewKey;
  score: number;
  scoreState: CommandCenterPayload["scoreState"];
  bullets: BulletMetric[];
  attention: AttentionItem[];
}): string {
  const lines = input.bullets.slice(0, 5).map((b) => {
    const unit = b.unit ?? "";
    const st = b.state;
    const tgt = b.target != null ? String(b.target) : "n/a";
    return `${b.label}: ${b.current} ${unit} (target ${tgt}, state ${st})`;
  });
  return [
    `You are summarizing a ${input.role} executive dashboard for CoheronConnect.`,
    `Health score: ${input.score}/100 (${input.scoreState}).`,
    "Top metrics:",
    ...lines,
    "",
    "Write a 2-sentence narrative for the executive. Sentence 1: overall posture in plain language.",
    "Sentence 2: identify the single biggest soft spot by name and what it means for the business.",
    "Do not invent numbers. Do not list more than 2 metrics by name. Do not editorialize.",
    "Output plain text only.",
  ].join("\n");
}
