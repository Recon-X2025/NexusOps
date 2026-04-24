"use client";

import { Fragment, useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ShoppingCart,
  Search,
  Monitor,
  Wifi,
  Shield,
  User,
  Package,
  Wrench,
  Phone,
  Key,
  HardDrive,
  Star,
  Clock,
  ChevronRight,
  Plus,
  CheckCircle2,
  Settings,
  GripVertical,
  Trash2,
  Edit,
  X,
  Type,
  AlignLeft,
  Hash,
  Mail,
  Calendar,
  List,
  ToggleLeft,
  Circle,
  FileUp,
  ChevronDown,
  TicketIcon,
} from "lucide-react";

/** Fixed category taxonomy; item counts come from `catalog.listItems`, not from this list. */
const CATALOG_CATEGORIES = [
  {
    id: "hardware",
    label: "Hardware",
    icon: Monitor,
    color: "text-blue-700 bg-blue-50 border-blue-200",
  },
  {
    id: "software",
    label: "Software & Licensing",
    icon: Key,
    color: "text-purple-700 bg-purple-50 border-purple-200",
  },
  {
    id: "network",
    label: "Network & Access",
    icon: Wifi,
    color: "text-indigo-700 bg-indigo-50 border-indigo-200",
  },
  {
    id: "security",
    label: "Security & Identity",
    icon: Shield,
    color: "text-red-700 bg-red-50 border-red-200",
  },
  {
    id: "onboarding",
    label: "Onboarding / Offboarding",
    icon: User,
    color: "text-green-700 bg-green-50 border-green-200",
  },
  {
    id: "facilities",
    label: "Facilities",
    icon: Wrench,
    color: "text-yellow-700 bg-yellow-50 border-yellow-200",
  },
  {
    id: "storage",
    label: "Storage & Backup",
    icon: HardDrive,
    color: "text-foreground/80 bg-muted/30 border-slate-200",
  },
  {
    id: "telecom",
    label: "Telecom & Mobility",
    icon: Phone,
    color: "text-cyan-700 bg-cyan-50 border-cyan-200",
  },
];

type CatalogView = "catalog" | "requests" | "manage" | "admin";

function tabParamToView(tab: string | null): CatalogView {
  if (tab === "my-requests") return "requests";
  if (tab === "manage") return "manage";
  if (tab === "admin") return "admin";
  return "catalog";
}

function viewToTabParam(view: CatalogView): string | null {
  if (view === "requests") return "my-requests";
  if (view === "manage") return "manage";
  if (view === "admin") return "admin";
  return null;
}

/** API stores category as slug (e.g. hardware); cards must filter by id OR label. */
function catalogItemMatchesCategory(item: { category?: string | null }, categoryId: string | null): boolean {
  if (!categoryId) return true;
  const def = CATALOG_CATEGORIES.find((c) => c.id === categoryId);
  const v = item.category ?? "";
  return v === categoryId || (!!def && v === def.label);
}

function catalogItemTitle(item: { name?: string | null; title?: string | null }): string {
  return (item.name ?? item.title ?? "").trim() || "Catalog item";
}

function catalogItemDeliveryLabel(item: { deliveryTime?: string | null; slaDays?: number | null }): string {
  if (item.deliveryTime) return item.deliveryTime;
  const d = item.slaDays ?? 3;
  return `${d} day${d === 1 ? "" : "s"} SLA`;
}

const REQ_STATE_CONFIG: Record<string, { label: string; color: string }> = {
  submitted:        { label: "Submitted",         color: "text-blue-700 bg-blue-100" },
  pending_approval: { label: "Pending Approval",  color: "text-yellow-700 bg-yellow-100" },
  approved:         { label: "Approved",          color: "text-green-700 bg-green-100" },
  fulfilling:       { label: "Fulfilling",        color: "text-indigo-700 bg-indigo-100" },
  completed:        { label: "Completed",         color: "text-green-800 bg-green-100" },
  rejected:         { label: "Rejected",          color: "text-red-700 bg-red-100" },
  cancelled:        { label: "Cancelled",         color: "text-muted-foreground bg-muted" },
  in_progress:      { label: "In progress",       color: "text-blue-700 bg-blue-100" },
  closed:           { label: "Closed",            color: "text-muted-foreground bg-muted" },
};

function formatCatalogDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function catalogRequestExpectedBy(
  createdAt: string | Date | null | undefined,
  slaDays: number | null | undefined,
): string {
  if (!createdAt) return "—";
  const c = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const days = Math.max(1, slaDays ?? 3);
  return formatCatalogDate(new Date(c.getTime() + days * 86400000));
}

// ── Form Builder Modal ────────────────────────────────────────────────────────

type FieldType = "text" | "textarea" | "number" | "email" | "date" | "dropdown" | "checkbox" | "radio" | "file" | "user_picker";

const FIELD_TYPES: { type: FieldType; label: string; icon: React.ElementType }[] = [
  { type: "text",        label: "Short Text",    icon: Type },
  { type: "textarea",    label: "Long Text",     icon: AlignLeft },
  { type: "number",      label: "Number",        icon: Hash },
  { type: "email",       label: "Email",         icon: Mail },
  { type: "date",        label: "Date",          icon: Calendar },
  { type: "dropdown",    label: "Dropdown",      icon: List },
  { type: "checkbox",    label: "Checkbox",      icon: ToggleLeft },
  { type: "radio",       label: "Radio",         icon: Circle },
  { type: "file",        label: "File Upload",   icon: FileUp },
  { type: "user_picker", label: "User Picker",   icon: User },
];

interface FormField { id: string; label: string; type: FieldType; required: boolean; options?: string[]; helpText?: string; }

