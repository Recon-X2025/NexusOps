# System Audit — Full Build Check (2026-06-29)

**Scope requested:** "100% check on every aspect of the build, in every page and every section.
A full-blown system check like none done till now. No shortcuts, no assumptions. Every aspect
checked to figure out what is broken and what is working today." Delivered as a **line-item
pass/fail report** plus a chat summary.

**Method (5 layers):**
1. **Static surface map** — every page route + every tRPC endpoint inventoried.
2. **Deterministic wiring sweep** — a script (`scripts/audit-placeholder-tabs.cjs`) compares every
   tab/section identifier against its render block to find tabs that show **nothing**.
3. **Engineering gates** — lint/typecheck, full test suite, coverage floor, migration integrity,
   money-path invariants.
4. **Live browser pass** — signed-in Playwright session against production `connect.coheron.tech`.
5. **END-TO-END side-effect pass** (§9) — real actions fired against a local real-infra stack
   (MailHog/MinIO/Redis/Temporal), each verdict backed by an **observed side-effect** (email lands,
   file stored, job processed) — not a 200 alone. Added after the first pass was judged surface-level.

**Environment:** branch `main` @ `2b6ac6c`; production `connect.coheron.tech` (platform v2.0.1);
test Postgres on :5433.

---

## 1. Headline verdict

| Area | Verdict |
|------|---------|
| Build / typecheck (7 packages) | ✅ PASS |
| Full automated test suite | ✅ PASS (exit 0, zero failures) |
| Coverage floor gate | ✅ PASS (all 4 metrics above floor) |
| Migration journal integrity | ✅ PASS (11 active migrations = 11 journal tags) |
| Money-path invariants | ✅ PASS (asserted by tests) |
| Live core pages (login, payroll, CRM, admin) | ✅ render & authenticate |
| **User-visible broken tabs (empty content)** | ❌ **4 found** |
| **"Looks wired but doesn't save" admin tabs** | ⚠️ **3 found** (stub endpoints) |
| Dead type member (no UI impact) | ⚠️ 1 found |

**Bottom line:** the platform builds clean, tests green, money paths sound, and core pages work.
The real defects are **4 tabs that render an empty pane** and **3 Admin tabs that appear to save
but don't persist** because their backend endpoints are stubs.

---

## 2. Engineering gates — line item

| # | Check | Command | Result |
|---|-------|---------|--------|
| G1 | Typecheck — web | `tsc --noEmit` | ✅ PASS |
| G2 | Typecheck — api | `tsc --noEmit` | ✅ PASS |
| G3 | Typecheck — db / metrics / mac / ui / types | turbo `lint` | ✅ PASS (7/7) |
| G4 | Migration journal in sync | `pnpm check:migrations` | ✅ PASS |
| G5 | Full API test suite (real Postgres :5433) | `vitest run --coverage` | ✅ PASS — exit 0, **no FAIL markers** across 59 test files |
| G6 | Coverage — statements | floor 45.90% | ✅ **46.72%** |
| G7 | Coverage — branches | floor 54.40% | ✅ **55.55%** |
| G8 | Coverage — functions | floor 37.40% | ✅ **40.76%** |
| G9 | Coverage — lines | floor 45.90% | ✅ **46.72%** |

> Note on G5: vitest's per-test scroll-back had rotated out of the captured buffer, but the run
> **exited 0** with **zero** `FAIL`/`✗`/`×`/`failed` markers and produced a complete coverage
> summary — both only happen on a fully green run.

### Money-path invariants (G10–G14)

| # | Invariant | Source | Tested |
|---|-----------|--------|--------|
| G10 | Journal debits == credits (tol 0.001), imbalanced REJECTED | `routers/accounting.ts` | ✅ `money-invariants.test.ts:24` |
| G11 | GST intra = CGST+SGST 50/50; inter = IGST; parts sum to total | `lib/india/gst-engine.ts` | ✅ `:69–98` |
| G12 | CGST credit cannot offset SGST liability (and vice-versa) | gst-engine | ✅ `:141` |
| G13 | netPay = max(0, gross − deductions); ≤ gross; ≥ 0 | `lib/payroll-cycle.ts` | ✅ `:197` |
| G14 | 3-way match (invoice ≈ PO ≈ GRN within tolerance) | `lib/invoice-po-match.ts` | present; covered in procurement suites |

