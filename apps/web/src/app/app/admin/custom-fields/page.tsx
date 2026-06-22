"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SlidersHorizontal, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

const ENTITIES = [
  { value: "ticket", label: "Ticket" },
  { value: "asset", label: "Asset (CMDB)" },
  { value: "employee", label: "Employee" },
  { value: "contract", label: "Contract" },
  { value: "vendor", label: "Vendor" },
  { value: "project", label: "Project" },
  { value: "change_request", label: "Change request" },
  { value: "lead", label: "Lead" },
  { value: "invoice", label: "Invoice" },
  { value: "expense_claim", label: "Expense claim" },
  { value: "okr_objective", label: "OKR objective" },
] as const;

const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "select",
  "multi_select",
  "url",
  "email",
  "phone",
  "user_reference",
  "file",
  "json",
] as const;

export default function CustomFieldsAdminPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const [entity, setEntity] = useState<(typeof ENTITIES)[number]["value"]>("ticket");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    label: "",
    type: "text" as (typeof FIELD_TYPES)[number],
    isRequired: false,
    helpText: "",
  });

  const listQ = trpc.customFields.listDefinitions.useQuery(
    { entity, activeOnly: false },
    mergeTrpcQueryOpts("customFields.listDefinitions", { enabled: can("admin", "read") }),
  );

  const utils = trpc.useUtils();
  const createMut = trpc.customFields.createDefinition.useMutation({
    onSuccess: () => {
      toast.success("Field created");
      setShowCreate(false);
      setForm({ name: "", label: "", type: "text", isRequired: false, helpText: "" });
      void utils.customFields.listDefinitions.invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const deleteMut = trpc.customFields.deleteDefinition.useMutation({
    onSuccess: () => {
      toast.success("Field deactivated");
      void utils.customFields.listDefinitions.invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const rows = useMemo(() => listQ.data ?? [], [listQ.data]);

  if (!can("admin", "read")) return <AccessDenied module="Custom Fields" />;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          <div>
            <h1 className="text-sm font-semibold text-foreground">Custom fields</h1>
            <p className="text-[11px] text-muted-foreground">
              Org-scoped definitions for forms and records. Names must be <code className="text-[10px]">snake_case</code>.
            </p>
          </div>
        </div>
        <Link href="/app/admin" className="text-[11px] text-primary hover:underline">
          ← Back to Administration
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase">Entity</label>
          <select
            className="mt-0.5 block border border-border rounded px-2 py-1.5 text-[12px] bg-background min-w-[200px]"
            value={entity}
            onChange={(e) => setEntity(e.target.value as typeof entity)}
          >
            {ENTITIES.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </div>
        {can("admin", "write") && (
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="flex items-center gap-1 px-2 py-1.5 text-[11px] bg-primary text-primary-foreground rounded hover:opacity-90"
          >
            <Plus className="w-3 h-3" /> New field
          </button>
        )}
      </div>

      {showCreate && can("admin", "write") && (
        <div className="border border-border rounded-lg p-4 bg-card space-y-3">
          <p className="text-[11px] font-semibold text-foreground">Create field on {entity}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase">API name *</label>
              <input
                className="mt-0.5 w-full border border-border rounded px-2 py-1 text-[12px] bg-background"
                placeholder="e.g. cost_center"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase">Label *</label>
              <input
                className="mt-0.5 w-full border border-border rounded px-2 py-1 text-[12px] bg-background"
                placeholder="e.g. Cost center"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase">Type</label>
              <select
                className="mt-0.5 w-full border border-border rounded px-2 py-1 text-[12px] bg-background"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as (typeof FIELD_TYPES)[number] }))}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                id="req"
                type="checkbox"
                checked={form.isRequired}
                onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))}
              />
              <label htmlFor="req" className="text-[12px]">Required</label>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground uppercase">Help text</label>
              <input
                className="mt-0.5 w-full border border-border rounded px-2 py-1 text-[12px] bg-background"
                value={form.helpText}
                onChange={(e) => setForm((f) => ({ ...f, helpText: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => createMut.mutate({
                entity,
                name: form.name.trim(),
                label: form.label.trim(),
                type: form.type,
                isRequired: form.isRequired,
                helpText: form.helpText || undefined,
              })}
              disabled={createMut.isPending || !form.name.trim() || !form.label.trim()}
              className="px-3 py-1.5 text-[11px] bg-primary text-primary-foreground rounded disabled:opacity-50"
            >
              {createMut.isPending ? "Saving…" : "Create"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-[11px] border border-border rounded">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Label</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium">Active</th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-muted-foreground text-center">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-muted-foreground text-center">No definitions for this entity.</td></tr>
            ) : (
              rows.map((r: any) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-[11px]">{r.name}</td>
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.type}</td>
                  <td className="px-3 py-2">{r.isActive ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-right">
                    {can("admin", "write") && r.isActive && (
                      <button
                        type="button"
                        title="Deactivate"
                        onClick={() => {
                          if (confirm(`Deactivate field “${r.label}”?`)) deleteMut.mutate({ id: r.id });
                        }}
                        className="p-1 rounded text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
