ALTER TABLE "document_acls" ADD COLUMN "is_deny" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_acls" ADD COLUMN "effective_from" timestamp with time zone;