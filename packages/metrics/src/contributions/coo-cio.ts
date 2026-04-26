import { registerMetric } from "../registry";
import { emptyMetricValue } from "../resolve-helpers";

/** COO / CIO lens placeholders — resolvers return no_data until domain routers expose the right signals. */

registerMetric({
  id: "coo.vendor_sla_breaches",
  label: "Vendor SLA breaches",
  function: "strategy",
  dimension: "sla",
  direction: "lower_is_better",
  unit: "count",
  description: "// TODO: contribute from vendors / procurement SLA feed.",
  drillUrl: "/app/vendors",
  resolve: async () => emptyMetricValue("no_data"),
  appearsIn: [
    { role: "coo", surface: "bullet", priority: 10 },
    { role: "coo", surface: "heatmap", priority: 200 },
  ],
});

registerMetric({
  id: "cio.change_backlog",
  label: "Change backlog",
  function: "it_services",
  dimension: "risk",
  direction: "lower_is_better",
  unit: "count",
  description: "// TODO: contribute from changes router (scheduled vs pending).",
  drillUrl: "/app/changes",
  resolve: async () => emptyMetricValue("no_data"),
  appearsIn: [
    { role: "cio", surface: "bullet", priority: 8 },
    { role: "cio", surface: "heatmap", priority: 200 },
  ],
});
