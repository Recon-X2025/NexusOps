-- Facilities module removed (2026-08-16, product-owner decision).
--
-- Drops the six facilities tables and their six enums. A forty-person company
-- books rooms in Outlook; four of the module's five tables worked correctly,
-- which is the argument FOR removal rather than against it — a working module
-- nobody needs is one you maintain, support and audit forever.
--
-- SAFE TO CASCADE: no table outside the facilities schema holds a foreign key
-- into any of these six (verified by grepping every `references(() => …)` in
-- packages/db/src/schema for buildings / rooms / facilitySpaces — zero hits
-- outside schema/facilities.ts). CASCADE is therefore dropping only these
-- tables' own dependent objects: their indexes, their FKs among themselves, and
-- the `tenant_isolation` RLS policies migration 0052 put on them
-- (0052_odd_forgotten_wall.sql:461, :1361, :1379 and the rest).
--
-- DATA LOSS IS INTENTIONAL AND ACCEPTED: there are no customers. Only two
-- internal test tenants hold rows here, and the seed that produced them
-- (seed-modules.ts "Facilities: 2 buildings, 3 rooms") is removed in the same
-- change.
--
-- NOT dropped, deliberately — "facilities" also names an ITSM REQUEST CATEGORY,
-- which is an unrelated concept and stays: the ticket category in
-- services/ai.ts, the catalog category, the portal request category, and the
-- `peopleWorkplace.facilitiesLive` HR settings flag (HR-owned; see the audit).
DROP TABLE "buildings" CASCADE;--> statement-breakpoint
DROP TABLE "facility_requests" CASCADE;--> statement-breakpoint
DROP TABLE "facility_spaces" CASCADE;--> statement-breakpoint
DROP TABLE "move_requests" CASCADE;--> statement-breakpoint
DROP TABLE "room_bookings" CASCADE;--> statement-breakpoint
DROP TABLE "rooms" CASCADE;--> statement-breakpoint
DROP TYPE "public"."booking_status";--> statement-breakpoint
DROP TYPE "public"."building_status";--> statement-breakpoint
DROP TYPE "public"."facility_request_status";--> statement-breakpoint
DROP TYPE "public"."facility_request_type";--> statement-breakpoint
DROP TYPE "public"."facility_space_status";--> statement-breakpoint
DROP TYPE "public"."move_request_status";
