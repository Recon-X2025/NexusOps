"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Globe, Plus, Trash2, RefreshCw, ChevronDown,
  CheckCircle2, XCircle, Clock, AlertTriangle, Copy, ToggleLeft, ToggleRight,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  "ticket.created",
  "ticket.updated",
  "ticket.closed",
  "ticket.sla_breach",
  "change.created",
  "change.approved",
  "asset.created",
  "asset.updated",
  "workflow.completed",
  "workflow.failed",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface DeliveryRow {
  id: string;
  event: string;
  status: string;
  statusCode: number | null;
  attempts: number;
  createdAt: Date | string;
  completedAt: Date | string | null;
}

// ─── Helper components ────────────────────────────────────────────────────────

function DeliveryStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    failed:  "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    retrying:"bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", map[status] ?? map.pending)}>
      {status}
    </span>
  );
}

// ─── New-webhook modal ────────────────────────────────────────────────────────

function NewWebhookModal({ onClose, onCreated }: { onClose: () => void; onCreated: (key: string) => void }) {
  const [name, setName] = useState("");
  const [url, setUrl]   = useState("");
  const [events, setEvents] = useState<string[]>([]);

  const create = trpc.integrations.createWebhook.useMutation({
    onSuccess: (data) => {
      toast.success("Webhook created");
      onCreated((data as { secretOnce?: string }).secretOnce ?? "");
    },
    onError: (err) => toast.error(err.message ?? "Failed to create webhook"),
  });

  function toggleEvent(ev: string) {
    setEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev],
    );
  }

  function handleSubmit() {
    if (!name.trim()) return toast.error("Name is required");
    if (!url.trim())  return toast.error("URL is required");
    if (events.length === 0) return toast.error("Select at least one event");
    create.mutate({ name, url, events });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-background border border-border shadow-xl">
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold">New Webhook</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My SIEM connector"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Endpoint URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-endpoint.example.com/hooks/nexusops"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Events to subscribe</label>
            <div className="grid grid-cols-2 gap-1.5">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={events.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="rounded"
                  />
                  <span className="text-xs font-mono">{ev}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={create.isPending}
            onClick={handleSubmit}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create webhook
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Secret-reveal modal ──────────────────────────────────────────────────────

function SecretModal({ secret, onClose }: { secret: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background border border-border shadow-xl">
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold">Webhook Secret</h2>
        </div>
        <div className="p-5 space-y-3">
          <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-3">
            <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium">
              ⚠ Copy this secret now. It will not be shown again.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-input bg-muted p-3">
            <code className="flex-1 break-all text-xs font-mono">{secret}</code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded p-1 hover:bg-accent"
            >
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use this secret to verify the <code className="font-mono">X-NexusOps-Signature</code> header
            on incoming webhook deliveries (HMAC-SHA256).
          </p>
        </div>
        <div className="p-5 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Webhook row ──────────────────────────────────────────────────────────────

function WebhookRow({
  hook,
  onDelete,
  onToggle,
  onReroll,
}: {
  hook: WebhookRow;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onReroll: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: deliveries, isLoading: loadingDeliveries } = trpc.integrations.listDeliveries.useQuery({ webhookId: hook.id, limit: 20 }, mergeTrpcQueryOpts("integrations.listDeliveries", { enabled: expanded },));

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm">{hook.name}</p>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              hook.isActive
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800",
            )}>
              {hook.isActive ? "Active" : "Paused"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{hook.url}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {hook.events.map((ev) => (
              <span key={ev} className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{ev}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title={hook.isActive ? "Pause webhook" : "Enable webhook"}
            onClick={() => onToggle(hook.id, !hook.isActive)}
            className="rounded-lg p-2 hover:bg-accent"
          >
            {hook.isActive
              ? <ToggleRight className="h-4 w-4 text-emerald-600" />
              : <ToggleLeft  className="h-4 w-4 text-muted-foreground" />
            }
          </button>
          <button
            type="button"
            title="Re-roll signing secret"
            onClick={() => onReroll(hook.id)}
            className="rounded-lg p-2 hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            type="button"
            title="Delete webhook"
            onClick={() => onDelete(hook.id)}
            className="rounded-lg p-2 hover:bg-accent text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg p-2 hover:bg-accent"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recent Deliveries</p>
          {loadingDeliveries ? (
            <div className="flex items-center justify-center h-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !deliveries || (deliveries as DeliveryRow[]).length === 0 ? (
            <p className="text-xs text-muted-foreground">No deliveries yet.</p>
          ) : (
            <div className="space-y-1.5">
              {(deliveries as DeliveryRow[]).map((d) => (
                <div key={d.id} className="flex items-center gap-3 text-xs">
                  <DeliveryStatusBadge status={d.status} />
                  <span className="font-mono text-muted-foreground">{d.event}</span>
                  <span className="text-muted-foreground ml-auto">
                    {d.statusCode ? `HTTP ${d.statusCode}` : "—"}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(d.createdAt).toLocaleString()}
                  </span>
                  {d.attempts > 1 && (
                    <span className="text-yellow-600">{d.attempts}× retried</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WebhooksSettingsPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const [showNew, setShowNew]       = useState(false);
  const [revealSecret, setRevealSecret] = useState<string | null>(null);

  const { data: hooks, isLoading, refetch } = trpc.integrations.listWebhooks.useQuery(undefined, mergeTrpcQueryOpts("integrations.listWebhooks", { enabled: can("settings", "read") },));

  const deleteWebhook = trpc.integrations.deleteWebhook.useMutation({
    onSuccess: () => { refetch(); toast.success("Webhook deleted"); },
    onError: (err) => toast.error(err.message ?? "Failed to delete"),
  });

  const updateWebhook = trpc.integrations.updateWebhook.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => toast.error(err.message ?? "Failed to update"),
  });

  const reroll = trpc.integrations.rerollWebhookSecret.useMutation({
    onSuccess: (data) => setRevealSecret((data as { secretOnce: string }).secretOnce),
    onError: (err) => toast.error(err.message ?? "Failed to re-roll secret"),
  });

  if (!can("settings", "read")) return <AccessDenied module="Settings" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900">
            <Globe className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Outgoing Webhooks</h1>
            <p className="text-sm text-muted-foreground">
              Push real-time event notifications to external systems.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          disabled={!can("settings", "write")}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          New webhook
        </button>
      </div>

      {/* Info box */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">How it works</p>
        <p>NexusOps sends a <code className="font-mono">POST</code> request to your URL for each subscribed event.</p>
        <p>Each request includes an <code className="font-mono">X-NexusOps-Signature</code> HMAC-SHA256 header so you can verify authenticity.</p>
        <p>Deliveries are retried up to 3× with exponential back-off on non-2xx responses.</p>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !hooks || (hooks as WebhookRow[]).length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16">
          <Globe className="h-10 w-10 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">No webhooks configured</p>
            <p className="text-sm text-muted-foreground">
              Add your first webhook to start receiving real-time event notifications.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            disabled={!can("settings", "write")}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create first webhook
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {(hooks as WebhookRow[]).map((hook) => (
            <WebhookRow
              key={hook.id}
              hook={hook}
              onDelete={(id) => deleteWebhook.mutate({ id })}
              onToggle={(id, isActive) => updateWebhook.mutate({ id, isActive })}
              onReroll={(id) => reroll.mutate({ id })}
            />
          ))}
        </div>
      )}

      {showNew && (
        <NewWebhookModal
          onClose={() => setShowNew(false)}
          onCreated={(secret) => {
            setShowNew(false);
            refetch();
            if (secret) setRevealSecret(secret);
          }}
        />
      )}

      {revealSecret && (
        <SecretModal
          secret={revealSecret}
          onClose={() => setRevealSecret(null)}
        />
      )}
    </div>
  );
}
