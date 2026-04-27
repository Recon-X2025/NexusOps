-- AP (vendor) vs AR (customer) direction; existing rows are vendor AP.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "invoice_flow" text NOT NULL DEFAULT 'payable';

ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_invoice_flow_chk";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_invoice_flow_chk" CHECK ("invoice_flow" IN ('payable', 'receivable'));

CREATE INDEX IF NOT EXISTS "invoices_org_flow_idx" ON "invoices" USING btree ("org_id", "invoice_flow");
