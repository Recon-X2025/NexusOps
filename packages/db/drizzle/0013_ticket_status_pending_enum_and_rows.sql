-- Add `pending` to ticket status categories and seed one Pending row per org.
-- Uses a new enum type + column cast (safe in a single transaction). `ALTER TYPE ADD VALUE` + INSERT in one Drizzle migrate txn hits PostgreSQL 55P04.

CREATE TYPE "public"."ticket_status_category_new" AS ENUM('open', 'in_progress', 'pending', 'resolved', 'closed');
--> statement-breakpoint
ALTER TABLE "ticket_statuses" ALTER COLUMN "category" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "ticket_statuses" ALTER COLUMN "category" TYPE "public"."ticket_status_category_new" USING ("category"::text::"public"."ticket_status_category_new");
--> statement-breakpoint
ALTER TABLE "ticket_statuses" ALTER COLUMN "category" SET DEFAULT 'open'::"public"."ticket_status_category_new";
--> statement-breakpoint
DROP TYPE "public"."ticket_status_category";
--> statement-breakpoint
ALTER TYPE "public"."ticket_status_category_new" RENAME TO "ticket_status_category";
--> statement-breakpoint
UPDATE "ticket_statuses" AS ts
SET "sort_order" = ts."sort_order" + 1
WHERE EXISTS (
  SELECT 1 FROM "organizations" AS o
  WHERE o."id" = ts."org_id"
  AND NOT EXISTS (
    SELECT 1 FROM "ticket_statuses" AS p
    WHERE p."org_id" = o."id" AND p."category" = 'pending'::"public"."ticket_status_category"
  )
)
AND ts."category" IN ('resolved'::"public"."ticket_status_category", 'closed'::"public"."ticket_status_category")
AND ts."sort_order" >= 2;
--> statement-breakpoint
INSERT INTO "ticket_statuses" ("id", "org_id", "name", "color", "category", "sort_order", "created_at")
SELECT gen_random_uuid(), o."id", 'Pending', '#94a3b8', 'pending'::"public"."ticket_status_category", 2, now()
FROM "organizations" AS o
WHERE NOT EXISTS (
  SELECT 1 FROM "ticket_statuses" AS ts
  WHERE ts."org_id" = o."id" AND ts."category" = 'pending'::"public"."ticket_status_category"
);
