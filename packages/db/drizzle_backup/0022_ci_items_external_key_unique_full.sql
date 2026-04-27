-- Drizzle / Postgres: ON CONFLICT ("org_id","external_key") requires a non-partial unique
-- index arbiter. Multiple NULL external_key values remain allowed under a full unique index.

DROP INDEX IF EXISTS "ci_items_org_external_key_uidx";

CREATE UNIQUE INDEX IF NOT EXISTS "ci_items_org_external_key_uidx" ON "ci_items" ("org_id", "external_key");