---

## 3. ❌ User-visible broken tabs (empty render — HIGH priority)

These tabs have a **clickable button** but **no content renders** when selected. Verified by the
deterministic sweep and (for payroll) confirmed **live**.

| # | Page | Route | Tab (button) | Status |
|---|------|-------|--------------|--------|
| B1 | Payroll | `/app/payroll` | **Salary structures** | ❌ empty pane — **confirmed live** (active tab, blank below) |
| B2 | Invoice detail | `/app/financial/invoices/[id]` | **Payment** | ❌ button maps in (`page.tsx:138`) but no `activeTab === "payment"` block (only details/activity) |
| B3 | Purchase Order detail | `/app/procurement/orders/[id]` | **Documents** | ❌ button maps in (`:130`) but no `activeTab === "documents"` block |
| B4 | Requisition detail | `/app/procurement/requisitions/[id]` | **Approval** | ❌ button maps in (`:143`) but no `activeTab === "approval"` block |

**Common root cause:** the tab button is included in the tab list / union type, but the matching
`{activeTab === "<x>" && (…)}` render block was never written.

**Backend note for B1:** there is also **no API to back it** — `payroll.ts` only *reads*
`salaryStructures` for computation; there is no `payroll.structures.list` (or equivalent) endpoint.
So fixing B1 requires both a render block **and** a new list endpoint.

---

## 4. ⚠️ "Looks wired but doesn't save" — Admin stub endpoints (MEDIUM priority)

These Admin Console tabs render a working-looking UI, but the backend **does not persist** changes —
the mutation just echoes the input back, and the list returns hardcoded/empty data. A user will
think they saved a setting that is silently discarded.

| # | Admin tab | Endpoint | Behaviour | File |
|---|-----------|----------|-----------|------|
| S1 | SLA Definitions | `admin.slaDefinitions.list` / `.upsert` | list → `[]`; upsert → echoes input (no DB) | `routers/admin.ts:337–353` |
| S2 | System Properties | `admin.systemProperties.list` / `.update` | list → 5 hardcoded rows; update → echoes input (no DB) | `:355–368` |
| S3 | Notification Rules | `admin.notificationRules.list` / `.create` | list → `[]`; create → fake `NR-${Date.now()}` (no DB) | `:370–392` |

**Root cause:** backing tables (`slaPolicies`, `notificationRules`) are not in the schema yet;
the code comments say as much. These are honest placeholders, not bugs — but they are **not labelled
as such in the UI**, which is the risk.

---

## 5. ⚠️ Dead code (no user impact — LOW priority)

| # | Location | Finding |
|---|----------|---------|
| D1 | `/app/work-orders/page.tsx:103` | `woActionPanel` union includes `"assign"`, but it is only ever set to `"state"` / `null`. The `"assign"` member is unreachable dead code (no UI sets or renders it). Harmless. |
| D2 | `packages/db/drizzle_backup/` (43 stale `.sql`) | Old migration set left beside the active `packages/db/drizzle/` (11 files). Not used at runtime; recommend archiving/removing to avoid confusion. |

---

## 6. Surface map (what exists)

- **Web pages:** ~129 `page.tsx` routes under `apps/web/src/app` across auth, IT services, HR,
  payroll, finance/procurement/accounting, CRM, CSM, legal/secretarial, security/GRC, strategy/PMO,
  knowledge, admin, settings, portal.
- **Tab-bearing pages:** 44 (231 distinct tab/section render blocks). Of these, **only the 4 in §3
  have a missing render block**; the rest are fully wired.
