-- P1-10: CSAT invite tokens (ticket close → 1-click survey)

CREATE TABLE IF NOT EXISTS "survey_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "survey_id" uuid NOT NULL REFERENCES "surveys"("id") ON DELETE CASCADE,
  "ticket_id" uuid REFERENCES "tickets"("id") ON DELETE SET NULL,
  "requester_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "token_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'sent', -- sent | submitted | expired | revoked
  "expires_at" timestamptz NOT NULL,
  "submitted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "survey_invites_token_hash_uidx" ON "survey_invites"("token_hash");
CREATE INDEX IF NOT EXISTS "survey_invites_org_idx" ON "survey_invites"("org_id", "created_at");
CREATE INDEX IF NOT EXISTS "survey_invites_ticket_idx" ON "survey_invites"("ticket_id");

