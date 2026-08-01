# NexusOps Quality Bar

This file is the contract. Both QA workflows (`qa-map`, `qa-audit`) read it
first. If a rule is not written here, the reviewer should not enforce it — that
is deliberate, and it is what keeps review output signal-dense.

---

## Please confirm these

These rules were first **inferred** from reading the codebase, then corrected by
the product owner. The owner's overarching correction: **every rule I first wrote
was an absolute, but the business has legitimate exceptions to each.** The versions
below carry those exceptions. Rules that raise an unresolved contradiction are
flagged as **OPEN QUESTIONS** — the named audit must resolve them, not assume an
answer. Plain-English note after each says what it would mean if the rule is wrong.

1. **Every tenant table carries an `org_id`, and no tenant row is ever read or
   written without a resolved org.** The app filters every query by `org_id`, and
   a second wall (database Row-Level Security) blocks cross-org rows.
   *If wrong:* the auditor would flag safe code as a leak, or (worse) we'd trust
   isolation that isn't actually there — one customer could see another's data.

2. **The database is the source of truth for isolation, not just the app.** RLS
   (migration `0052`) only bites because each request drops to a non-privileged
   `app_runtime` database role inside a transaction. If a code path talks to the
   database *outside* that request pipeline (background workers, migrations, seeds,
   scripts), it runs as a superuser and RLS does **not** protect it — those paths
   must filter by `org_id` themselves.
   *If wrong:* we'd assume background jobs are automatically tenant-safe when they
   are not, and miss real cross-tenant leaks in sweeps and workflows.

3. **Money must balance, and it must never disappear at a floor.** Journal entries
   must have debits equal credits within 0.001 (`accounting.ts:282`). GST is
   CGST+SGST for intra-state and IGST for inter-state.
   **Net pay correction:** the code computes `netPay = max(0, gross − deductions)`,
   but that floor silently *discards* any recovery (salary advance, loan repayment)
   that exceeds one month's pay. That is wrong. The correct invariant: when
   deductions exceed gross, the shortfall must **carry forward to the next cycle**
   and remain visible in the employee's outstanding balance. Money must never vanish
   at the `max(0, …)` floor. **An unrecorded shortfall is a BLOCKER.**
   *If wrong:* the auditor would either miss real money corruption, or block correct
   code that legitimately rounds differently.

4. **The audit log is tamper-evident and must stay an unbroken chain.** Every audit
   row is hash-chained to the one before it (`seq`, `prevHash`, `entryHash`). Any
   change that lets a row be written outside the chain, or lets the chain head be
   read wrong, is a BLOCKER.
   *If wrong:* we'd treat the audit log as trustworthy evidence when it can be
   silently forged — a compliance and legal exposure.

5. **PII hashing vs. statutory output — OPEN QUESTION (do not assume an answer).**
   Personal identifiers appear to be stored as a peppered HMAC hash (`pii-hash.ts`,
   `PII_HASH_PEPPER`), and raw PII in a log or error message is a BLOCKER. **But**
   the platform must produce statutory outputs that print a *real, unmasked* PAN /
   Aadhaar — Form 16, TDS returns, PF/ESI filings, invoices. A one-way HMAC cannot
   be reversed to produce those. So exactly one of these must be true, and the audit
   must determine **which**:
   - (a) the raw value is *also* stored somewhere (and must be encrypted, not
     hashed), or
   - (b) those statutory outputs are currently broken, or
   - (c) those statutory outputs are unbuilt.
   The **payroll-tax** and **dpdp-privacy** audits must resolve this end to end and
   record the finding. Do not presume raw PII is absent, and do not presume it is
   present-and-safe.
   *If wrong:* we either miss encrypted raw PII that needs protecting, or miss that
   a whole class of statutory filings can't actually be produced.

6. **Endpoints declare their authorisation explicitly; the super-admin plane is
   LIVE, unfinished code — audit it.** Anything tenant-scoped uses
   `protectedProcedure` (or stricter `permissionProcedure`/`adminProcedure`);
   tenant-scoped work on `publicProcedure` (which skips auth, RBAC, audit, and RLS)
   is a BLOCKER. The cross-tenant super-admin surface (`macProcedure` /
   `MAC_ENABLED`) is **under active construction — treat it as in-scope, live,
   cross-tenant code, not dormant and not disabled.** Its cross-tenant reach makes
   any gap there high-impact; audit it accordingly.
   *If wrong:* the auditor skips an unfinished cross-tenant surface, or misjudges
   which endpoints are exposed.

7. **Distinguish UI pagination from data export on every list path.** The 200-row
   cap (`paginationShape`) is correct **only** for paged UI lists. It is **not**
   acceptable for exports, reports, statutory filings, or any total/aggregate —
   customers hold far more than 200 employees, invoices, and transactions. **Silent
   truncation on an export, report, filing, or aggregate path is a BLOCKER.** Every
   audit of a list path must state which kind of path it is and check the cap is
   applied to the UI kind and *absent* from the data kind.
   *If wrong:* a filing or report silently omits rows — wrong totals submitted to a
   regulator, or shown as truth to the customer.