function FormBuilderModal({ item, onClose, onSave, saving }: {
  item: any;
  onClose: () => void;
  onSave: (fields: FormField[]) => void;
  saving: boolean;
}) {
  const [fields, setFields] = useState<FormField[]>(item.formFields ?? []);
  const [editingField, setEditingField] = useState<string | null>(null);

  const addField = (type: FieldType) => {
    const id = `field_${Date.now()}`;
    setFields(f => [...f, { id, label: FIELD_TYPES.find(ft => ft.type === type)!.label, type, required: false }]);
    setEditingField(id);
  };

  const updateField = (id: string, updates: Partial<FormField>) =>
    setFields(f => f.map(field => field.id === id ? { ...field, ...updates } : field));

  const removeField = (id: string) => setFields(f => f.filter(field => field.id !== id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card text-card-foreground rounded-2xl border border-border shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-bold text-lg">Form Builder</h2>
            <p className="text-xs text-muted-foreground">Designing form for: <strong>{item.name}</strong></p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto flex gap-0">
          {/* Field type palette */}
          <div className="w-44 border-r border-border p-4 flex-shrink-0">
            <p className="text-xs font-semibold text-muted-foreground mb-3">ADD FIELDS</p>
            <div className="space-y-1">
              {FIELD_TYPES.map(ft => (
                <button
                  key={ft.type}
                  onClick={() => addField(ft.type)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-primary/10 hover:text-primary transition-colors text-left"
                >
                  <ft.icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-xs">{ft.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 p-4 space-y-3 overflow-y-auto">
            {fields.length === 0 && (
              <div className="border-2 border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
                <Settings className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Click field types on the left to add them to the form</p>
              </div>
            )}
            {fields.map((f, idx) => (
              <div key={f.id} className={`border rounded-xl p-4 transition-colors ${editingField === f.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                <div className="flex items-center gap-3 mb-2">
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium capitalize">{f.type.replace("_"," ")}</span>
                  <span className="flex-1 font-medium text-sm">{f.label}</span>
                  {f.required && <span className="text-xs text-red-500">Required</span>}
                  <button onClick={() => setEditingField(editingField === f.id ? null : f.id)} className="p-1 hover:bg-muted rounded"><Edit className="w-3.5 h-3.5" /></button>
                  <button onClick={() => removeField(f.id)} className="p-1 hover:bg-red-50 text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                {editingField === f.id && (
                  <div className="space-y-3 mt-3 pl-7">
                    <div>
                      <label className="text-xs font-medium block mb-1">Label *</label>
                      <input value={f.label} onChange={e => updateField(f.id, { label: e.target.value })} className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background" />
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">Help Text</label>
                      <input value={f.helpText ?? ""} onChange={e => updateField(f.id, { helpText: e.target.value })} className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background" placeholder="Hint for the user" />
                    </div>
                    {(f.type === "dropdown" || f.type === "radio") && (
                      <div>
                        <label className="text-xs font-medium block mb-1">Options (one per line)</label>
                        <textarea rows={3} value={(f.options ?? []).join("\n")} onChange={e => updateField(f.id, { options: e.target.value.split("\n").filter(Boolean) })} className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background resize-none" placeholder="Option 1&#10;Option 2&#10;Option 3" />
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={f.required} onChange={e => updateField(f.id, { required: e.target.checked })} className="rounded" />
                      <span className="text-xs">Required field</span>
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 border-t border-border flex-shrink-0 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{fields.length} field{fields.length !== 1 ? "s" : ""} configured</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
            <button disabled={saving} onClick={() => onSave(fields)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              {saving ? "Saving..." : "Save Form Design"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CatalogPageClient() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tabPending, startTabTransition] = useTransition();
  /** URL is the only source of truth — avoids RSC refetch loops from useState + router.replace fighting. */
  const view = useMemo(() => tabParamToView(tabParam), [tabParam]);

  const [search, setSearch] = useState("");
  /** Category card selection uses stable ids (matches DB `category`), not display labels. */
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const setViewFromTab = useCallback(
    (next: CatalogView) => {
      if (tabParamToView(tabParam) === next) return;
      const p = viewToTabParam(next);
      const url = p ? `${pathname}?tab=${p}` : pathname;
      startTabTransition(() => {
        router.replace(url, { scroll: false });
      });
    },
    [pathname, router, tabParam],
  );
  const [requestedItem, setRequestedItem] = useState<string | null>(null);
  const [expandedReqId, setExpandedReqId] = useState<string | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [formBuilderItem, setFormBuilderItem] = useState<any | null>(null);
  const [itemForm, setItemForm] = useState({
    name: "",
    description: "",
    category: "hardware",
    price: "",
    slaDays: "3",
    approvalRequired: false,
    fulfillmentGroup: "",
  });

  const utils = trpc.useUtils();
  const { data: catalogData, isLoading: catalogListLoading, refetch: refetchCatalog } = trpc.catalog.listItems.useQuery({}, mergeTrpcQueryOpts("catalog.listItems", { refetchOnWindowFocus: false },));
  const { data: requestsData, isLoading: requestsLoading, refetch: refetchRequests } = trpc.catalog.listRequests.useQuery({ myRequests: true }, mergeTrpcQueryOpts("catalog.listRequests", { refetchOnWindowFocus: false },));

  const { data: catalogStats } = trpc.catalog.stats.useQuery(undefined, mergeTrpcQueryOpts("catalog.stats", undefined));

  const createItem = trpc.catalog.createItem.useMutation({
    onSuccess: () => {
      import("sonner").then(({ toast }) => toast.success("Catalog item created"));
      setShowAddItem(false);
      setItemForm({ name: "", description: "", category: "hardware", price: "", slaDays: "3", approvalRequired: false, fulfillmentGroup: "" });
      refetchCatalog();
      utils.catalog.listItems.invalidate();
    },
    onError: (e: any) => import("sonner").then(({ toast }) => toast.error(e?.message ?? "Failed to create item")),
  });

  const updateItem = trpc.catalog.updateItem.useMutation({
    onSuccess: () => {
      import("sonner").then(({ toast }) => toast.success("Item form updated"));
      setFormBuilderItem(null);
      refetchCatalog();
    },
    onError: (e: any) => import("sonner").then(({ toast }) => toast.error(e?.message ?? "Failed to update")),
  });

  const submitRequest = trpc.catalog.submitRequest.useMutation({
    onSuccess: (_, vars) => {
      setRequestedItem(vars.itemId);
      refetchRequests();
      utils.catalog.listRequests.invalidate();
      import("sonner").then(({ toast }) => toast.success("Service request submitted successfully"));
    },
    onError: (e: any) => import("sonner").then(({ toast }) => toast.error(e?.message ?? "Failed to submit request")),
  });

  const adminQueueEnabled = view === "admin" && (can("catalog", "admin") || can("catalog", "write"));
  const { data: queueRequests, isLoading: queueLoading, refetch: refetchQueue } = trpc.catalog.listRequests.useQuery({}, mergeTrpcQueryOpts("catalog.listRequests", { enabled: adminQueueEnabled, refetchOnWindowFocus: false },));

  const approveRequestMut = trpc.catalog.approveRequest.useMutation({
    onSuccess: () => {
      toast.success("Request updated");
      refetchQueue();
      utils.catalog.stats.invalidate();
      utils.catalog.listRequests.invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update request"),
  });

  const startFulfilmentMut = trpc.catalog.startFulfilment.useMutation({
    onSuccess: () => {
      toast.success("Fulfilment ticket created");
      refetchQueue();
      utils.catalog.stats.invalidate();
      utils.catalog.listRequests.invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not start fulfilment"),
  });

  const fulfillRequestMut = trpc.catalog.fulfillRequest.useMutation({
    onSuccess: () => {
      toast.success("Request marked complete");
      refetchQueue();
      utils.catalog.stats.invalidate();
      utils.catalog.listRequests.invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not complete request"),
  });

  if (!can("catalog", "read")) return <AccessDenied module="Service Catalog" />;

  const catalogItems = (catalogData ?? []) as any[];
  const myRequests = (requestsData ?? []) as any[];

  const canOpenTicket = can("incidents", "write") || can("requests", "write");

  const filteredItems = catalogItems.filter((item: any) => {
    const q = search.trim().toLowerCase();
    const title = catalogItemTitle(item).toLowerCase();
    const desc = (item.description ?? "").toLowerCase();
    const matchesSearch = !q || title.includes(q) || desc.includes(q);
    return matchesSearch && catalogItemMatchesCategory(item, activeCategoryId);
  });

  const tabBtn = (key: CatalogView, label: ReactNode) => (
    <button
      type="button"
      disabled={tabPending}
      onClick={() => setViewFromTab(key)}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
        view === key
          ? "bg-background text-foreground shadow-sm ring-1 ring-border"
          : "text-muted-foreground hover:text-foreground",
        tabPending && "opacity-60",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-w-0 max-w-[1600px] flex-col gap-4">
      {/* Module header — matches enterprise tab rail (segmented control, not loose bordered pills) */}
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-foreground">Service Catalog</h1>
            <p className="text-[11px] text-muted-foreground">Self-service portal — browse, request, and manage catalog items</p>
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Catalog views"
          className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-1"
        >
          {tabBtn("catalog", "Catalog")}
          {tabBtn("requests", <>My Requests ({myRequests.length})</>)}
          {can("catalog", "write") && tabBtn("manage", "Manage Items")}
          {can("catalog", "admin") && (
            <button
              type="button"
              disabled={tabPending}
              onClick={() => setViewFromTab("admin")}
              className={cn(
                "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                view === "admin"
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
                tabPending && "opacity-60",
              )}
            >
              <Settings className="h-3 w-3 shrink-0" /> Admin
            </button>
          )}
        </div>
      </div>

      {view === "catalog" && (
        <>
          {/* Search */}
          <div className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border rounded">
            <Search className="w-4 h-4 text-muted-foreground/70 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search the service catalog..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-[13px] text-foreground/80 placeholder:text-muted-foreground/70 outline-none flex-1"
            />
          </div>

          {/* Category grid */}
          <div className="grid grid-cols-4 gap-2">
            {CATALOG_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const liveCount = catalogItems.filter((item: any) => item.category === cat.id || item.category === cat.label).length;
              const countLine = catalogListLoading ? "Loading…" : `${liveCount} item${liveCount === 1 ? "" : "s"}`;
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setActiveCategoryId(activeCategoryId === cat.id ? null : cat.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded border text-left transition-all
                    ${activeCategoryId === cat.id
                      ? cat.color + " border-opacity-100"
                      : "bg-card border-border hover:border-slate-300"
                    }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${activeCategoryId === cat.id ? cat.color.split(" ")[0] : "text-muted-foreground/70"}`} />
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-foreground/80 truncate">{cat.label}</div>
                    <div className="text-[10px] text-muted-foreground/70">{countLine}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Items grid — shown below categories; each card has Order Now */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {activeCategoryId
                  ? `Items — ${CATALOG_CATEGORIES.find((c) => c.id === activeCategoryId)?.label ?? "Category"}`
                  : "All catalog items"}
              </h2>
              {activeCategoryId && (
                <button
                  type="button"
                  onClick={() => setActiveCategoryId(null)}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Show all categories
                </button>
              )}
            </div>
            {filteredItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center">
                <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground">
                  {catalogItems.length === 0
                    ? "No catalog items yet"
                    : activeCategoryId || search.trim()
                      ? "No items match this filter"
                      : "No items to show"}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {catalogItems.length === 0
                    ? can("catalog", "write")
                      ? "Create items below, or seed the database if your project ships demo catalog data."
                      : "Ask an admin to grant catalog write access, or run a database seed if your environment includes demo catalog data."
                    : "Try another category, clear search, or click Show all categories."}
                </p>
                {catalogItems.length === 0 && can("catalog", "write") && (
                  <button
                    type="button"
                    onClick={() => {
                      setViewFromTab("manage");
                      setShowAddItem(true);
                      if (activeCategoryId) {
                        setItemForm((f) => ({ ...f, category: activeCategoryId }));
                      }
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" />
                    Add catalog item
                  </button>
                )}
              </div>
            ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item: any) => {
              const Icon = item.icon ?? Package;
              return (
                <div
                  key={item.id}
                  className="bg-card border border-border rounded-lg hover:border-primary/40 hover:shadow-sm transition-all p-4 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex items-center gap-1">
                      {item.popular && (
                        <span className="flex items-center gap-0.5 text-[10px] text-yellow-600">
                          <Star className="w-3 h-3 fill-yellow-400 stroke-yellow-500" /> Popular
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">{catalogItemTitle(item)}</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{item.description ?? "—"}</p>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-3 h-3" /> {catalogItemDeliveryLabel(item)}
                    </span>
                    {item.approvalRequired ? (
                      <span className="text-yellow-600 flex items-center gap-0.5">
                        <Shield className="w-3 h-3" /> Approval required
                      </span>
                    ) : (
                      <span className="text-green-600 flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" /> Auto-approved
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={submitRequest.isPending && submitRequest.variables?.itemId === item.id}
                    onClick={() => {
                      if (requestedItem === item.id) return;
                      if (item.id && /^[0-9a-f-]{36}$/i.test(item.id)) {
                        submitRequest.mutate({ itemId: item.id });
                      } else {
                        setRequestedItem(item.id);
                        toast.success("Service request submitted");
                      }
                    }}
                    className={`mt-auto flex items-center justify-center gap-1 px-3 py-1.5 text-[12px] font-medium rounded transition-colors
                      ${requestedItem === item.id
                        ? "bg-green-100 text-green-700 border border-green-300"
                        : "bg-primary text-white hover:bg-primary/90"
                      }`}
                  >
                    {requestedItem === item.id ? (
                      <><CheckCircle2 className="w-3 h-3" /> Requested!</>
                    ) : (
                      <><Plus className="w-3 h-3" /> Order Now</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
            )}
          </div>
        </>
      )}

      {view === "requests" && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] text-muted-foreground">
              Requests are created from the <strong className="text-foreground">Catalog</strong> tab by choosing an item and
              clicking <strong className="text-foreground">Order Now</strong>. For ad-hoc IT work, open a ticket instead.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setViewFromTab("catalog")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-[11px] font-medium hover:bg-muted/60"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                Browse catalog
              </button>
              {canOpenTicket && (
                <Link
                  href="/app/tickets/new"
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <TicketIcon className="h-3.5 w-3.5" />
                  New ticket
                </Link>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                My service requests
              </span>
              {requestsLoading && <span className="text-[10px] text-muted-foreground animate-pulse">Loading…</span>}
            </div>
            {requestsLoading ? (
              <div className="space-y-0 divide-y divide-border px-3 py-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : myRequests.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground">You have no catalog requests yet</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Go to the catalog, pick a service, and use Order Now to submit one.
                </p>
                <button
                  type="button"
                  onClick={() => setViewFromTab("catalog")}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Browse catalog
                </button>
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Item</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Target by</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {myRequests.map((req: any) => {
                    const statusKey = String(req.status ?? "");
                    const sCfg = REQ_STATE_CONFIG[statusKey];
                    const isExpanded = expandedReqId === req.id;
                    const itemLabel =
                      req.item?.name ??
                      (typeof req.item === "string" ? req.item : null) ??
                      "Unknown item (item may have been removed)";
                    const refShort = String(req.id ?? "").replace(/-/g, "").slice(0, 8).toUpperCase();
                    const submitted = formatCatalogDate(req.createdAt);
                    const expected = catalogRequestExpectedBy(req.createdAt, req.item?.slaDays);
                    const formKeys =
                      req.formData && typeof req.formData === "object" && !Array.isArray(req.formData)
                        ? Object.keys(req.formData as object)
                        : [];
                    return (
                      <Fragment key={req.id}>
                        <tr className={isExpanded ? "bg-muted/20" : ""}>
                          <td className="font-mono text-[11px] font-medium text-primary" title={req.id}>
                            {refShort || "—"}
                          </td>
                          <td className="text-foreground">{itemLabel}</td>
                          <td>
                            <span className={`status-badge ${sCfg?.color ?? "text-muted-foreground bg-muted"}`}>
                              {sCfg?.label ?? (statusKey.replace(/_/g, " ") || "—")}
                            </span>
                          </td>
                          <td className="text-muted-foreground">{submitted}</td>
                          <td className="text-muted-foreground">{expected}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => setExpandedReqId(isExpanded ? null : req.id)}
                              className="flex items-center gap-0.5 text-[11px] text-primary hover:underline"
                            >
                              {isExpanded ? "Close" : "View"}{" "}
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-muted/10">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="grid grid-cols-1 gap-4 text-[11px] sm:grid-cols-3">
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                    Request ID
                                  </span>
                                  <p className="mt-0.5 font-mono font-semibold text-primary">{req.id}</p>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Item</span>
                                  <p className="mt-0.5 font-medium text-foreground">{itemLabel}</p>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Status</span>
                                  <p className="mt-0.5">
                                    <span className={`status-badge ${sCfg?.color ?? "text-muted-foreground bg-muted"}`}>
                                      {sCfg?.label ?? statusKey}
                                    </span>
                                  </p>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                    Submitted
                                  </span>
                                  <p className="mt-0.5 text-foreground">{submitted}</p>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                    Target by
                                  </span>
                                  <p className="mt-0.5 text-foreground">{expected}</p>
                                </div>
                                {req.notes && (
                                  <div className="sm:col-span-3">
                                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Notes</span>
                                    <p className="mt-0.5 text-foreground">{req.notes}</p>
                                  </div>
                                )}
                                {formKeys.length > 0 && (
                                  <div className="sm:col-span-3">
                                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                      Form details
                                    </span>
                                    <pre className="mt-1 max-h-40 overflow-auto rounded border border-border bg-background p-2 text-[10px]">
                                      {JSON.stringify(req.formData, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {req.fulfillmentTicketId && (
                                  <div className="sm:col-span-3">
                                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                      Fulfilment ticket
                                    </span>
                                    <p className="mt-0.5">
                                      <Link
                                        href={`/app/tickets/${req.fulfillmentTicketId}`}
                                        className="text-[11px] font-mono text-primary hover:underline"
                                      >
                                        Open in service desk
                                      </Link>
                                    </p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Manage Items (admin) ─────────────────────────────────── */}
      {view === "manage" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-foreground">Catalog Items</span>
            <button
              type="button"
              onClick={() => setShowAddItem(v => !v)}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
            >
              <Plus className="w-3 h-3" /> {showAddItem ? "Cancel" : "Add Item"}
            </button>
          </div>

          {showAddItem && (
            <div className="bg-card border border-primary/30 rounded p-4">
              <h3 className="text-[12px] font-semibold text-foreground mb-3">New Catalog Item</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-[11px] text-muted-foreground">Item Name *</label>
                  <input
                    className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                    placeholder="e.g. Laptop - MacBook Pro 14&quot;"
                    value={itemForm.name}
                    onChange={(e) => setItemForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Category</label>
                  <select
                    className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                    value={itemForm.category}
                    onChange={(e) => setItemForm(f => ({ ...f, category: e.target.value }))}
                  >
                    {CATALOG_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="text-[11px] text-muted-foreground">Description</label>
                  <input
                    className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                    placeholder="Brief description of the item"
                    value={itemForm.description}
                    onChange={(e) => setItemForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Price (₹)</label>
                  <input
                    type="number"
                    className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                    placeholder="0"
                    value={itemForm.price}
                    onChange={(e) => setItemForm(f => ({ ...f, price: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">SLA Days</label>
                  <input
                    type="number"
                    className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                    value={itemForm.slaDays}
                    onChange={(e) => setItemForm(f => ({ ...f, slaDays: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Fulfillment Group</label>
                  <input
                    className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background"
                    placeholder="e.g. IT Hardware Team"
                    value={itemForm.fulfillmentGroup}
                    onChange={(e) => setItemForm(f => ({ ...f, fulfillmentGroup: e.target.value }))}
                  />
                </div>
                <div className="col-span-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="approvalRequired"
                    checked={itemForm.approvalRequired}
                    onChange={(e) => setItemForm(f => ({ ...f, approvalRequired: e.target.checked }))}
                    className="rounded border-border"
                  />
                  <label htmlFor="approvalRequired" className="text-[11px] text-muted-foreground cursor-pointer">
                    Requires approval before fulfillment
                  </label>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  disabled={!itemForm.name || createItem.isPending}
                  onClick={() => createItem.mutate({
                    name: itemForm.name,
                    description: itemForm.description || undefined,
                    category: itemForm.category,
                    price: itemForm.price || undefined,
                    slaDays: parseInt(itemForm.slaDays) || 3,
                    approvalRequired: itemForm.approvalRequired,
                    fulfillmentGroup: itemForm.fulfillmentGroup || undefined,
                  })}
                  className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {createItem.isPending ? "Creating…" : "Create Item"}
                </button>
                <button onClick={() => setShowAddItem(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded overflow-hidden">
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>SLA Days</th>
                  <th>Fulfillment Group</th>
                  <th>Approval</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {catalogItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground text-[12px]">
                      No catalog items yet. Add items to populate the service catalog.
                    </td>
                  </tr>
                ) : catalogItems.map((item: any) => (
                  <tr key={item.id}>
                    <td className="font-medium text-foreground">{item.name}</td>
                    <td className="text-muted-foreground capitalize">{item.category ?? "—"}</td>
                    <td className="text-muted-foreground font-mono text-[11px]">{item.price ? `₹${item.price}` : "—"}</td>
                    <td className="text-muted-foreground text-center">{item.slaDays ?? 3}</td>
                    <td className="text-muted-foreground text-[11px]">{item.fulfillmentGroup ?? "—"}</td>
                    <td>
                      {item.approvalRequired ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">Required</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">Auto</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge capitalize ${item.status === "active" ? "text-green-700 bg-green-100" : "text-muted-foreground bg-muted"}`}>
                        {item.status ?? "active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Admin / Stats View ─────────────────────────────────────────────────── */}
      {view === "admin" && (
        <div className="space-y-4">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Active Items",      value: catalogStats?.totalItems ?? 0,     color: "text-blue-600 bg-blue-50" },
              { label: "Total Requests",    value: catalogStats?.totalRequests ?? 0,  color: "text-indigo-600 bg-indigo-50" },
              { label: "Pending Approval",  value: catalogStats?.pendingApproval ?? 0, color: "text-amber-600 bg-amber-50" },
              { label: "Completed",         value: catalogStats?.completed ?? 0,       color: "text-green-600 bg-green-50" },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                <div className={`p-2 rounded-xl ${s.color}`}><ShoppingCart className="w-4 h-4" /></div>
                <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
              </div>
            ))}
          </div>

          {adminQueueEnabled && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-sm">Service request queue</h3>
                {queueLoading && <span className="text-[10px] text-muted-foreground animate-pulse">Loading…</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {["Item", "Status", "Submitted", "Ticket", "Actions"].map((h) => (
                        <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {((queueRequests ?? []) as any[]).length === 0 && !queueLoading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-[12px]">
                          No catalog requests yet.
                        </td>
                      </tr>
                    ) : (
                      ((queueRequests ?? []) as any[]).map((r: any) => {
                        const st = REQ_STATE_CONFIG[String(r.status ?? "")];
                        const canAct = can("catalog", "write");
                        return (
                          <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                            <td className="px-4 py-2">
                              <div className="font-medium text-foreground">{r.item?.name ?? "—"}</div>
                              <div className="text-[10px] font-mono text-muted-foreground">{String(r.id).slice(0, 8)}…</div>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${st?.color ?? "bg-muted text-muted-foreground"}`}>
                                {st?.label ?? r.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">{formatCatalogDate(r.createdAt)}</td>
                            <td className="px-4 py-2">
                              {r.fulfillmentTicketId ? (
                                <Link
                                  href={`/app/tickets/${r.fulfillmentTicketId}`}
                                  className="text-xs text-primary hover:underline font-mono"
                                >
                                  Open
                                </Link>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex flex-wrap gap-1">
                                {r.status === "pending_approval" && can("catalog", "admin") && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={approveRequestMut.isPending}
                                      onClick={() => approveRequestMut.mutate({ id: r.id, approve: true })}
                                      className="rounded bg-green-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      disabled={approveRequestMut.isPending}
                                      onClick={() => {
                                        const reason = typeof window !== "undefined" ? window.prompt("Reject reason (optional)") : null;
                                        approveRequestMut.mutate({ id: r.id, approve: false, reason: reason ?? undefined });
                                      }}
                                      className="rounded border border-border px-2 py-0.5 text-[10px] font-medium hover:bg-muted disabled:opacity-50"
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                                {["submitted", "approved"].includes(String(r.status)) && !r.fulfillmentTicketId && canAct && (
                                  <button
                                    type="button"
                                    disabled={startFulfilmentMut.isPending}
                                    onClick={() => startFulfilmentMut.mutate({ id: r.id })}
                                    className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                                  >
                                    Start fulfilment
                                  </button>
                                )}
                                {["fulfilling", "approved"].includes(String(r.status)) && canAct && (
                                  <button
                                    type="button"
                                    disabled={fulfillRequestMut.isPending}
                                    onClick={() => fulfillRequestMut.mutate({ id: r.id })}
                                    className="rounded bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                                  >
                                    Mark complete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Items with Form Builder */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-sm">Catalog Items — Form Builder</h3>
              <p className="text-xs text-muted-foreground">Click "Design Form" to add custom fields to any catalog item</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>{["Name","Category","Fields","SLA","Approval","Status","Actions"].map(h => <th key={h} className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
              </thead>
              <tbody>
                {catalogItems.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No items. Switch to Manage Items to create some.</td></tr>}
                {catalogItems.map((item: any) => (
                  <tr key={item.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-xs capitalize text-muted-foreground">{item.category ?? "—"}</td>
                    <td className="px-4 py-3"><span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{(item.formFields ?? []).length} fields</span></td>
                    <td className="px-4 py-3 text-xs">{item.slaDays ?? 3}d</td>
                    <td className="px-4 py-3 text-xs">{item.approvalRequired ? "✓ Required" : "Auto"}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-1.5 py-0.5 rounded capitalize ${item.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{item.status}</span></td>
                    <td className="px-4 py-3">
                      <button onClick={() => setFormBuilderItem(item)} className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                        <Settings className="w-3 h-3" /> Design Form
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Form Builder Modal ────────────────────────────────────────────────── */}
      {formBuilderItem && (
        <FormBuilderModal
          item={formBuilderItem}
          onClose={() => setFormBuilderItem(null)}
          onSave={(fields) => updateItem.mutate({ id: formBuilderItem.id, formFields: fields })}
          saving={updateItem.isPending}
        />
      )}
    </div>
  );
}
