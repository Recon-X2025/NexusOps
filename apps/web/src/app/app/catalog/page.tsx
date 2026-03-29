"use client";

import { useState } from "react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import {
  ShoppingCart,
  Search,
  Monitor,
  Wifi,
  Shield,
  User,
  Package,
  Wrench,
  BookOpen,
  Phone,
  Globe,
  Key,
  HardDrive,
  Star,
  Clock,
  ChevronRight,
  Plus,
  CheckCircle2,
} from "lucide-react";

const CATALOG_CATEGORIES = [
  {
    id: "hardware",
    label: "Hardware",
    icon: Monitor,
    color: "text-blue-700 bg-blue-50 border-blue-200",
    count: 14,
  },
  {
    id: "software",
    label: "Software & Licensing",
    icon: Key,
    color: "text-purple-700 bg-purple-50 border-purple-200",
    count: 22,
  },
  {
    id: "network",
    label: "Network & Access",
    icon: Wifi,
    color: "text-indigo-700 bg-indigo-50 border-indigo-200",
    count: 8,
  },
  {
    id: "security",
    label: "Security & Identity",
    icon: Shield,
    color: "text-red-700 bg-red-50 border-red-200",
    count: 11,
  },
  {
    id: "onboarding",
    label: "Onboarding / Offboarding",
    icon: User,
    color: "text-green-700 bg-green-50 border-green-200",
    count: 6,
  },
  {
    id: "facilities",
    label: "Facilities",
    icon: Wrench,
    color: "text-yellow-700 bg-yellow-50 border-yellow-200",
    count: 9,
  },
  {
    id: "storage",
    label: "Storage & Backup",
    icon: HardDrive,
    color: "text-foreground/80 bg-muted/30 border-slate-200",
    count: 5,
  },
  {
    id: "telecom",
    label: "Telecom & Mobility",
    icon: Phone,
    color: "text-cyan-700 bg-cyan-50 border-cyan-200",
    count: 7,
  },
];

const REQ_STATE_CONFIG: Record<string, { label: string; color: string }> = {
  pending_approval: { label: "Pending Approval", color: "text-yellow-700 bg-yellow-100" },
  approved:         { label: "Approved",          color: "text-green-700 bg-green-100" },
  in_progress:      { label: "In Fulfillment",    color: "text-blue-700 bg-blue-100" },
  closed:           { label: "Closed",            color: "text-muted-foreground bg-muted" },
  cancelled:        { label: "Cancelled",         color: "text-red-700 bg-red-100" },
};

export default function CatalogPage() {
  const { can } = useRBAC();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [view, setView] = useState<"catalog" | "requests">("catalog");
  const [requestedItem, setRequestedItem] = useState<string | null>(null);

  const { data: catalogData } = trpc.catalog.listItems.useQuery(
    {},
    { refetchOnWindowFocus: false },
  );
  const { data: requestsData } = trpc.catalog.listRequests.useQuery(
    { myRequests: true },
    { refetchOnWindowFocus: false },
  );

  if (!can("catalog", "read")) return <AccessDenied module="Service Catalog" />;

  const catalogItems = (catalogData ?? []) as any[];
  const myRequests = (requestsData ?? []) as any[];

  const filteredItems = catalogItems.filter((item: any) => {
    const matchesSearch =
      !search ||
      item.title?.toLowerCase().includes(search.toLowerCase()) ||
      item.description?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !activeCategory || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Service Catalog</h1>
          <span className="text-[11px] text-muted-foreground/70">Self-Service Portal</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("catalog")}
            className={`px-3 py-1 text-[11px] rounded border transition-colors ${view === "catalog" ? "bg-primary text-white border-primary" : "text-muted-foreground border-border hover:bg-muted/30"}`}
          >
            Catalog
          </button>
          <button
            onClick={() => setView("requests")}
            className={`px-3 py-1 text-[11px] rounded border transition-colors ${view === "requests" ? "bg-primary text-white border-primary" : "text-muted-foreground border-border hover:bg-muted/30"}`}
          >
            My Requests ({myRequests.length})
          </button>
        </div>
      </div>

      {view === "catalog" ? (
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
              const displayCount = liveCount > 0 ? liveCount : cat.count;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(activeCategory === cat.label ? null : cat.label)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded border text-left transition-all
                    ${activeCategory === cat.label
                      ? cat.color + " border-opacity-100"
                      : "bg-card border-border hover:border-slate-300"
                    }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${activeCategory === cat.label ? cat.color.split(" ")[0] : "text-muted-foreground/70"}`} />
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-foreground/80 truncate">{cat.label}</div>
                    <div className="text-[10px] text-muted-foreground/70">{displayCount} items</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Items grid */}
          <div className="grid grid-cols-3 gap-3">
            {filteredItems.map((item: any) => {
              const Icon = item.icon ?? Package;
              const justRequested = requestedItem === item.id;
              return (
                <div
                  key={item.id}
                  className="bg-card border border-border rounded hover:border-primary/40 hover:shadow-sm transition-all p-4 flex flex-col gap-2"
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
                    <h3 className="text-[13px] font-semibold text-foreground">{item.title}</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-3 h-3" /> {item.deliveryTime}
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
                    onClick={() => setRequestedItem(item.id)}
                    className={`mt-auto flex items-center justify-center gap-1 px-3 py-1.5 text-[12px] font-medium rounded transition-colors
                      ${justRequested
                        ? "bg-green-100 text-green-700 border border-green-300"
                        : "bg-primary text-white hover:bg-primary/90"
                      }`}
                  >
                    {justRequested ? (
                      <><CheckCircle2 className="w-3 h-3" /> Requested!</>
                    ) : (
                      <><Plus className="w-3 h-3" /> Order Now</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* My Requests view */
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              My Service Requests
            </span>
          </div>
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th>Request #</th>
                <th>Item</th>
                <th>State</th>
                <th>Submitted</th>
                <th>Expected By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.map((req: any) => {
                const sCfg = REQ_STATE_CONFIG[req.state as keyof typeof REQ_STATE_CONFIG];
                return (
                  <tr key={req.id}>
                    <td className="text-primary font-medium">{req.id}</td>
                    <td className="text-foreground">{req.item}</td>
                    <td>
                      <span className={`status-badge ${sCfg?.color ?? ""}`}>{sCfg?.label ?? req.state}</span>
                    </td>
                    <td className="text-muted-foreground">{req.submittedOn}</td>
                    <td className="text-muted-foreground">{req.expectedBy}</td>
                    <td>
                      <button className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                        View <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
