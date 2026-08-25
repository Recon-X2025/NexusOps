// packages/metrics — public type contract for the Command Center metric registry

export type MetricDimension = "volume" | "sla" | "risk" | "trend";

export type FunctionKey =
  | "it_services"
  | "security"
  | "people"
  | "customer"
  | "finance"
  | "legal"
  | "strategy"
  | "devops";

export type MetricDirection = "higher_is_better" | "lower_is_better";

export type RoleViewKey = "ceo" | "coo" | "cio" | "cfo" | "chro" | "ciso" | "cs" | "gc";

export interface MetricDefinition<TCtx = unknown> {
  id: string;
  label: string;
  function: FunctionKey;
  dimension: MetricDimension;
  direction: MetricDirection;
  unit?: "count" | "percent" | "currency_inr" | "days" | "hours" | "minutes" | "months" | "ratio" | "score";
  target?: number;
  description?: string;
  drillUrl?: string | ((ctx: TCtx) => string);
  resolve: (ctx: MetricResolveCtx) => Promise<MetricValue>;
  appearsIn: Array<{
    role: RoleViewKey;
    /** `heatmap` selects the metric for the function × dimension grid (extension to core surfaces). */
    surface: "hero" | "bullet" | "trend" | "flow" | "risk" | "attention" | "heatmap";
    priority: number;
  }>;
}

export type MetricSurface = MetricDefinition["appearsIn"][number]["surface"];

export interface MetricResolveCtx {
  tenantId: string;
  userId: string;
  range: { start: Date; end: Date; granularity: "day" | "week" | "month" };
  services: MetricServices;
}

/** Narrow facade — only what metric resolvers need. */
export interface MetricServices {
  db: unknown;
}

/** A single categorical bucket (e.g. an AR-aging band). */
export interface CategoryPoint {
  label: string;
  value: number;
  /** Optional qualitative state for per-bucket colouring. */
  state?: "healthy" | "watch" | "stressed";
}

/** A single scatter/bubble point (e.g. a project in a portfolio matrix). */
export interface ScatterPoint {
  label: string;
  x: number;
  y: number;
  size?: number;
  state?: "healthy" | "watch" | "stressed";
}

export interface MetricValue {
  current: number;
  previous?: number;
  target?: number;
  /**
   * `t` is a human display label (e.g. "Aug", "Mar 4") and is NOT unique across
   * years. `k` is the year-aware bucket key (ISO YYYY-MM-DD); clients aligning
   * multiple series onto one axis must dedup/order on `k`, not `t` — two "Aug"
   * points a year apart otherwise collapse into one. Optional for series built
   * without a bucket key.
   */
  series: Array<{ t: string; v: number; k?: string }>;
  /** Categorical distribution (buckets). Present only for distribution metrics. */
  categories?: CategoryPoint[];
  /** Scatter/bubble points. Present only for matrix metrics. */
  scatter?: ScatterPoint[];
  state: "healthy" | "watch" | "stressed" | "no_data";
  lastUpdated: Date;
}

export interface RoleView {
  key: RoleViewKey;
  label: string;
  rbacRoles: string[];
  scopedFunctions: FunctionKey[];
  narrativeTemplate: string;
  attentionRules: Array<{
    metricId: string;
    when: "state_is_stressed" | "state_is_watch" | "breached_target" | "anomaly";
    severity: "high" | "watch";
  }>;
}

export const ALL_FUNCTION_KEYS: FunctionKey[] = [
  "it_services",
  "security",
  "people",
  "customer",
  "finance",
  "legal",
  "strategy",
  "devops",
];

export const ALL_METRIC_DIMENSIONS: MetricDimension[] = ["volume", "sla", "risk", "trend"];
