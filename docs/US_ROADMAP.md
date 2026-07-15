# CoheronConnect — US Roadmap (consolidated, verified)

**Date:** 2026-07-15
**Owner:** Product
**Status:** Proposed — supersedes `US_MARKET_BUILD_PLAN_2026-07-12.md` (now archived).
**Verification basis:** read-only code audit at migration head **`0032_damp_la_nuit`**.
Every status cited to `file:line`.

> Companion roadmaps: **`docs/INDIA_ROADMAP.md`** · **`docs/AI_ROADMAP.md`** (common AI).
> Effort labels are relative sizing, **not time estimates**.

---

## 0. Verified baseline — no US-market code exists yet

The archived plan's claim *"No US-market code exists yet"* is **VERIFIED TRUE** at head
`0032`. The platform is India-hardcoded end to end:

| Area | Verified state | Evidence |
|------|----------------|----------|
| Tenant country/regime | **absent** — no `country` / `complianceRegime` on `organizations` | `packages/db/src/schema/auth.ts:38-71` |
| Market settings | **absent** — no `market` on `OrgSettings` | `packages/db/src/schema/org-settings.ts:107-130` |
| Signup | India-only; seeds India COA, no country param | `apps/api/src/routers/auth.ts:106-173` (seed call `:143`) |
| Chart of Accounts | `INDIA_COA_SEED` only; no `US_COA_SEED`; seeder not country-aware | `apps/api/src/routers/accounting.ts:40-92`, `101-134` |
| Invoice→GL | hardcoded `"INR"` + GST CGST/SGST/IGST | `apps/api/src/lib/invoice-journal.ts:74-75,97-112,138` |
| QuickBooks | **absent** — no adapter, not in registry/catalog | `services/integrations/registry.ts:20-28` |
| CCPA/CPRA | **absent** — no `ccpa.ts` schema/router; DSR enum DPDP-only | `packages/db/src/schema/issuer-programme.ts:403-409` |

**One useful discovery [DISCREPANCY-confirmed]:** the OAuth callback route is genuinely
missing. `beginOAuth`/`completeOAuth` exist on the Microsoft-365 and Google-workspace
adapters but **no HTTP route invokes them** — they are effectively dead code today
(`microsoft-365.ts`, `google-workspace.ts`; only referenced by a test). Building the US
QuickBooks OAuth flow (§3) also *retroactively un-breaks* MS/Google OAuth.

**Migration baseline:** the archived plan assumed `0000→0030`; actual head is `0032`.
The first US migration should chain off `0032`, not `0030`.

---

## 1. Objective & locked decisions

Introduce a **tenant country/regime** model so US and India tenants run on one codebase
with per-market behavior branching (mixed-market SaaS). Carried-forward decisions:

| Decision | Choice |
|----------|--------|
| Market separation | Tenant **`country` column** (real column, not JSONB) |
| Scope | Full US market foundation |
| Delivery | **Phased, country model first** (each phase independently mergeable) |
| QuickBooks products | **Both** QBO (REST/OAuth2) and QB Desktop (Web Connector/QBXML) |
| QB sync direction | Bidirectional (COA / journal entries / invoices / payments) |
| CCPA depth | **Full CCPA/CPRA** (opt-out, Shine-the-Light, annual metrics, vendor audit) |

**Out of scope:** TurboTax API (no public filing API), US sales-tax rate/nexus engine,
cross-currency ledger consolidation.

---

## 2. Phase 1 — Country/regime model + regionalized finance · mergeable alone

**Schema:**
- `organizations` (`schema/auth.ts`, after `settings`): add `country`
  (`text NOT NULL DEFAULT 'IN'`, ISO-3166 alpha-2) + `complianceRegime`
  (`text NOT NULL DEFAULT 'dpdp'`; `dpdp|ccpa|none`); optional `country` index.
- `org-settings.ts`: add `OrgMarketSettings` + `market?` on `OrgSettings`
  (`baseCurrency`, `taxMode: "gst"|"sales_tax"|"none"`, `trackSaleOfPersonalInfo`).

