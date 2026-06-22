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

export type MetricCellState =
  | { kind: "healthy"; value: string | number; target?: string | number }
  | { kind: "watch"; value: string | number; target?: string | number }
  | { kind: "stressed"; value: string | number; target?: string | number }
  | { kind: "no_data" }
  | { kind: "not_applicable" }
  | { kind: "stale"; value: string | number; lastSyncedAt: Date };

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
  cellState: MetricCellState;
  direction: "higher_is_better" | "lower_is_better";
  displayValue?: string;
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
  cellState: MetricCellState;
  direction: "higher_is_better" | "lower_is_better";
  series: Array<{ t: string; v: number }>;
  displayValue?: string;
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
  displayValue?: string;
  drillUrl?: string;
}

export interface CommandCenterPayload {
  role: RoleViewKey;
  detectedRole: RoleViewKey;
  canOverride: boolean;
  asOf: string;
  score: number;
  scoreState: "healthy" | "watch" | "stressed" | "awaiting_data";
  /** Optional subtext for the health score (e.g. "Composite of 3 of 8 domains") */
  scoreSubtext?: string;
  /** Count of functional domains actually reporting data. */
  domainsReporting: number;
  totalDomains: number;
  narrative: string;
  attention: AttentionItem[];
  heatmap: Array<{
    function: FunctionKey;
    cells: Record<
      MetricDimension,
      {
        state: "healthy" | "watch" | "stressed" | "no_data";
        cellState: MetricCellState;
        value: number | null;
        label: string;
        unit?: MetricDefinition["unit"];
        displayValue?: string;
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
