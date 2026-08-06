ALTER TABLE "invoices" ADD COLUMN "original_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "original_invoice_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "note_reason" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_original_invoice_id_invoices_id_fk" FOREIGN KEY ("original_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
