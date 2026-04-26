import type { FunctionKey, MetricDefinition, MetricDimension, RoleViewKey } from "./types";

export interface AttentionItem {
  metricId: string;
  /** Functional area this metric rolls up to (e.g. "it_services"). Used for hub filtering. */
  function: FunctionKey;
  label: string;
  severity: "high" | "watch";
  message: string;
  drillUrl?: string;
}

export interface BulletMetric {
  metricId: string;
  function: FunctionKey;
  /** Metric dimension (volume / sla / risk / trend). Used by the workbench
   * Reports tab to filter to operator KPIs (volume + sla) only. */
  dimension: MetricDimension;
  label: string;
  unit?: string;
  current: number;
  target?: number;
  state: "healthy" | "watch" | "stressed" | "no_data";
  direction: "higher_is_better" | "lower_is_better";
  drillUrl?: string;
}

export interface TrendMetric {
  metricId: string;
  function: FunctionKey;
  dimension: MetricDimension;
  label: string;
  current: number;
  previous?: number;
  unit?: string;
  state: "healthy" | "watch" | "stressed" | "no_data";
  direction: "higher_is_better" | "lower_is_better";
  series: Array<{ t: string; v: number }>;
  drillUrl?: string;
}

export interface FlowItem {
  function: FunctionKey;
  label: string;
  created: number;
  resolved: number;
}

export interface RiskItem {
  metricId: string;
  function: FunctionKey;
  label: string;
  severity: "high" | "watch";
  detail: string;
  drillUrl?: string;
}

export interface CommandCenterPayload {
  role: RoleViewKey;
  detectedRole: RoleViewKey;
  canOverride: boolean;
  asOf: string;
  score: number;
  scoreState: "healthy" | "watch" | "stressed";
  narrative: string;
  attention: AttentionItem[];
  heatmap: Array<{
    function: FunctionKey;
    cells: Record<
      MetricDimension,
      {
        state: "healthy" | "watch" | "stressed" | "no_data";
        value: number | null;
        label: string;
        unit?: MetricDefinition["unit"];
        drillUrl?: string;
      }
    >;
    inScope: boolean;
  }>;
  bullets: BulletMetric[];
  trends: TrendMetric[];
  flow: FlowItem[];
  risks: RiskItem[];
}
