# QA WALK 2 — HANDOFF (start the new chat by reading this)

**Purpose:** full-platform QA on **localhost** at SHA `5c5490d`. Provisioning is DONE — do not redo it.
**Nothing is committed. This file holds local throwaway tokens — DO NOT COMMIT it.**

---

## ⛔ GROUND RULES — NON-NEGOTIABLE. Read before every action. Do not drift.

1. **THE BROWSER IS THE TEST. A SCREENSHOT IS THE EVIDENCE.** Every route is loaded in the browser, every
   control is *clicked* in the browser, and each is captured with a **screenshot**. **A finding with no
   screenshot does not exist.** If you did not click it and screenshot it, it is "not tested".

2. **`curl` / HTTP tRPC / `psql` / SQL / API callers are FORBIDDEN as a test path.** They are permitted for
   **exactly two things**: (a) the one-time **bulk provisioning that is already finished**, and (b) a
   **secondary confirmation** of a number you have ALREADY shown in a screenshot (verified-by-query *beside*
   verified-by-looking — never instead of it). **You may never establish a result via API/SQL because
   clicking is slow, tedious, or repetitive.** That exact shortcut is what invalidated the last run.

3. **DRIFT CHECK — run it in your head before every tool call:** *"Am I about to test, trigger, or verify
   something through curl/HTTP/SQL instead of clicking it in the browser?"* If yes → **STOP, open the
   browser, click it, screenshot it.** No exceptions for payroll steps, approvals, negative inputs, or
   isolation checks.

4. **The two proofs are shown ON A RENDERED PAYSLIP IN THE BROWSER** — screenshot the HRA-exemption and TDS
   rupee figures on screen (and the PDF). Do **not** compute them via the API or the payroll-math lib.

5. **Every payroll pipeline step is a BUTTON CLICK in the UI** as the correct logged-in role — lock, each
   compute step, HR/Finance/CFO approve, statutory generate — each screenshotted. Not a POST to `/trpc`.

6. **Watch the network tab on every click** (to catch inert buttons like COA "Add Account"), but the
   **click + screenshot is the test**; the network read is only how you explain *why* it failed.

7. **If a control/route/feature cannot be reached or done in the UI, that IS the finding** (record it as a
   reachability defect with a screenshot of where the trail ends). Never fall back to the API to "make it
   pass" — that hides the exact defect this QA exists to find.

8. **Coverage is the deliverable.** Enumerate first (routes/procedures/controls), then **every enumerated
   item gets a verdict** — works / broken / "not tested + reason". Report **coverage numbers** (X of Y
   routes clicked, etc.) in every audit file. Silent skipping is not allowed.

9. **Screenshot cadence:** at minimum one screenshot per route on load, one per meaningful control action
   (before/after where state changes), and one of every error/toast/empty-state. Name them per route so the audit can cite them.

> If you find yourself reaching for `curl`/`psql` to "just check", that is the drift. The last run failed
> this rule. The browser, or it did not happen.

---

