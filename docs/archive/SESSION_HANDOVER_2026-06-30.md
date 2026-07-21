# Session Handover — 2026-06-30

Purpose: resume work in a fresh session without re-deriving context. Read this
first, then `CLAUDE.md`, then `docs/PRODUCTION_READINESS_PLAN_2026-04-26.md`.

---

## 1. Where we are right now

- **Branch:** `main`, **one commit ahead of `origin/main`** (NOT pushed).
- **Last commit:** `3e1404f` — `feat(db): add 100-employee 24-month demo seed with invariant-correct money paths`.
- **Working tree:** clean except one untracked file `vendor-esign-detail.png` (an unrelated screenshot, intentionally left alone).
- **Local test DB (port 5433):** wiped to a clean slate — only the org
  (`CoheronConnect HQ`, slug `coheron-demo`) + founding owner `admin@coheron.com`
  + RBAC scaffolding remain. All other 148 users and all transactional/seed data
  were deleted on purpose.

### Pushing / deploying
Pushing to `main` triggers auto-deploy to Vultr. **Do not push without explicit
user approval.** Claude cannot perform cloud snapshots or credential operations.

---

## 2. Completed this session

### Demo seed — REMOVED
The 100-employee / 24-month `coheron-demo` demo seed (originally committed in
`3e1404f`) has been **deleted and made un-runnable** per explicit request. The
generator `packages/db/src/seed-demo.ts` and its `db:seed:company` / `db:seed:demo`
scripts no longer exist, and the previously-seeded demo data was dropped from the
local test DB (`DELETE FROM organizations WHERE slug='coheron-demo'`, CASCADE).
Do not re-introduce it.

**Two bugs were fixed inside the seed (both already committed):**
1. **Net-pay flooring → unbalanced journals.** `computeTax()` spreads *remaining*
   annual tax over *remaining* FY months; a single-month projection late in the FY
   concentrates the whole year's tax, pushing `totalDeductions > gross`, flooring
   net at 0 and overstating the journal credit. **Fix:** compute a stable monthly
   TDS via `computeEmployeePayslip(input, 1)` (fyMonth=1 → monthsInFY=12 → annual
   tax / 12), then rebuild deductions/net locally.
2. **ESI/LWF not credited → unbalanced journals.** Added accounts `2160 ESI Payable`
   and `2170 LWF Payable`, renamed `5110` to "Employer Statutory Contributions",
   and credited employee+employer ESI/LWF so the payroll journal balances.

**Verified** (during session, against test DB before the wipe): 0 unbalanced
journals, 0 net-pay violations, 0 three-way-match mismatches.

### Clean slate
Reset the **local test DB only** (guarded against any other target): wiped all
transactional tables, deleted all non-owner users, kept org + `admin@coheron.com`
+ RBAC. Temporary helper scripts (`_who.ts`, `_reset_keep_founder.ts`,
`_verify_demo.ts`, `_probe_balance.ts`) were created and then deleted — none committed.

### Whole-monorepo architecture audit (READ-ONLY — no code changed)
See §4 below for the findings to act on.

---

## 3. Open / deferred items

- **Super-admin / platform-monitoring role** — user observed there is no
  cross-tenant role (RBAC only has org-scoped `owner` / `member`). Explicitly
  **deferred** by the user ("we'll get to it later"). Would be a distinct
  architectural piece (platform identity outside org-scoped RBAC + cross-tenant
  admin surface + isolation guardrails + audit logging). Plan before coding.
- **Push of `3e1404f`** — pending user approval (auto-deploys).

---

## 4. Architecture audit findings (to triage next session)

Read-only audit of the whole monorepo. The codebase is **sound** — clean,
correctly-tiered dependency graph (no cycles, no app→app inversions); money math
stays server-side. Remaining work is finishing/hardening, **not a rewrite**.
Some agent-reported "CRITICAL" labels were inflated; caveats noted inline.

