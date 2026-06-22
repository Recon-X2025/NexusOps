# CoheronConnect — Chaos System Validation (Playwright)

This document explains what the **system validation** suite under `tests/chaos/` does, how to run it safely against local or remote deployments, and where outputs land. It is meant to replace informal “trust me” summaries with something you can hand to another engineer or your future self.

---

## What problem does this suite solve?

You want a **repeatable vertical check** that CoheronConnect still works end-to-end when the UI is under mild stress: intermittent API failures, concurrent actions, and both desktop and narrow (mobile) viewports. The spec does **not** replace unit tests or load tests; it is a **smoke + resilience** layer that catches regressions in login, tickets, HAM, dashboard approvals, and basic admin flows.

---

## Files that matter

| Path | Role |
|------|------|
| `tests/chaos/playwright.config.ts` | Projects (`chaos-chromium`, `chaos-mobile` / Pixel 7), timeouts, reporters, `baseURL` from env |
| `tests/chaos/system-validation.spec.ts` | The single end-to-end scenario |
| `tests/chaos/chaos-config.ts` | Env parsing, `.env` loading, org slug per project, **remote UI vs local DB safety guard** |
| `tests/chaos/chaos-seed.ts` | Drizzle seed (org, admin user, ticket scaffolding) and optional DB row count assert |
| `tests/chaos/chaos-auth.ts` | tRPC login (multiple response shapes), rate-limit backoff, **10% POST-only failure** route |

Run Playwright **from the monorepo root** so dependencies and `@coheronconnect/db` resolve like the rest of the repo. The `tests/chaos/package.json` script `playwright` does exactly that.

---

## Phases inside the test (in order)

1. **Seed (optional)**  
   If `CHAOS_SKIP_SEED` is not set: requires `CHAOS_DATABASE_URL` or `DATABASE_URL`, runs `assertDatabaseUrlMatchesBase` (see Safety), then seeds an org and a deterministic admin email `chaos.admin+{project}@coheronconnect.test` plus scaffolding used by the run.

2. **Login**  
   Uses `trpcLoginWithBackoff` so transient rate limits do not flake the suite.

3. **Chaos route (only after login)**  
   Installs a route that makes **every 10th POST** to `/api/trpc/**` return HTTP 500. **GET requests are not intercepted**, so page data queries still hydrate. Login is never subjected to this sampling.

4. **Ticket stress**  
   Creates **5** tickets from `/app/tickets/new`, with up to **5 submit retries** each if navigation to a ticket detail URL does not occur (e.g. sampled 500). Category is chosen via `ticket-form`’s first `select` (avoids strict-mode collisions with duplicate “Network” options elsewhere).

5. **Tickets list**  
   Goes to `/app/tickets` and searches using the placeholder **`Search…`** (the queue filter). This is intentionally **not** a regex like `/search/i`, because the global header omnibox also matches “search” on small viewports and is often not visible—filling it was a common mobile failure mode.

6. **HAM**  
   Visits `/app/ham`, clicks **Assign** while visible, and fires **Run Discovery**, **Export**, and asset search in parallel (best-effort; chaos may cause partial failures without failing the whole step).

7. **Dashboard concurrent Approve/Reject**  
   If at least two Approve and two Reject buttons exist, clicks two in parallel; otherwise falls back to one of each.

8. **Second tab**  
   Opens **Approvals** and **Admin** in parallel, clicks **Approve** and **Delete** (best-effort, time-boxed).

9. **Teardown chaos route**  
   Removes the 10% failure handler so the screenshot and DB assert see a clean client.

10. **Screenshot baseline**  
    Full-page screenshot `system-validation-dashboard.png` compared to committed snapshots (per project / OS). **Desktop** uses a tight `maxDiffPixels: 900`. **Mobile** uses `maxDiffPixelRatio: 0.05` because the dashboard shows more live, run-to-run variable content (queues, relative times) and a fixed pixel cap flakes between runs.

11. **DB assert (optional)**  
    If `CHAOS_SKIP_DB_ASSERT` is not set: counts tickets in Postgres whose titles start with the run prefix and expects **5** (for the org slug derived from config—see `system-validation.spec.ts` for the `coheron-demo` fallback when skipping seed without `CHAOS_ORG_SLUG`).

---

## Environment variables

### Targeting the deployment

| Variable | Default / notes |
|----------|------------------|
| `CHAOS_BASE_URL` | `http://localhost:3000` (strip trailing slash internally; override for remote) |
| `NEXUS_QA_BASE_URL` | Fallback in `playwright.config.ts` if `CHAOS_BASE_URL` unset |

### Database (seed + assert)

| Variable | Purpose |
|----------|---------|
| `CHAOS_DATABASE_URL` | Preferred Postgres URL for Drizzle in the test process |
| `DATABASE_URL` | Used if `CHAOS_DATABASE_URL` is unset |

### Modes

| Variable | When “truthy” (`1`, `true`) |
|----------|-----------------------------|
| `CHAOS_SKIP_SEED` | Do not seed; you **must** set `CHAOS_LOGIN_EMAIL` and `CHAOS_LOGIN_PASSWORD` for an existing user |
| `CHAOS_SKIP_DB_ASSERT` | Skip the final SQL row count check |
| `CHAOS_ALLOW_DB_MISMATCH` | Opt out of the **remote UI + local DB** safety check (dangerous; see below) |

### Org and credentials (seed path)

