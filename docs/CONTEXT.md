# CONTEXT — session hand-off

_Written 2026-08-05. A quick-start map so a new session picks up cleanly.
**Read `reports/fix-plan.md` first — it is the source of truth** for what is
done, pending, and blocked. This file only points you at it and summarises._

---

## What CoheronConnect is

A multi-tenant **Enterprise Operations Platform** for the India market — payroll,
tax (TDS/GST), HR, accounting, CRM, ITSM, IT-asset, and governance/privacy, all in
one product, each customer isolated as its own tenant. Repo name is **NexusOps**;
the product is **CoheronConnect**; production is `connect.coheron.tech`.

Monorepo: pnpm + Turborepo, Node ≥20. `apps/api` (Fastify + tRPC) holds the bulk of
the business logic and tests; `apps/web` is the Next.js front end; `apps/worker` runs
background workflows; `packages/db` is the Drizzle schema; `packages/payroll-math`
is the pure money-math. Full map is in `BUILD.md`; conventions are in `CLAUDE.md`.

## Current stage

**Pre-production.** Seven pilot customers go live **end of August**. India
payroll/tax is the most mature area and is the go-live gate; the remaining
payroll-blocking items are listed under "Next in queue" below.

## Deployed commit & migration head

- **Deployed commit:** `a7d31ee` — _"feat(payroll): salary-structure family
  versioning + gratuity/leave accrual (M-05)."_ Local `main` and `origin/main` are
  in sync at this SHA. (Pushing to `main` auto-deploys to Vultr.)
- **Migration head:** `0065_strange_captain_stacy` (the M-05 `family_id` migration).
  Always re-confirm the live head from the last entry in
  `packages/db/drizzle/meta/_journal.json` — do not trust a number in prose.

## The audit & sweep system (`.claude/skills/`)

Two skills drive quality review:

- **`qa-map`** — run **once**, before any auditing. Inventories every subsystem,
  drafts the quality bar (`docs/quality-bar.md`), and produces the audit checklist.
- **`qa-audit`** — deep audit of one subsystem against `docs/quality-bar.md`. It
  audits the **standing code, not a diff**, and writes findings in plain English
  (the owner is not a developer).

Both assume the reader cannot evaluate a finding by reading code, so every finding
must be explained in business terms.

## Where the reports live (`reports/`)

- **`reports/fix-plan.md`** — **THE source of truth.** The three-phase plan
  (Ratchets → Correctness → Completeness), a "Status at a glance" table, per-item
  detail, and the CA (chartered-accountant) rulings. Read this first, every session.
- `reports/audit-summary.md` — the five root causes that generated most defects.
- `reports/audit-*.md` — one deep audit per subsystem (payroll, GST, DPDP, auth,
  tenant-isolation, money/accounting, ITSM, CRM, etc.).
- `reports/sweep-*.md` — cross-cutting sweeps (fabricated constants, false comments,
  phantom fields, unreachable features, ownership checks, stale debt, …).
- `reports/triage.md` — findings sorted into Bucket A / Bucket B.

## The five ratchets — and their state

Ratchets are guardrails (mostly tests) built **first**, so a whole class of bug
becomes impossible to reintroduce. **All five are Done and green** (Phase 1 complete):

| # | What it guards | Turned green by |
|---|----------------|-----------------|
| R-1 | All tenant tables sit behind the RLS wall | A11 (migration 0061) |
| R-2 | Custom-role permissions stay in the five-verb vocabulary | A6 |
| R-3 | DPDP notices are only recorded as sent if truly sent | A3 / A4 |
| R-4 | Money read-then-write can't double-count (concurrency lock) | A2 |
| R-5 | Audit-log hash chain can't be tail-truncated silently | B5 head-anchor |

## What landed in the last few days

- **`a7d31ee` (Aug 5) — M-05:** salary-structure **family versioning**. Effective-dated
  versions share a `family_id`; employees link to the family; payroll resolves the
  version whose `[effective_from, effective_to)` window contains the pay period.
  Migration 0065 (nullable-add → backfill-to-own-id → NOT NULL + BEFORE INSERT
  trigger). Red-before/green-after proven; full API suite green.
- **`7b2f0e6` (Aug 4) — PT3/PT5:** cap new-regime surcharge at 25%; s.87A rebate
  marginal relief.
- **`2cfed5b` / `dcc3571` (Aug 4) — C2-FIX:** Karnataka/Gujarat/Maharashtra
  professional-tax slab corrections; Gujarat PT cap reverted to statutory ₹2,500.
- **`c59cb6f` (Aug 3) — F6/F7:** decode, surface, and gate the bank-file export.
- **`67026dc` — C5:** India income-tax rates moved into effective-dated
  `statutory_ceilings` config (PF/ESI%/gratuity are an explicit follow-up).

## Next in queue

The **payroll-blocking** items that gate the end-of-August go-live (see fix-plan for
detail and scope):

- **C1** — Old vs New tax-regime (s.115BAC) election.
- **C2-STRUCT** — professional-tax structure: half-yearly levy period (Kerala/TN/
  Puducherry), gender ingestion, month-specific rates, full-population + explicit-nil,
  tier-1 exemptions.
- **C3** — ESI six-month contribution-period rule (verify first).
- **C4** — PF ₹1,800 ceiling / VPF / joint-declaration override (verify first).
- **C6** — payslip mandatory statutory fields.
- **A12-D** — LOP split-logic defect (CA correction, against shipped A12).
- **C7** — GSTR-1 structural gaps (GST-blocking); needs **A7-SCREEN** (invoice
  line-item entry) first.

Deferrable: C8 (tolerant filing-schema parsing), C9/A18 (Form 24Q → TRACES import).

## Standing rules (do not break)

1. **No commit without a Vultr snapshot.** A snapshot/backup must be taken before any
   commit that will be pushed. Snapshots need the owner's cloud credentials —
   **Claude cannot take them**; ask the owner to confirm one exists.
2. **Never stage `.claude/settings.local.json`** (local permission config). It is the
   one file expected to show as dirty; leave it unstaged.
3. **Run `pnpm lint` from the repo root before any merge.** It typechecks all nine
   workspaces in one pass — the same gate CI enforces. A green `apps/api` alone is
   not enough (CI also typechecks `apps/web`).
4. **Fairness check on every fix: red before, green after.** Prove the test fails
   against the old behaviour, then passes with the fix. A fix that leaves its
   bug-blessing test in place is not finished.
5. **Don't commit unless explicitly asked;** the owner is not a developer, so explain
   in plain English; never propose changes to unread code.

_After `packages/db` edits, rebuild its `dist/` before `apps/api` typechecks see them.
Test DB is `coheronconnect_test` on port 5433 (`pnpm docker:test:up`)._
