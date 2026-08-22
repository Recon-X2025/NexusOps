"use client";

/**
 * Approval chains — which approvers an entity type routes to.
 *
 * A chain is what lets `approvals.raise` resolve an approver without the caller
 * naming one. Without a chain, raising for an entity type refuses outright, so
 * this screen is the prerequisite for wiring any module into approvals.
 *
 * Approvers are picked from `approvals.eligibleApprovers`, NOT from every user:
 * `raise` rejects an approver who lacks `approvals:approve`, and a chain that
 * only fails at the moment someone tries to use it is worse than one that
 * cannot be built wrong.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, GitBranch, Plus, Trash2, Pencil, ArrowDown, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

/** Entity types the platform already has a natural approval moment for. */
const SUGGESTED_ENTITIES = [
  "purchase_request",
  "contract",
  "expense_claim",
  "change_request",
  "leave_request",
];

interface Approver { id: string; name: string; email: string }

interface ChainRow {
  id: string;
  entityType: string;
  name: string;
  isActive: boolean | null;
  rules: Array<{ approvers: string[]; threshold?: number }>;
}

function ChainDialog({
  approvers,
  chain,
  onClose,
}: {
  approvers: Approver[];
  /** null = create, otherwise edit in place. */
  chain: ChainRow | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const rule0 = chain?.rules?.[0];
  const [entityType, setEntityType] = useState(chain?.entityType ?? "");
  const [name, setName] = useState(chain?.name ?? "");
  const [chosen, setChosen] = useState<string[]>(rule0?.approvers ?? []);
  const [threshold, setThreshold] = useState(
    rule0?.threshold != null ? String(rule0.threshold) : "",
  );

  const done = (msg: string) => {
    toast.success(msg);
    void utils.approvals.chains.list.invalidate();
    onClose();
  };
  const create = trpc.approvals.chains.create.useMutation({
    onSuccess: () => done("Approval chain created"),
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.approvals.chains.update.useMutation({
    onSuccess: () => done("Approval chain updated"),
    onError: (e) => toast.error(e.message),
  });

  const valid = entityType.trim() && name.trim() && chosen.length > 0;

  function toggle(id: string) {
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 className="text-body font-semibold text-foreground">
          {chain ? "Edit approval chain" : "New approval chain"}
        </h2>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <label className="flex flex-col gap-1">
            <span className="text-caption font-medium text-muted-foreground">Applies to *</span>
            <input
              list="entity-types"
              className="rounded border border-border bg-background px-3 py-2 text-body-sm"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder="purchase_request"
              disabled={!!chain}
            />
            <datalist id="entity-types">
              {SUGGESTED_ENTITIES.map((e) => <option key={e} value={e} />)}
            </datalist>
            <span className="text-[11px] text-muted-foreground">
              The entity type the raising module passes. Must match exactly.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption font-medium text-muted-foreground">Name *</span>
            <input
              className="rounded border border-border bg-background px-3 py-2 text-body-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Purchases over 1 lakh"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption font-medium text-muted-foreground">
              Only when amount is at least
            </span>
            <input
              type="number"
              min={0}
              className="rounded border border-border bg-background px-3 py-2 text-body-sm"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="leave blank to always apply"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-caption font-medium text-muted-foreground">
              Approvers, in order *
            </span>
            <span className="text-[11px] text-muted-foreground">
              Each approves in turn — the next is only asked once the previous approves. A
              rejection ends the chain. Only users who can approve are listed.
            </span>
            {chosen.length > 0 ? (
              <ol className="my-1 flex flex-col gap-1 rounded border border-border bg-muted/30 p-2">
                {chosen.map((id, i) => {
                  const a = approvers.find((x) => x.id === id);
                  return (
                    <li key={id} className="flex items-center gap-2 text-caption">
                      <span className="font-semibold tabular-nums">{i + 1}.</span>
                      <span className="text-foreground">{a?.name ?? id}</span>
                      <span className="text-muted-foreground">{a?.email}</span>
                      {i < chosen.length - 1 ? (
                        <ArrowDown className="h-3 w-3 text-muted-foreground" />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : null}
            <div className="max-h-44 overflow-y-auto rounded border border-border">
              {approvers.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-2 border-b border-border px-2 py-1.5 text-caption last:border-0 hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={chosen.includes(a.id)}
                    onChange={() => toggle(a.id)}
                  />
                  <span className="text-foreground">{a.name}</span>
                  <span className="text-muted-foreground">{a.email}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex shrink-0 justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-caption font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || create.isPending || update.isPending}
            onClick={() => {
              const rules = [
                {
                  condition: {},
                  approvers: chosen,
                  sequential: true,
                  ...(threshold.trim() ? { threshold: Number(threshold) } : {}),
                },
              ];
              if (chain) update.mutate({ id: chain.id, name: name.trim(), rules });
              else create.mutate({ entityType: entityType.trim(), name: name.trim(), isActive: true, rules });
            }}
            className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-caption font-semibold text-primary-foreground disabled:opacity-50"
          >
            {create.isPending || update.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {chain ? "Save changes" : "Create chain"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ApprovalChainsPage() {
  const { can } = useRBAC();
  const [dialog, setDialog] = useState<{ open: boolean; chain: ChainRow | null }>({
    open: false,
    chain: null,
  });
  const utils = trpc.useUtils();

  const canRead = can("approvals", "read");
  const canAdmin = can("approvals", "admin");

  const q = trpc.approvals.chains.list.useQuery(undefined, { enabled: canRead });
  const qa = trpc.approvals.eligibleApprovers.useQuery(undefined, { enabled: canAdmin });

  const setActive = trpc.approvals.chains.setActive.useMutation({
    onSuccess: () => void utils.approvals.chains.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.approvals.chains.remove.useMutation({
    onSuccess: () => {
      toast.success("Chain deleted");
      void utils.approvals.chains.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!canRead) return <AccessDenied module="Approval chains" />;

  const chains = (q.data ?? []) as ChainRow[];
  const approvers = (qa.data ?? []) as Approver[];
  const nameOf = (id: string) => approvers.find((a) => a.id === id)?.name ?? id.slice(0, 8) + "…";

  // Active chains that route to nobody. `create` requires at least one approver,
  // so these can only be pre-existing rows — four shipped in the dev database
  // with `rules: []`, marked active, with no writer anywhere in the repo.
  const hollow = chains.filter(
    (c) => c.isActive !== false && (c.rules?.[0]?.approvers ?? []).length === 0,
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-h4 font-bold text-foreground">
            <GitBranch className="h-5 w-5" /> Approval chains
          </h1>
          <p className="mt-1 max-w-3xl text-body-sm text-muted-foreground">
            Who signs off on what. A request routes to each approver in turn — the next is
            only asked once the previous has approved, and a rejection ends the chain.
          </p>
        </div>
        {canAdmin ? (
          <button
            type="button"
            onClick={() => setDialog({ open: true, chain: null })}
            className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-caption font-semibold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> New chain
          </button>
        ) : null}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-caption text-amber-950 dark:text-amber-100">
          An entity type with no active chain cannot raise an approval at all — the request
          is refused rather than routed to nobody.
        </p>
      </div>

      {hollow.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 dark:border-rose-900/50 dark:bg-rose-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-caption text-rose-950 dark:text-rose-100">
            <span className="font-semibold">
              {hollow.length} chain{hollow.length > 1 ? "s have" : " has"} no approvers
            </span>{" "}
            ({hollow.map((c) => c.entityType).join(", ")}). {hollow.length > 1 ? "They are" : "It is"}{" "}
            listed as active but {hollow.length > 1 ? "route" : "routes"} to nobody, so nothing can
            be sent for approval. Add approvers, or delete {hollow.length > 1 ? "them" : "it"} —
            leaving {hollow.length > 1 ? "them" : "it"} in place reads as configured when it is not.
          </p>
        </div>
      ) : null}

      {q.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-body-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading chains…
        </div>
      ) : chains.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center">
          <p className="text-body-sm font-medium text-foreground">No approval chains yet</p>
          <p className="mt-1 text-caption text-muted-foreground">
            Nothing can be sent for approval until at least one chain exists.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-body-sm">
            <thead className="bg-muted/40 text-caption uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Applies to</th>
                <th className="px-3 py-2 text-left font-semibold">Chain</th>
                <th className="px-3 py-2 text-left font-semibold">Approvers, in order</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {chains.map((c) => {
                const rule = c.rules?.[0];
                return (
                  <tr key={c.id} className={c.isActive === false ? "opacity-50" : ""}>
                    <td className="px-3 py-2 font-mono text-caption text-foreground">
                      {c.entityType}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{c.name}</div>
                      {rule?.threshold != null ? (
                        <div className="text-[11px] text-muted-foreground">
                          only when amount ≥ {rule.threshold.toLocaleString("en-IN")}
                        </div>
                      ) : null}
                      {c.isActive === false ? (
                        <div className="text-[11px] font-semibold uppercase text-amber-700">
                          inactive
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-caption">
                      {/* A chain with no approvers routes to nobody. Rendering an
                          empty cell makes that look like a display gap; it is a
                          configuration fault, and an ACTIVE one is worse — it
                          reads as "approvals are set up for this" when nothing
                          can be raised. Say so. */}
                      {(rule?.approvers ?? []).length === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                          <AlertTriangle className="h-3 w-3" />
                          No approvers — nothing can be raised
                        </span>
                      ) : (
                        (rule?.approvers ?? []).map((id, i) => (
                          <span key={id}>
                            {i > 0 ? <span className="text-muted-foreground"> → </span> : null}
                            {nameOf(id)}
                          </span>
                        ))
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        {canAdmin ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setDialog({ open: true, chain: c })}
                              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-caption"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setActive.mutate({ id: c.id, isActive: c.isActive === false })
                              }
                              className="rounded border border-border px-2 py-1 text-caption"
                            >
                              {c.isActive === false ? "Activate" : "Deactivate"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Delete "${c.name}"? Nothing will be able to raise an approval for ${c.entityType} until another chain covers it.`))
                                  remove.mutate({ id: c.id });
                              }}
                              className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-caption text-rose-700 dark:border-rose-900/60 dark:text-rose-300"
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog.open ? (
        <ChainDialog
          approvers={approvers}
          chain={dialog.chain}
          onClose={() => setDialog({ open: false, chain: null })}
        />
      ) : null}
    </div>
  );
}
