import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The Walk-Up Experience module was retired on 2026-04-26 in favour of a
 * unified ticket queue with `tickets.channel = "walk_in"`. This stub exists
 * so any cached browser tab, deep link, or training material that still
 * points at /app/walk-up lands on the live tickets surface instead of a
 * 404 page.
 *
 * Tracked under market-assessment redo §C3.
 */
export default function WalkUpLegacyRedirect() {
  redirect("/app/tickets?channel=walk_in");
}
