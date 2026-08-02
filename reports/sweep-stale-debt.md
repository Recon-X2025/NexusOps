# Sweep — Stale Accepted Debt

**Type:** Sweep, not an audit. No code was changed.
**Scope:** Every entry in the "Known accepted debt" section of
`docs/quality-bar.md` (lines 219-239) and every gap tracked in
`docs/GAP_ANALYSIS.md`, checked against the **current source** to see whether
each is still accurate.

Each entry is classified as one of:

- **(a) still true** — genuine accepted debt; the exemption is honest.
- **(b) stale, understating** — the gap was fixed; the entry is obsolete and
  now under-sells the product. Harmless to a customer, but it makes the debt
  register untrustworthy.
- **(c) stale, dangerous** — the item *changed* and a real defect now sits
  **inside** an exemption that tells auditors to ignore it. This is the
  category that hides live bugs.

Every classification below was confirmed by reading the cited source directly.

---

## In plain English

A "known accepted debt" list is a promise: "we already know about these gaps,
so a reviewer can skip them." That promise is only safe if the list stays
accurate. This sweep found that the list has drifted badly out of date — and
in one case, dangerously so.

- **Seven of the nine entries are obsolete.** The feature they excuse has since
  shipped and works. This is mostly harmless (the product is better than the
  register admits), but it means an auditor reading the register is being told
  to ignore things that are actually fine — noise, not danger.
- **One entry is dangerously stale.** The "DPDP external notification" debt says
  breach/DSR notices "are not wired" for outbound delivery, so an auditor is
  told to skip it. In reality delivery *was* wired — but wired **wrong**: the
  two legally-required recipients of a data-breach notice (India's Data
  Protection Board, and the affected individuals) are hardcoded to **internal
  company mailboxes**, and the system then records the notice as **"sent."** A
  reviewer following the exemption would walk straight past a bug that
  fabricates proof a statutory breach notification happened when it did not.
- **`docs/GAP_ANALYSIS.md` now marks literally everything as ✅ shipped.** It is
  the "living tracker" the quality bar points auditors to, but it no longer
  tracks any open gap. A tracker that says "nothing is open" is not a tracker —
  it can no longer catch anything, and at least one of its ✅ "shipped, wired,
  tested" claims (depreciation) is overstated.

