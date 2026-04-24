"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, CheckCheck, Info, AlertTriangle, CheckCircle, XCircle,
  ExternalLink, Filter, Inbox,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRBAC } from "@/lib/rbac-context";

const TYPE_ICON: Record<string, React.ReactNode> = {
  info: <Info className="h-4 w-4 text-blue-400" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  success: <CheckCircle className="h-4 w-4 text-emerald-400" />,
  error: <XCircle className="h-4 w-4 text-red-400" />,
};

const TYPE_BADGE: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  error: "bg-red-500/10 text-red-400 border-red-500/30",
};

function timeAgo(ts: string | Date) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const router = useRouter();
  const utils = trpc.useUtils();
  const { mergeTrpcQueryOpts } = useRBAC();

  const { data: notifData, isLoading } = trpc.notifications.list.useQuery(
    { unreadOnly, limit: 50 },
    mergeTrpcQueryOpts("notifications.list", { refetchInterval: 60_000 }),
  );
  const items = notifData?.items ?? [];

  const { data: count = 0 } = trpc.notifications.unreadCount.useQuery(
    undefined,
    mergeTrpcQueryOpts("notifications.unreadCount", { refetchInterval: 30_000 }),
  );

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
    onError: (e: any) => { console.error("notifications.markRead failed:", e); toast.error(e.message || "Failed to mark as read"); },
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
    onError: (e: any) => { console.error("notifications.markAllRead failed:", e); toast.error(e.message || "Failed to mark all as read"); },
  });

  function handleClick(n: (typeof items)[number]) {
    if (!n.isRead) markRead.mutate({ id: n.id });
    if (n.link) router.push(n.link);
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <Bell className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Notifications</h1>
            <p className="text-xs text-muted-foreground">
              {count > 0 ? `${count} unread` : "All caught up"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUnreadOnly((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition",
              unreadOnly
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20",
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            {unreadOnly ? "Showing unread" : "Show unread only"}
          </button>
          {count > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-4 p-4 animate-pulse">
                <div className="h-4 w-4 rounded-full bg-muted flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Inbox className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-sm font-medium">
              {unreadOnly ? "No unread notifications" : "No notifications yet"}
            </p>
            <p className="text-xs mt-1 opacity-70">
              {unreadOnly ? "You've read everything!" : "Notifications from tickets, approvals and more will appear here."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {(items as any[]).map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={cn(
                  "w-full flex items-start gap-4 px-4 py-4 text-left hover:bg-muted/50 transition-colors",
                  !n.isRead && "bg-primary/[0.03]",
                )}
              >
                {/* Unread indicator */}
                <div className="flex-shrink-0 mt-0.5 relative">
                  {TYPE_ICON[n.type ?? "info"]}
                  {!n.isRead && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary border-2 border-background" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className={cn("text-sm leading-snug", !n.isRead ? "font-semibold text-foreground" : "text-foreground/80")}>
                      {n.title}
                    </p>
                    <span className={cn("text-[10px] border rounded px-1.5 py-0.5 font-medium flex-shrink-0", TYPE_BADGE[n.type ?? "info"])}>
                      {n.type ?? "info"}
                    </span>
                    {n.sourceType && (
                      <span className="text-[10px] border border-border rounded px-1.5 py-0.5 text-muted-foreground capitalize flex-shrink-0">
                        {n.sourceType}
                      </span>
                    )}
                  </div>
                  {n.body && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.body}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/60 mt-1.5">{timeAgo(n.createdAt)}</p>
                </div>

                <div className="flex-shrink-0 flex items-center gap-2 self-center">
                  {n.link && (
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