**US Chart of Accounts** (`accounting.ts`): keep `INDIA_COA_SEED`; add `US_COA_SEED` —
drop GST ITC `1141/1142/1143`, TDS `1150/2130`, GST Payable `2121/2122/2123`, PF `2140`;
add `2125 Sales Tax Payable`, `2141 Payroll Taxes Payable`, `2142 Federal Withholding
Payable`; **keep stable money-path codes** AR `1130`, AP `2110`, Bank `1120`, Cash
`1110`, Revenue `4100`, Expense `5000`, Retained Earnings `3200`. Make
`seedChartOfAccountsForOrg(db, orgId, country)` + `coa.seed`/`coa.create` country/
currency-aware; signup stamps `country`+`complianceRegime`.

**Country-aware invoice→GL** (`invoice-journal.ts`): parameterize `postInvoiceJournalEntry`
with `country`, `salesTaxAmount?`, `currency`.
- India (`gst`): unchanged CGST/SGST/IGST.
- US (`sales_tax`): no split — Receivable `Dr AR / Cr Revenue / Cr Sales Tax Payable(2125)`;
  Payable `Dr Expense / Dr 2125 / Cr AP`; `salesTax=0` → 2-line entry. Replace `"INR"`
  literals (`:138` et al) with org base currency; `exchangeRate=1`.
- **Invariant preserved:** `gross = taxable + salesTax` ⇒ `Σdebit=Σcredit` (guard `:118`).
  Settlement/reversal reuse stable codes `2110/1130/1120/1110`.

**Tests:** `us-coa-seed.test.ts` (US seed correct, IN regression); `us-invoice-journal.test.ts`
(US receivable/payable balanced in USD, no GST lines, settlement+reversal balanced,
US↔IN isolation in one run).

**Migration:** new migration chained off `0032`; backfill via `NOT NULL DEFAULT` (India =
default branch, zero behavior change); validate on throwaway DB.

**Risk:** one org = one base currency; trial-balance/balance-sheet sum regardless of
currency — do **not** consolidate cross-currency (follow-up).

---

## 3. Phase 2 — QuickBooks adapter (QBO + Desktop) · mergeable on Phase 1

**Adapter** `apps/api/src/services/integrations/quickbooks/`: `types.ts`
(`QuickBooksConfig` with `edition`, tokens, realmId; implements `IntegrationAdapter`),
`qbo-backend.ts` (OAuth2 + REST v3; refresh mirrors `microsoft-365.ts:194-211`),
`qbd-backend.ts` (Web Connector SOAP/QBXML; queued cursor), `index.ts` (delegates by
edition). Register in `registry.ts` + `PROVIDER_CATALOG`; add `"accounting"` category.

**OAuth callback route (must build — also fixes MS/Google):** add
`apps/api/src/http/integrations-oauth.ts` (beside `http/webhooks.ts`): start →
`beginOAuth`; callback → `completeOAuth` → `encryptIntegrationConfig` → upsert
`integrations` row `status:"connected"`.

**Schema** `schema/quickbooks.ts`: `qbEntityMappings` (orgId/integrationId CASCADE;
entityType, localId, qbId, qbSyncToken, lastPushedHash, direction; unique
`(orgId,entityType,localId)` + `(orgId,entityType,qbId)`), `qbSyncState` (QBD poll
cursor). Reuse `integrationSyncLogs` for conflict/audit.

**Idempotency/conflict:** outbound idempotent by `(orgId,entityType,localId)` +
`lastPushedHash`; QBO `qbSyncToken` optimistic concurrency; inbound dedupe via
`WebhookEnvelope.providerRef`. **Money-safe:** posted `journalEntries` are source of
truth (immutable; reverse-and-repost); divergent posted JE logged, never auto-overwritten;
drafts may auto-sync.