8. **Tests run against a real Postgres and must self-isolate.** Each test seeds its
   own org and cleans up; there are no mocks for the DB. A test that pollutes shared
   state or depends on another test's data is a defect.
   *If wrong:* the auditor would misjudge test quality and flake risk.

9. **Secrets and integration credentials are envelope-encrypted via KMS** before
   storage (OAuth tokens, API keys, TOTP seeds). Storing an integration secret in
   plaintext is a BLOCKER.
   *If wrong:* we'd miss credential exposure or flag safe encrypted storage.

10. **Known open gaps in `docs/GAP_ANALYSIS.md` are accepted debt, not new
    findings** — the auditor should not re-report them as fresh discoveries (see
    "Known accepted debt" below). **Exception — GSTR-1 rate is NOT accepted debt.**
    The invoice UI offers 0/5/12/18/28% (18% default), so the real question is
    whether the rate chosen on an invoice actually flows into the GSTR-1 return, or
    whether GSTR-1 re-hardcodes 18% regardless. The **gst-invoicing** audit must
    trace a *non-18%* invoice end to end into the GSTR-1 output and report what it
    finds.
    *If wrong:* every audit re-surfaces known gaps as noise — or we wave off a real
    GSTR-1 rate bug as "known debt" when it was never confirmed.

---

## Severity definitions

| Severity | Meaning | Response |
|---|---|---|
| BLOCKER | Data loss, auth bypass, cross-tenant leak, silent corruption, tampered audit log, raw PII, or money moving incorrectly | Do not merge |
| HIGH | Incorrect behaviour under inputs a real user will produce | Fix before merge |
| MEDIUM | Correct today, fragile tomorrow; breaks on a plausible next change | Ticket it |
| LOW | Worth saying, no urgency | Optional |

## In scope for review

### Correctness
- Every external boundary (DB, network, queue, third-party portal: EPFO / NIC /
  MCA21 / ClearTax / Razorpay / KMS) has a defined behaviour for failure, timeout,
  and partial response.
- No swallowed errors. A caught exception is either handled, rethrown, or logged
  with enough context to act on. Never all three omitted.
- **A tenant row (any table with `org_id`) is never persisted without a resolved
  org id.** Handlers must not write with a null/absent `org_id`.
- **Journal entries balance to within 0.001; GST splits intra-state as CGST+SGST
  and inter-state as IGST.** Any edit on a money path must preserve these.
- **Wage recovery must never vanish at the net-pay floor.** `netPay = max(0, gross
  − deductions)` is only safe when deductions ≤ gross. When a recovery (advance /
  loan) exceeds gross, the shortfall must carry forward to the next cycle and stay
  visible in the employee's outstanding balance. A shortfall that is silently
  dropped at the `max(0, …)` floor is a BLOCKER.
- **Auto-numbered records (invoice / PO / ticket numbers) stay unique per org.**
  The org-scoped counter must not be bypassed in a way that can produce a duplicate.

### Security
- No credentials, tokens, or keys in source, logs, or error messages. Integration
  secrets are KMS envelope-encrypted at rest.