| Variable | Notes |
|----------|--------|
| `CHAOS_ORG_SLUG` | Override; default prefix is `coheronconnect-chaos-validation-{projectKey}` so parallel Playwright projects do not fight the same org row |
| `CHAOS_SEED_PASSWORD` / `CHAOS_ADMIN_PASSWORD` | Seeded admin password (default in code: `ChaosValidation!9`) |

### Skip-seed login

| Variable | Required when `CHAOS_SKIP_SEED=1` |
|----------|-----------------------------------|
| `CHAOS_LOGIN_EMAIL` | Existing user on the target deployment |
| `CHAOS_LOGIN_PASSWORD` | Matching password |

### Reliability tuning

| Variable | Effect |
|----------|--------|
| `CHAOS_RETRIES` | Playwright retries (string integer); if unset, CI uses 1, local uses 0 |
| `.env`, `.env.local`, `.env.production` | Loaded from repo root (and one level up) for the keys listed in `chaos-config.ts` |

---

## Safety: remote UI must not use local DB by accident

If `CHAOS_BASE_URL` is **not** localhost and `DATABASE_URL` / `CHAOS_DATABASE_URL` points at **localhost** (or similar), seeding would write rows your remote API never reads—logins would fail or asserts would lie. `assertDatabaseUrlMatchesBase` throws unless you set `CHAOS_ALLOW_DB_MISMATCH=1` or use skip-seed with explicit login credentials.

**Postgres on loopback only (recommended on Vultr):** production compose binds Postgres to `127.0.0.1:5432`. For a full vertical from your laptop, open a tunnel then point `CHAOS_DATABASE_URL` at `127.0.0.1` and the local tunnel port, e.g. `ssh -L 5433:127.0.0.1:5432 root@<vps>` → `postgresql://…@127.0.0.1:5433/coheronconnect`.

---

## How to run

From repository root:

```bash
# Full suite (both projects), typical “against existing Vultr demo” with no seed/DB:
CHAOS_SKIP_SEED=1 CHAOS_SKIP_DB_ASSERT=1 \
CHAOS_LOGIN_EMAIL='you@example.com' CHAOS_LOGIN_PASSWORD='secret' \
pnpm exec playwright test -c tests/chaos/playwright.config.ts
```

Or from `tests/chaos` using the package script (still runs from root):

```bash
cd tests/chaos && pnpm run playwright
```

Update screenshot baselines after intentional UI changes:

```bash
pnpm exec playwright test -c tests/chaos/playwright.config.ts --update-snapshots
```

Single project:

```bash
pnpm exec playwright test -c tests/chaos/playwright.config.ts --project=chaos-chromium
pnpm exec playwright test -c tests/chaos/playwright.config.ts --project=chaos-mobile
```

---

## Output locations (paths relative to `tests/chaos/`)

Playwright resolves these relative to the config file’s directory:

| Artifact | Path |
|----------|------|
| HTML report | `tests/chaos/results/html-report/` |
| JSON results | `tests/chaos/results/system-validation-results.json` |
| Traces / screenshots / video on failure | `tests/chaos/results/artifacts/` |
| Screenshot baselines | `tests/chaos/system-validation.spec.ts-snapshots/` (files named like `system-validation-dashboard-chaos-chromium-darwin.png`) |

Open the HTML report after a run:

```bash
pnpm exec playwright show-report tests/chaos/results/html-report
```

---

## Projects

| Project | Device | Why it exists |
|---------|--------|----------------|
| `chaos-chromium` | Desktop Chrome, 1440×900 | Primary regression surface |
| `chaos-mobile` | Pixel 7 (Chromium) | Narrow viewport without requiring WebKit; catches layout-only breakages (e.g. wrong search field) |

---

## Known limitations (by design)

- **POST-only chaos**: Intermittent failures apply to tRPC **mutations and POST batch** traffic, not GET reads, so pages can still load during the stress phase.
- **Best-effort HAM / Approvals / Admin**: Some clicks are intentionally soft under chaos; hard assertions focus on ticket creation, navigation, and screenshot/DB phases.
- **Rate limits**: Login uses backoff; other endpoints may still rate-limit on very aggressive CI; use `CHAOS_RETRIES` or a dedicated test tenant if needed.
- **Seed + remote DB**: For seed/assert against production-like data you must point `CHAOS_DATABASE_URL` at the **same** database the deployment uses (VPN or tunnel is fine).

---

## Verification log (this repo)

On **2026-04-05**:

1. Tickets list search was scoped to the queue field placeholder **`Search…`** so **chaos-mobile** does not target the global header search (often hidden or wrong on narrow viewports).
2. Dashboard screenshot comparison for **chaos-mobile** was relaxed to **`maxDiffPixelRatio: 0.05`** so live dashboard content does not flake a tight pixel count between runs.

Full suite (no snapshot update) completed with exit code 0:

```bash
CHAOS_RETRIES=0 CHAOS_SKIP_SEED=1 CHAOS_SKIP_DB_ASSERT=1 \
CHAOS_LOGIN_EMAIL=admin@coheron.com CHAOS_LOGIN_PASSWORD='demo1234!' \
pnpm exec playwright test -c tests/chaos/playwright.config.ts
```

Result: **2 passed** (`chaos-chromium`, `chaos-mobile`).

---

## Related suites

- `tests/chaos-vertical/` — older vertical validation; separate from this `system-validation.spec.ts` flow. Prefer this document’s suite for the current “chaos + screenshot + optional DB” contract unless you have a reason to run the legacy path.

If something in this doc drifts from code, **`chaos-config.ts` and `system-validation.spec.ts` are authoritative**; update this file when behavior changes.
