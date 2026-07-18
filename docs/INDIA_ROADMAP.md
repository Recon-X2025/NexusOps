# CoheronConnect — India Roadmap (consolidated, verified)

**Date:** 2026-07-18 (rev; orig 2026-07-15)
**Owner:** Product
**Status:** Current — supersedes the India/security/GA planning docs listed in §0.
**Verification basis:** read-only code audit at migration head **`0038_chief_ultimates`**
(39 migrations, 0000–0038). Every status below is cited to `file:line`. Where a
superseded plan's claim no longer matches code, it is flagged **[DISCREPANCY]**.

> **2026-07-18 revision:** since the original `0032` audit, the DPDP privacy track has
> shipped the pieces the plan called its launch-blocker "trap": DSR **erasure execution**
> (wired into the fulfil transition, retention-floor-aware, flag-gated, unit-tested), the
> 8-year **retention floor**, **Aadhaar minimisation** (peppered-HMAC + masked display,
> raw dropped) and **PAN** hashing, plus a **fail-fast pepper boot guard**. DPDP moves
> from **PARTIAL launch-blocker** to **near-closed** — what remains is real notification
> **delivery** (still `LogOnlyDispatcher`) and Indian privacy-counsel **sign-off** to flip
> `DPDP_ERASURE_ENABLED` on and extend the erasure map to domain tables. Migrations
> `0036–0038` carry this work.

> Companion roadmaps: **`docs/US_ROADMAP.md`** (US market) · **`docs/AI_ROADMAP.md`**
> (common AI maturity stages). Effort labels are relative sizing (S/M/L), **not time
> estimates**.

---

## 0. What this consolidates (now archived)

This file merges and replaces, for the India track:

- `PRODUCTION_READINESS_PLAN_2026-04-26.md` — the locked 90-day India GA plan (WS-1…WS-6).
  Retained as **decision-history** (the §1 locked decisions still explain *why*).
- `SECURITY_COMPLIANCE_ROADMAP_2026-07-13.md` — Phases A–F (the 5 security items + audits).
- `INDIA_GOLIVE_DEV_PLAN_2026-07-13.md` — Phases 1–5 (same 5 items, go-live framing).
- `INDIA_GOLIVE_SPEC_PHASES_1-3-5_2026-07-13.md` — detailed impl spec for a subset.

The three 07-13 docs described the **same five technical items** (DPDP, Vuln-SLA, MFA,
KMS, RLS) under two framings. They were written **before merge `c88aaf2`**, which
shipped MFA, Vuln-SLA, and the DPDP artifact/sweep scaffolding — so several "to build"
items are now **done**. This roadmap reflects the verified post-merge reality.

---

## 1. Verified status — the five security/go-live items

| # | Item | Plan (07-13) said | **Verified now (0038)** | Gap that remains | Effort |
|---|------|-------------------|------------------|------------------|--------|
| 1 | **DPDP privacy engine** | ~90%, "finish the loop" | **NEAR-CLOSED** | Real notification *delivery*; counsel sign-off to enable live erasure + extend map | S + legal |
| 2 | **Vulnerability SLA escalation** | "to build" | **REAL — shipped** | `slaSummary()` view only (minor) | — |
| 3 | **MFA (TOTP)** | "enrollment missing" | **REAL — shipped** | Step-up asks password, not TOTP (minor) | S |
| 4 | **KMS + secrets rotation** | STUB, plumbed | **STUB** (AES only) | Full KMS envelope + rotation | M–L |
| 5 | **DB row-level security (RLS)** | not started | **NOT-STARTED** | All Postgres RLS | L |

**[DISCREPANCY] Items 2 & 3 are already DONE** — the archived plans list them as future
work. **[UPDATED 0038] Item 1 is no longer a hard blocker on code** — the erasure
executor is wired and tested (see §2); the only remaining code item is delivery, and the
gating dependency is legal sign-off, not engineering. **[DISCREPANCY]** CLAUDE.md once
cited head `0031_workable_spot`; the audited head is now `0038_chief_ultimates`
(0036–0038 add retention floor, PAN/Aadhaar minimisation, raw-Aadhaar drop).

---

## 2. Priority 1 — DPDP privacy engine (finish the loop) 🟠 NEAR-CLOSED · S + legal

India pilot holds real PII, so DSR/breach windows are statutory from day one.

**Verified built (do NOT rebuild):**
- DSR lifecycle + state machine — `apps/api/src/routers/compliance.ts:35-43`; `dueAt`
  clock; `dsr.slaSummary`.
- Consent ledger + `expireLapsed` — `compliance.ts` (consent sub-router).
- Breach register + `notifyDueAt` clock; `privacyBreachNotificationProfiles` —
  `packages/db/src/schema/issuer-programme.ts:358-374`.
- Tables `dpdpDataSubjectRequests` (`issuer-programme.ts:427`), `dpdpConsentRecords`
  (`:536`), `dpdpBreachIncidents` (`:648`) + event logs.