- **Raw Aadhaar / PAN must never land in a log or error message.** Storage is an
  OPEN QUESTION (see "Please confirm these" #5): a hashed identifier is safe, but
  statutory outputs (Form 16, TDS/PF/ESI returns, invoices) need a real unmasked
  value, which a one-way hash cannot yield. Where raw PII must exist to produce
  those outputs it must be *encrypted at rest*, never plaintext and never a bare
  hash that silently breaks the filing. The payroll-tax / dpdp-privacy audits
  resolve which case actually holds.
- Every endpoint states its authorisation requirement explicitly (`protectedProcedure`,
  `permissionProcedure(module, action)`, `adminProcedure`, or `macProcedure`). There
  is no "authenticated therefore authorised" shortcut. Anything tenant-scoped on
  `publicProcedure` is a finding.
- All user-supplied input crossing a trust boundary is validated at that boundary
  (Zod input schemas), not downstream. Request bodies pass prototype-pollution
  sanitisation before parsing.
- **Tenant isolation rule:** every query includes an `org_id` filter *and* the
  request runs through the `rlsTenant` pipeline. Any database access that runs
  outside that pipeline (workers, sweeps, Temporal activities, scripts, migrations)
  is a superuser connection that RLS does **not** protect, so it must carry its own
  explicit `org_id` scoping — call this out wherever it's missing.

### Data layer
- Queries are parameterised. No string-built SQL. (Note: `sql.raw("set local role
  app_runtime")` in `trpc.ts` is a fixed literal, not user input — that is fine.)
- Every write that touches more than one table is in a transaction.
- Migrations: the journal (`_journal.json`) must have a matching tag for every
  `.sql`. Drizzle diffs against its own snapshot, so a corrective migration must be
  hand-written when a prior one drifted. Hand-written migrations (e.g. `0052` RLS)
  must say why.
- **PII / retention:** personal identifiers stored hashed; DPDP erasure and
  retention paths must actually cascade the delete/anonymise, not just mark a flag.

### API contracts
- Response shape changes are additive, or versioned. (`trpc-web-parity` test guards
  the web↔api contract.)
- Error responses carry a stable machine-readable code (tRPC error `code`), not just
  a message. The error formatter attaches a `traceId` for correlation.
- Pagination: **UI list** endpoints accept and honour `limit`/`offset` (default 50,
  max 200). This cap must **not** apply to exports, reports, statutory filings, or
  any total/aggregate — those must return the complete set; silent truncation there
  is a BLOCKER. Every list-path audit must state which kind it is. Mutations declare
  an input schema (`mutations-require-input` test guards this).

### Tests
- Every failure branch identified above has a test that exercises it.
- Tests assert the requirement, not the implementation. A test that would still pass
  with the logic inverted is a finding.
- **Every fix must correct any test that asserted the buggy behaviour.** If a test
  currently passes *because* it encodes the defect (it "blesses the bug"), that test
  must be changed in the same pass as the fix — otherwise a green suite will silently
  restore the bug on the next change. A fix that leaves its blessing test in place is
  incomplete.
- Tests self-isolate: seed a fresh org per test/suite, clean up after. No dependence
  on another test's data or ordering (`fileParallelism: false`, shared DB).
- Money-path and tenant-isolation changes must have a test that would fail if the
  invariant were broken.
- Minimum coverage on changed lines: **80%** (matches the repo coverage-floor gate;
  correct if the gate says otherwise).

### Performance
- No N+1 query patterns on any path serving a list view.
- Queries have a hard timeout (8s prod). A handler that can run unbounded is a
  finding.
- Latency budget: **p95 under 500ms** for tenant-facing tRPC calls (the codebase
  emits a `SLOW_REQUEST` warning past 500ms — adopt that as the bar unless told
  otherwise).

## Explicitly out of scope

Do not report on these. Tooling owns them, or we have decided not to care:

- Formatting, import order, line length — Prettier/ESLint own these
- Naming preferences
- Comment density
- Speculative hardening with no demonstrated exploit path
- Suggestions to adopt a different library or framework
- The dormant MongoDB / `hybrid` / `mongo` provider paths — they are intentionally
  kept and no-op under the default `postgres` provider; do not report them as dead
  code (see `CLAUDE.md`).

## Known accepted debt

Things the reviewer will find and should NOT re-report. These are consciously
accepted and tracked in `docs/GAP_ANALYSIS.md`. Add to this list as risk is
accepted — it is the main lever for reducing repeat noise.

> **Register hygiene (verified 2026-07-31 against current source, see
> `reports/sweep-stale-debt.md`).** Seven entries that previously sat here —
> balance sheet, depreciation engine, gratuity/leave encashment+carry-forward,
> CRM lead scoring, CRM lead→deal conversion, SAM reconciliation, and
> SMS/notification delivery — have **shipped and are wired**; they were removed
> so the register stops telling reviewers to skip working features. Do NOT
> re-add them as debt; if they regress, file a fresh finding. One former entry
> (DPDP external notification) turned out to hide a **live defect** and has been
> escalated out of accepted debt — see the LIVE BLOCKER note below.

- **GSTR-1 rate** — NOT accepted debt. The invoice UI offers 0/5/12/18/28%; whether
  the chosen rate flows into the GSTR-1 return, or GSTR-1 re-hardcodes 18%, is an
  open question the gst-invoicing audit must trace end to end (see #10 above).
  (Verified 2026-07-31: `accounting.ts:744-797` groups by real per-line rate and
  falls back to a header-derived effective rate — no 18% hardcode. Note the
  per-line path reads `invoiceLineItems`, which has no production write path, so
  real invoices take the header fallback.)

### LIVE — NOT accepted debt (do not skip)

- **DPDP external notification — LIVE BLOCKER, misrouted statutory notices.**
  This was previously listed as accepted debt ("sweeps log artifacts, outbound
  delivery not wired"). That is now **false and dangerous**: delivery *is* wired
  (`notification-dispatcher.ts:131` binds `EmailDispatcher`, which really sends
  via `sendTransactionalEmail → transporter.sendMail`). But the two **statutory**
  recipients are hardcoded to **internal mailboxes** —
  `data_protection_board → dpb-india@coheronconnect.coheron.com` and
  `affected_principals → privacy@coheronconnect.coheron.com`
  (`notification-dispatcher.ts:92-100`) — and the artifact is then stamped
  `status: "sent"` (`:108-112`). The breach sweep raises both notices on the
  statutory clock (`dpdp-sweeps.ts:163-189`), and the sweep file header still
  wrongly claims "only logs an artifact" (`dpdp-sweeps.ts:10-11`). Net effect:
  a DPDP breach notice to the Data Protection Board and to affected principals
  is **recorded as delivered while going to internal inboxes** — fabricated proof
  of statutory notice. Treat as a **BLOCKER**, audit it, do not wave off as
  known debt. (Tracked in `GAP_ANALYSIS.md` as an open gap, not shipped.)
