"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2, KeyRound, Plus, Trash2, Copy, CheckCircle2,
  Calendar, Shield,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: Record<string, string[]>;
  lastUsedAt: Date | string | null;
  expiresAt: Date | string | null;
  createdAt: Date | string;
}

// ─── New API key modal ────────────────────────────────────────────────────────

const PERMISSION_MODULES = [
  { key: "tickets",    label: "Tickets" },
  { key: "assets",     label: "Assets" },
  { key: "changes",    label: "Changes" },
  { key: "knowledge",  label: "Knowledge" },
  { key: "workflows",  label: "Workflows" },
  { key: "reports",    label: "Reports" },
];

const PERMISSION_LEVELS = ["read", "write"] as const;

function NewApiKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (key: string) => void;
}) {
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<string>("");
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});

  const create = trpc.integrations.createApiKey.useMutation({
    onSuccess: (data) => {
      toast.success("API key created");
      onCreated((data as { keyOnce?: string }).keyOnce ?? "");
    },
    onError: (err) => toast.error(err.message ?? "Failed to create API key"),
  });

  function togglePerm(module: string, level: string) {
    setPermissions((prev) => {
      const current = prev[module] ?? [];
      const next = current.includes(level)
        ? current.filter((l) => l !== level)
        : [...current, level];
      return { ...prev, [module]: next };
    });
  }

  function handleSubmit() {
    if (!name.trim()) return toast.error("Name is required");
    const days = expiresInDays ? parseInt(expiresInDays) : undefined;
    if (expiresInDays && (isNaN(days!) || days! < 1)) {
      return toast.error("Expiry must be at least 1 day");
    }
    create.mutate({
      name,
      permissions,
      expiresInDays: days,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-background border border-border shadow-xl">
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold">Create API Key</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            API keys grant programmatic access to the NexusOps REST / tRPC API.
          </p>
        </div>
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CI pipeline key"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Expires in (days) — leave blank for no expiry
            </label>
            <input
              type="number"
              min={1}
              max={3650}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="365"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Permissions</label>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Module</th>
                    {PERMISSION_LEVELS.map((l) => (
                      <th key={l} className="text-center px-3 py-2 font-medium capitalize w-16">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {PERMISSION_MODULES.map((mod) => (
                    <tr key={mod.key} className="hover:bg-muted/30">
                      <td className="px-3 py-2">{mod.label}</td>
                      {PERMISSION_LEVELS.map((level) => (
                        <td key={level} className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={(permissions[mod.key] ?? []).includes(level)}
                            onChange={() => togglePerm(mod.key, level)}
                            className="rounded"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              No modules selected = read access to all public endpoints only.
            </p>
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
            Generate key
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Key-reveal modal ─────────────────────────────────────────────────────────

function KeyRevealModal({ apiKey, onClose }: { apiKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background border border-border shadow-xl">
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold">Your API Key</h2>
        </div>
        <div className="p-5 space-y-3">
          <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-3">
            <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium">
              ⚠ Copy this key now. It will not be shown again. Store it securely.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-input bg-muted p-3">
            <code className="flex-1 break-all text-xs font-mono">{apiKey}</code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded p-1 hover:bg-accent"
            >
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pass the key as a <code className="font-mono">Bearer</code> token in the{" "}
            <code className="font-mono">Authorization</code> header:
          </p>
          <pre className="rounded bg-muted p-2 text-xs font-mono overflow-auto">
{`Authorization: Bearer ${apiKey.slice(0, 20)}…`}
          </pre>
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ApiKeysSettingsPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const [showNew, setShowNew]       = useState(false);
  const [revealKey, setRevealKey]   = useState<string | null>(null);

  const { data: keys, isLoading, refetch } = trpc.integrations.listApiKeys.useQuery(undefined, mergeTrpcQueryOpts("integrations.listApiKeys", { enabled: can("settings", "read") },));

  const revoke = trpc.integrations.revokeApiKey.useMutation({
    onSuccess: () => { refetch(); toast.success("API key revoked"); },
    onError: (err) => toast.error(err.message ?? "Failed to revoke"),
  });

  if (!can("settings", "read")) return <AccessDenied module="Settings" />;

  const rows = (keys ?? []) as ApiKeyRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900">
            <KeyRound className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">API Keys</h1>
            <p className="text-sm text-muted-foreground">
              Manage programmatic access credentials for the NexusOps API.
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
          New API key
        </button>
      </div>

      {/* Info */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Security notice</p>
        <p>API keys are shown <strong>once</strong> at creation time. NexusOps only stores a SHA-256 hash.</p>
        <p>Keys are prefixed <code className="font-mono">nxk_</code> and can be revoked at any time from this page.</p>
        <p>Scope each key to the minimum permissions required for its use case.</p>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16">
          <KeyRound className="h-10 w-10 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">No API keys yet</p>
            <p className="text-sm text-muted-foreground">
              Create a key for CI/CD pipelines, integrations, or custom scripts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            disabled={!can("settings", "write")}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create first API key
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Key prefix</th>
                <th className="text-left px-4 py-3 font-medium">Permissions</th>
                <th className="text-left px-4 py-3 font-medium">Last used</th>
                <th className="text-left px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((key) => {
                const isExpired = key.expiresAt && new Date(key.expiresAt) < new Date();
                const expiringSoon =
                  key.expiresAt &&
                  !isExpired &&
                  new Date(key.expiresAt).getTime() - Date.now() < 14 * 86_400_000;
                const modules = Object.keys(key.permissions ?? {});

                return (
                  <tr key={key.id} className={cn("hover:bg-muted/30", isExpired && "opacity-60")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{key.name}</span>
                        {isExpired && (
                          <span className="rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 px-1.5 py-0.5 text-xs">Expired</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Created {formatRelativeTime(key.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{key.keyPrefix}…</td>
                    <td className="px-4 py-3">
                      {modules.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Read-only (all)</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {modules.map((m) => (
                            <span key={m} className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                              {m}:{(key.permissions[m] ?? []).join("+")}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {key.lastUsedAt ? formatRelativeTime(key.lastUsedAt) : "Never"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {key.expiresAt ? (
                        <span className={cn(
                          "flex items-center gap-1",
                          isExpired ? "text-red-600" : expiringSoon ? "text-yellow-600" : "text-muted-foreground",
                        )}>
                          <Calendar className="h-3 w-3" />
                          {new Date(key.expiresAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => revoke.mutate({ id: key.id })}
                        disabled={!can("settings", "write") || revoke.isPending}
                        title="Revoke key"
                        className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewApiKeyModal
          onClose={() => setShowNew(false)}
          onCreated={(key) => {
            setShowNew(false);
            refetch();
            if (key) setRevealKey(key);
          }}
        />
      )}

      {revealKey && (
        <KeyRevealModal apiKey={revealKey} onClose={() => setRevealKey(null)} />
      )}
    </div>
  );
}