- **`dpdpNotificationArtifacts`** — `issuer-programme.ts:735-765` (migration
  `0032_damp_la_nuit.sql:25-37`). *(Plan listed this as a gap — now exists.)*
- **`dpdpSweepWorkflow`** — `apps/worker/src/workflows/dpdpSweepWorkflow.ts`.
- Regime tags: `regimeCode` on DSR (`:440`) + consent (`:556`), default `"DPDP"`;
  breach `jurisdictionCode` (`:660`, default `"IN"`) — the cheap US forward-hook is
  in place.

**Shipped since the 0032 audit (0036–0038) — the trap is now closed in code:**
1. **DSR erasure EXECUTION — BUILT + WIRED.** `executeErasureForDsr`
   (`apps/api/src/lib/dpdp-erasure.ts:199`) walks a declarative per-table `ERASURE_MAP`
   (`:67`, anonymise | delete) inside one transaction and stamps
   `erasureExecutedAt`/`erasureSummary` on the DSR. It is **invoked from the fulfil
   transition** — `apps/api/src/routers/compliance.ts:297-298` runs it in the same tx
   when an erasure DSR moves to `fulfilled`, logging the summary (`:303`). Unit-tested
   (dry-run + forced-destructive + retention-defer) in
   `apps/api/src/__tests__/dpdp-sweeps.test.ts:255-304`.
   - **Retention-floor aware:** rows still inside their statutory window are DEFERRED,
     never touched, even under live erasure (`dpdp-erasure.ts:137-141`) — reconciles §12
     erasure with §8(7). 8-year floor in `apps/api/src/lib/retention.ts`.
   - **Flag-gated for legal:** ships FLAG-OFF in DRY-RUN; destructive path only runs when
     `DPDP_ERASURE_ENABLED === "true"` (`dpdp-erasure.ts:106-108`). The map is
     deliberately CONSERVATIVE (only the DSR record + notification artifacts), NOT domain
     tables — extending it is a counsel-gated follow-up (`dpdp-erasure.ts:20-24`).
2. **PII minimisation shipped** — Aadhaar peppered-HMAC hash + masked display, raw
   dropped (migration `0038_chief_ultimates`); PAN hash/display alongside retained raw
   (for filing); fail-fast pepper boot guard (`assertPiiHashConfigured`). See
   `docs/DPDP_ERASURE_STRATEGY.md`.
3. **Sweep HTTP binding present** — `POST /internal/dpdp/sweep` (`apps/api/src/index.ts:676`).

**Genuinely still missing (the real work):**
1. **Real notification delivery** — artifacts default `status:'logged'`; the active
   dispatcher is still `LogOnlyDispatcher` (`apps/api/src/lib/notification-dispatcher.ts:72`).
   Swap to an email/SMS adapter to actually notify (the final external pass).
2. **Enable + extend erasure (counsel-gated)** — flip `DPDP_ERASURE_ENABLED` on in prod
   and extend `ERASURE_MAP` to domain tables (CRM/HR) once counsel signs off delete-vs-
   anonymise per table.
3. **Sweep schedule** — confirm the Temporal Schedule registration that drives the
   `/internal/dpdp/sweep` binding fires end-to-end live.

**Off-code dependency (now the primary bottleneck):** Indian privacy counsel to sign off
the erasure map + statutory windows before enabling live erasure across domain tables.

**Exit:** overdue DSRs alert on schedule; breach clock fires; consent expiry runs;
fulfilled erasure DSRs purge/anonymize with evidence (✅ built, flag-off);
notifications *delivered* (pending); erasure flag enabled after sign-off (pending legal).

---

## 3. Priority 2 — Vulnerability SLA escalation ✅ SHIPPED (verify + thin polish)

**[DISCREPANCY] This is already REAL** — the archived plans list it as to-build.

**Verified built:**
- CVSS→SLA policy (Crit 7d / High 30d / Med 90d / Low 180d) —
  `apps/api/src/lib/vuln-sla-policy.ts:23-87`.
- Columns `slaBreached`, `escalationLevel` on vulnerabilities —
  `apps/api/src/routers/security.ts:106-107` (migration `0032`).
- **`vulnerabilitySlaEvents`** table — `security.ts:120-137`.
- **Running loop** — BullMQ queue `coheronconnect-vuln-sla` with breach-sweep +
  escalation-sweep (60s) — `apps/api/src/workflows/vulnerabilitySlaWorkflow.ts:41-278`;
  on-call chain integration + notifications fire.

**Residual (optional, minor):** add a `slaSummary()` read model for a UI escalation
view; confirm `security.ts` calls `computeRemediationSla()` at create/import.

---

## 4. Priority 3 — MFA (TOTP) ✅ SHIPPED (close step-up gap)

**[DISCREPANCY] This is already REAL** — archived plans list enrollment as missing.

**Verified built:**
- `mfaEnrollments` table (encrypted `totpSecret`, bcrypt `backupCodes`, status) —
  `packages/db/src/schema/auth.ts:129-154` (migration `0032`).
