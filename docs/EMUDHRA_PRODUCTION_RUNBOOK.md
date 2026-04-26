# eMudhra production credentialing & design-partner dry-run

**Audience:** ops + first design-partner customer
**Owner:** product / integrations lead
**Status:** ready to execute on credential receipt

This runbook takes a fresh tenant from "no e-sign configured" to "first
production envelope signed" using eMudhra Aadhaar e-Sign as the ASP.

---

## 0 · Pre-flight

| Check | Where to verify |
| --- | --- |
| `APP_SECRET` set in API env (≥ 64 chars) | `apps/api/.env` |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` set | `apps/api/.env` |
| `WEBHOOK_ALLOWLIST_EMUDHRA` env var present (can be empty until step 4) | `apps/api/.env` |
| Web app reachable on `https://app.nexusops.<tenant>.com` | DNS + reverse proxy |
| `/webhooks/esign/emudhra` reachable from public internet (no IP filter at LB) | curl from outside corp net |
| Drizzle migration `0027_*` applied (esign + documents tables) | `pnpm --filter @nexusops/db db:migrate` |

---

## 1 · Procure eMudhra credentials

1. Email `partners@emudhra.com` requesting **eMsigner ASP** API access.
2. Provide:
   - Legal entity name, GSTIN, contact, intended monthly volume
   - Use cases (HR offer letters, contracts, board resolutions)
   - Public webhook URL `https://app.<tenant>.com/webhooks/esign/emudhra`
3. eMudhra issues a **sandbox** kit first — `apiKey`, `apiSecret`,
   `webhookSecret`, optional `signerId`. Production kit follows after a
   successful sandbox demo.
4. Ask eMudhra for their **outbound webhook source IP range** — paste it
   into `WEBHOOK_ALLOWLIST_EMUDHRA` on the API host (comma-separated CIDRs)
   and restart the API.

---

## 2 · Configure the tenant

1. Sign in as an **admin / owner** on the target tenant.
2. Navigate to **Settings → Integrations**.
3. Find **eMudhra Aadhaar e-Sign** under the *E-Signature* section.
4. Paste:
   - API Key
   - API Secret
   - Webhook Secret
   - ASP Signer ID (optional — leave blank if not provided)
   - Environment: `sandbox`
5. **Save credentials**. Status should flip to **Connected**.
6. Click **Test connection**. We do not run a live envelope test for
   e-sign (it would consume a signer slot and a real OTP). The button
   will report "Provider registered, live test consumes a signer slot —
   skipped here." That is expected. The save itself proves the config
   round-trips through encryption/decryption cleanly.

---

## 3 · Sandbox dry-run (with the design-partner customer)

Goal: prove the full chain works end-to-end on eMudhra's sandbox before
flipping to production.

1. **Create a contract**
   - Module: **Legal → Contracts**
   - Upload a 1-page PDF (NDA template works)
   - Add the design-partner contact as the signer
2. Open the contract, find the **E-sign** panel
3. Click **Send for signature**. Behind the scenes:
   - Document is fetched, base64-encoded, SHA-256 hashed
   - `esign.send` calls `emudhraProvider.init(config, …)` against the
     sandbox base URL
   - `signature_requests` row is created with status `sent`
   - The signer email receives a sandbox OTP page link
4. Have the design partner complete the signing flow with the
   eMudhra **sandbox test Aadhaar** that came in the credential pack
   (eMudhra publishes a fixed sandbox Aadhaar that always returns
   "signed" without needing a real OTP)
5. Within ~30 s, eMudhra POSTs to `/webhooks/esign/emudhra`. Verify:
   - HTTP 200 from the webhook (check Fastify logs / Datadog)
   - `signature_requests.status` flips to `completed` (Postgres)
   - `signature_audit` rows record `viewed`, `signed`, `completed`
   - The contract page UI updates to **Signed** badge automatically
6. Click **Download signed PDF** in the panel — should return the
   eMudhra-stamped, audit-trail PDF.

If any step fails, see the troubleshooting matrix below.

---

## 4 · Cutover to production

1. Re-request the **production credential set** from eMudhra after the
   sandbox demo passes.
2. In Settings → Integrations → eMudhra:
   - **Disconnect** to wipe the sandbox creds
   - Re-save with the production `apiKey`, `apiSecret`, `webhookSecret`
   - Environment: `production`
3. Update `WEBHOOK_ALLOWLIST_EMUDHRA` with the production source IPs
   (often the same as sandbox — confirm with eMudhra).
4. Repeat step 3 above with a **real signer Aadhaar OTP** to validate
   end-to-end on production. Use a low-stakes test contract (e.g. an
   internal NDA between two of your own employees).

---

## 5 · Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Test connection` returns "INTERNAL_SERVER_ERROR: APP_SECRET is not configured" | API env missing `APP_SECRET` | Set `APP_SECRET`, restart API |
| `esign.send` returns 401 from eMudhra | Wrong `apiKey` / `apiSecret` / clock skew on API host | Re-paste creds; check `ntpdate` on API host |
| Webhook never arrives | DNS / firewall blocking inbound from eMudhra IPs, or webhook URL not configured eMudhra-side | curl the URL from outside your VPC; confirm URL in eMudhra console |
| Webhook arrives but returns `401 Invalid signature` | `webhookSecret` mismatch between NexusOps and eMudhra console | Roll the secret on both sides |
| Webhook arrives but returns `403 Source IP not permitted` | `WEBHOOK_ALLOWLIST_EMUDHRA` too tight | Add eMudhra's CIDR or empty the env to disable IP gate temporarily |
| Webhook returns 200 but `signature_requests.status` stays `sent` | Provider sent an unknown event type | Inspect the row in `signature_audit` — extend `parsed.status` mapping if eMudhra added a new event |
| Signed PDF download 404s | eMudhra hasn't finalised the envelope; some events fire before final stamping | Retry after 1 minute; eventual final state comes via a second webhook |

---

## 6 · Rollback

If something goes irreversibly wrong on production:

1. **Disconnect** the integration in Settings → Integrations. This
   wipes the encrypted config — eMudhra calls will fail loudly rather
   than silently using stale creds.
2. Set every in-flight `signature_requests` row from `sent` /
   `viewed` back to `draft` or mark them `voided` after talking to
   the signer:
   ```sql
   UPDATE signature_requests
      SET status = 'voided', updated_at = now()
    WHERE status IN ('sent','viewed')
      AND org_id = '<tenant uuid>';
   ```
3. Communicate with the design-partner customer; resend manually-
   signed PDFs over email if needed.

---

## 7 · Sign-off checklist

Mark each item before declaring eMudhra GA-ready for the tenant:

- [ ] Sandbox round-trip green (steps 2–3 complete)
- [ ] At least one production envelope signed end-to-end (step 4)
- [ ] Webhook IP allowlist enforced (`WEBHOOK_ALLOWLIST_EMUDHRA` non-empty)
- [ ] Tenant DPA / sub-processor list updated to disclose eMudhra
- [ ] On-call runbook updated with the troubleshooting matrix above
- [ ] Pricing & invoicing terms with eMudhra finalised (per-envelope or
      monthly minimum)
