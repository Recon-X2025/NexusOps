ALTER TABLE "organizations" ADD COLUMN "country" text DEFAULT 'IN' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "compliance_regime" text DEFAULT 'dpdp' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_country_idx" ON "organizations" USING btree ("country");