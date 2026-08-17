-- Backfill: gstin_registry.state_code must be the GST state code, derived from the GSTIN.
--
-- WHY THIS EXISTS
-- The Setup Wizard asked for a "Primary State Code" described as a 2-letter
-- ISO 3166-2:IN code (placeholder "MH", default "KA") and wrote that value into
-- gstin_registry.state_code. That column is the SUPPLIER side of every GST split:
-- resolveOrgState() reads it and computeGST() decides intra- vs inter-state from it.
-- normaliseStateToCode('KA') returns NULL — the GST vocabulary is 2-DIGIT ('29') —
-- so the supplier had no resolvable state, computeGST compared '' against the buyer's
-- '29', and a Karnataka-to-Karnataka supply was billed INTER-state IGST. The right
-- total with the wrong split, on documents a customer claims input credit against.
--
-- The WRITE PATH was fixed separately (accounting.gstin.create and orgWizardWrite now
-- derive the code from the GSTIN and reject a contradicting one). This migration fixes
-- the rows that already exist, because nothing re-touches them: a stored 'KA' resolves
-- to NULL forever and keeps mis-splitting every future document for that tenant.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- It does NOT rewrite invoices or quotes that were already issued. Those were computed
-- under the old value and their stored figures are a record of what was sent to a
-- customer. Correcting an already-issued tax document is a credit-note-and-reissue
-- decision for the business, NOT something a migration may do silently. Do not "finish"
-- this migration by adding an UPDATE over invoices or crm_quotes.
--
-- state_name is NOT backfilled: it is optional, and every read path derives the display
-- name from the code via gstStateName(), so a NULL there is already correct behaviour.

-- ── Guard first: refuse to guess past a GSTIN that cannot be parsed ─────────────
-- A row with a non-empty GSTIN that is not well-formed, or whose leading two digits
-- are not a real GST jurisdiction, is a DATA FINDING. Deriving a state from it would
-- invent a place of supply. Raise with the row detail and stop the deploy instead —
-- the api container runs `migrate && server`, so the previous container keeps serving.
--
-- An ABSENT GSTIN (NULL or '') is NOT an error: that is a tenant which is not GST
-- registered. orgWizardWrite legitimately creates such a row. It is skipped, keeps its
-- state as-is, and cannot issue a tax invoice anyway — /financial/invoice-pdf/:id already
-- refuses without a supplier GSTIN.
DO $$
DECLARE
  r record;
  bad_count int := 0;
  detail text := '';
BEGIN
  FOR r IN
    SELECT id, org_id, gstin, state_code
    FROM gstin_registry
    WHERE gstin IS NOT NULL
      AND btrim(gstin) <> ''
      AND (
        btrim(upper(gstin)) !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'
        OR left(btrim(gstin), 2) NOT IN (
          '01','02','03','04','05','06','07','08','09','10',
          '11','12','13','14','15','16','17','18','19','20',
          '21','22','23','24','26','27','28','29','30',
          '31','32','33','34','35','36','37','38','97','99'
        )
      )
  LOOP
    bad_count := bad_count + 1;
    detail := detail || format(
      E'\n  org_id=%s  registry_id=%s  gstin=%L  stored_state_code=%L',
      r.org_id, r.id, r.gstin, r.state_code
    );
  END LOOP;

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'gstin_registry holds % row(s) whose GSTIN cannot be parsed into a GST state. Correct the GSTIN (or clear it if the tenant is not GST registered) and re-run. Rows:%',
      bad_count, detail;
  END IF;
END $$;--> statement-breakpoint

-- ── The correction ─────────────────────────────────────────────────────────────
-- The first two characters of a GSTIN ARE its state code, so this is a derivation
-- rather than a guess. `IS DISTINCT FROM` so NULLs are handled, and rows that are
-- already correct are left untouched (updated_at is not disturbed for them).
UPDATE gstin_registry
SET state_code = left(btrim(upper(gstin)), 2),
    updated_at = now()
WHERE gstin IS NOT NULL
  AND btrim(gstin) <> ''
  AND state_code IS DISTINCT FROM left(btrim(upper(gstin)), 2);
