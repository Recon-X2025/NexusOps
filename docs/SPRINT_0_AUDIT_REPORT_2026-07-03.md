# Sprint 0 — Build Audit Report

**Date:** 2026-07-03
**Scope:** Sprint 0 "cheap wins, low risk" from `docs/PLATFORM_GAP_INDEX_2026-07-03.md` §6, **excluding** the GRC Add-on (₹25k) and GRC Advanced (₹50k) product tiers.
**Branch:** `main` — **20 commits ahead of `origin/main`, NOT pushed** (pushing auto-deploys to Vultr and requires user approval).
**Test DB:** PostgreSQL `coheronconnect_test` on port 5433.

---

## 1. Executive summary

All **8 planned Sprint 0 items are complete**, each shipped as a single focused
commit with invariant tests that pass against a real Postgres and a clean
`tsc --noEmit`. Combined Sprint 0 test surface: **8 new test files, 36 tests,
all green**. Three additive DB migrations were generated, applied, and their
snapshots + journal entries committed. No existing tests regressed (audit and
money-path suites re-run clean).

| # | Item | Type | Commit | Tests |
|---|------|------|--------|-------|
| 0.1 | GSTR-1 rate-grouped `itms` (drop hardcoded `rt:18`) | fix | `78e8dc9` | 3 |
| 0.2 | Real procurement accrual accounts (drop placeholder UUIDs) | fix | `22edfbf` | 2 |
| 0.3 | Asset↔contract linking (nullable FK + migration) | feat | `fc6c98a` | 4 |
| 0.4 | Tamper-evident audit log (hash chain) | feat | `76e3169` | 4 |
| 0.5 | CVSS→SLA remediation policy mapping | feat | `8138a40` | 8 |
| 0.6 | Gate DocuSign stub (only implemented providers) | fix | `5d24236` | 4 |
| 0.7 | Warranty / software-license expiry radar | feat | `acb7022` | 5 |
| 0.8 | OKR cascade / alignment (org→team→individual) | feat | `d564420` | 6 |
| | **Total** | | **8 commits** | **36** |

---

## 2. Item-by-item detail

### 0.1 — GSTR-1 rate-grouped `itms` — `fix(gstr1)` `78e8dc9`
- **Gap:** the GSTR-1 B2B export hardcoded `rt: 18` for every invoice line item, so any non-18% supply reported the wrong tax rate to the return.
- **Fix:** `apps/api/src/routers/accounting.ts` — `buildItms()` now fetches invoice line items (`invoiceLineItems`, batched via `inArray`), groups them by their actual GST rate, and emits one `itm_det` per distinct rate `{rt, txval, iamt, camt, samt, csamt}`, with a header-derived fallback when a line has no explicit rate.
- **Invariant preserved:** per-rate tax split (intra-state CGST+SGST / inter-state IGST) continues to reconcile against the invoice header.
- **Tests:** `gstr1-rate-grouping.test.ts` (3) — multi-rate grouping, single-rate passthrough, fallback. (Fixed a `vendorId: null` NOT-NULL violation in the test seed by inserting a real vendor.)

### 0.2 — Real procurement accrual accounts — `fix(procurement)` `22edfbf`
- **Gap:** PO accrual journal entries used two hardcoded placeholder account UUIDs (`…0001`/`…0002`), so the debit/credit never pointed at a real chart-of-accounts row.
- **Fix:** `procurement.ts` — new `resolveAccrualAccounts(tx, orgId)` resolves the expense (debit) and accounts-payable liability (credit) accounts by (org, type/subType), lazily provisioning the system accounts (code 6000 expense, 2000 AP) via `onConflictDoNothing` when absent, and throws `PRECONDITION_FAILED` if unresolvable.
- **Invariant preserved:** debits == credits within tolerance (journal balance rule).
- **Tests:** `po-accrual-accounts.test.ts` (2) — auto-provisions real accounts with balanced lines; reuses pre-seeded accounts without creating duplicates.