- **tRPC API:** 56 top-level routers, ~400+ procedures. Largest: `tickets` (~2k LOC), `hr` (~1.5k),
  `accounting` (~950). **Stub procedures:** only the 6 in §4 (all in `admin`). Everything else hits
  the DB.
- **Live render spot-checks (signed in):** `/login` ✅, `/app/payroll` ✅ (tabs work; structures empty),
  `/app/crm` ✅ (8 tabs, KPIs live), `/app/admin` ✅ (overview live: 3 users, 26 roles, live audit feed).

---

## 7. Known issues parked from earlier (not re-opened here)

| Ref | Item | State |
|-----|------|-------|
| P-a | Deploy-visibility lag (~20 min) | Diagnosed = Next.js prerender cache (`s-maxage`, `x-nextjs-cache: HIT`, stale-time 300s) on `/app/*`. Fix (mark routes dynamic) approved earlier, then paused. |
| P-b | Caddy (live) vs Traefik (`docker-compose.prod.yml`) | Config drift; live server uses Caddy. `docker-compose.prod.yml` is stale, not source of truth. |

---

## 8. Recommended fix order

1. **B1–B4 (broken tabs)** — highest user-visible impact. B2/B3/B4 are pure front-end (add the
   missing render block). B1 needs a render block **plus** a `payroll` list endpoint + backing read.
2. **S1–S3 (admin stubs)** — either implement the tables/persistence, or label the tabs
   "Coming soon" so admins aren't misled into thinking settings saved.
3. **P-a (cache lag)** — apply the dynamic-route fix so deploys reflect immediately.
4. **D1/D2 (cleanup)** — remove dead `"assign"` member and archive `drizzle_backup/`.

---

*Generated by automated audit: static surface map + `scripts/audit-placeholder-tabs.cjs` +
engineering gates (lint/test/coverage/migrations) + signed-in Playwright live pass.*

---

## 9. END-TO-END pass (no shortcuts) — 2026-06-29 follow-up