**The one thing to fix first:** the DPDP notification misrouting (finding #8).
It is a live statutory-compliance defect *and* it is hidden behind an exemption
that tells reviewers not to look.

---

## Verdict

The accepted-debt register is stale across the board. Eight of nine
quality-bar entries no longer match the code; seven understate (fixed), one is
dangerous (a live defect now hides inside the exemption). The GSTR-1 line is
the only quality-bar entry that is still accurate — and it was deliberately
written as "NOT accepted debt / open question," which the code confirms.
`GAP_ANALYSIS.md` has collapsed to all-✅ and can no longer surface a gap.

---

## Quality-bar "Known accepted debt" — entry by entry

### 1. GSTR-1 rate — **(a) still accurate** (correctly marked NOT debt)

- **Register says:** not accepted debt; open question whether the invoice rate
  flows into GSTR-1 or GSTR-1 re-hardcodes 18%.
- **Code:** `apps/api/src/routers/accounting.ts:744-797`. GSTR-1 groups items by
  the actual per-line GST rate; when an invoice has no line items it derives the
  effective rate from header tax amounts (`rt = totalTax/txval`, line 796).
  **No 18% hardcode remains in either branch.**
- **Verdict:** the register's framing ("trace it, don't assume") is correct and
  matches the code. Keep as-is.
- **Caveat (not debt, but worth knowing):** the preferred per-line path reads
  `invoiceLineItems`, which is never written by production code (see
  `reports/sweep-unreachable-features.md` #8), so real invoices always take the
  header-derived fallback. The rate is still correct; the per-line detail is
  simply never present.

### 2. Balance sheet — **(b) stale, understating**

- **Register says:** "not computed (only GL trial balance / P&L exist)."
- **Code:** `apps/api/src/routers/accounting.ts:617-666` — a full `balanceSheet`
  procedure: assets/liabilities/equity from the `currentBalance` snapshot,
  current-period earnings folded into equity, and an explicit
  `isBalanced = |assets − (liab + equity)| < 0.01` check.
  `GAP_ANALYSIS.md:30` corroborates (test `balance-sheet-pnl.test.ts`).
- **Verdict:** shipped. The entry is obsolete — remove it.

### 3. Depreciation engine — **(b) stale, understating** (known)

- **Register says:** "partial; full schedule engine not finished."
- **Code:** `packages/payroll-math/src/depreciation.ts:100-159` —
  `computePeriodDepreciation` + `generateDepreciationSchedule` (SLM & WDV,
  Schedule II final-period true-up to salvage). Wired into the router at
  `apps/api/src/routers/depreciation.ts:147`.
- **Verdict:** the engine is finished — entry is obsolete.
- **Caveat:** the depreciation router has **no UI caller** (only the generated
  RBAC map references it — see `reports/sweep-unreachable-features.md` #6). So
  the *math* debt is stale, but the feature is unreachable for a different
  reason. Note this when closing the entry so the reachability gap isn't lost.

### 4. Gratuity / leave accrual — **(b) stale, understating**

- **Register says:** "accrual works; encashment + carry-forward rules
  incomplete."
- **Code:** `packages/payroll-math/src/leave-accrual.ts` implements
  `computeCarryForward` (line 64, cap + lapse) **and** `computeLeaveEncashment`
  (line 89, per-day wage valuation) — exactly the two things called incomplete.
  Both are wired: `apps/api/src/routers/leave-accrual.ts:402,468` (carry-forward)
  and `:566,616` (encashment). Gratuity is fully computed
  (`packages/payroll-math/src/gratuity.ts:82`) and wired
  (`routers/gratuity.ts:283,366`).
- **Verdict:** the "incomplete" clause is obsolete — encashment and
  carry-forward both exist and are wired. Update the entry.

### 5. CRM lead scoring — **(b) stale, understating** (known)

- **Register says:** "stub/placeholder, not a real model."
- **Code:** `apps/api/src/lib/crm/lead-score.ts:85-113` — a real deterministic
  scorer (source/status/title-seniority/contactability weights, clamped
  0..maxScore), with a versioned-config resolver. Persisted on every create,
  update, and rescore (`lib/crm/lead-write.ts:38,77,101,120`).
- **Verdict:** not a stub — obsolete entry.
- **Nuance:** it is a **rule-based** scorer, not a machine-learned "model." The
  word "model" in the register was always aspirational; if the intent is a
  learned model, re-file that as a *new, honest* forward-looking item rather
  than leaving the misleading "stub/placeholder" wording.

### 6. CRM lead→deal conversion — **(b) stale, understating** (known)

- **Register says:** "drops account/contact context (lossy)."
- **Code:** `apps/api/src/lib/crm/lead-convert.ts` — upserts account + contact
  from the lead, carries both onto the new deal, re-points open activities, and
  back-links the lead; idempotent and transactional. Wired at
  `routers/crm/leads.ts:73` and `routers/crm/index.ts:349`.
- **Verdict:** conversion is now lossless — obsolete entry.

### 7. SAM installed-vs-entitled reconciliation — **(b) stale, understating**

- **Register says:** "not closed (M365 true-up)."
- **Code:** `apps/api/src/lib/sam/license-reconcile.ts` — `reconcileLicense`
  computes installed − entitled → over_deployed / under_utilized / at_parity /
  unknown + shortfall; `ingestInstalledCount` / `reconcileOrgLicenses` persist
  and sort audit-risk-first. Wired at `routers/assets.ts:913,925`.
- **Verdict:** shipped — obsolete entry.

### 8. DPDP external notification — **(c) STALE, DANGEROUS** (known direction, confirmed)

- **Register says:** "sweeps run and log artifacts, but outbound delivery to the
  data subject / regulator is not wired. Tracked." → an auditor is told the
  delivery seam is empty and can be skipped.
- **What actually changed in the code:**
  1. The process-wide dispatcher is now **`EmailDispatcher`**, not
     `LogOnlyDispatcher` (`apps/api/src/lib/notification-dispatcher.ts:131`). It
     performs a **real external send** via
     `sendTransactionalEmail → sendEmail → transporter.sendMail`
     (`notification-dispatcher.ts:106`; `services/notifications.ts:47-58,92-99`).
     So "not wired" is **false** — delivery is wired.
  2. The wiring is **defective for exactly the two statutory recipients** the
     debt names. In `EmailDispatcher.dispatch`
     (`notification-dispatcher.ts:92-100`) the symbolic audiences are hardcoded:
     - `data_protection_board` → `dpb-india@coheronconnect.coheron.com`
       (an internal company vanity address — **not** the real Data Protection
       Board).
     - `affected_principals` → `privacy@coheronconnect.coheron.com`
       (the company's own privacy mailbox — **not** the affected individuals).
  3. After the (misrouted) send, the artifact row is stamped **`status: "sent"`**
     (`notification-dispatcher.ts:108-112`).
  4. The breach sweep raises **both** a `board` notice and a `principal` notice
     when a breach's statutory clock elapses
     (`apps/api/src/lib/dpdp-sweeps.ts:163-189`), so this path fires on the exact
     obligation DPDP §8(6)/breach rules impose.
  5. The DPDP sweep file header still asserts the old reality — "None of these
     functions perform external delivery … which today only logs an artifact"
     (`dpdp-sweeps.ts:10-11`) — so the **code comment actively lies** about the
     current behaviour, reinforcing the stale exemption.
- **Why this is the dangerous class:** a statutory breach notification to the
  regulator and to affected data principals is **recorded as delivered** while
  actually going to two internal inboxes. That is worse than "not wired": it
  manufactures false evidence of compliance. And it is hidden precisely where a
  reviewer is told not to look ("known debt: not wired, skip it").
- **Verdict:** rewrite the entry immediately. It is NOT "not wired" — it is
  "wired, but statutory recipients are misrouted to internal mailboxes and
  falsely marked sent." Raise as a live **BLOCKER**-class compliance defect, not
  accepted debt.

### 9. SMS / notification delivery — **(b) stale, understating**

- **Register says:** "dispatcher routes and logs; real external send is a seam,
  not fully wired."
- **Code:** `apps/api/src/services/integrations/sms-msg91.ts:39-58` — a real
  `send` that POSTs to the MSG91 flow API. Wired end to end through the durable
  dispatch worker: `workflows/notificationDispatchWorkflow.ts:134` resolves the
  `sms_msg91` config, `:137` gets the adapter, `:161` invokes it on the `sms`
  channel. `sendNotification` opts in via `payload.sms`
  (`services/notifications.ts:143`).
- **Verdict:** external send **is** wired (real adapter + durable worker). The
  entry's "not fully wired" is obsolete; the only accurate residue is the
  best-effort no-op **when the integration is unconfigured**, which is normal
  degradation, not a gap. Update the wording.

---

## `docs/GAP_ANALYSIS.md` — the tracker itself is stale

- **Observation:** every tracked item G1–G17, plus the entire "Shipped &
  production-grade" table, is marked **✅** (`GAP_ANALYSIS.md:26-88`). Searching
  the file, **no** 🟡 PARTIAL / 🔴 STUB / ⛔ MISSING marker exists outside the
  legend line. The "living gap tracker" tracks zero open gaps.
- **Why that is itself a dangerous-direction problem:** quality-bar rule #10
  points auditors here as the authoritative accepted-debt registry ("Known open
  gaps in `docs/GAP_ANALYSIS.md` are accepted debt … the auditor should not
  re-report them"). A registry that says everything shipped can no longer flag
  anything — and it silently blesses whatever regressions land inside those
  ✅ areas.
- **At least one ✅ is overstated:** the "Depreciation engine (SLM/WDV, Schedule
  II)" row (`GAP_ANALYSIS.md:31`) is legend-defined as "shipped, **wired**,
  tested." The math is shipped and tested, but it is **not wired to any UI** (no
  caller outside the generated RBAC map — see
  `reports/sweep-unreachable-features.md` #6). "Wired" is wrong.
- **Cross-check of the ✅ items that overlap this sweep:** balance sheet (#2),
  gratuity/leave (#4), lead scoring (#5), lead→deal (#6), SAM (#7), SMS (#9),
  GSTR-1 rate — all independently confirmed shipped above, so those ✅ marks are
  accurate. The DPDP row (`GAP_ANALYSIS.md:38`, "DPDP consent / DSR / breach
  automation + sweeps ✅") is accurate about the *sweeps* but does not capture
  the misrouted-delivery defect in finding #8; it should carry that caveat.

---

## Summary table

| # | Debt entry | Class | One-line reason |
|---|-----------|-------|-----------------|
| 1 | GSTR-1 rate | (a) still accurate | per-line + header-derived rate; no 18% hardcode |
| 2 | Balance sheet | (b) understating | `balanceSheet` procedure shipped + balances |
| 3 | Depreciation engine | (b) understating | SLM/WDV schedule engine finished (but UI-unreachable) |
| 4 | Gratuity / leave accrual | (b) understating | carry-forward + encashment both shipped & wired |
| 5 | CRM lead scoring | (b) understating | real deterministic scorer, persisted (not a stub) |
| 6 | CRM lead→deal conversion | (b) understating | lossless upsert of account+contact, wired |
| 7 | SAM reconciliation | (b) understating | installed-vs-entitled true-up shipped & wired |
| 8 | **DPDP external notification** | **(c) DANGEROUS** | delivery wired but statutory recipients misrouted to internal inboxes, marked "sent" |
| 9 | SMS / notification delivery | (b) understating | real MSG91 adapter wired through dispatch worker |
| — | GAP_ANALYSIS.md (whole tracker) | (c) dangerous-direction | all-✅; tracks no open gap; one ✅ ("depreciation wired") overstated |

---

## Recommended actions (register hygiene, not code)

1. **Rewrite entry #8 now** and escalate it out of "accepted debt" into a live
   BLOCKER-class finding: DPDP board/principal notices are misrouted to internal
   mailboxes and falsely recorded as "sent"
   (`notification-dispatcher.ts:92-112`); the `dpdp-sweeps.ts:10-11` comment must
   also be corrected as it now misstates behaviour.
2. **Delete or update the seven understating entries** (#2–#7, #9) so the
   register stops telling reviewers to skip working features. Where a residual
   nuance exists, keep only that nuance:
   - depreciation → "engine done; **UI-unreachable**" (don't lose the real gap).
   - lead scoring → if a learned model is still wanted, file it as a fresh
     forward item, not "stub."
   - SMS → "wired; no-op only when integration unconfigured."
3. **Re-open `GAP_ANALYSIS.md` as a real tracker:** it should not be all-✅.
   Correct the depreciation row from "wired" to "engine only, no UI caller," and
   add the DPDP delivery-misrouting caveat to the DPDP row.

*No source files were modified by this sweep.*
