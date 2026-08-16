"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Key, AlertTriangle, Plus, Download, Search, RefreshCw, X, Info } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { downloadCSV } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

const SAM_TABS = [
  { key: "dashboard",    label: "License Dashboard",   module: "sam" as const, action: "read"  as const },
  { key: "software",     label: "Software Catalog",    module: "sam" as const, action: "read"  as const },
  { key: "compliance",   label: "Compliance Position", module: "sam" as const, action: "read"  as const },
  // The "Optimization" tab was REMOVED. It rendered a hardcoded empty panel with
  // no query behind it — "Recommendations will appear after license discovery
  // data is collected", for a discovery feature that does not exist. Its only
  // real content would have been the under-utilized rows of the reconciliation,
  // which now appear on Compliance Position with their unused-seat count, so the
  // tab was a filter of another tab at best and a permanent blank at worst.
];

/**
 * Reconciliation posture → badge colour. These are the FOUR values
 * `reconcileLicense` can return (lib/sam/license-reconcile.ts) — not a separate
 * vocabulary. The old map keyed on `compliant` / `non_compliant` /
 * `under_licensed` / `over_licensed`, none of which the API has ever produced.
 */
const RECON_STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  over_deployed:  { cls: "text-red-700 bg-red-100 font-semibold", label: "over-deployed" },
  under_utilized: { cls: "text-yellow-700 bg-yellow-100",         label: "under-utilized" },
  at_parity:      { cls: "text-green-700 bg-green-100",           label: "at parity" },
  unknown:        { cls: "text-muted-foreground bg-muted",        label: "not reconciled" },
};

