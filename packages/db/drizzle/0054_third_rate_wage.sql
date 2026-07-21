-- G2 / Labour Codes 2025: statutory-ceiling schema + platform-default seed.
--
-- This migration is intentionally SELF-CONTAINED (schema change + seed in one
-- file) because drizzle's migrator runs the whole pending set inside a single
-- outer transaction. Postgres forbids USING a value added via
-- `ALTER TYPE ... ADD VALUE` in the same transaction that adds it
-- (SQLSTATE 55P04), so a split "add value in 0054 / seed in 0055" still fails —
-- both files share the one transaction. We therefore REBUILD the enum type via
-- the create/swap/drop/rename dance (fully transaction-safe: nothing here relies
-- on ADD VALUE), then create the arbiter index, then seed.
--
-- 1. Rebuild `statutory_metric_key` to include `bonus_eligibility_ceiling`
--    (Payment of Bonus Act eligibility wage ceiling). Only
--    `statutory_ceilings.metric_key` uses this type and it has no default, so the
--    column swap is a single USING cast.
ALTER TYPE "statutory_metric_key" RENAME TO "statutory_metric_key_old";--> statement-breakpoint
CREATE TYPE "statutory_metric_key" AS ENUM (
	'pf_wage_ceiling',
	'esi_wage_ceiling',
	'pt_slab',
	'lwf_rate',
	'bonus_eligibility_ceiling'
);--> statement-breakpoint
ALTER TABLE "statutory_ceilings"
	ALTER COLUMN "metric_key" TYPE "statutory_metric_key"
	USING "metric_key"::text::"statutory_metric_key";--> statement-breakpoint
DROP TYPE "statutory_metric_key_old";--> statement-breakpoint
-- 2. Provision the unique arbiter the seed's ON CONFLICT binds to. The
--    pre-existing `statutory_ceilings_lookup_idx` is non-unique, and a plain
--    multi-column unique index would treat nullable org_id/state_code as distinct
--    (letting duplicate platform-default rows through), so the arbiter coalesces
--    them to sentinels.
CREATE UNIQUE INDEX IF NOT EXISTS "statutory_ceilings_scope_unique_idx" ON "statutory_ceilings" USING btree (
	coalesce("org_id"::text, '00000000-0000-0000-0000-000000000000'),
	"metric_key",
	coalesce("state_code", ''),
	"effective_from"
);--> statement-breakpoint
-- 3. Seed the platform-default ceilings effective 2025-11-21 (the day the four
--    Labour Codes came into force). org_id IS NULL rows apply to every tenant
--    unless overridden by an org-scoped row. The 50%-inclusion proviso
--    (Code on Wages s.2(y)) is applied in payroll-math
--    (`calculateLabourCodeWageBase`) BEFORE these ceilings clamp the base — the
--    ceilings themselves are unchanged rupee limits, only the wage *base* they
--    clamp is recomputed under the new definition of "wages".
--
--    Idempotent: ON CONFLICT on the scope arbiter refreshes value/source_ref so a
--    re-run or a corrected figure is a no-op / update, never a duplicate.
INSERT INTO "statutory_ceilings"
	("org_id", "metric_key", "state_code", "value", "effective_from", "source_ref")
VALUES
	(NULL, 'pf_wage_ceiling', NULL, 15000.00, '2025-11-21 00:00:00+00', 'Labour Codes 2025 — EPF & MP Act wage ceiling'),
	(NULL, 'esi_wage_ceiling', NULL, 21000.00, '2025-11-21 00:00:00+00', 'Labour Codes 2025 — ESI Act wage ceiling'),
	(NULL, 'bonus_eligibility_ceiling', NULL, 21000.00, '2025-11-21 00:00:00+00', 'Labour Codes 2025 — Payment of Bonus Act eligibility ceiling')
ON CONFLICT (
	coalesce("org_id"::text, '00000000-0000-0000-0000-000000000000'),
	"metric_key",
	coalesce("state_code", ''),
	"effective_from"
) DO UPDATE SET
	"value" = EXCLUDED."value",
	"source_ref" = EXCLUDED."source_ref";
