# Sweep — Hardcoded External / Tenant-Specific Constants

**Type:** Sweep, not an audit. No code changes were made.
**Question:** Which hardcoded constants represent something external or
tenant-specific (emails, phones, URLs, endpoints, GSTINs/PANs, bank/IFSC,
regulator contacts, state codes, statutory rates, thresholds)? For each,
classify as **(a)** legitimately global and correct, **(b)** an invented
placeholder filling a required slot, or **(c)** something that should be
per-tenant configuration.

## Plain-English summary

Most of what turned up is fine: statutory tax/payroll rates and GST state codes
belong in code (they're the same for every tenant, set by law), and format
regexes are global. Three things stand out:

1. **Two invented email addresses** (the ones you already knew) are the delivery
   targets for India's data-protection breach and privacy notices. If a real
   breach happens, the legally-required emails go to mailboxes that don't exist —
   silently. This is the most dangerous item because it's a compliance
   obligation that will appear to work and actually fail.

2. **Five invented government-portal domains.** The EPFO, ESIC, professional-tax,
   MCA21 and e-way-bill integrations point at hostnames like
   `gsp.epfo-suvidha.in` that are not the real regulator/GSP endpoints. They *are*
   overridable per-tenant (good), but the built-in defaults are fabricated, so any
   tenant who doesn't override them files into the void.

3. **The known GST 18% default.** Confirmed. It's a fallback rate applied when an
   invoice line omits its own rate — correct GST is per-HSN, so a blanket 18%
   silently mis-taxes anything that isn't an 18% item.

The one thing to fix first: the **DPDP notification addresses** — a legally
mandated breach notice that goes nowhere is worse than one that errors loudly.

---

## (b) Invented placeholders — filling a required slot with a fake value

### Data-protection notification addresses — **the known instances, confirmed**

`apps/api/src/lib/notification-dispatcher.ts:95-99` — hardcoded, **not**
env-driven (verified: literal assignment inside an `if` on `input.audience`):

```
95:  emailAddress = "privacy@coheronconnect.coheron.com";        // privacy_officer
97:  emailAddress = "dpb-india@coheronconnect.coheron.com";      // data_protection_board
99:  emailAddress = "privacy@coheronconnect.coheron.com";        // affected_principals
```

These are the delivery targets for DPDP breach / privacy artifacts. The mailboxes
do not exist. `sendTransactionalEmail` is called against them (line 106); on
success the artifact is marked `sent` (line 109) — so a bounce or a black-holed
address still records as "sent". **Classification: (b)** invented placeholder;
and the board/officer targets arguably should be **(c)** per-tenant config (each
tenant's own DPO address, and the correct regulator address, not the vendor's).

### Government-portal / GSP base URLs — fabricated domains

Each integration adapter has `SANDBOX_BASE` / `PROD_BASE` constants. They *are*
overridable (`config.baseUrl ?? (environment === "production" ? PROD_BASE : SANDBOX_BASE)`,
verified at `mca21.ts:69`), but the baked-in domains are not real GSP/regulator
hosts:

| file:line | value | represents |
|---|---|---|
| services/integrations/epfo-ecr.ts:49-50 | `https://gsp-sandbox.epfo-suvidha.in` / `https://gsp.epfo-suvidha.in` | EPFO ECR filing |
| services/integrations/esic-return.ts:44-45 | `https://gsp-sandbox.esic-suvidha.in` / `https://gsp.esic-suvidha.in` | ESIC returns |
| services/integrations/pt-challan.ts:45-46 | `https://gsp-sandbox.pt-suvidha.in` / `https://gsp.pt-suvidha.in` | Professional-tax challan |
| services/integrations/mca21.ts:47-48 | `https://gateway-sandbox.mca21-suvidha.in` / `https://gateway.mca21-suvidha.in` | MCA21 e-form filing |
| services/integrations/nic-ewaybill.ts:88-89 | `https://gsp-sandbox.nic-ewaybill.in` / `https://gsp.nic-ewaybill.in` | NIC e-way bill |

The `*-suvidha.in` / `nic-ewaybill.in` domains do not correspond to the actual
EPFO/ESIC/MCA/NIC or a named GSP. **Classification: (b)** invented placeholder
default. Because they're per-tenant overridable, the *right* long-term shape is
**(c)** — ship no default (force explicit config) rather than a fake one.

Contrast — the ClearTax and third-party endpoints below are **real** vendor
domains, so they are **(a)**: `cleartax-gst.ts:54-55` (`einv-api.cleartax.in`),
`emudhra.ts:28-29` (`emsigner.emudhra.com`), `razorpay.ts:36`
(`api.razorpay.com`), `whatsapp-aisensy.ts:28`, `sms-msg91.ts:32/40`,
Google/Microsoft/Slack OAuth+API hosts. These are the correct fixed endpoints for
those SaaS products.

### Placeholder HSN code on synthetic invoice lines

`apps/api/src/workflows/irnGenerationWorkflow.ts:119, 130` — `hsnCode: li.hsnSacCode ?? "9983"`
and a bare `"9983"` for the synthetic fallback line. `9983` ("Other professional
services") is a catch-all stand-in when the real HSN/SAC is absent. Filing an IRN
with a wrong HSN is a compliance defect. **Classification: (b)** placeholder (a
missing HSN should fail, not default).

### From/sender email default

`apps/api/src/services/notifications.ts:49` — `process.env["SMTP_FROM"] ?? "CoheronConnect <noreply@coheronconnect.coheron.com>"`.
`apps/api/src/routers/admin.ts:606` — env fallback `"noreply@coheronconnect.io"`.
These are env-overridable defaults, but the fallback address is on a domain that
may not exist / may not be a verified sender. **Classification: borderline (b)** —
a default sender is reasonable, but the two files disagree on the domain
(`coheronconnect.coheron.com` vs `coheronconnect.io`), which is a smell.

### CORS allow-list host

`apps/api/src/index.ts:229` — `"https://coheronconnect-super-fwyz.bolt.host"`
plus `/\.bolt\.host$/` (230) and `bolt.new` (233-234). A specific Bolt.io preview
host baked into the production CORS allow-list. **Classification: (b)** —
scaffolding placeholder that leaks a dev/preview origin into prod config;
should be **(c)** env-driven allowed-origins.

---

## (c) Should be per-tenant / per-jurisdiction configuration

These have a partial config path already, but fall back to hardcoded values.

### GST default rate — **the known "GSTR-1 18% hardcode", confirmed**

18% is used as the fallback rate wherever a line's own rate is missing:

| file:line | form |
|---|---|
| routers/financial.ts:54 | `GST_RATE_INPUT … .default(18)` (verified) |
| routers/ingest.ts:101 | `.default(18)` on import gstRate |
| workflows/irnGenerationWorkflow.ts:123 | `Number(li.gstRate ?? 18)` |
| workflows/irnGenerationWorkflow.ts:143 | synthetic-line fallback `: 18` (though 134-142 *derive* the rate from tax amounts when taxableValue>0) |
| packages/db/schema/procurement.ts:166,227,378 | column default `"18"` on PR/PO/invoice line gstRate |
| apps/web/.../financial/page.tsx:121,122,135,144 | UI form initial `gstRate: "18"` |

Correct GST is per-HSN/SAC and per-item, not a flat 18%. **Classification: (c)** —
rate should resolve from the item's HSN, not a global default. The IRN synthetic
branch already shows the right instinct (deriving the effective rate); the input
defaults don't.

### Professional Tax, LWF, and bonus ceiling — hardcoded defaults with a DB override

`packages/payroll-math/src/statutory-deductions.ts` holds per-state PT slabs
(lines ~161-220), LWF rates (~259-266) and the bonus eligibility ceiling
(`BONUS_ELIGIBILITY_WAGE_CEILING` ~400). These **do** accept runtime overrides
from the `statutory_ceilings` DB table via
`apps/api/src/lib/india/statutory-ceilings.ts`, and the bonus ceiling is
seed-activated. So the mechanism for **(c)** exists and is wired — but only PT/LWF/
bonus are externalised. **Classification: (c)-partial** — correct pattern, not yet
applied to the rates below.

### Income-tax slabs, EPF/ESI rates & ceilings — hardcoded, no override path

- `packages/payroll-math/src/tax-engine.ts` — old/new regime slabs (86-101),
  87A rebate (299-304), surcharge bands (115-118), 4% cess (318), standard
  deduction (255/258), 80C/80D/80CCD/80TTA/24(b) caps (261-274).
- `packages/payroll-math/src/statutory-deductions.ts` — PF ceiling ₹15,000 (96),
  12% / 3.67% / 8.33% / 0.50% (97-101); ESI ceiling ₹21,000 (137), 0.75% / 3.25%
  (138-139).
- `packages/payroll-math/src/gratuity.ts` — ₹20,00,000 cap (26), 5-yr min (29),
  15/26 formula (32-33).
- `packages/payroll-math/src/gst-engine.ts` — e-invoice ₹5 Cr threshold (195),
  e-way-bill ₹50,000 threshold (203).

These are statutory numbers set by law and equal for every tenant, so as *values*
they are correct. But because they change over time (Finance Act each year, Labour
Codes 2025), they are **(a)-now / (c)-eventually**: correct today, but the same
`statutory_ceilings`-style config the PT/LWF/bonus path already uses should back
them so an Apr-2026 rate change doesn't require a code deploy. Not a current
defect; a durability concern.

---

## (a) Legitimately global and correct — no action

- **Format-validation regexes** (these describe the *shape* of an ID, which is
  fixed by the issuing authority, and hold no tenant value):
  GSTIN `onboarding.ts:30`, `accounting.ts:678`, `cleartax-gst.ts:66`;
  PAN `onboarding.ts:31`; CIN `onboarding.ts:32`, `mca21.ts:51`;
  TAN `onboarding.ts:33`; IFSC `india/bank-file-generator.ts:59`.
- **GST state-code lookup table** — `packages/payroll-math/src/validators.ts:84-99`
  (28+ codes). These are the statutory GSTIN state codes; global and correct.
- **Real third-party SaaS/vendor endpoints** — ClearTax, eMudhra, Razorpay,
  MSG91, Aisensy, Google, Microsoft, Slack, Stripe (see the (b) section's
  contrast note for file:lines). Fixed by the vendor; correct as constants.
- **UI placeholder examples** shown in empty form fields (not assigned values):
  GSTIN `integrations.ts:176` (`29ABCDE1234F1Z5`), PAN
  onboarding-wizard/secretarial pages, email placeholders like `admin@yourco.com`,
  `jane@acme.com`. These are display hints only.
- **Per-org derived identifiers** (not hardcoded — generated from the org id):
  `orgEpfoId = EPFO_${org.id.slice(0,8)}` at `hr.ts:1579`,
  `india-compliance.ts:726`. Correct multi-tenant pattern.
- **`localhost` / `127.0.0.1` dev fallbacks** behind env vars (OIDC/SAML/tRPC/
  Meilisearch/reset+invite URLs, ~30 sites). Dev defaults, env-overridden in prod.
- **Bank-file generator** — fully parameterised; account no / IFSC / bank name are
  inputs from employee records, nothing hardcoded (`india/bank-file-generator.ts`).

---

## What's genuinely dangerous vs. merely worth noting

- **Dangerous now:** the DPDP notification addresses (b) — a mandated breach
  notice that silently goes to a non-existent mailbox and records as `sent`. Fix
  first.
- **Dangerous when used:** the five fabricated GSP portal domains (b) — any
  tenant relying on the default files nowhere; the CI/challan/return simply never
  reaches a regulator.
- **Correctness bug:** GST 18% default (c) — mis-taxes non-18% items on any line
  that omits its rate.
- **Cosmetic / durability:** the SMTP-from domain mismatch, the Bolt.host CORS
  entry, and the hardcoded-but-currently-correct statutory rates (a/c-eventually).

## Method / scope note

Recon was done with Grep across `apps/api`, `apps/web`, `apps/worker`, `apps/mac`,
`apps/mobile`, and `packages/*`; test files (`*.test.ts`, `e2e/`), docs and
`reports/` were excluded from findings (test GSTINs/phones like `27AAAAA0000A1Z5`,
`+919876543210` are test fixtures, not shipped constants). Every item in the (b)
section and the GST-18% / GSP-URL classifications was confirmed by direct source
read (`notification-dispatcher.ts:95-99`, `epfo-ecr.ts:49-50`, `mca21.ts:47-69`,
`cleartax-gst.ts:54-55`, `notifications.ts:49`, `irnGenerationWorkflow.ts:115-145`,
`financial.ts:51-54`). No code was changed.
