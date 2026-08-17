CREATE TYPE "public"."id_verification_status" AS ENUM('unverified', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."pf_kyc_status" AS ENUM('pending', 'done', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."residential_status" AS ENUM('resident', 'resident_not_ordinarily_resident', 'non_resident');--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "international_worker" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "residential_status" "residential_status";--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pf_join_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pf_kyc_status" "pf_kyc_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pf_kyc_document" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pf_kyc_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "aadhaar_verification" "id_verification_status" DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pan_verification" "id_verification_status" DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "bank_verification" "id_verification_status" DEFAULT 'unverified' NOT NULL;