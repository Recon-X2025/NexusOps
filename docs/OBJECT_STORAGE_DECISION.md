# Object Storage — Decision Brief (report only)

_Prepared for an owner decision. Nothing was provisioned; no credentials were added. This is the
number, not a patch._

## Bottom line

The storage **code is already written** against an S3-compatible client
(`apps/api/src/services/storage.ts`, `@aws-sdk/client-s3` — works with AWS S3, Cloudflare R2,
MinIO, DigitalOcean Spaces, **and Vultr Object Storage**). Turning it on is **configuration, not
building**: provision a Vultr Object Storage bucket, set five secrets, pass them into the api
container, redeploy. **No code change.** Estimated **~0.5 day** of wiring plus the owner-only step
of provisioning the bucket/credentials. Because Vultr Object Storage is a **managed** S3 service,
**no compose service is needed** — the orphaned MinIO container in `docker-compose.prod.yml`
(referenced by nothing, line 132) is a red herring and should not be copied into the live compose.

## 1. The six paths and how each behaves today (unconfigured storage)

The live stack (`docker-compose.vultr-test.yml`) defines no storage service and no `S3_BUCKET`, so
`bucket()` throws `"S3_BUCKET not configured"` and any real upload rejects.

| Path | Real S3 upload? | Behaviour on the live stack | First-cycle? |
|------|-----------------|------------------------------|--------------|
| **DMS document upload** (`documents.upload`) | Yes (`putObject`) | Mutation **rejects** → honest "Upload failed" toast. **But** the mutation is **not transactional**: the `documents` row is inserted *before* `putObject` (`documents.ts:115` then `:136`), so a **dangling stub row** (empty storage key) is left and then shows in the documents list as an entry that cannot be downloaded. | No |
| **Procurement PO document** (`orders/[id]` Documents tab) | Yes — **same `documents.upload` mutation** | **Same as DMS**: honest error toast (`onError`, `orders/[id]/page.tsx:241`) + the same dangling stub row. **The "may fake success — worst case" suspicion is REFUTED** — it surfaces an error, it does not silently succeed. The only residual is the shared stub-row issue. | Procurement is first-cycle, but attaching a PO document is **not** blocking. |
| **Form 16** (`payroll.ts:1516`) | Yes (`putObject`) | Mutation rejects → honest error. | **No** — Form 16 is issued after the financial year ends. |
| **Avatar** (`auth.ts:651`) | Yes (`putObject`) | Mutation rejects → honest error; no stub (the user row is updated *after* `putObject`). | No |
| **E-sign key** (`esign.ts:167`) | **No** — v1 passes a `storageKey` **through**; it does not upload bytes. | No real store attempted; a reference is threaded. Not a fake success, a v1 stub. | No |
| **Offboarding attachments** (separation / clearance / security) | **No** — these are **text columns**, not file uploads (`offboardingDetails.separationDocs` etc.; the HR form fields are plain text inputs). | You can record a text note; there is **no file** to store. | **Yes** (leavers are day-one confirmed) — but see below. |

**Key correction to the premise:** of the "six paths", only **four** are actual S3 file uploads
(DMS, PO document, Form 16, avatar). The e-sign path is a pass-through stub, and the offboarding
"attachments" are **text fields, not files** — they never needed object storage. So the real
question is narrower than "six broken uploads."

**None fakes success.** The worst residual is the shared **dangling-stub-row** on the two
`documents.upload` callers (DMS + PO document): the user is told it failed, but a non-downloadable
row appears in the list. That is a small, separate bug (wrap the insert + `putObject` in a
transaction, or insert only after the put) — fixable independently of provisioning storage.

## 2. What wiring storage actually requires

Because the client is already written and env-driven, the work is:

1. **Provision** a Vultr Object Storage bucket (owner, Vultr console — minutes). *Owner-only; Claude
   cannot do this.*
2. **Secrets** (5): `S3_ENDPOINT` (the Vultr OS endpoint), `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
   `S3_BUCKET`, `S3_REGION`. Add to GitHub Actions secrets. *Owner-only.*
3. **Pass-through**: add those env vars to the `api` service in `docker-compose.vultr-test.yml` and
   to the deploy script's env. *~0.5 day, code/config — Claude can do this once the secret names
   are agreed.*
4. **Smoke test**: one upload + download round-trip on the deployed stack.

No new table, no migration, no library, no compose service. The `S3_FORCE_PATH_STYLE` default
already turns on automatically when a custom endpoint is set (`storage.ts:29`), which Vultr OS
needs.

## 3. Honest size, and what gives in twelve days

**~0.5 day of engineering** (step 3) plus the owner steps (1–2, minutes). Nothing substantial has
to give — this does not compete with a build. The only true dependency is **owner-provided
credentials**; without them nothing can be turned on, and Claude must not create them.

If the stub-row cleanup is done at the same time, add ~1–2 hours to make `documents.upload`
transactional.

## 4. Which of the six are genuinely first-cycle

- **Form 16** — after year-end. **Not first-cycle.**
- **DMS / avatar / PO document / e-sign** — convenience; **not first-cycle-blocking**.
- **Offboarding separation / clearance** — needed whenever someone exits, and leavers are day-one
  confirmed, so this is the only first-cycle-relevant one. **But** these are **text fields today**,
  so the first cycle can record a *note* without storage; only if you need to attach the actual
  scanned form does storage become necessary — and that also needs a file-upload control that does
  not exist yet (a small build, not just config).

**Recommendation.** Storage is **not** a first-cycle blocker for payroll. If the owner wants file
attachments for exits, the cheapest path is: provision the Vultr bucket + secrets (owner),
Claude wires the env pass-through (~0.5 day) and fixes the stub-row transaction, and a small
file-upload control is added to the offboarding form in a later unit. Until then, the manual set
(`docs/MANUAL_SET.md`) already tells customers these files live in their own storage.