| # | Finding | Type | Severity | Maps to |
|---|---|---|---|---|
| 1 | Tenant isolation enforced by hand-written `eq(table.orgId, …)` in every router (~48× in `tickets.ts`). Consistent today; one omission = cross-tenant leak. No actual missing check found — risk is future regressions. | Security / Scalability | High (future-risk) | Phase 6 / sooner |
| 2 | Money-math duplicated in 4 places (`apps/api/src/lib/*` + `packages/db/src/lib/india-payroll-math.ts`). No test enforces sync; the stable-TDS fix currently lives only in the seed copy. | Duplicate logic | High | Phase 5 |
| 3 | `apps/worker` Temporal is wired but activities lack idempotency keys, retry/backoff, dead-letter handling; re-run duplicates `workflow_step_runs`. This **is** Phase 5. | Scalability | High | Phase 5 |
| 4 | God files: web admin page 3,037 LOC, CRM 2,139 (9 pages >1k); api `tickets.ts` 2,215, `hr.ts` 1,615. Sidebar/header have no `React.memo`, re-render on 120s badge poll. | Maintainability / Perf | Medium | Ongoing |
| 5 | Repo hygiene: tracked junk — 1.3 MB `test_job_log.txt`, ~6 `build_log*.txt`, binary-corrupted `test.ts`, ~8 scratch scripts, 71-file duplicate snapshot `system_export_20260504_155527/`, 84 MB brand PDF in history. | Maintainability | Medium (quick win) | Anytime |
| 6 | `packages/validators` is dead (0 imports); 3 overlapping type sources (types / validators / 837 inline `z.object`). | Duplicate logic | Medium | Ongoing |
| 7 | 5 diverging docker-compose files; both Traefik and Caddy present. | Maintainability | Low | Anytime |
| 8 | `packages/db` overloaded (schema + migrations + seeds + payroll math). `drizzle_backup/` (27 files) vs active `drizzle/` (12) ambiguity. | Architecture | Low/Med | Later |

**Caveats / corrections to the raw agent output:**
- `.env.test` was flagged "CRITICAL secret risk" — values are dummy test-only
  data; it's a best-practice nit, not a breach. Repo bloat (logs, PDF in history)
  is the more real concern.
- Finding #1 severity is about *future* regressions; no live leak was confirmed.
- Tax surcharge marginal-relief §89(1) gap was agent-reported but **not verified** —
  confirm before trusting.

### Recommended sequencing
- **Do now (low-risk, pure subtraction / bug-closing):**
  (a) repo hygiene cleanup [#5/#7], (b) consolidate money-math into one package
  [#2 — closes a real drift bug].
- **Phase 5:** worker durability [#3] — the real next milestone.
- **Defer (plan deliberately, not big-bang):** orgId scoping wrapper [#1],
  god-file refactors [#4].

---

## 5. Key facts to not re-learn the hard way

- `packages/db` is consumed via compiled `dist/`. After editing schema/types,
  run `pnpm --filter @coheronconnect/db build` before `apps/api` typechecks see it.
- Tests run against real Postgres on **port 5433** (`pnpm docker:test:up`).
  Note: `pnpm docker:test:reset` kept the data volume in practice — it did not
  truly drop data; verify state with a quick query if it matters.
- `cd` into the package dir before `npx tsc` (cwd resets between Bash calls).
- zsh quirks: multi-line SQL piped through commands breaks; unquoted paths in
  `cd` error "too many arguments"; `!` triggers history expansion in `node -e`.
  Workaround: write a temp `.cjs` and quote paths.
- Indian payroll engine: `computeTax()` spreads *remaining* annual tax over
  *remaining* FY months — see seed fix #1 above before reusing it per-month.

---

## 6. Standing guardrails (from CLAUDE.md)

- Read files before editing; never propose changes to unread code.
- Make only requested changes; no unrequested refactors / premature abstraction.
- Don't commit without explicit ask; stage specific files, not `git add -A`.
- Never commit secrets. Claude cannot do cloud snapshots / deploy triggers /
  production ops — those need the user's credentials.
- This is a **demo instance** shown to customers; the user is non-technical.