## Environment (already up)
- HEAD = `5c5490d` (matches deployed). Dev stack RUNNING: web `http://localhost:3000`, api `http://localhost:3001`.
- api tRPC: `http://localhost:3001/trpc/<proc>` — **plain JSON, NO transformer**. Mutation = POST raw input JSON; query = GET `?input=<json>`. Response `{"result":{"data":...}}`.
- Dev DB: `postgresql://coheronconnect:coheronconnect@localhost:5434/coheronconnect`. At migration head `0081` (llpin present).
- **Browser login (NO password form — the app itself does exactly this):** the `coheronconnect_session` cookie is **NOT httpOnly** (`apps/web/src/app/login/page.tsx:45-47` sets it via `document.cookie` + `localStorage`; web middleware reads `request.cookies.get("coheronconnect_session")`). To log the browser in as any role: open `http://localhost:3000`, then run JS:
  ```js
  localStorage.setItem("coheronconnect_session","<TOKEN>");
  document.cookie="coheronconnect_session=<TOKEN>; path=/; SameSite=Lax";
  ```
  then navigate to `http://localhost:3000/app/command`. Use the **bootstrap admin token** you mint in Part 0, and later the role users you create in Part 0, swapping `<TOKEN>` to walk as HR / Finance / CFO / plain-employee / org-B. (The api also accepts `authorization: Bearer <token>` — but that's for the allowed *secondary confirmation* only, never as the test; see rule 2.)

## PART 0 — BUILD A FRESH TENANT & 100 EMPLOYEES **IN THE BROWSER** (the prior API seed is VOID)

The earlier API/SQL-seeded orgs have been **DELETED** — they bypassed the UI, so they don't count. Build it
fresh **in the browser, with screenshots**, because tenant onboarding + structure + employee creation are
*themselves* the tests (mandate Parts 1–2). **Do NOT re-seed 100 employees by API/SQL** — see rule 2.

**The ONLY allowed non-browser bootstrap** (a real signup form = account creation, out of scope to automate):
seed exactly **ONE fresh org + ONE admin user + one admin session** so the browser can log in. Write a tiny
`tsx` script (pattern: `insert organizations{name,slug,plan} → insert users{orgId,email,role:'admin',
matrixRole:'admin',passwordHash:bcrypt('Walk2QA!Pass123'),status:'active'} → insert sessions{id:sha256(token),
userId,expiresAt}`; run from `apps/api` with its `./node_modules/.bin/tsx` and `DATABASE_URL`=dev; print the
raw token). Log the browser in with that token via the JS recipe above. **Everything below is browser-driven,
screenshotted:**

1. **Onboarding wizard from step 1 → complete.** Org basics → India compliance (entity = **Private Limited** →
   confirm CIN asked; also confirm leaving GSTIN/CIN/EPF blank still completes) → **statutory identity**
   (PF rate / ESI number / PT registration) → finish. Screenshot each step + what blocks.
2. **Salary structures** via the UI: one from a **starter template**, one **from scratch**. Bands chosen so
   gross > ₹21,000/mo (→ no ESI members).
3. **Role users** (HR, Finance, CFO, plain employee, + a **2nd org** with its admin) — create via the
   **Admin / user-management UI** so RBAC + approval-chain + tenant-isolation tests have distinct logins.
   If the UI can't set matrixRole/password directly, **record that as a finding** and minimal-seed those users
   as a flagged bootstrap exception (they need distinct HR / finance / finance-for-CFO roles for SoD).
4. **Employees — BOTH creation paths, in the UI:**
   - **~8 via the "Add employee" FORM** (tests the form + its negative validations). Must include the
     **proof controls**: an old-regime **Karnataka/Bengaluru** employee (→40% HRA), an old-regime
     **Delhi/New Delhi** employee (→50% HRA) on the **same band**, a **new-regime** control, and a
     **mid-month joiner** (start on the 15th).
   - **the remaining ~92 via the "Import CSV" bulk-import UI** (generate a CSV, upload it with the browser
     **file-upload** tool — this tests the importer at scale AND reaches 100). Screenshot the import result +
     any skipped-row report.
5. **Tax declarations** for the old-regime employees via the **Tax declarations tab** UI (80C ₹1,50,000) —
   confirm the new-regime warning + `provenance=provisional`.
6. **Rent for old-regime** (needed for a non-zero HRA exemption): look for a rent field in the employee/
   declaration UI. **If none exists, that is itself a finding** — record it; only then may you set
   `rent_paid_annual` via a *flagged secondary DB write* solely to unblock the HRA proof (note it explicitly).
7. Mark **one leaver** via the offboarding / status UI.

**TARGET composition:** 100 employees, ~25 old / ~75 new regime, spread across KA / Delhi / TN / Kerala, all
structure-linked, all >₹21k/mo gross. Old-regime: 80C + rent. One leaver, one mid-month joiner. **Proof pair —
same band, old-regime, rent+80C: a Karnataka one (→40% HRA) and a Delhi one (→50% HRA).**

## PART 5 (do FIRST after Part 0) — the two proofs, ON A LIVE PAYSLIP IN THE BROWSER
a. **80C reduces TDS** (~₹2,500/mo at the 20% slab). Show the old-regime employee's TDS on the rendered
   payslip; toggle their declaration (provisional↔lapsed) in the UI and re-run to show TDS move. Screenshot both.
b. **HRA metro: Karnataka 40% vs Delhi 50%.** Show both exemption figures on the two payslips. Screenshot both.

**Run the WHOLE cycle by CLICKING each step in the UI as the right role** (never POST to `/trpc`): create run →
lock period → each compute step → **HR approve (as HR) → Finance approve (as Finance) → CFO approve (as CFO)**
→ statutory generate → open + **download the payslip PDF**. Screenshot every step. (Reference only — what each
button does: `payroll.runs.create{month,year}`, `lockPeriod/advanceComputationStep/computePayslips/
generateStatutory{runId}`, `approve{runId,step,decision}`; HR needs hr.write, FINANCE/CFO need financial.write,
SoD ⇒ 3 distinct approvers.)

## Part 1 enumeration (may be in scratchpad of the OLD session — re-run if absent)
3 agents were writing route/procedure inventories to the old session scratchpad (`inv-routes.md`, `inv-procs-1.md`, `inv-procs-2.md`). If not found, re-enumerate: 130 web `page.tsx` routes under `apps/web/src/app`; 57 tRPC routers under `apps/api/src/routers` (procedures + `permissionProcedure("mod","action")`/`protectedProcedure`/`publicProcedure`). Root mount in `apps/api/src/routers/index.ts`. QA Release Kit CT-CNC-QA-001 is **NOT in the repo** — build a feature reachability list instead.

## Known from walk 1 (deployed) — don't re-discover, verify on fresh tenant
- COA "Add Account" INERT (no modal/request/console error) — `accounting.ts:159` backend exists → front-end wiring. Check EVERY accounting create button.
- PO approve 404: dashboard calls `procurement.purchaseRequests.approve` with a PO id. Establish whether a REQUISITION approves correctly.
- Invoice↔PO 3-way match NOT built in UI.
- Format bugs: `₹160000K`, `₹$1L`, COA chips `LIABILITYS/EQUITYS/INCOMES`, truncated vendor ids in invoice list, `₹0.1Cr`, structures list "Annual CTC" vs editor "Base Pay".
- Statutory artefacts: completed run showed "No TDS challans/No ECR" + raw `hr.payroll.generateECR` with no button — establish records-exist-but-unreachable vs never-created.
- Walk 1 audit: `docs/audits/deployed-walk_full-cycle_2026-08-12_run-201250.md` (LOCKED). fix-plan summary already added.

## State so far / cleanup
- The prior API-seeded WALK2 orgs are **already deleted**; temp scripts `apps/api/qa-seed-accounts.mts` /
  `qa-provision.mts` are **already removed**. Dev DB is back to its 3 original orgs — a clean slate.
- The tenant you build in Part 0 is **disposable dev data** (drop its org by id when the QA is done). It is
  **NOT** the removed coheron-demo company — do not reintroduce that.
- Any bootstrap/seed script you write: delete it when done, and **do not commit** it or this handoff (local tokens).

## Output required (per the mandate)
Multiple dated `docs/audits/` files (coverage inventories · payroll+statutory · procurement+accounting · authz+isolation · modules · negative-testing · QA reachability). Each: live SHA · coverage numbers · per-finding file:line or "cause unestablished" · looking-vs-query · state created · not-tested+reason. Then `reports/fix-plan.md` summary + severity-ordered pre-25-Aug fix list. Nothing committed.
