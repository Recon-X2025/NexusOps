# CoheronConnect — GRC Basic Hardening Backlog

**Date:** 2026-07-03
**Prepared by:** Engineering
**Companion to:** `docs/GRC_GAP_ANALYSIS_2026-07-03.md`, `docs/GRC_TIER_WORKITEM_MAP_2026-07-03.md`.

**Purpose:** GRC Basic is included in all plans. The gap analysis rates it **~85% shipped** — this backlog is the remaining ~15% to make the "included" tier honest and defensible. These are **hardening** items (extend/verify existing code), not new subsystems. Anything that is a genuine build is out of scope here and lives in the tier work-item map (GRC+/Advanced).

**Reminders (from `CLAUDE.md`):**
- After schema edits: `pnpm --filter @coheronconnect/db build` before `apps/api` typechecks see them.
- Tests run against real Postgres (port 5433): `pnpm docker:test:up`; suites must self-isolate (fresh org per test).
- FK `onDelete` policy: `orgId → organizations` = CASCADE; child → parent = CASCADE; nullable actor = SET NULL (see `docs/DATA_MODEL.md`).
- New migrations: `pnpm db:generate`, then `pnpm check:migrations`; validate against a throwaway copy of a real DB.

Priority: **P0** (blocks an honest tier claim) · **P1** (buyer-visible polish) · **P2** (nice-to-have).

---

## H-1 — Policy acknowledgement tracking  **[P0]**

**Why:** The tier advertises "Policy management — create, version, **acknowledge**." Create/version exist (`packages/db/src/schema/grc.ts:139`), but there is **no acknowledgement logic** in `apps/api/src/routers/grc.ts` (confirmed: no `acknowledge` reference). The "acknowledge" claim is currently unbacked.

