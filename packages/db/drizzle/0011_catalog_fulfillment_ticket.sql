-- Links a catalog service request to the fulfilment ticket (Phase A — service request fulfilment).
ALTER TABLE "catalog_requests" ADD COLUMN IF NOT EXISTS "fulfillment_ticket_id" uuid;
--> statement-breakpoint
ALTER TABLE "catalog_requests" DROP CONSTRAINT IF EXISTS "catalog_requests_fulfillment_ticket_id_tickets_id_fk";
--> statement-breakpoint
ALTER TABLE "catalog_requests" ADD CONSTRAINT "catalog_requests_fulfillment_ticket_id_tickets_id_fk" FOREIGN KEY ("fulfillment_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL ON UPDATE no action;
