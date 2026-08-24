-- A supplier below the GST registration threshold issues a BILL OF SUPPLY
-- (Rule 49), not a tax invoice: no GSTIN, no tax breakup. Without this value the
-- product could only represent a tax invoice, so an unregistered tenant could
-- not bill at all.
--
-- ADD VALUE only — no existing row changes meaning, so no backfill is required:
-- every current invoice was created by the tax-invoice path and stays one.
ALTER TYPE "public"."invoice_type" ADD VALUE IF NOT EXISTS 'bill_of_supply';
