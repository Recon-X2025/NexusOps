ALTER TABLE "crm_pipeline_stages" ADD COLUMN "probability" integer DEFAULT 10 NOT NULL;
--> statement-breakpoint
-- Backfill the real per-stage defaults.
--
-- The ADD COLUMN above gives every existing row the column default of 10, which
-- would leave every tenant with a flat 10% across all seven stages — worse than
-- no default at all, because it looks configured. These UPDATEs seed the factory
-- values so an org created before this migration behaves exactly like one created
-- after it.
--
-- Safe to run unconditionally: the column did not exist a statement ago, so no
-- tenant can yet have deliberately configured a value that this would overwrite.
-- The numbers mirror DEFAULT_PIPELINE_STAGES in apps/api/src/routers/crm/deals.ts;
-- the two must stay in step, and a test pins them together.
UPDATE "crm_pipeline_stages" SET "probability" = 10  WHERE "key" = 'prospect';--> statement-breakpoint
UPDATE "crm_pipeline_stages" SET "probability" = 25  WHERE "key" = 'qualification';--> statement-breakpoint
UPDATE "crm_pipeline_stages" SET "probability" = 50  WHERE "key" = 'proposal';--> statement-breakpoint
UPDATE "crm_pipeline_stages" SET "probability" = 70  WHERE "key" = 'negotiation';--> statement-breakpoint
UPDATE "crm_pipeline_stages" SET "probability" = 90  WHERE "key" = 'verbal_commit';--> statement-breakpoint
UPDATE "crm_pipeline_stages" SET "probability" = 100 WHERE "key" = 'closed_won';--> statement-breakpoint
UPDATE "crm_pipeline_stages" SET "probability" = 0   WHERE "key" = 'closed_lost';