export default function SAMPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const visibleTabs = SAM_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "dashboard");
  const [search, setSearch] = useState("");
  const [showAddLicense, setShowAddLicense] = useState(false);
  const [licForm, setLicForm] = useState({ productName: "", vendor: "", licenseType: "subscription" as "perpetual"|"subscription"|"trial"|"open_source"|"freeware", totalSeats: "", costPerSeat: "", expiresAt: "" });
  /** Licence currently being reconciled in the "record installed count" dialog. */
  const [recordFor, setRecordFor] = useState<{ id: string; name: string; entitled: number | null } | null>(null);
  const [recordCount, setRecordCount] = useState("");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  // @ts-ignore
  const licensesQuery = trpc.assets.licenses.list.useQuery(undefined, mergeTrpcQueryOpts("assets.licenses.list", { refetchOnWindowFocus: false }));
  const vendorsQuery = trpc.procurement.vendors.list.useQuery(undefined, mergeTrpcQueryOpts("procurement.vendors.list", { refetchOnWindowFocus: false }));
  const cmdbQuery = trpc.assets.cmdb.list.useQuery(undefined, mergeTrpcQueryOpts("assets.cmdb.list", { refetchOnWindowFocus: false }));

  /**
   * The reconciliation engine (`assets.licenses.reconcile`) — real since G11 and
   * until now reachable only by a direct API call. It returns, per licence:
   * entitled / installed / assigned / delta / status / shortfall, ordered
   * audit-risk first. Every reconciliation figure on this screen comes from here,
   * so the Dashboard and Compliance tabs cannot disagree about the same licence.
   *
   * `staleTime: 0` + `refetchOnMount: "always"`: the app-wide default is a 10s
   * stale window, which is fine for a list and wrong for a compliance posture —
   * record an installed count, come back, and you would be reading the variance
   * from before your own correction. Declared ABOVE the mutations because they
   * refetch it.
   */
  const reconcileQuery = trpc.assets.licenses.reconcile.useQuery(
    undefined,
    mergeTrpcQueryOpts("assets.licenses.reconcile", { staleTime: 0, refetchOnMount: "always" }),
  );

  /**
   * Both mutations refetch the RECONCILIATION as well as the licence list.
   *
   * Creating a licence adds a row to the compliance position (as "not
   * reconciled"); assigning a seat moves its `assigned` figure. Refetching only
   * `licensesQuery` leaves the Compliance tab showing a view of the estate from
   * before the change — and the acceptance spec caught exactly that: a licence
   * created through the dialog, then "No licences on record" on the next tab.
   * This is the standing rule in CLAUDE.md — a mutation must refetch every list
   * its procedure writes, judged by what the procedure touches rather than by
   * what the screen is called.
   */
  const createLicense = trpc.assets.licenses.create.useMutation({
    onSuccess: () => {
      toast.success("License added to SAM registry");
      setShowAddLicense(false);
      setLicForm({ productName: "", vendor: "", licenseType: "subscription", totalSeats: "", costPerSeat: "", expiresAt: "" });
      void licensesQuery.refetch();
      void reconcileQuery.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  const assignLicense = trpc.assets.licenses.assign.useMutation({
    onSuccess: () => { void licensesQuery.refetch(); void reconcileQuery.refetch(); toast.success("License assigned"); },
    onError: (e: any) => { console.error("sam.licenses.assign failed:", e); toast.error(e.message || "Failed to assign license"); },
  });

  const ingestInstalled = trpc.assets.licenses.ingestInstalled.useMutation({
    onSuccess: (r: any) => {
      // Both queries move: reconcile recomputes the posture, list carries
      // installedCount/reconciledAt. Refetch both or the two tabs drift apart.
      void reconcileQuery.refetch();
      void licensesQuery.refetch();
      setRecordFor(null);
      setRecordCount("");
      toast.success(
        r?.status === "over_deployed"
          ? `Recorded — over-deployed by ${r.shortfall} seat${r.shortfall === 1 ? "" : "s"}`
          : "Installed count recorded",
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to record installed count"),
  });

  if (!can("sam", "read")) return <AccessDenied module="Software Asset Management" />;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const licenses: any[] = licensesQuery.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reconRows: any[] = reconcileQuery.data ?? [];
  const reconById = new Map<string, any>(reconRows.map((r) => [r.licenseId, r]));
  /** `reconciledAt` lives on the licence row, not on the engine's output. */
  const licenseById = new Map<string, any>(licenses.map((l) => [l.id, l]));

  const filteredLicenses = licenses.filter((l) =>
    !search ||
    (l.name ?? l.productName ?? l.software ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (l.vendor ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  /**
   * KPI tiles, rebound to figures that exist.
   *
   * Every one of these except Annual Cost previously read a field the API has
   * never returned: `l.compliance` (no such column — so "Non-Compliant Titles"
   * was permanently 0), and a "Potential Savings" figure derived from
   * `l.costPerSeat` (the column is `cost`) times a hardcoded 50% of idle seats,
   * which is a guess wearing a rupee sign. They now come from the reconciliation
   * engine, so a tile and the table beneath it state the same thing.
   */
  const overDeployed = reconRows.filter((r) => r.status === "over_deployed");
  const underUtilized = reconRows.filter((r) => r.status === "under_utilized");
  const notReconciled = reconRows.filter((r) => r.status === "unknown");
  const seatsToBuy = overDeployed.reduce((s: number, r) => s + (r.shortfall ?? 0), 0);
  const unusedSeats = underUtilized.reduce((s: number, r) => s + Math.abs(r.delta ?? 0), 0);
  // Both factors are real stored columns: `cost` (per seat, per the Add License
  // form) and `total_seats`.
  const totalCost = licenses.reduce((s: number, l) => s + (parseFloat(l.cost ?? "0") * (parseInt(l.totalSeats ?? "0") || 0)), 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-body-sm font-semibold text-foreground">Software Asset Management</h1>
          {/* No longer advertises "Optimization" — that tab is gone. */}
          <span className="text-[11px] text-muted-foreground/70">Licence registry · Seat assignment · Installed-vs-entitled reconciliation</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Disabled: this only refetched the licence list while claiming a sync
              "from connected endpoints". There are no connected endpoints. */}
          <button
            disabled
            title="Discovery is not connected in this release — no endpoints are connected, so no installed-software data is synced."
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded text-muted-foreground opacity-50 cursor-not-allowed"
          >
            <RefreshCw className="w-3 h-3" /> Sync Discovery
          </button>
          <button
            /* The export emitted Publisher (never a column), Used from
               `l.usedSeats ?? l.installed` and Total from `l.totalSeats ??
               l.licensed` — a spreadsheet of blanks handed to whoever asked for
               the licence position. It now carries the reconciliation. */
            onClick={() => downloadCSV((licensesQuery.data ?? []).map((l: any) => {
              const r = reconById.get(l.id);
              return {
                Name: l.name,
                Vendor: l.vendor ?? "",
                Type: l.type ?? "",
                Entitled: r?.entitled ?? "",
                Installed: r?.installed ?? "",
                Variance: r?.delta ?? "",
                Assigned: r?.assigned ?? 0,
                Position: RECON_STATUS_STYLE[r?.status ?? "unknown"]!.label,
                "Cost/Seat": l.cost ?? "",
                Expires: l.expiryDate ? new Date(l.expiryDate).toLocaleDateString("en-IN") : "",
                "Last Reconciled": l.reconciledAt ? new Date(l.reconciledAt).toLocaleDateString("en-IN") : "never",
              };
            }), "sam_license_reconciliation")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          <button
            onClick={() => setShowAddLicense(true)}
            className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" /> Add License
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {[
          { label: "Total Licenses",      value: licenses.length,                       color: "text-foreground/80", testId: "sam-kpi-total" },
          { label: "Annual License Cost", value: `₹${(totalCost / 1000).toFixed(0)}K`,  color: "text-foreground/80", testId: "sam-kpi-cost" },
          { label: "Over-Deployed",       value: overDeployed.length,                   color: "text-red-700",       testId: "sam-kpi-over" },
          { label: "Seats To Buy",        value: seatsToBuy,                            color: "text-orange-700",    testId: "sam-kpi-seats" },
          { label: "Unused Seats",        value: unusedSeats,                           color: "text-green-700",     testId: "sam-kpi-unused" },
        ].map((k) => (
          <div key={k.label} data-testid={k.testId} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-h4 font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {overDeployed.length > 0 && (
        <div data-testid="sam-overdeployed-banner" role="alert" className="bg-red-50 border border-red-200 rounded px-3 py-2 flex items-center gap-2 text-[12px] text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>{overDeployed.length} title{overDeployed.length === 1 ? " is" : "s are"} over-deployed</strong>
            {" "}— more installs recorded than seats owned, {seatsToBuy} seat{seatsToBuy === 1 ? "" : "s"} short:{" "}
            {overDeployed.map((r) => `${r.name} (+${r.shortfall})`).join(", ")}
          </span>
        </div>
      )}

      <div className="flex border-b border-border bg-card rounded-t">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {tab === "dashboard" && (
          <>
            <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
              <Search className="w-3 h-3 text-muted-foreground/70" />
              <input
                type="text"
                placeholder="Search software or vendor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-[12px] outline-none flex-1 placeholder:text-muted-foreground/70 bg-transparent"
              />
            </div>
            {licensesQuery.isLoading ? (
              <div className="animate-pulse p-4 space-y-2">
                {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-muted rounded" />)}
              </div>
            ) : licensesQuery.isError ? (
              <div className="text-center py-8 text-muted-foreground text-[12px]">
                <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-500" />
                Failed to load licenses. Please try again.
              </div>
            ) : filteredLicenses.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Key className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-[13px]">No licenses found</p>
              </div>
            ) : (
              /* Every column below reads a field that exists. Before this the
                 table rendered Purchased / Deployed / Available / Overage /
                 Unused / Renewal / Compliance from `l.purchased`, `l.deployed`,
                 `l.available`, `l.overage`, `l.unused`, `l.renewalDate` and
                 `l.compliance` — seven names `assets.licenses.list` has never
                 returned, so five showed 0 and two showed an em-dash forever.
                 The seat figures now come from the reconciliation engine, the
                 same source the Compliance tab uses. */
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th className="w-4" />
                    <th>Software</th>
                    <th>Vendor</th>
                    <th>Type</th>
                    <th className="text-center">Entitled</th>
                    <th className="text-center">Installed</th>
                    <th className="text-center">Assigned</th>
                    <th className="text-center">Overage</th>
                    <th className="text-center">Unused</th>
                    <th>Cost / Seat</th>
                    <th>Expires</th>
                    <th>Position</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {filteredLicenses.map((l: any) => {
                    const r = reconById.get(l.id);
                    const style = RECON_STATUS_STYLE[r?.status ?? "unknown"]!;
                    const unused = r?.status === "under_utilized" ? Math.abs(r.delta) : 0;
                    return (
                    <tr key={l.id} className={r?.status === "over_deployed" ? "bg-red-50/30" : ""}>
                      <td className="p-0"><div className={`priority-bar ${r?.status === "over_deployed" ? "bg-red-600" : r?.status === "under_utilized" ? "bg-yellow-500" : r?.status === "at_parity" ? "bg-green-500" : "bg-muted"}`} /></td>
                      <td className="font-medium text-foreground">{l.name}</td>
                      <td className="text-muted-foreground">{l.vendor ?? "—"}</td>
                      <td><span className="status-badge text-muted-foreground bg-muted">{l.type}</span></td>
                      <td className="text-center font-mono text-foreground/80">{r?.entitled ?? "—"}</td>
                      {/* null installed means "never recorded", which is not zero. */}
                      <td className="text-center font-mono text-foreground/80">{r?.installed ?? "—"}</td>
                      <td className="text-center font-mono text-foreground/80">{r?.assigned ?? 0}</td>
                      <td className="text-center">{(r?.shortfall ?? 0) > 0 ? <span className="font-bold text-red-700">+{r.shortfall}</span> : <span className="text-muted-foreground/70">—</span>}</td>
                      <td className="text-center">{unused > 0 ? <span className={unused > 20 ? "text-yellow-600 font-semibold" : "text-muted-foreground"}>{unused}</span> : "—"}</td>
                      <td className="font-mono text-[11px] text-foreground/80">{l.cost ? `₹${Number(l.cost).toLocaleString("en-IN")}` : "—"}</td>
                      <td className={`text-[11px] ${l.expiryDate && new Date(l.expiryDate) < new Date(Date.now() + 90 * 86400000) ? "text-orange-600 font-semibold" : "text-muted-foreground"}`}>{l.expiryDate ? new Date(l.expiryDate).toLocaleDateString("en-IN") : "—"}</td>
                      <td><span className={`status-badge ${style.cls}`}>{style.label}</span></td>
                      <td>
                        <button
                          className="px-2 py-0.5 text-[10px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
                          onClick={() => assignLicense.mutate({ licenseId: l.id })}
                        >
                          Assign
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === "software" && (
          <div className="p-0">
            {cmdbQuery.isLoading ? (
              <div className="animate-pulse p-4 space-y-2">
                {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-muted rounded" />)}
              </div>
            ) : cmdbQuery.isError ? (
              <div className="text-center py-8 text-muted-foreground text-[12px]">
                <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-500" />
                Failed to load software catalog. Please try again.
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th>Software / Application Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Owner</th>
                    <th>Environment</th>
                  </tr>
                </thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(cmdbQuery.data ?? []).filter((c: any) => c.ciType === "application" || c.ciType === "software").map((c: any) => (
                    <tr key={c.id}>
                      <td className="font-medium text-foreground">{c.name}</td>
                      <td><span className="status-badge text-muted-foreground bg-muted capitalize">{c.ciType}</span></td>
                      <td><span className={`status-badge capitalize ${c.status === "operational" ? "text-green-700 bg-green-100" : "text-muted-foreground bg-muted"}`}>{c.status}</span></td>
                      <td className="text-muted-foreground">{c.ownerId ?? "—"}</td>
                      <td className="text-muted-foreground">{c.environment ?? "—"}</td>
                    </tr>
                  ))}
                  {(cmdbQuery.data ?? []).filter((c: any) => c.ciType === "application" || c.ciType === "software").length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-muted-foreground">
                        <Key className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                        <p className="text-[13px]">No software CIs found in the CMDB.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Compliance Position — the reconciliation view ──────────────────
            `assets.licenses.reconcile` has existed and been correct since G11
            with no way to reach it. This is that engine, rendered. It shows only
            what the engine returns — entitled, installed, assigned, the variance
            and the posture. There is no cost column here because the engine does
            not return cost; a rupee figure would be this screen's own invention.
        */}
        {tab === "compliance" && (
          <div data-testid="sam-reconciliation">
            <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-muted-foreground/70 mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground">
                Installed counts are <strong>recorded by hand</strong>, not discovered — there is
                no endpoint or M365 connector in this release. Take the number from the vendor&apos;s
                admin console and record it against the licence; the variance below is only as
                current as the date in the last column.
              </p>
            </div>

            {reconcileQuery.isLoading ? (
              <div className="animate-pulse p-4 space-y-2">
                {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-muted rounded" />)}
              </div>
            ) : reconcileQuery.isError ? (
              <div className="text-center py-8 text-muted-foreground text-[12px]">
                <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-500" />
                Failed to run the reconciliation. Please try again.
              </div>
            ) : reconRows.length === 0 ? (
              /* A fresh tenant. Saying "0 over-deployed" here would read as a
                 clean bill of health for an estate nobody has entered yet. */
              <div data-testid="sam-recon-empty" className="text-center py-12 text-muted-foreground px-6">
                <Key className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-[13px] font-medium text-foreground">No licences on record</p>
                <p className="text-[11px] mt-1 max-w-md mx-auto">
                  There is nothing to reconcile yet — this is an empty registry, not a compliant
                  estate. Add a licence with its seat count, then record how many installs you
                  actually have.
                </p>
              </div>
            ) : (
              <>
                {notReconciled.length === reconRows.length && (
                  <div data-testid="sam-none-reconciled" className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-800">
                    None of your {reconRows.length} licence{reconRows.length === 1 ? " has" : "s have"} an
                    installed count recorded, so no compliance position can be calculated. Every row
                    below reads &ldquo;not reconciled&rdquo; — that is unknown, not compliant.
                  </div>
                )}
                <table className="ent-table w-full">
                  <thead>
                    <tr>
                      <th className="w-4" />
                      <th>Software</th>
                      <th className="text-center">Entitled</th>
                      <th className="text-center">Installed</th>
                      <th className="text-center">Variance</th>
                      <th className="text-center">Assigned</th>
                      <th>Position</th>
                      <th>Last Reconciled</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconRows.map((r: any) => {
                      const style = RECON_STATUS_STYLE[r.status]!;
                      const lic = licenseById.get(r.licenseId);
                      return (
                        <tr key={r.licenseId} data-testid={`sam-recon-row-${r.name}`} className={r.status === "over_deployed" ? "bg-red-50/30" : ""}>
                          <td className="p-0"><div className={`priority-bar ${r.status === "over_deployed" ? "bg-red-600" : r.status === "under_utilized" ? "bg-yellow-500" : r.status === "at_parity" ? "bg-green-500" : "bg-muted"}`} /></td>
                          <td className="font-medium text-foreground">{r.name}</td>
                          <td className="text-center font-mono text-foreground/80">{r.entitled ?? "—"}</td>
                          <td className="text-center font-mono text-foreground/80">{r.installed ?? "—"}</td>
                          <td data-testid={`sam-variance-${r.name}`} className="text-center font-mono">
                            {r.delta === null ? (
                              <span className="text-muted-foreground/70">—</span>
                            ) : r.delta > 0 ? (
                              <span className="font-bold text-red-700">+{r.delta}</span>
                            ) : r.delta < 0 ? (
                              <span className="text-yellow-700">{r.delta}</span>
                            ) : (
                              <span className="text-green-700">0</span>
                            )}
                          </td>
                          <td className="text-center font-mono text-foreground/80">{r.assigned}</td>
                          <td><span className={`status-badge ${style.cls}`}>{style.label}</span></td>
                          <td className="text-[11px] text-muted-foreground">
                            {lic?.reconciledAt ? new Date(lic.reconciledAt).toLocaleDateString("en-IN") : "never"}
                          </td>
                          <td>
                            {can("sam", "write") && (
                              <button
                                data-testid={`sam-record-${r.name}`}
                                onClick={() => { setRecordFor({ id: r.licenseId, name: r.name, entitled: r.entitled }); setRecordCount(r.installed !== null ? String(r.installed) : ""); }}
                                className="px-2 py-0.5 text-[10px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
                              >
                                Record installed
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
                  Variance is installed − entitled. Positive is over-deployed (seats to buy, audit
                  exposure); negative is under-utilized (seats paid for and not installed).
                  &ldquo;Assigned&rdquo; counts un-revoked seat assignments in this product and is
                  shown for context — it is not part of the variance.
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Record-installed dialog — the entry path for the one number the
          reconciliation engine cannot get anywhere else. Deliberately worded as
          "record", never "sync" or "discover": a human is typing what they read
          off a vendor console, and the screen should not dress that up. */}
      {recordFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-sm p-5 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-body-sm font-semibold">Record installed count</h2>
              <button onClick={() => setRecordFor(null)} aria-label="Close"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {recordFor.name}
              {recordFor.entitled !== null
                ? ` — ${recordFor.entitled} seat${recordFor.entitled === 1 ? "" : "s"} owned.`
                : " — no seat count recorded on this licence, so no variance can be calculated until one is set."}
            </p>
            <div className="flex flex-col gap-1">
              <label htmlFor="sam-installed-count" className="text-caption font-medium">
                Installs found <span className="text-red-500">*</span>
              </label>
              <input
                id="sam-installed-count"
                data-testid="sam-installed-input"
                type="number"
                min={0}
                value={recordCount}
                onChange={(e) => setRecordCount(e.target.value)}
                placeholder="e.g. 63"
                className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[10px] text-muted-foreground/80">
                From the vendor&apos;s admin console — Microsoft 365 admin centre, the Adobe
                console, and so on. This is not discovered automatically.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setRecordFor(null)} className="px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                data-testid="sam-installed-save"
                disabled={ingestInstalled.isPending || recordCount.trim() === "" || Number(recordCount) < 0 || !Number.isInteger(Number(recordCount))}
                onClick={() => ingestInstalled.mutate({ licenseId: recordFor.id, installedCount: Number(recordCount) })}
                className="px-4 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              >
                {ingestInstalled.isPending ? "Recording…" : "Record"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add License Modal */}
      {showAddLicense && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-body-sm font-semibold">Add Software License</h2>
              <button onClick={() => setShowAddLicense(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-caption font-medium">Product Name <span className="text-red-500">*</span></label>
                <input value={licForm.productName} onChange={(e) => setLicForm(f => ({...f, productName: e.target.value}))} placeholder="e.g. Microsoft 365, Figma" className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-caption font-medium">Vendor</label>
                <select value={licForm.vendor} onChange={(e) => setLicForm(f => ({...f, vendor: e.target.value}))} className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none">
                  <option value="">Select Vendor...</option>
                  {(vendorsQuery.data ?? []).map((v: any) => (
                    <option key={v.id} value={v.name}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-caption font-medium">License Type</label>
                <select value={licForm.licenseType} onChange={(e) => setLicForm(f => ({...f, licenseType: e.target.value as any}))} className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none">
                  {["perpetual","subscription","trial","open_source","freeware"].map(t => <option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-caption font-medium">Total Seats</label>
                <input type="number" value={licForm.totalSeats} onChange={(e) => setLicForm(f => ({...f, totalSeats: e.target.value}))} placeholder="e.g. 50" className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-caption font-medium">Cost/Seat (₹)</label>
                <input value={licForm.costPerSeat} onChange={(e) => setLicForm(f => ({...f, costPerSeat: e.target.value}))} placeholder="e.g. 2500" className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none" />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-caption font-medium">Expiry Date</label>
                <input type="date" value={licForm.expiresAt} onChange={(e) => setLicForm(f => ({...f, expiresAt: e.target.value}))} className="px-3 py-2 text-body-sm border border-border rounded bg-background focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowAddLicense(false)} className="px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={() => { if (!licForm.productName.trim()) { toast.error("Product name is required"); return; } createLicense.mutate({ productName: licForm.productName.trim(), vendor: licForm.vendor || undefined, licenseType: licForm.licenseType, totalSeats: licForm.totalSeats ? parseInt(licForm.totalSeats) : undefined, costPerSeat: licForm.costPerSeat || undefined, expiresAt: licForm.expiresAt || undefined }); }}
                disabled={createLicense.isPending}
                className="px-4 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50">
                {createLicense.isPending ? "Adding…" : "Add License"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
