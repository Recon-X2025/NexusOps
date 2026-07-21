ALTER TABLE "crm_leads" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
