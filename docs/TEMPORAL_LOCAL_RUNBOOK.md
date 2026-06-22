# Temporal — local behaviour & degraded mode

This runbook supports **Sprint 4** workflow hardening: developers should know what happens when Temporal is down and how to run the worker locally.

## Components

| Piece | Location |
|--------|----------|
| API Temporal client | `apps/api/src/lib/temporal.ts` — connects to `TEMPORAL_ADDRESS` (default `localhost:7233`) |
| Publish → start workflow | `apps/api/src/routers/workflows.ts` — `publish` tries `getTemporalClient()`; on failure persists run metadata with `temporalUnavailable: true` |
| Worker | `apps/worker` — `@temporalio/worker`, workflows under `apps/worker/src/workflows/` |
| Infra | `infra/temporal/` (see root `README.md` docker compose) |

## Local happy path

1. Start stack (Postgres, Redis, Temporal, etc.) per root **README.md** Quick Start.
2. Set `TEMPORAL_ADDRESS` to match your compose service (often `localhost:7233`).
3. Run API and **apps/worker** so published canvas workflows can execute.

## API down / Temporal down

- **Temporal unreachable:** `workflows.publish` still returns success for the saved definition; the run row records degraded mode (see router catch block). UI should surface “Temporal unavailable” from run metadata when present.
- **Worker not running:** Workflows may stay queued in Temporal; no in-process fallback executes nodes until the worker is up.

## Verification checklist

- [ ] `publish` with Temporal up: run receives `temporalWorkflowId`.
- [ ] `publish` with Temporal stopped: run completes without throwing; metadata indicates degradation.
- [ ] Worker logs show workflow start for a simple published flow.

---

*Update this file when worker entrypoints, env vars, or fallback semantics change.*