- Enroll/confirm/disable + login challenge + verify — `apps/api/src/routers/auth.ts`
  (`startEnroll:413`, `confirmEnroll:435` sets `mfaEnrolled=true` at `:465`,
  `verifyMfa:305`, `disable:482`).
- TOTP helpers (`apps/api/src/lib/totp.ts`), AES secret encryption
  (`services/encryption.ts:41-61`), policy gate `assertMfaIfRequired`
  (`lib/mfa-policy.ts:31-80`).

**Residual (S):** step-up (`verifyStepUp`, `auth.ts:522-540`) re-checks **password, not
TOTP** — require a TOTP code for sensitive/finance mutations. Audit that all sensitive
sites invoke the gate.

---

## 5. Priority 4 — KMS + secrets rotation 🟢 FAST-FOLLOW · M–L · STUB

**Verified state:** AES-256-CBC via `APP_SECRET` only —
`apps/api/src/services/encryption.ts:11-34`. Columns `integrations.kmsKeyId` /
`dekWrappedB64` plumbed but **never populated** — `packages/db/src/schema/integrations.ts:42-43`.
No KMS client, no DEK envelope, no rotation.

**Build:** provider decision (AWS KMS likely) → per-tenant DEK wrapped by CMK (store
`dekWrappedB64` + `kmsKeyId`, unwrap on use) → scheduled rotation (reuse the DPDP
schedule harness) → key-use audit table → re-encrypt existing `configEncrypted` under
envelope, validated on a throwaway DB. Keep AES for dev/sandbox.

**Ops dependency:** KMS provisioning + prod secret changes need **your cloud
credentials** — code is buildable in-house; provisioning is not.

---

## 6. Priority 5 — Database RLS backstop 🟢 DELIBERATE POST-LAUNCH · L · NOT-STARTED

**Verified state:** **Zero** Postgres RLS (no `CREATE POLICY` / `ENABLE ROW LEVEL
SECURITY` in any of the 39 migrations; 0036–0038 add none). Isolation is app-layer only
— ~700+ hand-written `eq(table.orgId, …)` predicates; `withOrg` helper exists but is
**unused**
(`apps/api/src/lib/with-org.ts`). Cross-tenant tests pass
(`apps/api/src/__tests__/tenant-isolation.test.ts`).

**Build (behind a flag, table-group by group):** session context
(`SET LOCAL app.current_org_id`, recommend wrapping the tRPC ctx db handle) → RLS
policies on every `orgId` table (hand-written migration, validated on a throwaway DB) →
`BYPASSRLS` role for migrator/worker → adopt `withOrg` as greppable belt-and-suspenders
→ extend isolation tests to prove an *unscoped* query is blocked by the DB.

---

## 7. Compliance program & external audits (parallel, not code)

SOC 2 Type II and ISO 27001 are **organizational + attestation** tracks that code
supports but cannot earn. Technical prerequisites map to: MFA (done §4), audit
logging/RBAC/tenant isolation (done), KMS (§5), RLS (§6). Start the org side now
(GRC/vCISO, policies, access reviews, vendor register, evidence window). **Do not
publish any SOC 2 / ISO claim until earned** (per the 2026-07-13 website brief).

---

## 8. Shared building blocks

- **Temporal Schedules harness** — one scheduler powers DPDP sweeps (§2) and KMS
  rotation (§5). `dpdpSweepWorkflow` is the first user; generalize it.
- **NotificationDispatcher** — `LogOnlyDispatcher` (persist artifact) today; swap to
  email/SMS for real delivery. Reused by DPDP + could back Vuln-SLA notices.
- **Migration discipline (CLAUDE.md):** build `packages/db` before API typecheck;
  hand-write corrective migrations + snapshot; validate on a throwaway real DB (Drizzle
  diffs its own snapshot). §5, §6 add tables — follow each time.

---

## 9. Critical path

```
LAUNCH GATE ► §2 DPDP: notification DELIVERY (code, S) + counsel sign-off to enable
              live erasure (legal)   [erasure execution itself ✅ built/wired/tested]
SHIPPED     ► §2 erasure execution ✓   §3 Vuln-SLA ✓   §4 MFA ✓   (verify + minor polish)
POST-LAUNCH ► §5 KMS → §6 RLS   ‖   §7 SOC2/ISO program (parallel from day one)
```

---

## 10. Decisions needed

1. **Erasure sign-off + map extension** — engage Indian privacy counsel to approve
   delete-vs-anonymise per table and statutory windows, then flip `DPDP_ERASURE_ENABLED`
   and extend `ERASURE_MAP` to domain tables (gates §2; executor already built).
2. **Notification delivery adapter** — email vs SMS (vs both) to replace
   `LogOnlyDispatcher` for DPDP notices (§2, §8).
3. **MFA step-up** — require TOTP (not just password) for finance mutations? (§4)
4. **KMS provider** — AWS KMS / GCP KMS / Vault (§5).
5. **RLS session-context** — wrap ctx db handle (recommended) vs per-request tx (§6).

*Planning only — no application code changed by this document. Certification claims stay
off public surfaces until earned.*