**Work:**
- New table `policy_acknowledgements` (`orgId` CASCADE, `policyId` → `policies` CASCADE, `userId` → `users` CASCADE, `policyVersion` int, `acknowledgedAt`). Unique on `(policyId, policyVersion, userId)`.
- Router procedures in `grc.ts`: `acknowledgePolicy`, `listPolicyAcknowledgements`, `policyAcknowledgementStatus` (who has/hasn't acked the current version).
- Re-acknowledge required when `policies.version` increments.

**Acceptance:**
- A user can acknowledge a published policy; re-acknowledgement is required after a version bump.
- Admin can see ack coverage (% of target users) per policy.
- Test: seed org + policy + users; acknowledge; bump version; assert stale acks are excluded.

**Effort:** S · **Files:** `packages/db/src/schema/grc.ts`, `apps/api/src/routers/grc.ts`, `apps/web/src/app/app/grc`.

---

## H-2 — DPDP consent capture + data-principal request intake  **[P0]**

**Why:** The tier advertises "DPDP Act compliance — **consent & data principal**." Today only RoPA (`packages/db/src/schema/issuer-programme.ts:50` `dpdpProcessingActivities`) and breach-notification profiles exist. There is **no consent record and no data-principal (DSAR) request** flow. This is the tier's weakest claim.

**Scope for Basic (intake + proof only; full automation is GRC+/Advanced):**
- New table `consent_records` (`orgId` CASCADE, subject identifier, purpose, lawful basis, `grantedAt`, `revokedAt`, proof reference). Links to a `dpdpProcessingActivities` row where applicable.
- New table `data_principal_requests` (`orgId` CASCADE, type: access/correction/erasure/nomination/grievance, status: received/in_progress/fulfilled/rejected, subject, due date, handler).
- Router procedures: record/revoke consent; create/advance a data-principal request.

**Acceptance:**
- Consent can be recorded and revoked with a timestamped proof reference.
- A data-principal request can be logged and moved through its status lifecycle with an SLA due date.
- Test: record consent → revoke → assert revocation timestamp; create DSAR → advance to fulfilled.

**Out of scope (defer):** automated consent enforcement, automated breach detection/notification sending, subject-facing self-service portal (Advanced).

**Effort:** M · **Files:** `packages/db/src/schema/issuer-programme.ts` (or new `packages/db/src/schema/dpdp.ts`), new/extended router (e.g. `apps/api/src/routers/india-compliance.ts` or a `privacy.ts`), `apps/web`.

---

## H-3 — Wire board/risk KPI surface  **[P1]**

**Why:** Basic includes a "Basic risk register." `grc.riskMatrix` returns counts only. To be usable at the Basic tier (not board-grade — that's GRC+), ensure the register has a working summary surface.

**Work:**
- Confirm `grc.riskMatrix` (counts by status/score) renders on the GRC dashboard page and reflects live data.
- Add open-vs-closed and by-category counts if not present (query-only; no new tables).

**Acceptance:** GRC dashboard shows accurate live counts by status, rating, and category for the caller's org.

**Effort:** S · **Files:** `apps/api/src/routers/grc.ts`, `apps/web/src/app/app/grc`. (Trend/heatmap/drill-down = GRC+, not here.)

---

## H-4 — Verify compliance-calendar reminder dispatch  **[P1]**

**Why:** The calendar stores `reminderDaysBefore` (default `[30,15,7,1]`) and penalty math (`packages/db/src/schema/india-compliance.ts`, `apps/api/src/routers/india-compliance.ts`), but "deadline tracking" only delivers value if reminders actually fire.

**Work:**
- Confirm a worker job reads due `complianceCalendarItems` and emits notifications at the configured offsets; if absent, add one in `apps/worker`.
- Confirm `calendar.updatePenalties` runs on a schedule for overdue items.

**Acceptance:** An item due in N days where N ∈ reminder offsets produces a notification; overdue items accrue penalty on schedule. Test with a seeded item at each offset boundary.

**Effort:** S–M · **Files:** `apps/worker`, `apps/api/src/routers/india-compliance.ts`.

---

## H-5 — Audit-trail coverage spot-check  **[P2]**

**Why:** "Unified audit trail across all modules" is a strong claim. `auditLogs` (`packages/db/src/schema/auth.ts`) + `siemExportPreview` exist, but coverage is "~90%" per the 2026-06-30 analysis.

**Work:**
- Enumerate mutation routers and confirm each writes an audit entry; list any gaps (do not fix silently — record them).
- Ensure GRC-specific mutations (risk/policy/control/finding create/update) are audited.

**Acceptance:** A coverage table (router → audited yes/no) exists; GRC mutations are all audited.

**Effort:** S (audit) + variable (fill gaps) · **Files:** across `apps/api/src/routers/`.

---

## H-6 — Approvals engine regression guard  **[P2]**

**Why:** "Approvals & workflow engine" is EXISTS and org-hierarchy-aware (`apps/api/src/routers/approvals.ts`). Protect it with an isolation-safe test since multiple tiers depend on it.

**Work:** Add/confirm a test covering multi-step routing + idempotent decision de-dup + cascading rejection.

**Acceptance:** Test seeds a reporting subtree, routes a multi-step approval, asserts idempotency and cascade behaviour.

**Effort:** S · **Files:** `apps/api/src/__tests__/`, `apps/api/src/routers/approvals.ts`.

---

## Summary

| ID | Item | Priority | Effort | Type |
|---|---|---|---|---|
| H-1 | Policy acknowledgement tracking | P0 | S | Small build (backs a live claim) |
| H-2 | DPDP consent + data-principal intake | P0 | M | Small build (backs a live claim) |
| H-3 | Wire board/risk KPI surface | P1 | S | Hardening |
| H-4 | Verify calendar reminder dispatch | P1 | S–M | Hardening/verify |
| H-5 | Audit-trail coverage spot-check | P2 | S+ | Verify |
| H-6 | Approvals regression guard | P2 | S | Test |

**Do H-1 and H-2 first** — they are the only two places where a headline Basic-tier feature ("acknowledge", "consent & data principal") is currently advertised but not backed by code. Everything else is verification or polish.
