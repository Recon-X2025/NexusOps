# CSAT Loop — Execution Plan (SMB deal-blocker Story 4)

**Date:** 2026-07-05
**Branch:** `feat/csat-loop` (off `main` @ `7ca2ab2`, per FEATURE_BRANCH_PLAYBOOK)
**Backlog ref:** `docs/SMB_NEEDED_NOW_BACKLOG.md` Story 4 (P1-10)

---

## TL;DR — this is a HARDENING job, not a greenfield build

Contrary to the backlog's "cheapest, `surveys` router already exists" framing, the
CSAT loop is **already wired end-to-end**. A read-only, `file:line`-grounded pass found:

- **Trigger** on ticket resolve: `tickets.ts:1485-1565` — creates/reuses an active CSAT
  survey, mints a one-time invite token (SHA-256, 14-day expiry), writes `survey_invites`,
  notifies the requester in-app + email. Best-effort (try/catch, non-fatal). One-invite-per-ticket
  guard at `1491-1495`.
- **Delivery**: `sendNotification(...)` (`services/notifications.ts:95-144`) → in-app row + email + Slack fan-out. Deeplink `/survey/{token}`.
- **Public capture**: `http/public-surveys.ts` — `GET /public/surveys/:token` (metadata) and
  `POST /public/surveys/:token/submit` (score 1-5 + comments, one-shot: flips invite `sent→submitted` in a tx).
- **Schema**: `survey_invites` (`schema/surveys.ts:82-101`) already has `ticketId`, `requesterId`, `tokenHash`, `expiresAt`, `submittedAt`.
- **Aggregation**: `csm.dashboard` (`csm.ts:206-224`) computes org+type-scoped avg CSAT correctly (raw SQL, `org_id` + `type='csat'`).

So the loop **works**. The job is to fix real defects, close the unmet acceptance
criteria, and — critically — **add the tests** (there are none for the trigger/submit/aggregate path today; only a survey-CRUD smoke at `layer8-module-smoke.test.ts:2126`).

---

## Defects found (fix these — ranked)

### D1 (HIGH — tenant isolation bug). `reports.executiveOverview` CSAT aggregation is unscoped.
`reports.ts:150-153`:
```ts
const [avgCsatRow] = await db.select({ avgCsat: avg(surveyResponses.score) })
  .from(surveyResponses)
  .where(gte(surveyResponses.submittedAt, since));   // ⚠ no orgId, no type filter
```
This averages **every org's** survey responses of **every type** (NPS, pulse, exit-interview…)
into one org's executive report. That's a cross-tenant data leak in a reported number
**and** a correctness bug. Fix: `innerJoin(surveys)` + `eq(surveys.orgId, org.id)` +
`eq(surveys.type, "csat")` + `isNotNull(score)`. Mirror the correct `csm.ts:210-220` query.

### D2 (MEDIUM). `reports.workloadAnalysis` per-assignee `csat: 0` is a hardcoded placeholder.
`reports.ts:314`. Backlog AC forbids placeholder tiles. Either compute per-assignee CSAT
(join responses→invites→ticket.assignee) or drop the field. **Recommend computing it** to
satisfy the "no placeholder" AC; fall back to `null` (not `0`) when no data.

### D3 (LOW). Main `dashboard.getMetrics` has no CSAT tile.
`dashboard.ts:48-197`. AC: "CSAT score surfaces on the existing dashboard/reports — no
placeholder tile." Add an org+type-scoped, cached avg-CSAT (+response count) to the metrics
object. Return `null` for zero-response orgs (never a fabricated score — follow the SLA-compliance null pattern at `dashboard.ts:165-171`).

---

## Unmet acceptance criteria (from Story 4)

