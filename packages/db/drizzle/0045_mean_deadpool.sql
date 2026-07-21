ALTER TABLE "crm_accounts" ADD COLUMN "state_code" text;--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "crm_quotes" ADD COLUMN "place_of_supply" text;--> statement-breakpoint
ALTER TABLE "crm_quotes" ADD COLUMN "is_interstate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_quotes" ADD COLUMN "taxable_value" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_quotes" ADD COLUMN "cgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_quotes" ADD COLUMN "sgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_quotes" ADD COLUMN "igst_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_quotes" ADD COLUMN "tax_total" numeric(12, 2) DEFAULT '0' NOT NULL;