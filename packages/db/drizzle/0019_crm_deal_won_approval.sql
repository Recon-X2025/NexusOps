-- US-CRM-003: gate high-value deal → closed_won behind recorded leadership approval
ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "won_approved_at" timestamp with time zone;
ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "won_approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "won_approval_tier" text;
