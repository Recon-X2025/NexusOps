# Command Center architecture

The **CoheronConnect Command Center** is the executive front door (`/app/command`) with a **single default organization overview**. Access is gated by `command_center.read`; there is no per-user lens switching in the UI.

## Data flow

1. **`packages/metrics`** — Typed metric registry (`MetricDefinition`, `RoleView`, contributions under `src/contributions/`). Each metric declares `function`, `dimension`, `direction`, `appearsIn` (role × surface × priority), and a `resolve(ctx)` that returns `MetricValue` (current, optional previous, series, `state`).
2. **`apps/api`** — `commandCenter` tRPC router calls `buildCommandCenterPayload()` for a fixed default `RoleViewKey` (CEO rollup), resolves metrics in parallel, assembles heatmap / bullets / trends / flow / risks / attention, caches per `(org, range)` in Redis (~30s), optionally enriches narrative via Claude, and audit-logs the view.
3. **`apps/web`** — `/app/command` consumes `commandCenter.getView` and renders dumb section components; drill targets are URLs from metric definitions.

## Adding a metric

1. Add `packages/metrics/src/contributions/<domain>.ts` and call `registerMetric({ ... })`.
2. Import that file from `packages/metrics/src/contributions/index.ts`.
3. No UI or router edits are required unless the new metric introduces a novel surface.

## RBAC

- Module: `command_center` with action `read` (required to open `/app/command` and call `getView` / `generateNarrative`).
- The metrics registry still tags definitions by `RoleViewKey` for layout; the live Command Center always uses the default CEO rollup for assembly.

## Related docs

- Operator / developer: `apps/docs/pages/command-center.mdx`
- Full build checklist / PR text: `docs/COMMAND_CENTER_BUILD.md`
