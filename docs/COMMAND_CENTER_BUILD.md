# CoheronConnect Command Center — build spec (reference)

This file captures the **acceptance checklist**, **build order**, and **PR template** for the Command Center vertical slice. Product behavior and operator notes live in `docs/COMMAND_CENTER.md`, `apps/docs/src/pages/command-center.mdx`, and `docs/PRODUCT_REFERENCE.md` §4.1.

## Acceptance (11 points)

1. `pnpm install` resolves cleanly with `@coheronconnect/metrics`.
2. `pnpm -w lint` / package `lint` scripts pass for affected packages.
3. Typecheck passes (`tsc --noEmit` / package lint) for `packages/metrics`, `apps/api`, `apps/web`.
4. Tests: registry unit tests; integration test for `commandCenter.getView` (CEO payload, mocked DB).
5. `/app/command` for users with `command_center.read` shows the default overview; metrics show live data or `no_data` UX.
6. `/app/dashboard` → `/app/command` (308).
7. Sidebar: **Command Center** under Platform → `/app/command`.
8. Heatmap, bullets, trends, attention: keyboard-accessible + `aria-label`s.
9. Dark mode for new components.
10. Warm-cache response: parallel resolves + Redis cache (~30s) per org/range.
11. New metric = one file under `packages/metrics/src/contributions/` + import in `contributions/index.ts`.

## Suggested commit sequence

1. `feat(metrics): add metric registry package`
2. `feat(metrics): contribute CEO metrics from existing routers`
3. `feat(api): add command-center tRPC router`
4. `feat(web): add command-center UI primitives`
5. `feat(web): add command-center section components`
6. `feat(web): mount command center route, redirect dashboard`
7. `feat(command-center): add AI-generated narrative with fallback`
8. `docs(command-center): add operator and architecture docs`

## PR description (template)

```markdown
# Command Center — replaces /app/dashboard with role-aware exec view

## What
- New `/app/command` route (CEO/COO/CIO views, RBAC-detected with override)
- New `packages/metrics` registry — every router contributes metric definitions
- New `commandCenter` tRPC router — assembles role payloads from registry
- AI-generated hero narrative via existing AI service (deterministic fallback)
- Old `/app/dashboard` → 308 redirect to `/app/command`

## Why
The prior dashboard mirrored the sidebar. The Command Center is one platform with role-aware lenses and proves cross-module value.

## Architecture
Metrics registry → `commandCenter.getView` → dumb UI sections.

## Scope
CEO vertical slice wired to DB-backed metrics where available; COO/CIO shape with TODO/no_data elsewhere.

## Out of scope
Module hub workbenches unchanged.

## Acceptance
[Paste 13-point checklist from this doc]
```

_For the full original Cursor composer prompt (all sections 0–9), refer to the implementation PR or your saved chat export._
