-- Gap-closure: legal entities, invoice linkage, ITSM SLA pause / parent incident, finance SoD / step-up support

CREATE TABLE IF NOT EXISTS legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_entities_org_code UNIQUE (org_id, code)
);

CREATE INDEX IF NOT EXISTS legal_entities_org_idx ON legal_entities(org_id);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES legal_entities(id) ON DELETE SET NULL;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_pause_reason_code text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS parent_ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tickets_parent_ticket_id_idx ON tickets(parent_ticket_id);

-- Privileged step-up is stored in Redis (see apps/api/src/lib/step-up-session.ts), not users.step_up_verified_until.
