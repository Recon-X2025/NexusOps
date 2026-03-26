"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { toast } from "sonner";
import {
  GitBranch, ChevronRight, Save, X, AlertTriangle, Calendar,
  Loader2, Info, Shield, FileText, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TYPES = [
  { value: "normal",    label: "Normal",    desc: "Standard change following full CAB review" },
  { value: "standard",  label: "Standard",  desc: "Pre-approved low-risk change, no CAB needed" },
  { value: "emergency", label: "Emergency", desc: "Urgent change to restore service; CAB post-review" },
];
const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
const CATEGORIES = ["Infrastructure", "Application", "Security", "Network", "Database", "Facilities"];

export default function NewChangePage() {
  const router = useRouter();
  const { can } = useRBAC();
  const canCreate = can("changes", "write");

  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "normal",
    riskLevel: "medium",
    category: "",
    implementationPlan: "",
    rollbackPlan: "",
    testPlan: "",
    scheduledStart: "",
    scheduledEnd: "",
    businessJustification: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const utils = trpc.useUtils();

  const createMutation = trpc.changes.create.useMutation({
    onSuccess: (ch) => {
      toast.success(`Change ${(ch as any).number ?? ch.id.slice(0,8)} created`);
      void utils.changes.list.invalidate();
      router.push(`/app/changes/${ch.id}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  };

  function validate() {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.description.trim()) e.description = "Description is required";
    if (!form.implementationPlan.trim()) e.implementationPlan = "Implementation plan is required";
    if (!form.rollbackPlan.trim()) e.rollbackPlan = "Rollback plan is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    createMutation.mutate({
      title: form.title,
      description: form.description,
      type: form.type as any,
      risk: form.riskLevel as any,
      implementationPlan: form.implementationPlan,
      rollbackPlan: form.rollbackPlan,
      testPlan: form.testPlan,
      scheduledStart: form.scheduledStart || undefined,
      scheduledEnd: form.scheduledEnd || undefined,
    });
  }

  if (!canCreate) return <AccessDenied module="Change Management" />;

  return (
    <div className="flex flex-col gap-3 max-w-4xl">
      <nav className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
        <Link href="/app/changes" className="hover:text-primary">Change Management</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-medium text-muted-foreground">New Change Request</span>
      </nav>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Header card */}
        <div className="flex items-center justify-between bg-card border border-border rounded px-4 py-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-indigo-600" />
            <h1 className="text-sm font-semibold">New Change Request</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/app/changes" className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs hover:bg-accent transition">
              <X className="h-3 w-3" /> Cancel
            </Link>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition"
            >
              {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Submit for Review
            </button>
          </div>
        </div>

        {/* Change type */}
        <div className="bg-card border border-border rounded p-4 flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Change Type</h2>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => set("type", t.value)}
                className={cn(
                  "flex flex-col gap-1 rounded border p-3 text-left transition",
                  form.type === t.value ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                )}
              >
                <span className={cn("text-xs font-semibold", form.type === t.value ? "text-primary" : "text-foreground")}>{t.label}</span>
                <span className="text-[11px] text-muted-foreground">{t.desc}</span>
              </button>
            ))}
          </div>
          {form.type === "emergency" && (
            <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              Emergency changes bypass CAB but require post-implementation review within 24 hours.
            </div>
          )}
        </div>

        {/* Main fields */}
        <div className="bg-card border border-border rounded p-4 grid grid-cols-2 gap-3">
          <h2 className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Change Details</h2>

          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Title *</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)}
              placeholder="Brief summary of the change…"
              className={cn("rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary", errors.title ? "border-red-400" : "border-input")} />
            {errors.title && <p className="text-[11px] text-red-500">{errors.title}</p>}
          </div>

          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Description *</label>
            <textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)}
              placeholder="What is being changed and why…"
              className={cn("rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none", errors.description ? "border-red-400" : "border-input")} />
            {errors.description && <p className="text-[11px] text-red-500">{errors.description}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Risk Level</label>
            <select value={form.riskLevel} onChange={(e) => set("riskLevel", e.target.value)}
              className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary capitalize">
              {RISK_LEVELS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Category</label>
            <select value={form.category} onChange={(e) => set("category", e.target.value)}
              className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Select category…</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Scheduled Start</label>
            <input type="datetime-local" value={form.scheduledStart} onChange={(e) => set("scheduledStart", e.target.value)}
              className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Scheduled End</label>
            <input type="datetime-local" value={form.scheduledEnd} onChange={(e) => set("scheduledEnd", e.target.value)}
              className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>

        {/* Plans */}
        {[
          { key: "implementationPlan", label: "Implementation Plan *", placeholder: "Step-by-step implementation procedure…" },
          { key: "rollbackPlan",       label: "Rollback Plan *",       placeholder: "How to revert if the change fails…" },
          { key: "testPlan",           label: "Test Plan",             placeholder: "How will success be verified post-implementation…" },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="bg-card border border-border rounded p-4 flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</h2>
            <textarea rows={4} value={(form as Record<string, string>)[key]}
              onChange={(e) => set(key, e.target.value)}
              placeholder={placeholder}
              className={cn("rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none", errors[key] ? "border-red-400" : "border-input")} />
            {errors[key] && <p className="text-[11px] text-red-500">{errors[key]}</p>}
          </div>
        ))}
      </form>
    </div>
  );
}
