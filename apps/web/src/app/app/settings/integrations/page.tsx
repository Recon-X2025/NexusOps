"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, XCircle, Plug, MessagesSquare,
  GitPullRequest, Database, Mail, ChevronRight, Settings, MessageSquare,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = "slack" | "teams" | "email" | "jira" | "sap";
type Status   = "connected" | "disconnected" | "error" | "pending";

interface IntegrationDef {
  provider: Provider;
  label: string;
  description: string;
  icon: React.ReactNode;
  fields: { key: string; label: string; type?: string; placeholder?: string }[];
  docsUrl?: string;
}

const INTEGRATION_DEFS: IntegrationDef[] = [
  {
    provider: "slack",
    label: "Slack",
    description: "Post ticket notifications, approvals, and SLA alerts to Slack channels.",
    icon: <MessageSquare className="h-5 w-5" />,
    fields: [
      { key: "webhookUrl", label: "Incoming Webhook URL", placeholder: "https://hooks.slack.com/services/…" },
      { key: "defaultChannel", label: "Default Channel", placeholder: "#nexusops-alerts" },
    ],
  },
  {
    provider: "teams",
    label: "Microsoft Teams",
    description: "Send adaptive card notifications to Teams channels.",
    icon: <MessagesSquare className="h-5 w-5" />,
    fields: [
      { key: "webhookUrl", label: "Connector Webhook URL", placeholder: "https://…webhook.office.com/…" },
    ],
  },
  {
    provider: "email",
    label: "SMTP / Email",
    description: "Configure outbound email for notifications and ticket updates.",
    icon: <Mail className="h-5 w-5" />,
    fields: [
      { key: "host",     label: "SMTP Host",     placeholder: "smtp.sendgrid.net" },
      { key: "port",     label: "Port",           placeholder: "587" },
      { key: "user",     label: "Username / API Key" },
      { key: "pass",     label: "Password",       type: "password" },
      { key: "from",     label: "From address",   placeholder: "noreply@yourcompany.com" },
    ],
  },
  {
    provider: "jira",
    label: "Jira",
    description: "Bidirectional sync — NexusOps tickets ↔ Jira issues.",
    icon: <GitPullRequest className="h-5 w-5" />,
    fields: [
      { key: "baseUrl",    label: "Jira Base URL",    placeholder: "https://yourco.atlassian.net" },
      { key: "email",      label: "Account Email",    placeholder: "admin@yourco.com" },
      { key: "apiToken",   label: "API Token",        type: "password" },
      { key: "projectKey", label: "Project Key",      placeholder: "OPS" },
    ],
  },
  {
    provider: "sap",
    label: "SAP",
    description: "Connect to SAP REST APIs for asset and procurement sync.",
    icon: <Database className="h-5 w-5" />,
    fields: [
      { key: "baseUrl",  label: "SAP Base URL" },
      { key: "clientId", label: "Client ID" },
      { key: "secret",   label: "Client Secret", type: "password" },
    ],
  },
];

// ─── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({
  def,
  status,
  onSave,
  onDisconnect,
  isSaving,
  isDisconnecting,
}: {
  def: IntegrationDef;
  status: Status | undefined;
  onSave: (provider: Provider, config: Record<string, string>) => void;
  onDisconnect: (provider: Provider) => void;
  isSaving: boolean;
  isDisconnecting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const isConnected = status === "connected";

  function handleSave() {
    const missing = def.fields.filter((f) => !form[f.key]);
    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    onSave(def.provider, form);
    setOpen(false);
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        className="flex w-full items-center gap-4 p-4 text-left hover:bg-accent/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {def.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{def.label}</p>
          <p className="text-xs text-muted-foreground truncate">{def.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isConnected ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-500">
              <XCircle className="h-3 w-3" />Not connected
            </span>
          )}
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
        </div>
      </button>

      {/* Config panel */}
      {open && (
        <div className="border-t border-border p-4 space-y-3 bg-muted/30">
          {def.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {field.label}
              </label>
              <input
                type={field.type ?? "text"}
                placeholder={field.placeholder}
                value={form[field.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isConnected ? "Update" : "Connect"}
            </button>
            {isConnected && (
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={() => onDisconnect(def.provider)}
                className="flex items-center gap-2 rounded-lg border border-destructive/50 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                {isDisconnecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Disconnect
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IntegrationsSettingsPage() {
  const { can } = useRBAC();
  const [savingProvider, setSavingProvider] = useState<Provider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<Provider | null>(null);

  const { data: list, isLoading, refetch } = trpc.integrations.listIntegrations.useQuery(
    undefined,
    { enabled: can("settings", "read") },
  );

  const upsert = trpc.integrations.upsertIntegration.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Integration saved");
      setSavingProvider(null);
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to save integration");
      setSavingProvider(null);
    },
  });

  const disconnect = trpc.integrations.disconnectIntegration.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Integration disconnected");
      setDisconnectingProvider(null);
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to disconnect");
      setDisconnectingProvider(null);
    },
  });

  if (!can("settings", "read")) return <AccessDenied module="Settings" />;

  const statusMap = Object.fromEntries(
    (list ?? []).map((i: any) => [i.provider, i.status as Status]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900">
          <Plug className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Connect NexusOps to external systems for notifications, sync, and automation.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {INTEGRATION_DEFS.map((def) => (
            <IntegrationCard
              key={def.provider}
              def={def}
              status={statusMap[def.provider]}
              isSaving={savingProvider === def.provider && upsert.isPending}
              isDisconnecting={disconnectingProvider === def.provider && disconnect.isPending}
              onSave={(provider, config) => {
                setSavingProvider(provider);
                upsert.mutate({ provider, config });
              }}
              onDisconnect={(provider) => {
                setDisconnectingProvider(provider);
                disconnect.mutate({ provider });
              }}
            />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-border p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Settings className="h-4 w-4" />
          <p className="text-sm">
            More integrations — Jira bidirectional sync and SAP REST adapter — are in the roadmap.
            Configuration will be fully handled here once those connectors are implemented.
          </p>
        </div>
      </div>
    </div>
  );
}
