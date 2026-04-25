-- US-STR-004…008: strategic initiatives, benefits, intake status, dependencies, APM links on projects.
-- US-ITSM-007: CAB approval stores structured risk score + questionnaire on change_requests.
-- US-ITSM-008: KB article content revisions (version history).

DO $$ BEGIN
  ALTER TYPE "project_status" ADD VALUE 'proposed';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "strategic_initiatives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
  "name" text NOT NULL,
  "theme" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "strategic_initiatives_org_idx" ON "strategic_initiatives" ("org_id");

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "initiative_id" uuid REFERENCES "strategic_initiatives"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "benefit_type" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "benefit_target" numeric(14, 2);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "benefit_actual" numeric(14, 2);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "linked_application_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;

CREATE INDEX IF NOT EXISTS "projects_initiative_idx" ON "projects" ("initiative_id");

CREATE TABLE IF NOT EXISTS "project_dependencies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
  "from_project_id" uuid NOT NULL REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action,
  "to_project_id" uuid NOT NULL REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action,
  "dependency_type" text DEFAULT 'finish_to_start' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_dependencies_distinct" CHECK ("from_project_id" <> "to_project_id")
);

CREATE INDEX IF NOT EXISTS "project_dependencies_org_idx" ON "project_dependencies" ("org_id");
CREATE INDEX IF NOT EXISTS "project_dependencies_from_idx" ON "project_dependencies" ("from_project_id");
CREATE INDEX IF NOT EXISTS "project_dependencies_to_idx" ON "project_dependencies" ("to_project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "project_dependencies_pair_uidx" ON "project_dependencies" ("from_project_id", "to_project_id");

ALTER TABLE "change_requests" ADD COLUMN IF NOT EXISTS "risk_score" integer;
ALTER TABLE "change_requests" ADD COLUMN IF NOT EXISTS "risk_questionnaire" jsonb;

ALTER TABLE "kb_articles" ADD COLUMN IF NOT EXISTS "content_version" integer DEFAULT 1 NOT NULL;

CREATE TABLE IF NOT EXISTS "kb_article_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "article_id" uuid NOT NULL REFERENCES "public"."kb_articles"("id") ON DELETE cascade ON UPDATE no action,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
  "version" integer NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "kb_article_revisions_article_idx" ON "kb_article_revisions" ("article_id");
CREATE UNIQUE INDEX IF NOT EXISTS "kb_article_revisions_article_version_uidx" ON "kb_article_revisions" ("article_id", "version");
