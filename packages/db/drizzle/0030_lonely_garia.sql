CREATE TABLE IF NOT EXISTS "compliance_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"risk_id" uuid,
	"compliance_framework_id" uuid,
	"audit_id" uuid,
	"audit_doc_uri" text,
	"failed_control_id" uuid,
	"failed_control_doc_uri" text,
	"security_policy_id" uuid,
	"security_policy_doc_uri" text,
	"supporting_doc_uri" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "threat_intelligence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"number" text NOT NULL,
	"description" text,
	"document_uri" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vulnerabilities" ADD COLUMN "incident_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compliance_evidence" ADD CONSTRAINT "compliance_evidence_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compliance_evidence" ADD CONSTRAINT "compliance_evidence_incident_id_security_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."security_incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "threat_intelligence" ADD CONSTRAINT "threat_intelligence_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "threat_intelligence" ADD CONSTRAINT "threat_intelligence_incident_id_security_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."security_incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_evidence_org_idx" ON "compliance_evidence" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_evidence_incident_idx" ON "compliance_evidence" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "threat_intelligence_org_idx" ON "threat_intelligence" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "threat_intelligence_incident_idx" ON "threat_intelligence" USING btree ("incident_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_incident_id_security_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."security_incidents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oncall_incidents_org_idx" ON "oncall_incidents" USING btree ("org_id");