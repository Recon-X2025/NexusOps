ALTER TABLE "invoices" ADD COLUMN "gstin_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_gstin_id_gstin_registry_id_fk" FOREIGN KEY ("gstin_id") REFERENCES "public"."gstin_registry"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
