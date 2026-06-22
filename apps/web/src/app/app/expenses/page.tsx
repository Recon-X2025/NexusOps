import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy redirect: the canonical employee expense-claims surface moved to
 * `/app/hr/expenses` on 2026-04-26 (market-assessment redo §C4 — docs claimed
 * `/app/hr/expenses` but the page lived at `/app/expenses`). This stub
 * preserves any deep links / bookmarks while the new path is the source of
 * truth in the sidebar, command palette, and virtual agent map.
 */
export default function ExpensesLegacyRedirect() {
  redirect("/app/hr/expenses");
}