### 0.3 — Asset↔contract linking — `feat(assets)` `fc6c98a` (migration 0013)
- **Gap:** assets could not be tied to the contract that governs them (warranty/lease/procurement).
- **Change:** `packages/db/src/schema/assets.ts` — nullable `assets.contract_id` self-documenting FK → `contracts.id`, `onDelete: set null` (per FK policy: nullable reference), plus index. `assets.linkContract` mutation validates org ownership on both sides and writes `assetHistory` (`contract_linked`/`contract_unlinked`).
- **Migration note:** `0013_living_sir_ram.sql` also carried a pre-existing snapshot drift (`teams.is_archived`) that had never been migrated; it is additive + defaulted and was retained deliberately (documented in the commit body).
- **Tests:** `asset-contract-link.test.ts` (4) — link, cross-org rejection, unlink, SET NULL on contract delete.

### 0.4 — Tamper-evident audit log — `feat(audit)` `76e3169` (migration 0014)
- **Gap:** `audit_logs` rows were independent and could be silently edited or deleted with no detection.
- **Change:** added `seq`, `prev_hash`, `entry_hash` columns + a unique `(org_id, seq)` index. New `apps/api/src/lib/audit-hash.ts`: deterministic `canonicalize`, `computeEntryHash` (SHA-256 over prevHash + canonical payload), `appendAuditEntry` (transaction-guarded, reads chain head, assigns next seq), and `verifyAuditChain` (re-derives the chain; flags seq gaps, prevHash breaks, entryHash tampering; ignores legacy null-seq rows). The central `auditMutation` middleware in `lib/trpc.ts` now routes through `appendAuditEntry`.
- **Tests:** `audit-hash-chain.test.ts` (4) — chain linkage, edit-tamper detection, delete detection, hash determinism. Existing `audit.test.ts` (3) re-run clean (backward compatible).

### 0.5 — CVSS→SLA remediation policy — `feat(security)` `8138a40`
- **Gap:** vulnerability remediation SLA/due date was ad-hoc; CVSS score didn't drive it.
- **Change:** new `apps/api/src/lib/vuln-sla-policy.ts` — `severityFromCvss`, `resolveRemediationSlaDays` (explicit override → CVSS band → severity), `computeRemediationSla` (returns `{remediationSlaDays, remediationDueAt}`). SLA windows: critical 7d / high 30d / medium 90d / low 180d / none null. Wired into `createVulnerability` and `importVulnerabilities` (schema already had the columns; no migration).
- **Tests:** `vuln-sla-policy.test.ts` (8) — 5 pure-policy + 3 router-integration.

### 0.6 — Gate DocuSign stub — `fix(esign)` `5d24236`
- **Gap:** DocuSign was advertised as a selectable e-sign provider (router input enum + registry) but had no adapter — a stub.
- **Change:** `services/esign/index.ts` adds `IMPLEMENTED_ESIGN_PROVIDERS` (`["emudhra"]`) with a compile-time guard asserting each is registered; the `esign.createRequest` input `provider` enum now derives from it, so `provider="docusign"` is rejected at input validation. `getEsignProvider("docusign")` still returns null.
- **Tests:** `esign-provider-gating.test.ts` (4) — registry resolution, advertised-set contents, docusign rejected at validation, emudhra accepted (fails later on missing integration, proving the enum accepts it).

### 0.7 — Warranty / license expiry radar — `feat(assets)` `acb7022`
- **Gap:** `assets.warranty_expiry` and `software_licenses.expiry_date` were captured but never surfaced — no view of what lapses soon.
- **Change:** `assets.expiring` merges both sources into one horizon-filtered (default 30d, max 365), day-sorted feed with a `kind` filter (warranty|license|all), urgency banding (expired / critical ≤7d / warning) and per-band counts. Excludes disposed assets and inactive licenses; retains already-expired items. Tenant-scoped. (Router-only; no migration.)
- **Tests:** `asset-expiry-alerts.test.ts` (5) — horizon+sort, urgency+counts, kind filter, disposed/inactive exclusion, cross-tenant isolation.