The sections above are static + render-level. On request ("I asked for an end-to-end check and
not a surface level"), a full **side-effect-following** pass was run against a **local stack with
real infra** (not mocks): Postgres :5434, Redis :6379, **MailHog** (SMTP :1025 / UI :8025),
**MinIO** S3 :9000, Temporal :7233, Meilisearch :7700. Dev API in `development` mode on the seeded
dev DB; admin `admin@coheron.com`. Each test **triggers a real action and follows the downstream
side-effect to its conclusion** (email leaving the system, file reaching storage, job processed).

### 9.1 Results

| # | Surface | Action fired | Side-effect verified | Verdict |
|---|---------|--------------|----------------------|---------|
| E1 | Email — invite | `auth.inviteUser` (live tRPC) | Invite email **landed in MailHog** (subject "You've been invited to join CoheronConnect HQ") | ✅ PASS |
| E2 | Email — reset | `auth.requestPasswordReset` | Reset email **landed in MailHog** (MailHog total 1→3) | ✅ PASS |
| E3 | Money — journal | `accounting.journal.create` balanced + unbalanced + `post` | Balanced → `JE-2026-00001`; **unbalanced rejected** ("debit 1000 ≠ credit 999"); post → `status=posted` | ✅ PASS |
| E4 | Money — GST | `computeGST()` intra + inter | Intra → CGST 90 + SGST 90; inter → IGST 180; both = ₹180 | ✅ PASS |
| E5 | Money — invariants suite | `money-invariants.test.ts` (real DB) | 13/13 pass (journal, GST, payroll netPay, 3-way match) | ✅ PASS |
| E6 | Integrations (6 testable) | `upsertIntegration` + `testIntegration` per provider | Config encrypts + stored; `.test()` makes **real outbound calls** (razorpay→401, sms_msg91→200) | ✅ PASS (plumbing) |
| E7 | Storage + jobs | `documents.upload` | File **round-tripped through MinIO** (signed URL returned 73 bytes, content matched); **scan job ran** (`scanStatus` pending→skipped via BullMQ/Redis) | ✅ PASS |

### 9.2 Bugs the E2E pass surfaced that static analysis did NOT

These are the high-value finds — each looked "fine" at render/DB-write level but **broke at the
side-effect boundary**:

| Ref | Severity | Bug | Evidence | Fix |
|-----|----------|-----|----------|-----|
| **E-1** | **High** | **Production email silently no-ops.** `inviteUser` → `sendTransactionalEmail` → `sendEmail`, but `getTransporter()` returns `null` when `SMTP_HOST` is unset and just logs `[EMAIL] Would send…`. Prod `.env` has all SMTP commented out. | Email worked instantly once `SMTP_HOST` pointed at MailHog → **config gap, not code bug**. | Set `SMTP_HOST/PORT/USER/PASS/FROM` in prod (SES/Postmark/SendGrid). Requires user's provider creds. |
| **E-2** | **High** | **S3 env var name mismatch — uploads fail on any documented setup.** `storage.ts` reads `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` and needs `S3_FORCE_PATH_STYLE=true` for non-AWS (MinIO). But `.env`/`.env.example` provide `S3_ACCESS_KEY` / `S3_SECRET_KEY`. | Upload threw "Could not load credentials from any providers" until the code-expected names were set. | Either rename the env vars the code reads, or fix `.env*` templates. Add `S3_FORCE_PATH_STYLE` for S3-compatible storage. `apps/api/src/services/storage.ts:25-32`. |
| **E-3** | **High** | **`APP_SECRET` undocumented but mandatory for ALL integrations.** Saving any integration calls `encryptIntegrationConfig`, which throws `APP_SECRET is not configured` if unset. `APP_SECRET` is **missing from `.env.example`/`.env`** (only in KMS/self-hosted docs). | `upsertIntegration` failed for all 6 providers until `APP_SECRET` was set. | Add `APP_SECRET` to `.env.example` with generation note. `apps/api/src/routers/integrations.ts:290`. |
| **E-4** | **Medium** | **ClearTax GST integration unusable via UI — field-name drift.** Catalog form collects `clientId` / `clientSecret` / `gstin` / `environment`; the adapter reads `apiKey` / `apiSecret` / `gstin`. A user filling the form always gets "Missing apiKey, apiSecret". | `testIntegration("cleartax_gst")` → "Missing apiKey, apiSecret, or gstin" despite a valid form save. | Align catalog field keys with adapter (`apiKey`/`apiSecret`) or map them on save. `services/integrations/cleartax-gst.ts:63` vs catalog. |
| **E-5** | **Low / env-only** | **MinIO needs KMS for the code's default SSE-S3.** `putObject` always sets `ServerSideEncryption: "AES256"`; default MinIO has no KMS → "Server side encryption specified but KMS is not configured." | Upload succeeded once MinIO ran with `MINIO_KMS_SECRET_KEY`. | Correct prod default for AWS; for dev, add `MINIO_KMS_SECRET_KEY` to `docker-compose.dev.yml` (or document it). Not a prod bug. |

### 9.3 What this means

- The **money engine is solid** end-to-end — invariants actively reject bad data, not just on paper.
- The **biggest real risks are configuration/wiring gaps** (E-1, E-2, E-3) that make whole subsystems
  (email, document storage, integrations) **silently inert on a by-the-book deployment**. None of
  these throw at build/typecheck/test time — only an action-following E2E exposes them.
- **E-4** is a genuine logic bug shipping today (GST e-invoicing can't be configured from the UI).

### 9.4 Recommended fix order (E2E additions)

1. **E-2 + E-3** — one-line/env fixes that unblock storage + integrations entirely. Do first.
2. **E-1** — wire prod SMTP (needs user's mail-provider credentials).
3. **E-4** — align ClearTax catalog/adapter field keys.
4. **E-5** — dev-only; add MinIO KMS key to dev compose for parity.

*E2E method: live tRPC + engine calls against a local real-infra stack (MailHog/MinIO/Redis/Temporal);
every PASS is backed by an observed side-effect, not a 200 response alone.*
