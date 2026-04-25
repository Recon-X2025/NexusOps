# KMS / envelope metadata for integration secrets — US-SEC-002

## Current product behaviour

- Integration configs are **encrypted at rest** using AES-256-CBC with a key derived from **`APP_SECRET`** (`apps/api/src/services/encryption.ts`).
- Table `integrations` now stores:
  - **`kms_key_id`** — logical KMS key identifier (default `nexusops:local-dev-kek` or override via **`INTEGRATIONS_KMS_KEY_ID`**).
  - **`dek_wrapped_b64`** — placeholder wrapping metadata for future true envelope encryption (today: derived fingerprint for rotation audits).

## Rotation runbook (legacy APP_SECRET)

1. **Prepare** new `APP_SECRET` in a secure vault.
2. **Decrypt** each integration config with the *old* secret and **re-encrypt** with the *new* secret (maintenance script / one-off admin task).
3. **Roll** the deployment env to the new `APP_SECRET`.
4. **Verify** Jira/SAP sync jobs (`integrations.triggerJiraSync` / `triggerSapSync`) still authenticate.

## Target-state envelope (customer KMS)

1. Generate a **data encryption key (DEK)** per integration or per org.
2. Wrap DEK with **customer KMS** (CMK); store `kms_key_id` + ciphertext in `dek_wrapped_b64`.
3. Encrypt integration JSON config with DEK (AES-GCM recommended for new implementations).
4. **Never** log decrypted configs, tokens, or DEKs — redact in application logs.

## No secrets in logs

Enforce structured logging with redaction lists for keys: `token`, `password`, `secret`, `authorization`.
