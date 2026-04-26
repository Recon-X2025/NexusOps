import { redirect } from "next/navigation";

/** Bookmarks / legacy links — permanent redirect to Command Center. */
export default function DashboardRedirectPage() {
  redirect("/app/command");
}
