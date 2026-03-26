"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { toast } from "sonner";
import { Wrench, ChevronRight, Save, X, Loader2, MapPin, User, Calendar, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITIES = [
  { value: "1_critical", label: "P1 — Critical", color: "border-red-400 bg-red-50 text-red-700" },
  { value: "2_high",     label: "P2 — High",     color: "border-orange-400 bg-orange-50 text-orange-700" },
  { value: "3_medium",   label: "P3 — Medium",   color: "border-yellow-400 bg-yellow-50 text-yellow-700" },
  { value: "4_low",      label: "P4 — Low",      color: "border-green-400 bg-green-50 text-green-700" },
];
const CATEGORIES = ["Preventive Maintenance", "Corrective Repair", "Installation", "Inspection", "Emergency Repair", "Upgrade", "Decommission"];

export default function NewWorkOrderPage() {
  const router = useRouter();
  const { can } = useRBAC();
  const canCreate = can("work_orders", "write") || can("incidents", "write");

  const [form, setForm] = useState({
    shortDescription: "",
    description: "",
    priority: "4_low",
    category: "",
    location: "",
    assetTag: "",
    contactName: "",
    contactPhone: "",
    scheduledDate: "",
    estimatedHours: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const utils = trpc.useUtils();

  const createMutation = trpc.workOrders.create.useMutation({
    onSuccess: (wo) => {
      toast.success(`Work Order ${(wo as any).number ?? wo.id.slice(0,8)} created`);
      void utils.workOrders.list.invalidate();
      router.push(`/app/work-orders/${wo.id}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  };

  function validate() {
    const e: Record<string, string> = {};
    if (!form.shortDescription.trim()) e.shortDescription = "Title is required";
    if (!form.description.trim()) e.description = "Description is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    createMutation.mutate({
      shortDescription: form.shortDescription,
      description: form.description,
      priority: form.priority as any,
      category: form.category || undefined,
      location: form.location || undefined,
      scheduledStartDate: form.scheduledDate ? new Date(form.scheduledDate).toISOString() : undefined,
      estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : undefined,
    });
  }

  if (!canCreate) return <AccessDenied module="Work Orders" />;

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <nav className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
        <Link href="/app/work-orders" className="hover:text-primary">Work Orders</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-medium text-muted-foreground">New Work Order</span>
      </nav>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-center justify-between bg-card border border-border rounded px-4 py-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-orange-600" />
            <h1 className="text-sm font-semibold">New Work Order</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/app/work-orders" className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs hover:bg-accent transition">
              <X className="h-3 w-3" /> Cancel
            </Link>
            <button type="submit" disabled={createMutation.isPending}
              className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition">
              {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Create Work Order
            </button>
          </div>
        </div>

        {/* Priority */}
        <div className="bg-card border border-border rounded p-4 flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</h2>
          <div className="grid grid-cols-4 gap-2">
            {PRIORITIES.map((p) => (
              <button key={p.value} type="button" onClick={() => set("priority", p.value)}
                className={cn("rounded border px-2 py-2 text-[11px] font-semibold transition text-center", form.priority === p.value ? p.color : "border-border hover:bg-accent text-muted-foreground")}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main fields */}
        <div className="bg-card border border-border rounded p-4 grid grid-cols-2 gap-3">
          <h2 className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work Order Details</h2>

          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Title *</label>
            <input value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)}
              placeholder="Short description of work required…"
              className={cn("rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary", errors.shortDescription ? "border-red-400" : "border-input")} />
            {errors.shortDescription && <p className="text-[11px] text-red-500">{errors.shortDescription}</p>}
          </div>

          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Description *</label>
            <textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)}
              placeholder="Detailed description of the fault or task…"
              className={cn("rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none", errors.description ? "border-red-400" : "border-input")} />
            {errors.description && <p className="text-[11px] text-red-500">{errors.description}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Category</label>
            <select value={form.category} onChange={(e) => set("category", e.target.value)}
              className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Select…</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Scheduled Date</label>
            <input type="datetime-local" value={form.scheduledDate} onChange={(e) => set("scheduledDate", e.target.value)}
              className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Location / Site</label>
            <div className="relative flex items-center">
              <MapPin className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input value={form.location} onChange={(e) => set("location", e.target.value)}
                placeholder="e.g. DC1 – Row 5, Server Room"
                className="w-full rounded border border-input bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Asset Tag / CI</label>
            <input value={form.assetTag} onChange={(e) => set("assetTag", e.target.value)}
              placeholder="e.g. PROD-WEB-01"
              className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Site Contact</label>
            <input value={form.contactName} onChange={(e) => set("contactName", e.target.value)}
              placeholder="Name of on-site contact"
              className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Estimated Hours</label>
            <input type="number" min="0.5" step="0.5" value={form.estimatedHours} onChange={(e) => set("estimatedHours", e.target.value)}
              placeholder="e.g. 2.5"
              className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>
      </form>
    </div>
  );
}
