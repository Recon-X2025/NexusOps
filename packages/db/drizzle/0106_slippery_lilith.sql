CREATE TABLE IF NOT EXISTS "super_admin_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"badge_cls" text DEFAULT 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-700/50 dark:text-slate-300' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"capabilities" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "super_admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'operations_staff' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"phone" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "super_admin_users_email_idx" ON "super_admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "super_admin_users_role_idx" ON "super_admin_users" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "super_admin_users_status_idx" ON "super_admin_users" USING btree ("status");