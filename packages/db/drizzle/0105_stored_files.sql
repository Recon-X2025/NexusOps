CREATE TABLE IF NOT EXISTS "stored_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"data" bytea NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stored_files_key_idx" ON "stored_files" USING btree ("storage_key");
