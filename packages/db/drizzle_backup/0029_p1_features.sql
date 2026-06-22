-- P1 features: live IRN dual-write, expense policy/OCR, agent conversation memory.

-- ── Invoices: extra e-invoice columns for ClearTax dual-write status ──
ALTER TABLE "invoices" ADD COLUMN "e_invoice_signed_qr_code" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "e_invoice_status" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "e_invoice_last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "e_invoice_error" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_e_invoice_status_idx" ON "invoices" ("org_id","e_invoice_status");--> statement-breakpoint

-- ── Expense claims: policy + OCR enrichment columns ──
ALTER TABLE "expense_claims" ADD COLUMN "merchant" text;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD COLUMN "mileage_km" numeric(10,2);--> statement-breakpoint
ALTER TABLE "expense_claims" ADD COLUMN "policy_violation_code" text;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD COLUMN "policy_violation_reason" text;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD COLUMN "ocr_extracted" jsonb;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD COLUMN "ocr_confidence" numeric(4,3);--> statement-breakpoint

-- ── Agent conversations + messages (server-side memory) ──
CREATE TABLE IF NOT EXISTS "agent_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "model" text NOT NULL,
  "summary" text,
  "message_count" integer NOT NULL DEFAULT 0,
  "last_message_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_conversations_org_user_idx" ON "agent_conversations" ("org_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_conversations_updated_idx" ON "agent_conversations" ("updated_at" DESC);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "agent_conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "tool_name" text,
  "tool_args" jsonb,
  "tool_result_preview" text,
  "sequence" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_messages_conversation_idx" ON "agent_messages" ("conversation_id","sequence");
