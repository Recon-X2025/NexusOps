CREATE TYPE "public"."audit_chain_status" AS ENUM('ok', 'broken');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_chain_anchors" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"max_seq" integer NOT NULL,
	"head_hash" text NOT NULL,
	"status" "audit_chain_status" DEFAULT 'ok' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_chain_anchors" ADD CONSTRAINT "audit_chain_anchors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- B5 backfill: establish one head-anchor per org that already has a chained
-- audit trail (seq IS NOT NULL). This must NOT bless a pre-existing break by
-- anchoring a broken chain to its current MAX(seq) as if it were correct.
--
-- SQL can only see STRUCTURAL breaks (a non-contiguous seq range: a gap or a
-- missing genesis). It cannot re-derive the SHA-256 hash chain to detect a
-- TAMPERED row — replicating computeEntryHash()'s exact canonicalisation in SQL
-- would be a second, drift-prone implementation of the same logic. So:
--   • contiguous chain (min seq = 1 AND max seq = count) -> status 'ok'
--   • non-contiguous (gap / no genesis)                  -> status 'broken'
-- Any hash-TAMPER that SQL can't see is caught on the scheduled verifier's first
-- run: runtime verifyAuditChain re-derives the chain and flips the anchor to
-- 'broken'. The anchor is thus a floor, never a false clean bill of health.
INSERT INTO "audit_chain_anchors" ("org_id", "max_seq", "head_hash", "status", "updated_at")
SELECT
  h.org_id,
  h.max_seq,
  h.head_hash,
  CASE WHEN h.min_seq = 1 AND h.max_seq = h.cnt THEN 'ok'::"audit_chain_status"
       ELSE 'broken'::"audit_chain_status"
  END,
  now()
FROM (
  SELECT
    a.org_id,
    MAX(a.seq)                                              AS max_seq,
    MIN(a.seq)                                              AS min_seq,
    COUNT(a.seq)                                            AS cnt,
    (ARRAY_AGG(a.entry_hash ORDER BY a.seq DESC))[1]        AS head_hash
  FROM "audit_logs" a
  WHERE a.seq IS NOT NULL
  GROUP BY a.org_id
) h
ON CONFLICT ("org_id") DO NOTHING;
--> statement-breakpoint
-- RLS wall for the new tenant table. `audit_chain_anchors` carries `org_id`, so
-- by the exact rule 0052 used it is a tenant table and must be walled (ENABLE +
-- FORCE ROW LEVEL SECURITY + the `tenant_isolation` policy). Stanza copied
-- verbatim from 0052/0061. `app_runtime` already gets DML via the ALTER DEFAULT
-- PRIVILEGES 0052 set, so no GRANT is needed here. drizzle-kit does not model
-- RLS, so this is hand-authored and absent from the generated snapshot.
ALTER TABLE "audit_chain_anchors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_chain_anchors" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "audit_chain_anchors";
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit_chain_anchors"
  USING (
    current_setting('app.org_id', true) IS NULL
    OR current_setting('app.org_id', true) = ''
    OR org_id = current_setting('app.org_id', true)::uuid
  )
  WITH CHECK (
    current_setting('app.org_id', true) IS NULL
    OR current_setting('app.org_id', true) = ''
    OR org_id = current_setting('app.org_id', true)::uuid
  );
