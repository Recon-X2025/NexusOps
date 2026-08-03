-- C5 / Income-tax rate set → effective-dated config.
--
-- Externalises the income-tax constants that live in
-- `@coheronconnect/payroll-math` (`tax-engine.ts`) into the existing
-- effective-dated `statutory_ceilings` table so a rate change becomes a data
-- change, not a redeploy. NOTHING in this migration changes any computed figure:
-- the seeded platform-default rows carry the EXACT current in-code constants, and
-- `computeTax` reads each value as `taxConfig?.X ?? <constant>` — so an org with
-- these rows resolves the same numbers the constants already produce.
--
-- Like 0054, this migration is SELF-CONTAINED (enum change + seed in one file).
-- drizzle's migrator runs the whole pending set inside one outer transaction, and
-- Postgres forbids USING a value added via `ALTER TYPE ... ADD VALUE` in the same
-- transaction that adds it (SQLSTATE 55P04). We therefore REBUILD the enum type
-- via the create/swap/drop/rename dance (transaction-safe — nothing relies on ADD
-- VALUE), then seed.
--
-- REGIME-IN-STATE_CODE OVERLOAD: for the regime-specific keys (income_tax_slabs,
-- standard_deduction, rebate_87a) the `state_code` column carries the tax REGIME
-- ("OLD" / "NEW"), not an Indian state — see the schema column comment and the
-- resolver. Regime-agnostic keys (surcharge_bands, cess_rate) leave it NULL.
--
-- EFFECTIVE DATES (prospective-only, plan requirement #1 — these must be exact so
-- a re-run of a historical period is never silently changed):
--   NEW-regime values are the Finance-Act-2025 figures, effective FY 2025-26 →
--     2025-04-01.
--   OLD-regime + regime-agnostic values are long-standing; dated 2020-04-01 (a
--     stable past FY start, safely before any pilot period).
--
-- SLAB `to` ENCODING: the open-ended top band's `to` is stored as JSON `null`
-- (JSON cannot encode Infinity) and normalised back to Infinity in the resolver,
-- so `computeSlabTax` treats it as the unbounded top band exactly as the constants
-- do.

-- 1. Rebuild `statutory_metric_key` to add the five income-tax keys. Only
--    `statutory_ceilings.metric_key` uses this type and it has no default, so the
--    column swap is a single USING cast.
ALTER TYPE "statutory_metric_key" RENAME TO "statutory_metric_key_old";--> statement-breakpoint
CREATE TYPE "statutory_metric_key" AS ENUM (
	'pf_wage_ceiling',
	'esi_wage_ceiling',
	'pt_slab',
	'lwf_rate',
	'bonus_eligibility_ceiling',
	'income_tax_slabs',
	'standard_deduction',
	'rebate_87a',
	'surcharge_bands',
	'cess_rate'
);--> statement-breakpoint
ALTER TABLE "statutory_ceilings"
	ALTER COLUMN "metric_key" TYPE "statutory_metric_key"
	USING "metric_key"::text::"statutory_metric_key";--> statement-breakpoint
DROP TYPE "statutory_metric_key_old";--> statement-breakpoint
-- 2. Seed the platform-default income-tax rate set (org_id IS NULL). Idempotent:
--    ON CONFLICT on the scope arbiter refreshes value/slabs_json/source_ref, so a
--    re-run or a corrected figure is a no-op / update, never a duplicate.
INSERT INTO "statutory_ceilings"
	("org_id", "metric_key", "state_code", "value", "slabs_json", "effective_from", "source_ref")
VALUES
	-- ── Income-tax slabs ──────────────────────────────────────────────────────
	-- OLD regime (pre-FA-2025, long-standing): 0 / 5% / 20% / 30%.
	(NULL, 'income_tax_slabs', 'OLD', NULL,
	 '{"slabs":[{"from":0,"to":250000,"rate":0},{"from":250000,"to":500000,"rate":0.05},{"from":500000,"to":1000000,"rate":0.20},{"from":1000000,"to":null,"rate":0.30}]}',
	 '2020-04-01 00:00:00+00', 'Income Tax Act 1961 — Old Regime slabs'),
	-- NEW regime (Finance Act 2025, FY 2025-26): ₹4L exemption, 7 bands to ₹24L.
	(NULL, 'income_tax_slabs', 'NEW', NULL,
	 '{"slabs":[{"from":0,"to":400000,"rate":0},{"from":400000,"to":800000,"rate":0.05},{"from":800000,"to":1200000,"rate":0.10},{"from":1200000,"to":1600000,"rate":0.15},{"from":1600000,"to":2000000,"rate":0.20},{"from":2000000,"to":2400000,"rate":0.25},{"from":2400000,"to":null,"rate":0.30}]}',
	 '2025-04-01 00:00:00+00', 'Finance Act 2025 — New Regime slabs (s.115BAC)'),
	-- ── Standard deduction (scalar `value`) ───────────────────────────────────
	(NULL, 'standard_deduction', 'OLD', 50000.00, NULL,
	 '2020-04-01 00:00:00+00', 'Income Tax Act — Old Regime standard deduction'),
	(NULL, 'standard_deduction', 'NEW', 75000.00, NULL,
	 '2025-04-01 00:00:00+00', 'Finance Act 2025 — New Regime standard deduction'),
	-- ── Section 87A rebate (threshold + max rebate) ───────────────────────────
	(NULL, 'rebate_87a', 'OLD', NULL, '{"threshold":500000,"maxRebate":12500}',
	 '2020-04-01 00:00:00+00', 'Income Tax Act s.87A — Old Regime rebate'),
	(NULL, 'rebate_87a', 'NEW', NULL, '{"threshold":1200000,"maxRebate":60000}',
	 '2025-04-01 00:00:00+00', 'Finance Act 2025 s.87A — New Regime rebate'),
	-- ── Surcharge bands (regime-agnostic, state_code NULL) ─────────────────────
	(NULL, 'surcharge_bands', NULL, NULL,
	 '{"bands":[{"threshold":5000000,"rate":0.10},{"threshold":10000000,"rate":0.15},{"threshold":20000000,"rate":0.25},{"threshold":50000000,"rate":0.37}]}',
	 '2020-04-01 00:00:00+00', 'Income Tax Act — surcharge bands'),
	-- ── Health & Education cess (regime-agnostic scalar) ──────────────────────
	(NULL, 'cess_rate', NULL, 0.04, NULL,
	 '2020-04-01 00:00:00+00', 'Income Tax Act — Health & Education Cess 4%')
ON CONFLICT (
	coalesce("org_id"::text, '00000000-0000-0000-0000-000000000000'),
	"metric_key",
	coalesce("state_code", ''),
	"effective_from"
) DO UPDATE SET
	"value" = EXCLUDED."value",
	"slabs_json" = EXCLUDED."slabs_json",
	"source_ref" = EXCLUDED."source_ref";
