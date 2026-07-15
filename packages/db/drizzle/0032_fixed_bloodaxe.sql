CREATE TABLE IF NOT EXISTS "mfa_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"totp_secret" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"backup_codes" text[] DEFAULT '{}' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mfa_enrollments" ADD CONSTRAINT "mfa_enrollments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mfa_enrollments" ADD CONSTRAINT "mfa_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mfa_enrollments_user_id_idx" ON "mfa_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mfa_enrollments_org_id_idx" ON "mfa_enrollments" USING btree ("org_id");