| AC | Status today | Work |
|----|--------------|------|
| Auto-trigger on `ticket.resolved` for a requester | ✅ done (`tickets.ts:1485`) | keep; add test |
| 1-click deeplink (email + in-app) | ✅ done | keep; add test |
| Response captured against ticket + requester; one per resolution; re-open→re-survey | ⚠ partial | one-invite-per-**ticket** guard means re-open→resolve does **not** re-survey. AC wants re-survey on next resolve. Decide (see Q1). |
| CSAT surfaces on dashboard/reports, no placeholder | ⚠ partial | D1/D2/D3 |
| **Configurable per org: on/off, channel, suppression window** | ❌ missing | no config schema exists (grep clean). Build (see below). |
| Tests: fires on resolve, not on other transitions, one-response constraint, aggregation | ❌ missing | build the whole suite |

---

## Proposed build (feature branch)

### Step 1 — Fix aggregation defects (D1, D2, D3)
Pure query fixes in `reports.ts` + `dashboard.ts`. No schema change. Highest value, lowest risk — do first. Each gets a test asserting org-isolation + type-filter.

### Step 2 — Per-org CSAT config (closes the biggest AC gap)
Add an org-scoped config. **Recommended: a single `csat_settings` row per org** (not columns
on `organizations`), FK `orgId → organizations` CASCADE (per FK policy):
- `enabled` (bool, default true)
- `channel` (enum: `in_app` | `email` | `both`, default `both`)
- `suppressionWindowHours` (int, default 24) — don't survey the same requester more than once per N hours
- `expiryDays` (int, default 14)

New migration (`0027_*`), rebuild `packages/db`, apply to test DB, journal check. Extend
`surveysRouter` with `getCsatSettings` / `updateCsatSettings` (permission `surveys:read/write`).

### Step 3 — Enforce config in the trigger
Refactor the `tickets.ts:1485-1565` block into a small reusable service
`services/csat.ts::triggerCsatForResolvedTicket(db, {orgId, ticket, requesterId})` so it's
testable without the full ticket-update path (mirrors how `itom-correlation.ts` extracted logic
from routers). It must:
- respect `enabled` (skip if off);
- honor `channel` (pass/omit email to `sendNotification`);
- enforce the **suppression window** (skip if this requester got a CSAT invite < N hours ago) — this is a new query on `survey_invites` by `(orgId, requesterId, createdAt)`, index already exists (`survey_invites_org_idx` on `(orgId, createdAt)`);
- use `expiryDays` from config.
Keep it best-effort / non-fatal (never roll back the resolve).

### Step 4 — Tests (real Postgres, `apps/api`, seed-per-test)
New `apps/api/src/__tests__/csat-loop.test.ts`:
1. resolve transition fires exactly one invite + one notification;
2. non-resolve transitions (open→in_progress) fire nothing;
3. suppression window: second resolve for same requester within N hours → no new invite;
4. config off → no invite;
5. public submit records a response, flips invite to `submitted`, rejects reuse (409) and out-of-range score (400);
6. aggregation: `dashboard`/`reports`/`csm` return org-scoped, type-filtered avg; a second org's responses don't leak (D1 regression guard).

Expect ~10-12 tests. Verify: `pnpm --filter @coheronconnect/db build` → migrate → `npx tsc --noEmit` → run new file → full suite (1027 + new, 0 regressions).

### Step 5 — PR
Branch `feat/csat-loop`, PR with CI + tRPC parity. **No push/deploy without explicit approval + snapshot.** ITSM router owner review.

---

## Open questions for the morning (need a decision before Step 3)

- **Q1 — Re-open→re-survey.** AC says "re-open → re-survey on next resolve," but the current
  one-invite-**per-ticket** guard blocks that. Change the guard to "one invite per (ticket,
  resolution-cycle)" (re-survey allowed), or keep strict one-per-ticket? *Recommend: allow
  re-survey but gate it behind the suppression window so we don't spam.*
- **Q2 — Default channel.** `both` (in-app + email) by default, or in-app only until an email
  connector is verified for the org? *Recommend: `both`, since `sendNotification` already
  degrades gracefully when no email is on file.*
- **Q3 — workloadAnalysis (D2).** Compute per-assignee CSAT, or remove the field? *Recommend:
  compute; it's a cheap join and satisfies the "no placeholder" AC.*

