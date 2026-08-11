ALTER TABLE "organizations" ADD COLUMN "pf_contribution_rate" numeric(5, 2) DEFAULT '12' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "para266_joint_request" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "para266_employer_undertaking" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "para266_approval_reference" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "para266_effective_from" timestamp with time zone;