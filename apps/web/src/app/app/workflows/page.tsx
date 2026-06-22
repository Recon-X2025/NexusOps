"use client";

import Link from "next/link";
import { Plus, Play, Pause, GitBranch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatRelativeTime, cn } from "@/lib/utils";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

const TRIGGER_LABELS: Record<string, string> = {
  ticket_created: "Ticket Created",
  ticket_updated: "Ticket Updated",
  status_changed: "Status Changed",
  scheduled: "Scheduled",
  manual: "Manual",
  webhook: "Webhook",
};

export default function WorkflowsPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const { data: workflows, isLoading, refetch } = trpc.workflows.list.useQuery(undefined, mergeTrpcQueryOpts("workflows.list", { enabled: can("approvals", "read") },));

  const toggle = trpc.workflows.toggle.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Workflow updated");
    },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });

  if (!can("approvals", "read")) return <AccessDenied module="Workflows" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Visual automation engine — no-code workflow orchestration
          </p>
        </div>
        <Link
          href="/app/workflows/new"
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          New Workflow
        </Link>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : workflows?.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16">
          <GitBranch className="h-10 w-10 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">No workflows yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first workflow to automate ticket routing, notifications, and more.
            </p>
          </div>
          <Link
            href="/app/workflows/new"
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            Create first workflow
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {workflows?.map((workflow: { id: string; name: string; isActive: boolean; triggerType: string; currentVersion: number; createdAt: Date; updatedAt: Date; description: string | null }) => (
            <div
              key={workflow.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    workflow.isActive ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-muted",
                  )}
                >
                  <GitBranch
                    className={cn(
                      "h-5 w-5",
                      workflow.isActive ? "text-emerald-600" : "text-muted-foreground",
                    )}
                  />
                </div>
                <div>
                  <p className="font-medium">{workflow.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{TRIGGER_LABELS[workflow.triggerType] ?? workflow.triggerType}</span>
                    <span>·</span>
                    <span>v{workflow.currentVersion}</span>
                    <span>·</span>
                    <span>Updated {formatRelativeTime(workflow.updatedAt)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    workflow.isActive
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {workflow.isActive ? "Active" : "Inactive"}
                </span>
                <button
                  onClick={() => toggle.mutate({ id: workflow.id, isActive: !workflow.isActive })}
                  className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-accent"
                  title={workflow.isActive ? "Deactivate" : "Activate"}
                >
                  {workflow.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <Link
                  href={`/app/workflows/${workflow.id}/edit`}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