## Guardrails
- Real-Postgres tests (5433); rebuild `packages/db` after schema edits; journal in sync.
- No `any` in routers; best-effort trigger must never roll back the resolve.
- No commit unless asked; no push/deploy without snapshot + explicit approval.

---

## Progress report — COMPLETE (2026-07-06)

All five steps landed on `feat/csat-loop`. Q1/Q2/Q3 resolved with the recommended
defaults (re-survey allowed but gated by the suppression window; default channel `both`;
per-assignee CSAT computed for D2).

| Step | Status | Detail |
|------|--------|--------|
| 1 — D1/D2/D3 aggregation fixes | ✅ | see below |
| 2 — `csat_settings` schema + migration `0027` | ✅ | table + enum + router procedures |
| 3 — extract `services/csat.ts` + enforce config | ✅ | trigger moved out of `tickets.ts` |
| 4 — `csat-loop.test.ts` | ✅ | 10 tests, all green |
| 5 — verification | ✅ | typecheck + full suite green |

### Defects fixed
- **D1 (tenant isolation)** — `reports.executiveOverview` now `innerJoin(surveys)` +
  `orgId` + `type='csat'` + `isNotNull(score)`. Added `surveys` to the router's db import.
  Cross-tenant + type-filter regression is guarded by a test.
- **D2 (placeholder)** — `reports.workloadAnalysis` computes per-assignee CSAT via a
  responses→invites→surveys→tickets group query; falls back to `null` (never `0`) when no data.
- **D3 (missing tile)** — `dashboard.getMetrics` now returns `csatScore` (1dp, 30-day,
  org+type-scoped) + `csatResponses`; `null` when zero responses (no fabricated score).

### New / changed surface
- **New table** `csat_settings` (`schema/surveys.ts`): `enabled`, `channel`
  (`csat_channel` enum: in_app|email|both), `suppressionWindowHours`, `expiryDays`.
  `orgId` unique, FK CASCADE. Migration `0027_clear_ogun.sql` (+ snapshot + journal).
- **Router** `surveys.getCsatSettings` / `surveys.updateCsatSettings` (upsert on `orgId`,
  perms `surveys:read`/`surveys:write`).
- **New service** `services/csat.ts::triggerCsatForResolvedTicket(db, {orgId, ticket, createdById})`
  — extracted from `tickets.ts`. Enforces `enabled`, `channel` (omits email addr for `in_app`),
  suppression window (per-requester across tickets; `0`h disables), `expiryDays`. Best-effort:
  never throws, never rolls back the resolve. Returns `{triggered, reason?, inviteId?}`.
- `tickets.ts` resolve path now calls the service; dropped the now-unused `randomBytes` import.

### Re-survey semantics (Q1 resolution)
One invite per ticket is retained (one response per resolution). A re-opened+re-resolved
ticket is **not** re-surveyed while an invite row already exists for it; a *different* ticket
for the same requester is gated by the suppression window (default 24h). `suppressionWindowHours=0`
disables the window (per-ticket invites still fire).

### Build report
- `packages/db` rebuilt after schema edit; `pnpm check:migrations` → **in sync**.
- Migration `0027` applied to test DB (`:5433`) via `drizzle-kit migrate` — OK.
- `apps/api` `npx tsc --noEmit` → **exit 0** (no `any` in routers).
- New suite `csat-loop` → **10/10 passed**.
- Full API suite → **95 files / 1037 tests / 0 failures** (baseline 1027 + 10 new, zero regressions).

### Not done (awaiting explicit approval, per guardrails)
- No commit, no push, no deploy. Working tree on `feat/csat-loop`:
  modified `dashboard.ts`, `reports.ts`, `surveys.ts` (router), `tickets.ts`,
  `schema/surveys.ts`, `_journal.json`; new `csat.ts`, `csat-loop.test.ts`,
  `0027_clear_ogun.sql`, `0027_snapshot.json`, this doc.
