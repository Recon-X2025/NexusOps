"use client";

export const dynamic = "force-dynamic";

/**
 * Integrations admin page — operators paste credentials here for every
 * external connector (Slack, Jira, AiSensy WhatsApp, MSG91 SMS, Razorpay,
 * ClearTax GST, Google Workspace, Microsoft 365, eMudhra e-Sign, etc.).
 *
 * The form schema is fetched from `integrations.providerCatalog` so the
 * server-side adapter registry is the single source of truth — adding a
 * new connector is a single PR with no UI changes here.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plug,
  ChevronRight,
  ShieldCheck,
  ExternalLink,
  Settings,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { cn } from "@/lib/utils";

type Status = "connected" | "disconnected" | "error" | "pending";

type ConfigField = {
  key: string;
  label: string;
  type?: "text" | "password" | "url" | "number" | "select";
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
};

type ProviderCatalogEntry = {
  provider: string;
  displayName: string;
  category: string;
  testable: boolean;
  description: string;
  docsUrl?: string;
  fields: readonly ConfigField[];
};

const CATEGORY_ORDER = [
  "messaging",
  "payments",
  "tax",
  "esign",
  "chat",
  "email",
  "itsm",
  "identity",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  messaging: "Messaging (WhatsApp / SMS)",
  payments: "Payments",
  tax: "Tax & GST",
  esign: "E-Signature",
  chat: "Chat",
  email: "Email",
  itsm: "ITSM",
  identity: "Identity & Directory",
};

function StatusBadge({ status, error }: { status: Status | undefined; error?: string | null }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Connected
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
        title={error ?? "Last test failed"}
      >
        <AlertTriangle className="h-3 w-3" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
      <XCircle className="h-3 w-3" />
      Not connected
    </span>
  );
}

function IntegrationCard({
  def,
  status,
  lastError,
  onSave,
  onDisconnect,
  onTest,
  isSaving,
  isDisconnecting,
  isTesting,
}: {
  def: ProviderCatalogEntry;
  status: Status | undefined;
  lastError: string | null;
  onSave: (provider: string, config: Record<string, string>) => void;
  onDisconnect: (provider: string) => void;
  onTest: (provider: string) => void;
  isSaving: boolean;
  isDisconnecting: boolean;
  isTesting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const isConnected = status === "connected" || status === "error";

  function handleSave() {
    const missing = def.fields
      .filter((f) => f.required && !form[f.key]?.trim())
      .map((f) => f.label);
    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.join(", ")}`);
      return;
    }
    onSave(def.provider, form);
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-4 p-4 text-left hover:bg-accent/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Plug className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold">{def.displayName}</p>
            {def.testable && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                <ShieldCheck className="h-3 w-3" />
                live-testable
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{def.description}</p>
          {status === "error" && lastError && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 truncate">
              Last error: {lastError}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={status} error={lastError} />
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-3 bg-muted/30">
          {def.docsUrl && (
            <a
              href={def.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Provider documentation
            </a>
          )}
          {def.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {field.label}
                {field.required && <span className="text-destructive ml-0.5">*</span>}
              </label>
              {field.type === "select" ? (
                <select
                  value={form[field.key] ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select…</option>
                  {field.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type ?? "text"}
                  placeholder={field.placeholder}
                  value={form[field.key] ?? ""}
                  autoComplete="off"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
              {field.helpText && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">{field.helpText}</p>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isConnected ? "Update credentials" : "Save credentials"}
            </button>
            {isConnected && def.testable && (
              <button
                type="button"
                disabled={isTesting}
                onClick={() => onTest(def.provider)}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/50 disabled:opacity-50"
              >
                {isTesting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <ShieldCheck className="h-3.5 w-3.5" />
                Test connection
              </button>
            )}
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
          <p className="text-[10px] text-muted-foreground/60">
            Credentials are stored encrypted (AES-256-CBC) and never logged. Disconnecting wipes the
            stored config.
          </p>
        </div>
      )}
    </div>
  );
}

export default function IntegrationsSettingsPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const utils = trpc.useUtils();
  const [busyProvider, setBusyProvider] = useState<{
    provider: string;
    op: "save" | "disconnect" | "test";
  } | null>(null);

  const catalogQ = trpc.integrations.providerCatalog.useQuery(
    undefined,
    mergeTrpcQueryOpts("integrations.providerCatalog", { enabled: can("settings", "read") }),
  );

  const listQ = trpc.integrations.listIntegrations.useQuery(
    undefined,
    mergeTrpcQueryOpts("integrations.listIntegrations", { enabled: can("settings", "read") }),
  );

  const upsert = trpc.integrations.upsertIntegration.useMutation({
    onSuccess: () => {
      void utils.integrations.listIntegrations.invalidate();
      toast.success("Integration saved.");
      setBusyProvider(null);
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to save integration");
      setBusyProvider(null);
    },
  });

  const disconnect = trpc.integrations.disconnectIntegration.useMutation({
    onSuccess: () => {
      void utils.integrations.listIntegrations.invalidate();
      toast.success("Integration disconnected.");
      setBusyProvider(null);
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to disconnect");
      setBusyProvider(null);
    },
  });

  const testMut = trpc.integrations.testIntegration.useMutation({
    onSuccess: (res) => {
      void utils.integrations.listIntegrations.invalidate();
      if (res.ok) toast.success("Connection OK.");
      else toast.error(`Test failed: ${res.details ?? "unknown error"}`);
      setBusyProvider(null);
    },
    onError: (err) => {
      toast.error(err.message ?? "Test failed");
      setBusyProvider(null);
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, ProviderCatalogEntry[]>();
    for (const entry of (catalogQ.data ?? []) as ProviderCatalogEntry[]) {
      const arr = map.get(entry.category) ?? [];
      arr.push(entry);
      map.set(entry.category, arr);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c,
      label: CATEGORY_LABELS[c] ?? c,
      entries: map.get(c) ?? [],
    }));
  }, [catalogQ.data]);

  if (!can("settings", "read")) return <AccessDenied module="Settings" />;

  const statusMap: Record<string, { status: Status; lastError: string | null }> = {};
  for (const i of (listQ.data ?? []) as Array<{
    provider: string;
    status: Status;
    lastError: string | null;
  }>) {
    statusMap[i.provider] = { status: i.status, lastError: i.lastError };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900">
          <Plug className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Connect CoheronConnect to external systems. Credentials are stored encrypted at rest and
            tested live before they go into rotation.
          </p>
        </div>
      </div>

      {catalogQ.isLoading || listQ.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.category} className="space-y-2">
              <div className="flex items-center gap-2">
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
              </div>
              <div className="space-y-3">
                {group.entries.map((def) => {
                  const s = statusMap[def.provider];
                  return (
                    <IntegrationCard
                      key={def.provider}
                      def={def}
                      status={s?.status}
                      lastError={s?.lastError ?? null}
                      isSaving={busyProvider?.provider === def.provider && busyProvider.op === "save"}
                      isDisconnecting={
                        busyProvider?.provider === def.provider && busyProvider.op === "disconnect"
                      }
                      isTesting={busyProvider?.provider === def.provider && busyProvider.op === "test"}
                      onSave={(provider, config) => {
                        setBusyProvider({ provider, op: "save" });
                        upsert.mutate({ provider, config });
                      }}
                      onDisconnect={(provider) => {
                        setBusyProvider({ provider, op: "disconnect" });
                        disconnect.mutate({ provider });
                      }}
                      onTest={(provider) => {
                        setBusyProvider({ provider, op: "test" });
                        testMut.mutate({ provider });
                      }}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
