ALTER TABLE "software_licenses" ADD COLUMN "installed_count" integer;--> statement-breakpoint
ALTER TABLE "software_licenses" ADD COLUMN "reconciled_at" timestamp with time zone;