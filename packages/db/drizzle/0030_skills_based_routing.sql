-- P1-8: Skills-based ticket routing
-- Adds user.skills[] and ticket.required_skill to support assignment scoring.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "skills" text[] NOT NULL DEFAULT '{}';

ALTER TABLE "tickets"
  ADD COLUMN IF NOT EXISTS "required_skill" text;

CREATE INDEX IF NOT EXISTS "users_skills_gin_idx" ON "users" USING gin ("skills");
CREATE INDEX IF NOT EXISTS "tickets_required_skill_idx" ON "tickets" ("required_skill");

