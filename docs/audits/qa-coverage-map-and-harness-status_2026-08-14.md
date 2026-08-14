# QA — Coverage Map & Harness Status (2026-08-14)

_Verified-by-query against the codebase at live SHA `f487ee8`. This is the useful, durable output of the
full-platform QA pass. **The Playwright run results are deliberately NOT recorded** — the harness was
broken (§2), so any pass rate from it is meaningless and must not be quoted._

---

## 1. Coverage inventory (the map)

### Web routes — 130 pages (+4 API handlers)

`find apps/web/src/app -name page.tsx` → **130 routable pages** (the register's "83" undercounted by ~57).
Plus **4** `route.ts` API handlers (`/api/health`, `/api/payroll/form16`, `/api/payroll/payslip-pdf/[id]`,
`/api/trpc/[...path]`). **23 are dynamic** (`[id]`/`[token]`). No Next.js route groups, so every directory
maps 1:1 to a URL.

By section: Public/Auth 6 · Portal/Survey 6 · App core 11 · HR/People 14 · Finance/Procurement 18 ·
CRM/CSM 6 · ITSM/ServiceDesk 19 · CMDB/Assets/DevOps 7 · Field/Facilities 6 · Security/GRC/Legal 11 ·
Strategy/Projects 4 · Admin/Settings/Workflows 10 · Workbench (persona pages) 12.

Known dead routes (F15): **`/app/devops`, `/app/developer-ops`** → "Something went wrong". One console-warning
route (F14): `/app/profile` (React duplicate-key).

### tRPC procedures — 894 total (500 mutations, 394 queries)

Across **56 top-level namespaces** (`routers/index.ts`) over 57 files. Builder tally = the auth requirement:

| Builder | Meaning | Count |
|---|---|---|
| `permissionProcedure(mod,act)` | specific module/action permission | **763** |
| `protectedProcedure` | any authenticated user | **51** |
| `adminProcedure` | org admin only | **50** |
| `macProcedure` | platform super-admin | **20** |
| `publicProcedure` | unauthenticated | **8** |
| `anyPermissionProcedure` | any one of several | **2** |

Per-namespace counts (checklist denominators): accounting 27 · admin 29 · agent 4 · ai 6 · apm 5 ·
approvals 5 · assets 30 · assignmentRules 6 · auth 23 · catalog 12 · changes 24 · commandCenter 3 ·
compliance 26 · contracts 9 · crm 69 · csm 8 · customFields 6 · dashboard 3 · depreciation 6 · devops 7 ·
documents 8 · esign 4 · events 12 · expenseReports 10 · facilities 14 · financial 36 · gratuity 6 · grc 21 ·
hr 78 · indiaCompliance 27 · ingest 8 · integrations 18 · inventory 15 · knowledge 8 · leaveAccrual 9 ·
legal 25 · mac 21 · notifications 7 · onboarding 5 · oncall 8 · payroll 23 · performance 13 · procurement 24 ·
projects 17 · recruitment 20 · reports 8 · search 1 · secretarial 30 · security 26 · settlement 3 ·
surveys 9 · teams 7 · tickets 19 · vendors 6 · workOrders 11 · workbench 12 · workflows 11 · workforce 6.

**Authz caveat — read handler bodies, not builders.** A `protectedProcedure` is not automatically a hole:
- `payroll.runs.approve` (protectedProcedure) is **SAFE** — the permission check (`hr/write` or
  `financial/write`, per the `step` input) + SoD is in the handler body (`payroll.ts:728-761`).
- `onboarding.updateStatutoryIdentity` (protectedProcedure) is **UNGATED** — no in-body check; any
  authenticated org member can write the org's PF rate / EPF code (`onboarding.ts:379-418`). Org-scoped
  (no cross-tenant leak), but PF rate is money. See `STATUTORY-IDENTITY-UNGATED` in `reports/fix-plan.md`.

The 8 public procedures are the expected pre-auth surface only (`auth.signup/login/verifyMfa/
requestPasswordReset/resetPassword/acceptInvite`, `mac.login`) — no unexpected public write.

---

## 2. `tests/full-qa` has NEVER run — do not trust its output

**There are 699 Playwright tests across 12 spec files in `tests/full-qa/`. They have never executed
meaningfully.** Anyone who finds them and assumes the platform is covered would be wrong. The harness
carries **five self-inflicted faults** that must be repaired before any number it produces means anything:

1. **Duplicate route** in the shared `ALL_ROUTES` (`helpers.ts` — `/app/knowledge` twice) → Playwright
   duplicate-test-title **collection error aborts the entire suite** before a single test runs.
2. **`global-setup.ts` login hydration race** — it clicks submit before React hydrates, so login does a
   native GET and never reaches `/app` (this is also the `LOGIN-PASSWORD-IN-URL` product defect).
3. **`apiCall` tRPC GET encoding does not match tRPC v11** → **every** module-list assertion fails
   uniformly across ~55 modules (modules that render fine live and are green in the API vitest suite).
4. **The session token is not attached** to direct API mutation calls → false "Not authenticated" failures.
5. **Empty-seed-data assumptions** on modules the base seed does not populate.

**Consequence: every green CI run has been green without these tests contributing anything** — the same
class as `.turbo` making "cold lint" warm: a check that appeared to exist and did not. Repairing the
harness (faults 1–5) is its own unit; **only after that, and a checkpoint, can the 699 tests underneath be
judged any good.** Endpoint-level coverage today is served by the **API vitest suite (1646 tests, green)**,
not by this suite.
