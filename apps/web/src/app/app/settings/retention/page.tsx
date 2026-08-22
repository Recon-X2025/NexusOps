"use client";

/**
 * Document retention policies.
 *
 * The retention sweeper hard-deletes soft-deleted documents once they are older
 * than their policy's duration, or RETENTION_DEFAULT_DAYS (90) when no policy is
 * attached. Until this screen existed nothing wrote `document_retention_policies`,
 * so that default was unreachable and the policy-level legal-hold flag — the only
 * way to pin a whole class of documents against deletion — could never be set.
 *
 * Two things are deliberately loud here: the default that applies when no policy
 * is set, and what a delete actually does (documents fall back to the default,
 * which may be SHORTER than the policy being removed).
 */

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Archive, Plus, Trash2, Pencil, Lock, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

interface PolicyRow {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  legalHold: boolean;
  documentCount: number;
}

function PolicyDialog({
  policy,
  onClose,
}: {
  policy: PolicyRow | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(policy?.name ?? "");
  const [description, setDescription] = useState(policy?.description ?? "");
  const [durationDays, setDurationDays] = useState(String(policy?.durationDays ?? 365));
  const [legalHold, setLegalHold] = useState(policy?.legalHold ?? false);

  const done = () => {
    void utils.documents.retention.list.invalidate();
    onClose();
  };
  const create = trpc.documents.retention.create.useMutation({
    onSuccess: () => { toast.success("Retention policy created"); done(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.documents.retention.update.useMutation({
    onSuccess: () => { toast.success("Retention policy updated"); done(); },
    onError: (e) => toast.error(e.message),
  });

  const days = Number(durationDays);
  const valid = name.trim().length > 0 && Number.isInteger(days) && days >= 1;
  const busy = create.isPending || update.isPending;

  function submit() {
    if (!valid) return;
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      durationDays: days,
      legalHold,
    };
    if (policy) update.mutate({ id: policy.id, ...payload, description: payload.description ?? null });
    else create.mutate(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 className="text-body font-semibold text-foreground">
          {policy ? "Edit retention policy" : "New retention policy"}
        </h2>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-caption font-medium text-muted-foreground">Name *</span>
            <input
              className="rounded border border-border bg-background px-3 py-2 text-body-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Contracts — 7 years"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption font-medium text-muted-foreground">Description</span>
            <input
              className="rounded border border-border bg-background px-3 py-2 text-body-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this policy covers"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption font-medium text-muted-foreground">
              Keep for (days) *
            </span>
            <input
              type="number"
              min={1}
              className="rounded border border-border bg-background px-3 py-2 text-body-sm"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
            />
            <span className="text-[11px] text-muted-foreground">
              Counted from the day a document is deleted, not from upload. Minimum 1 day —
              a 0-day policy would erase a document the moment someone deletes it.
            </span>
          </label>

          <label className="flex items-start gap-2 rounded border border-border bg-muted/30 px-3 py-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={legalHold}
              onChange={(e) => setLegalHold(e.target.checked)}
            />
            <span className="text-caption text-foreground">
              <span className="font-medium">Legal hold</span>
              <span className="block text-[11px] text-muted-foreground">
                Every document on this policy is exempt from deletion, whatever the duration
                says. Use for litigation or investigation holds.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-caption font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-caption font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {policy ? "Save changes" : "Create policy"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RetentionPoliciesPage() {
  const { can } = useRBAC();
  const [dialog, setDialog] = useState<{ open: boolean; policy: PolicyRow | null }>({
    open: false,
    policy: null,
  });

  const utils = trpc.useUtils();
  const q = trpc.documents.retention.list.useQuery(undefined, { enabled: can("settings", "read") });
  const remove = trpc.documents.retention.remove.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.documentsReverted > 0
          ? `Deleted "${r.name}" — ${r.documentsReverted} document(s) now fall back to the ${r.revertedToDays}-day default`
          : `Deleted "${r.name}"`,
      );
      void utils.documents.retention.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!can("settings", "read")) return <AccessDenied module="Retention policies" />;

  const canWrite = can("settings", "write");
  const canDelete = can("settings", "delete");
  const policies = (q.data?.policies ?? []) as PolicyRow[];
  const defaultDays = q.data?.defaultDurationDays ?? 90;

  function confirmDelete(p: PolicyRow) {
    const warn =
      p.documentCount > 0
        ? `\n\n${p.documentCount} document(s) use it. They will fall back to the ${defaultDays}-day default, which may be shorter than this policy.`
        : "";
    if (window.confirm(`Delete "${p.name}"?${warn}`)) remove.mutate({ id: p.id });
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-h4 font-bold text-foreground">
            <Archive className="h-5 w-5" /> Retention policies
          </h1>
          <p className="mt-1 max-w-3xl text-body-sm text-muted-foreground">
            How long deleted documents are kept before they are permanently erased. The clock
            starts when a document is deleted, not when it is uploaded.
          </p>
        </div>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setDialog({ open: true, policy: null })}
            className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-caption font-semibold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> New policy
          </button>
        ) : null}
      </div>

      {/* The default is what most documents actually get — say so out loud. */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-caption text-amber-950 dark:text-amber-100">
          Documents with no policy attached are permanently erased{" "}
          <span className="font-semibold">{defaultDays} days</span> after deletion. That applies
          to every document below that is not covered by a policy.
        </p>
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-body-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading policies…
        </div>
      ) : q.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-body-sm text-rose-900">
          Couldn’t load retention policies. {q.error?.message}
        </div>
      ) : policies.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center">
          <p className="text-body-sm font-medium text-foreground">No retention policies yet</p>
          <p className="mt-1 text-caption text-muted-foreground">
            Every document currently follows the {defaultDays}-day default. Create a policy to
            keep a class of documents for longer, or to hold them indefinitely.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-body-sm">
            <thead className="bg-muted/40 text-caption uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Policy</th>
                <th className="px-3 py-2 text-left font-semibold">Keeps for</th>
                <th className="px-3 py-2 text-left font-semibold">Documents</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {policies.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      {p.name}
                      {p.legalHold ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                          <Lock className="h-3 w-3" /> Legal hold
                        </span>
                      ) : null}
                    </div>
                    {p.description ? (
                      <div className="text-[11px] text-muted-foreground">{p.description}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {p.legalHold ? (
                      <span className="text-rose-700 dark:text-rose-300">
                        Never deleted (hold)
                      </span>
                    ) : (
                      `${p.durationDays} days`
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {p.documentCount}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      {canWrite ? (
                        <button
                          type="button"
                          onClick={() => setDialog({ open: true, policy: p })}
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-caption"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => confirmDelete(p)}
                          disabled={remove.isPending}
                          className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-caption text-rose-700 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-300"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog.open ? (
        <PolicyDialog
          policy={dialog.policy}
          onClose={() => setDialog({ open: false, policy: null })}
        />
      ) : null}
    </div>
  );
}