### 0.8 — OKR cascade / alignment — `feat(okr)` `d564420` (migration 0015)
- **Gap:** OKR objectives were flat ("Strategy / OKR — R (no cascade)"); no alignment or roll-up.
- **Change:** `okr_objectives.parent_objective_id` self-FK (`onDelete: set null` + index). `hr.okr.createObjective` accepts a tenant-guarded `parentObjectiveId`; new `hr.okr.setParent` aligns/detaches with a cycle guard (no self-parent, no descendant-parent via a bounded walk); new `hr.okr.cascade` returns the alignment forest with `rollupProgress` = average of a node's own progress and all descendants'. Nodes whose parent is filtered out surface as roots so nothing is dropped.
- **Tests:** `okr-cascade.test.ts` (6) — aligned create, cross-org parent rejection, align/detach, self-parent + cycle rejection, rollup math, SET NULL orphaning on parent delete.

---

## 3. Database migrations

| Migration | Adds | onDelete | Applied to 5433 | Journal + snapshot |
|-----------|------|----------|-----------------|--------------------|
| `0013_living_sir_ram.sql` | `assets.contract_id` (+`teams.is_archived` drift) | set null | ✅ | ✅ |
| `0014_bright_talkback.sql` | `audit_logs.seq/prev_hash/entry_hash` + unique idx | — | ✅ | ✅ |
| `0015_medical_scalphunter.sql` | `okr_objectives.parent_objective_id` + idx | set null | ✅ | ✅ |

All three are **additive** (new nullable columns / indexes) — no data backfill,
no destructive DDL. `pnpm check:migrations` reports the journal in sync.

FK `onDelete` choices follow the repo policy in `docs/DATA_MODEL.md`: nullable
reference columns (asset→contract, objective→parent) use **SET NULL**.

---

## 4. Verification performed

- **Typecheck:** `tsc --noEmit` (apps/api) clean after every item.
- **Tests:** full Sprint 0 suite re-run together — **8 files, 36 tests, all passing** (~50s).
- **Regression:** existing `audit.test.ts` (3) re-run after the audit hash-chain change — clean.
- **Migration journal:** `pnpm check:migrations` — in sync.
- **db package rebuilt** (`pnpm --filter @coheronconnect/db build`) after each schema change so apps/api typechecks/tests saw the new columns.

Reproduce the suite from `apps/api`:
```
DATABASE_URL="postgresql://coheronconnect_test:coheronconnect_test@localhost:5433/coheronconnect_test" \
  npx vitest run gstr1-rate-grouping po-accrual-accounts asset-contract-link \
  audit-hash-chain vuln-sla-policy esign-provider-gating asset-expiry-alerts okr-cascade
```

---

## 5. Scope notes, carry-overs & follow-ups

- **CMDB cycle detection** appears in the §6 sequencing prose but was **not** one of the 8 tracked Sprint 0 items; it remains open (`assets.cmdb.getTopology` currently returns nodes/edges without a cycle guard). Recommend folding it into an early Sprint 1 hardening pass or a dedicated follow-up.
- **`teams.is_archived` drift** was resolved incidentally by migration 0013. No further action, but worth noting the schema/snapshot were previously out of sync.
- **e-sign / DocuSign:** the stub is now un-selectable, not deleted. If DocuSign is ever required, implement a real adapter and add it to `IMPLEMENTED_ESIGN_PROVIDERS` (the compile-time guard will enforce registration).
- **Audit chain backfill:** legacy pre-chain rows have null `seq` and are ignored by `verifyAuditChain`. A one-time backfill to seed genesis hashes is optional and out of Sprint 0 scope.
- **Expiry radar / OKR cascade** are API-complete; surfacing them in the web UI and wiring the expiry feed into the alerting worker are downstream UI/worker tasks.

## 6. Git / deploy state

- 20 commits ahead of `origin/main`; **nothing pushed**. Push (→ Vultr auto-deploy) awaits explicit user approval, and a snapshot/backup should be taken first per CLAUDE.md.
- Pre-existing unrelated working-tree changes (`apps/docs/*`, `docs-word/`, `scripts/gen-gap-docx.py`, `vendor-esign-detail.png`) were left untouched throughout Sprint 0.
