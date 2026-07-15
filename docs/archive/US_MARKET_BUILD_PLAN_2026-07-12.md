> **⚠️ SUPERSEDED (2026-07-15) — replaced by `docs/US_ROADMAP.md`.**
> Its "no US-market code exists yet" baseline was re-verified TRUE at head
> `0032_damp_la_nuit` (note: baseline migration is now `0032`, not `0030`). Archived.

# US-Market Build Plan — Country Separation + QuickBooks + CCPA

**Date:** 2026-07-12
**Status:** Proposed (awaiting approval)
**Baseline:** clean tree, `main` in sync with `origin/main`, migrations `0000→0030`. No US-market code exists yet.
**Related:** approved planning notes in `~/.claude/plans/jolly-yawning-thunder.md`; roadmap `docs/PRODUCTION_READINESS_PLAN_2026-04-26.md`.

---

## 1. Objective

A US company wants CoheronConnect aligned to US finance and legal: **QuickBooks integration** and a
US-aligned **Legal & Compliance** module. The platform is currently India-hardcoded (GST/TDS/PF chart of
accounts, INR currency, DPDP-only compliance). This plan introduces a **tenant country/regime** model so
US and India tenants run on one codebase with behavior branching per market (supports mixed-market SaaS).

**Out of scope:** TurboTax API (no public filing API — data flows CoheronConnect → QuickBooks; QB→TurboTax
is Intuit's own end-user export). US sales-tax rate/nexus engine. Cross-currency ledger consolidation.

---

## 2. Decisions carried forward (from prior approval)

| Decision | Choice |
|----------|--------|
| Market separation | Tenant **country column** (real column, not JSONB) |
| Scope | Full US market foundation |
| Delivery | **Phased, country model first** (each phase independently mergeable/testable) |
| QuickBooks products | **Both** QBO (REST/OAuth2) and QB Desktop (Web Connector/QBXML) |
| QB sync direction | Bidirectional (COA / journal entries / invoices / payments) |
| CCPA depth | **Full CCPA/CPRA** (opt-out, Shine-the-Light, annual metrics, vendor audit) |

---

## 3. Phase overview

| Phase | Deliverable | Unblocks | Mergeable alone |
|-------|-------------|----------|-----------------|
| **1** | Country/regime model + US Chart of Accounts + country-aware invoice→GL posting | Phases 2 & 3 | Yes |
| **2** | QuickBooks adapter (QBO + Desktop) + OAuth callback wiring + sync tables | — | Yes (on Phase 1) |
| **3** | CCPA/CPRA compliance regime | — | Yes (on Phase 1) |

---

## 4. Phase 1 — Country/regime model + regionalized finance

### 4.1 Schema
- `packages/db/src/schema/auth.ts` (organizations, after `settings:45`): add
  `country` (`text NOT NULL DEFAULT 'IN'`, ISO-3166 alpha-2) and
  `complianceRegime` (`text NOT NULL DEFAULT 'dpdp'`; `dpdp|ccpa|none`); optional `country` index beside `slugIdx:52`.
- `packages/db/src/schema/org-settings.ts`: add `OrgMarketSettings` type + `market?` on `OrgSettings`
  (`baseCurrency`, `taxMode: "gst"|"sales_tax"|"none"`, `trackSaleOfPersonalInfo`).

### 4.2 US Chart of Accounts
- `apps/api/src/routers/accounting.ts`: keep `INDIA_COA_SEED:41`; add `US_COA_SEED`.
  - **Drop:** GST ITC `1141/1142/1143`, TDS `1150/2130`, GST Payable `2121/2122/2123`, PF `2140`.
  - **Add:** `2125 Sales Tax Payable`, `2141 Payroll Taxes Payable`, `2142 Federal Withholding Payable`.
  - **Keep stable (money-path depends on these):** AR `1130`, AP `2110`, Bank `1120`, Cash `1110`, Revenue `4100`, Expense `5000`, Retained Earnings `3200`.
- `seedChartOfAccountsForOrg(db, orgId, country="IN"):101` selects the seed and stamps `currency` (USD/INR) per row.
- `coa.seed:199` and `coa.create:166` become country/currency-aware.
- `apps/api/src/routers/auth.ts` signup (`:119-122`, seed call `:131`): accept `country`, stamp `country`+`complianceRegime` on org, pass into seed.

### 4.3 Country-aware invoice→GL posting (money-path)
- `apps/api/src/lib/invoice-journal.ts` `postInvoiceJournalEntry:39` (codes `:74-75`): add `country`, `salesTaxAmount?`, `currency`.
  - **India (`gst`):** unchanged CGST/SGST/IGST.
  - **US (`sales_tax`):** no split. Receivable → `Dr AR(1130)`, `Cr Revenue(4100)`, `Cr Sales Tax Payable(2125)`. Payable → `Dr Expense(5000)`, `Dr Sales Tax Payable(2125)`, `Cr AP(2110)`. `salesTax=0` → 2-line entry.
  - Currency from org base currency (replaces `"INR"` literals `:138/263/359`); `exchangeRate=1`.
- Balance invariant preserved: `gross = taxable + salesTax` ⇒ `Σdebit=Σcredit`; guard `:118` (and settlement `:243`) covers US.
- `postInvoiceSettlementEntry:185` + `reverseInvoiceJournalEntry:305`: currency country-derived; logic unchanged (stable codes `2110/1130` + cash `["1120","1110"]` at `:217`).
- `apps/api/src/routers/financial.ts` (`computeGST` call sites `:27/74-105/807-826`): pass country/currency; US treats sales tax as caller-supplied amount.

### 4.4 Tests
- `us-coa-seed.test.ts` — US seed has `2125`, no GST/TDS/PF, stable codes present, `currency=USD`; IN seed regression.
- `us-invoice-journal.test.ts` (or extend `money-invariants.test.ts`) — US receivable/payable balanced in USD, Sales Tax Payable credited, no GST lines; `salesTax=0` 2-line balanced; settlement + reversal balanced; US↔IN isolation in one run.

### 4.5 Migration workflow
`db:generate` → `check:migrations` → `pnpm --filter @coheronconnect/db build` → validate on throwaway DB copy (`127.0.0.1`, inline `PGPASSWORD=`). Backfill via `NOT NULL DEFAULT` (India = default branch, no behavior change). New migration `0031_*`.

### 4.6 Risks
- Settlement/reversal depend on stable `2110/1130/1120/1110` — enforced in US seed.
- One org = one base currency; trial balance (`accounting.ts` schema `:461-489`) / balance sheet (`:587-636`) sum regardless of currency — do not consolidate cross-currency (follow-up).

---

## 5. Phase 2 — QuickBooks adapter (QBO + Desktop)

### 5.1 Adapter
- New `apps/api/src/services/integrations/quickbooks/`:
  - `types.ts` — `QuickBooksConfig` (`edition: "online"|"desktop"`, tokens, realmId; desktop webConnectorPassword/sessionTicket) + backend interface; implements `IntegrationAdapter` (`services/integrations/types.ts:32-58`).
  - `qbo-backend.ts` — OAuth2 + REST v3; near-real-time; inbound via signed change webhooks; refresh mirrors `microsoft-365.ts:194-211`.
  - `qbd-backend.ts` — Web Connector SOAP/QBXML; poll/batch, one session at a time; queued request/response cursor.
  - `index.ts` — delegates by `edition`; `beginOAuth` throws for desktop.
- `registry.ts:20-28`: add `quickbooks: quickbooksAdapter`.
- `integrations.ts`: add to `PROVIDER_CATALOG:56`; extend `category` union (`:48`) with `"accounting"`. Env `QBO_OAUTH_CLIENT_ID/SECRET`, per-org override.

### 5.2 OAuth callback wiring (must build)
No HTTP route calls `beginOAuth`/`completeOAuth` today (only adapters `microsoft-365.ts:136/152`, `google-workspace.ts:134/149` + a test). Add `apps/api/src/http/integrations-oauth.ts` (beside `http/webhooks.ts:105`): start → `beginOAuth`; callback → `completeOAuth` → `encryptIntegrationConfig` (`services/encryption.ts:11-22`) → upsert `integrations` row `status:"connected"`. Retroactively finishes MS/Google. QBO webhooks route via `http/webhooks.ts` pipeline.

### 5.3 Schema — mapping + sync state
- New `packages/db/src/schema/quickbooks.ts`:
  - `qbEntityMappings` — `orgId`/`integrationId` CASCADE; `entityType`, `localId`, `qbId`, `qbSyncToken`, `lastPushedHash`, `lastSyncedAt`, `direction`. Unique `(orgId,entityType,localId)` + `(orgId,entityType,qbId)`.
  - `qbSyncState` — poll cursor (QBD): `lastChangedAfter`/`cursor`, `pendingRequests` jsonb, `sessionTicket`.
  - Reuse `integrationSyncLogs` for conflict/audit trail.

### 5.4 Idempotency / dedupe / conflict
- Outbound idempotent by `(orgId,entityType,localId)` + `lastPushedHash`; QBO `qbSyncToken` optimistic concurrency.
- Inbound dedupe via `WebhookEnvelope.providerRef` + `(orgId,entityType,qbId)`.
- **Money-safe conflict:** posted `journalEntries` are source of truth (immutable; reverse-and-repost). Divergent mapped posted JE → logged to `integrationSyncLogs.errors` + manual resolution, never auto-overwritten. Drafts may auto-sync.
- QBD: all sync queued in `qbSyncState.pendingRequests`, drained on poll.

### 5.5 Where sync runs
- QBO: on-demand `triggerQuickBooksSync` (mirror `triggerJiraSync:656`/`triggerSapSync:681`) + inbound webhooks; scheduled `quickbooksReconcileWorkflow` on Temporal cron (`apps/worker/src/index.ts` — **first cron workflow in repo, validate wiring**).
- QBD: driven by customer's Web Connector poll; worker sweeps stale sessions.

### 5.6 Tests
- `quickbooks-adapter.test.ts` — capabilities, `test()`, OAuth shape, edition branching, desktop rejects OAuth.
- `quickbooks-mapping.test.ts` — idempotent push, inbound dedupe, `qbSyncToken` mismatch logs + no overwrite of posted JE, no double-post, tenant isolation.

### 5.7 Risks
- OAuth callback route genuinely missing — budget to build (also un-breaks MS/Google).
- Intuit sandbox creds needed for live `test()`.
- QBD SOAP/QBXML heavier than QBO — QBO first behind a flag, QBD second within the phase.

---

## 6. Phase 3 — CCPA / CPRA compliance regime

### 6.1 Parametrize existing cores (reuse, don't fork)
- `packages/db/src/schema/issuer-programme.ts`:
  - `dsrRequestTypeEnum:403` — additively `ADD VALUE`: `know`, `delete`, `opt_out_sale`, `opt_out_sharing`, `limit_sensitive`, `correct`, `portability` (keep DPDP values).
  - `dpdpConsentRecords:528` — add nullable `optOutOfSale`, `optOutOfSharing`, `limitSensitiveUse`, `saleCategory`.
  - Breach clock keys on `jurisdictionCode` via `privacyBreachNotificationProfiles:358` — seed a US profile row per US org (no schema change).
- `apps/api/src/routers/compliance.ts`: DSR create/transition (`:144`, `:256`, `DSR_TRANSITIONS:34`) accept widened types gated by `org.complianceRegime`; breach create defaults `jurisdictionCode` from org country (US → `US-CA`) instead of `"IN"` (`:633`, clock `:648-661`, 72h default `:661`).

### 6.2 New CCPA tables + router
- New `packages/db/src/schema/ccpa.ts`:
  - `ccpaOptOutRequests` (+ events child) — opt-out sale/sharing/limit-sensitive; 15-business-day honor clock; channel GPC/webform/email.
  - `ccpaShineTheLightDisclosures` — annual §1798.83.
  - `ccpaSaleShareMetrics` — CPRA §999.317(g) annual metrics.
  - `ccpaVendorAuditRecords` — service-provider/third-party audit.
  - FK: orgId CASCADE; event children CASCADE; nullable `actorUserId` SET NULL (mirror `dpdpDsrEvents:473`).
- New `apps/api/src/routers/ccpa.ts` — `optOut.*`, `shineTheLight.*`, `metrics.*`, `vendorAudit.*` following `compliance.ts` patterns.

### 6.3 RBAC + gating
- `privacy_officer` (`rbac-matrix.ts:336`) already owns `compliance:*`; `legal_counsel:313` has compliance read/write. Add `assertRegime(org, "ccpa")` so DPDP-only orgs can't reach CCPA endpoints and vice-versa.

### 6.4 Tests
- `ccpa-dsr.test.ts` — CCPA types accepted for `ccpa` org, rejected for `dpdp`; DPDP regression.
- `ccpa-optout.test.ts` — lifecycle + 15-business-day clock + GPC channel.
- `ccpa-breach.test.ts` — US org defaults US jurisdiction/clock (not 72h DPDP); mirror `dpdp-breach.test.ts:55-71`.
- `ccpa-metrics.test.ts` — annual rollup.
- Extend `compliance-rbac.test.ts` — role gating + tenant isolation.

### 6.5 Risks
- `ALTER TYPE ADD VALUE` may not run in a txn on some PG configs and is irreversible — validate on throwaway DB.
- Heavy regression on IN path (new columns nullable, new types gated).

---

## 7. Per-phase verification gate

1. `db:generate` → `check:migrations` → `pnpm --filter @coheronconnect/db build` → validate migration on throwaway DB copy.
2. `pnpm docker:test:up` → from `apps/api`: `DATABASE_URL=postgresql://coheronconnect_test:coheronconnect_test@localhost:5433/coheronconnect_test npx vitest run`. Tests self-isolate.
3. Money-path: `Σdebit=Σcredit` within 0.001 for US postings; settlement/reversal reuse stable codes.
4. Regime gating + US↔IN tenant isolation asserted in one run.
5. QB adapter/mapping tests green; live `test()` only against Intuit sandbox.
6. `pnpm lint` + full `pnpm test` before merge.

---

## 8. Deliverables checklist

- [ ] Phase 1: country/regime columns, `OrgMarketSettings`, `US_COA_SEED`, country-aware seed + invoice→GL, migration `0031`, tests.
- [ ] Phase 2: QuickBooks adapter (QBO+QBD), OAuth callback route, `quickbooks.ts` schema, reconcile workflow, tests.
- [ ] Phase 3: regime-parametrized DSR/consent/breach, `ccpa.ts` schema + router, regime gating, tests.

---

## 9. Rollout / deploy notes

- Migrations auto-apply in prod via the `migrator` service; each phase's migration defaults to India → zero behavior change for existing tenants.
- **Take a snapshot/backup before deploy** (per CLAUDE.md); snapshot + deploy trigger require the user's cloud credentials.
- Suggested branch-per-phase; each phase gated by `[lint, test, e2e]` before merge to `main`.
