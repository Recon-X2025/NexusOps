-- Business rules: org-scoped automation on record events (see packages/db/src/schema/business-rules.ts).

CREATE TABLE IF NOT EXISTS "business_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"name" text NOT NULL,
	"description" text,
	"entity_type" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "business_rules_org_idx" ON "business_rules" ("org_id");
CREATE INDEX IF NOT EXISTS "business_rules_org_enabled_idx" ON "business_rules" ("org_id", "enabled");
