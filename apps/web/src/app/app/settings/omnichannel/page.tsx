"use client";

import Link from "next/link";
import { MessagesSquare, Mail, Globe, Bot, ChevronRight } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

const CHANNELS = [
  {
    id: "portal",
    label: "Employee portal",
    status: "Live",
    detail: "Self-service requests and knowledge under /portal.",
  },
  {
    id: "email",
    label: "Email",
    status: "Live",
    detail: "SMTP notifications and inbound parsing via integrations (see Integrations).",
  },
  {
    id: "chat",
    label: "Chat / messaging adapters",
    status: "Roadmap",
    detail: "Slack and Teams connectors are listed in Settings → Integrations; deeper bidirectional chat is planned.",
  },
  {
    id: "virtual_agent",
    label: "Virtual agent",
    status: "Live",
    detail: "Guided flows under IT Services → Virtual Agent (module-gated).",
  },
] as const;

export default function OmnichannelSettingsPage() {
  const { can } = useRBAC();
  if (!can("settings", "read")) return <AccessDenied module="Settings" />;

  return (
    <div className="space-y-6 max-w-3xl">
      <nav className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
        <Link href="/app/settings/integrations" className="hover:text-primary">
          Settings
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-medium text-muted-foreground">Omnichannel</span>
      </nav>

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
          <MessagesSquare className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Omnichannel intake</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Single view of how work enters NexusOps today and what is on the roadmap for Phase C2-style parity with
            enterprise ITSM consoles.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {CHANNELS.map((ch) => (
          <div key={ch.id} className="flex gap-3 px-4 py-3">
            <div className="mt-0.5 text-muted-foreground">
              {ch.id === "portal" && <Globe className="h-4 w-4" />}
              {ch.id === "email" && <Mail className="h-4 w-4" />}
              {ch.id === "chat" && <MessagesSquare className="h-4 w-4" />}
              {ch.id === "virtual_agent" && <Bot className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{ch.label}</span>
                <span
                  className={
                    ch.status === "Live"
                      ? "text-[10px] font-semibold uppercase rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5"
                      : "text-[10px] font-semibold uppercase rounded-full bg-amber-100 text-amber-900 px-2 py-0.5"
                  }
                >
                  {ch.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{ch.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Ticket <span className="font-medium text-foreground/80">Intake</span> on each record can be set to portal,
        email, API, or chat as systems are wired in.
      </p>
    </div>
  );
}
