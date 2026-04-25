ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "legal_entity_id" uuid REFERENCES "legal_entities"(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "purchase_orders_legal_entity_idx" ON "purchase_orders" ("legal_entity_id");
