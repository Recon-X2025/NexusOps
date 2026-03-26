"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { toast } from "sonner";
import {
  Workflow, ChevronRight, Save, X, Loader2, Plus, Trash2,
  GitBranch, Bell, Mail, Wrench, TicketIcon, Users, Database, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generateUUID } from "@/lib/uuid";

const TRIGGERS = [
  { value: "ticket_created",  label: "Ticket Created",   icon: TicketIcon },
  { value: "ticket_updated",  label: "Ticket Updated",   icon: TicketIcon },
  { value: "status_changed",  label: "Status Changed",   icon: GitBranch },
  { value: "scheduled",       label: "Scheduled",        icon: Bell },
  { value: "webhook",         label: "Webhook / API",    icon: Zap },
  { value: "manual",          label: "Manual Trigger",   icon: Users },
];

const ACTION_TYPES = [
  { value: "assign",    label: "Assign Record" },
  { value: "notify",    label: "Send Notification" },
  { value: "email",     label: "Send Email" },
  { value: "update_field", label: "Update Field" },
  { value: "create_task",  label: "Create Task" },
  { value: "webhook",   label: "Call Webhook" },
];

type StepRow = { id: string; type: string; config: string };

export default function NewWorkflowPage() {
  const router = useRouter();
  const { can } = useRBAC();
  const canCreate = can("approvals", "write");

  const [form, setForm] = useState({
    name: "",
    description: "",
    trigger: "ticket_created",
    isActive: false,
  });
  const [steps, setSteps] = useState<StepRow[]>([
    { id: generateUUID(), type: "notify", config: "" },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const utils = trpc.useUtils();

  const createMutation = trpc.workflows.create.useMutation({
    onSuccess: (wf) => {
      toast.success(`Workflow "${(wf as any).name ?? wf.id}" created`);
      void utils.workflows.list.invalidate();
      router.push("/app/workflows");
    },
    onError: (e: any) => toast.error(e.message),
  });

  function addStep() {
    setSteps((s) => [...s, { id: generateUUID(), type: "notify", config: "" }]);
  }
  function removeStep(id: string) {
    setSteps((s) => s.filter((r) => r.id !== id));
  }
  function updateStep(id: string, key: keyof StepRow, value: string) {
    setSteps((s) => s.map((r) => r.id === id ? { ...r, [key]: value } : r));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Workflow name is required";
    if (steps.length === 0) e.steps = "Add at least one action step";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    createMutation.mutate({
      name: form.name,
      description: form.description,
      triggerType: form.trigger as any,
      triggerConfig: {},
    });
  }

  if (!canCreate) return <AccessDenied module="Workflow Designer" />;

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <nav className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
        <Link href="/app/workflows" className="hover:text-primary">Workflows</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-medium text-muted-foreground">New Workflow</span>
      </nav>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-center justify-between bg-card border border-border rounded px-4 py-3">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-indigo-600" />
            <h1 className="text-sm font-semibold">Create Workflow</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/app/workflows" className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs hover:bg-accent transition">
              <X className="h-3 w-3" /> Cancel
            </Link>
            <button type="submit" disabled={createMutation.isPending}
              className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition">
              {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Workflow
            </button>
          </div>
        </div>

        {/* Name + description */}
        <div className="bg-card border border-border rounded p-4 grid grid-cols-2 gap-3">
          <h2 className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Info</h2>
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Workflow Name *</label>
            <input value={form.name} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); if (errors.name) setErrors((e) => ({ ...e, name: "" })); }}
              placeholder="e.g. Auto-escalate SLA breach"
              className={cn("rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary", errors.name ? "border-red-400" : "border-input")} />
            {errors.name && <p className="text-[11px] text-red-500">{errors.name}</p>}
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What this workflow does…"
              className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" id="isActive" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="rounded border-input" />
            <label htmlFor="isActive" className="text-xs text-foreground/80 cursor-pointer">Activate immediately after saving</label>
          </div>
        </div>

        {/* Trigger */}
        <div className="bg-card border border-border rounded p-4 flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trigger</h2>
          <div className="grid grid-cols-3 gap-2">
            {TRIGGERS.map(({ value, label, icon: Icon }) => (
              <button key={value} type="button"
                onClick={() => setForm((f) => ({ ...f, trigger: value }))}
                className={cn("flex items-center gap-2 rounded border p-2.5 text-xs font-medium transition",
                  form.trigger === value ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-accent text-muted-foreground"
                )}>
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="bg-card border border-border rounded p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action Steps</h2>
            <button type="button" onClick={addStep}
              className="flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs hover:bg-accent transition">
              <Plus className="h-3 w-3" /> Add Step
            </button>
          </div>
          {errors.steps && <p className="text-[11px] text-red-500">{errors.steps}</p>}
          <div className="flex flex-col gap-2">
            {steps.map((step, i) => (
              <div key={step.id} className="flex items-center gap-2 bg-muted/30 rounded border border-border p-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold flex-shrink-0">{i + 1}</span>
                <select value={step.type} onChange={(e) => updateStep(step.id, "type", e.target.value)}
                  className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary">
                  {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                <input value={step.config} onChange={(e) => updateStep(step.id, "config", e.target.value)}
                  placeholder="Configuration / target…"
                  className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                <button type="button" onClick={() => removeStep(step.id)}
                  className="text-muted-foreground hover:text-red-500 transition">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}