**Where sync runs:** QBO on-demand `triggerQuickBooksSync` (mirror
`triggerJiraSync`/`triggerSapSync`) + inbound webhooks + scheduled
`quickbooksReconcileWorkflow` (Temporal cron — **first cron workflow; validate wiring**).
QBD driven by customer Web Connector poll.

**Risks:** OAuth callback genuinely missing (budget it); Intuit sandbox creds for live
`test()`; QBD heavier than QBO — ship QBO first behind a flag.

---

## 4. Phase 3 — CCPA / CPRA compliance regime · mergeable on Phase 1

**Parametrize existing DPDP cores (reuse, don't fork):**
- `dsrRequestTypeEnum` (`schema/issuer-programme.ts:403`): additively `ADD VALUE`
  `know, delete, opt_out_sale, opt_out_sharing, limit_sensitive, correct, portability`
  (keep DPDP values).
- `dpdpConsentRecords` (`:536`): add nullable `optOutOfSale`, `optOutOfSharing`,
  `limitSensitiveUse`, `saleCategory`.
- Breach clock keys on `jurisdictionCode` via `privacyBreachNotificationProfiles:358` —
  seed a US profile row per US org (no schema change).
- `compliance.ts`: DSR create/transition accept widened types **gated by
  `org.complianceRegime`**; breach create defaults `jurisdictionCode` from org country
  (US → `US-CA`) instead of hardcoded `"IN"`.

**New CCPA tables + router** `schema/ccpa.ts`: `ccpaOptOutRequests` (+ events; 15-business-
day honor clock; channel GPC/webform/email), `ccpaShineTheLightDisclosures` (§1798.83),
`ccpaSaleShareMetrics` (CPRA §999.317(g) annual), `ccpaVendorAuditRecords`. FK: orgId
CASCADE; event children CASCADE; nullable `actorUserId` SET NULL. New
`apps/api/src/routers/ccpa.ts` (`optOut.*`, `shineTheLight.*`, `metrics.*`,
`vendorAudit.*`).

**RBAC/gating:** `privacy_officer` already owns `compliance:*`; add `assertRegime(org,
"ccpa")` so DPDP-only orgs can't reach CCPA endpoints and vice-versa.

**Tests:** `ccpa-dsr`, `ccpa-optout` (15-day + GPC), `ccpa-breach` (US jurisdiction/clock,
not 72h DPDP), `ccpa-metrics`; extend `compliance-rbac` (gating + isolation).

**Risk:** `ALTER TYPE ADD VALUE` may not run in a txn / is irreversible — validate on a
throwaway DB. New IN columns nullable + new types gated → low IN-path regression.

---

## 5. Phase order & per-phase gate

```
Phase 1 (country/regime + finance)  ─►  unblocks Phase 2 & Phase 3
Phase 2 (QuickBooks + OAuth route)  ─┐  independent of Phase 3
Phase 3 (CCPA/CPRA)                 ─┘
```

**Gate each phase:** `db:generate` → `check:migrations` → build `packages/db` → validate
migration on throwaway DB → `pnpm docker:test:up` + vitest (self-isolating) →
money-path `Σdebit=Σcredit` within 0.001 for US postings → regime gating + US↔IN
isolation asserted → `pnpm lint` + full `pnpm test` before merge. Branch-per-phase; each
migration defaults to India ⇒ zero behavior change for existing tenants.

---

## 6. Relationship to the India & AI roadmaps

- **India-first, US-parametrized:** every US change is additive and default-`IN`, so the
  India track (`INDIA_ROADMAP.md`) is unaffected. The DPDP↔CCPA work is *the same engine*
  parametrized by regime — coordinate §4 here with India §2 (DPDP) so the regime tag and
  breach-profile mechanism aren't duplicated.
- **AI (`AI_ROADMAP.md`)** is regime-agnostic and applies to both markets once Stage-2
  computation is truthful.

**Deploy:** migrations auto-apply via the `migrator` service; **snapshot before deploy**
(needs your cloud credentials). Intuit/KMS/cloud provisioning are user actions, not code.

*Planning only — no application code changed by this document.*
