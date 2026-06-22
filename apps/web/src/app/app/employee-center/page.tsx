"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import {
  Home, Search, BookOpen, ShoppingCart, TicketIcon, Bell, CheckSquare,
  Clock, AlertTriangle, Star, ChevronRight, Bot, Wrench, Shield, Users, HardDrive, FileText, Key, Monitor, Wifi
} from "lucide-react";

const CATALOG_QUICK = [
  { icon: Monitor, label: "New Laptop",      href: "/app/catalog", color: "bg-blue-50 text-blue-600 border-blue-200" },
  { icon: Key, label: "Software Access",      href: "/app/catalog", color: "bg-purple-50 text-purple-600 border-purple-200" },
  { icon: Wifi, label: "VPN Access",          href: "/app/catalog", color: "bg-green-50 text-green-600 border-green-200" },
  { icon: Users, label: "New Starter Setup",  href: "/app/catalog", color: "bg-orange-50 text-orange-600 border-orange-200" },
  { icon: Shield, label: "Security Badge",    href: "/app/catalog", color: "bg-red-50 text-red-600 border-red-200" },
  { icon: FileText, label: "HR Request",      href: "/app/hr",      color: "bg-muted/30 text-muted-foreground border-border" },
];

const STATUS_COLOR: Record<string, string> = {
  fulfilled:        "text-green-700 bg-green-100",
  in_progress:      "text-blue-700 bg-blue-100",
  pending_approval: "text-yellow-700 bg-yellow-100",
  open:             "text-red-700 bg-red-100",
  submitted:        "text-blue-700 bg-blue-100",
  cancelled:        "text-muted-foreground bg-muted",
};

export default function EmployeeCenterPage() {
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const canView = can("requests", "read") || can("catalog", "read");

  // Live catalog requests (my requests)
  const catalogRequestsQuery = trpc.catalog.listRequests.useQuery({ myRequests: true }, mergeTrpcQueryOpts("catalog.listRequests", { enabled: canView },));

  // Live open tickets count (requester-scoped — same as portal)
  const ticketsQuery = trpc.tickets.list.useQuery({ ticketScope: "mine", limit: 50, orderBy: "updatedAt", order: "desc" }, mergeTrpcQueryOpts("tickets.list", { enabled: canView },));

  // Live knowledge base articles
  const kbQuery = trpc.knowledge.list.useQuery({ limit: 4 }, mergeTrpcQueryOpts("knowledge.list", { enabled: canView }));

  if (!canView) return <AccessDenied module="Employee Center" />;

  // Map live catalog requests to display format; fall back to static data
  const rawRequests = Array.isArray(catalogRequestsQuery.data) ? catalogRequestsQuery.data : (catalogRequestsQuery.data as any)?.items ?? [];
  const liveRequests = (rawRequests as any[]).map((r: any) => ({
    id: r.id?.slice(0, 10).toUpperCase() ?? "—",
    title: r.item?.name ?? r.formData?.title ?? "Catalog Request",
    type: r.item?.category ?? "General",
    status: r.status ?? "submitted",
    updated: r.updatedAt
      ? new Date(r.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : "—",
  }));

  const myRequests = liveRequests;

  const openTicketsCount = (ticketsQuery.data?.items ?? []).filter(
    (t: { closedAt?: string | null; resolvedAt?: string | null }) => !t.closedAt && !t.resolvedAt,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Hero banner */}
      <div className="bg-gradient-to-r from-primary to-blue-700 rounded-lg p-5 text-white">
        <h1 className="text-[18px] font-bold mb-1">Employee Service Center</h1>
        <p className="text-[13px] text-white/80 mb-4">Your one-stop shop for IT support, requests, and self-service resources.</p>
        <div className="flex items-center gap-2 bg-card/20 rounded-lg px-3 py-2 max-w-md">
          <Search className="w-4 h-4 text-white/70" />
          <input
            type="text"
            placeholder="Search for help, services, or articles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[13px] text-white placeholder:text-white/60 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Quick actions + requests */}
        <div className="col-span-2 space-y-4">
          <div className="bg-card border border-border rounded overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/30">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Quick Requests</span>
            </div>
            <div className="p-3 grid grid-cols-3 gap-2">
              {CATALOG_QUICK.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.label} href={item.href}
                    className={`flex flex-col items-center gap-2 p-3 border rounded-lg hover:shadow-sm transition-all cursor-pointer ${item.color}`}>
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] font-medium text-center">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* My requests — live from catalog.listRequests */}
          <div className="bg-card border border-border rounded overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">My Open Requests</span>
                {catalogRequestsQuery.isLoading && (
                  <span className="text-[10px] text-muted-foreground/60 animate-pulse">Loading…</span>
                )}
                {openTicketsCount > 0 && (
                  <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded">
                    {openTicketsCount} open ticket{openTicketsCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <Link href="/app/catalog" className="text-[11px] text-primary hover:underline">View all</Link>
            </div>
            <div className="divide-y divide-border">
              {catalogRequestsQuery.isLoading ? (
                <div className="animate-pulse">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 gap-3">
                      <div className="flex-1 space-y-1.5">
                        <div className="flex gap-2">
                          <div className="h-4 bg-muted rounded w-24" />
                          <div className="h-4 bg-muted rounded w-16" />
                        </div>
                        <div className="h-3.5 bg-muted rounded w-2/3" />
                      </div>
                      <div className="h-4 bg-muted rounded w-12" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {myRequests.map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-primary">{r.id}</span>
                          <span className="status-badge text-muted-foreground bg-muted">{r.type}</span>
                          <span className={`status-badge capitalize ${STATUS_COLOR[r.status] ?? "text-muted-foreground bg-muted"}`}>{r.status.replace(/_/g," ")}</span>
                        </div>
                        <p className="text-[12px] text-foreground/80 mt-0.5">{r.title}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground/70">{r.updated}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70" />
                      </div>
                    </div>
                  ))}
                  {/* Open tickets from tickets router */}
                  {!ticketsQuery.isLoading && (ticketsQuery.data?.items ?? []).slice(0, 3).map((i: any) => (
                    <div key={i.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-primary">{i.number ?? i.id?.slice(0,10).toUpperCase()}</span>
                          <span className="status-badge text-orange-700 bg-orange-100">{i.priority}</span>
                          <span className="status-badge text-blue-700 bg-blue-100">{i.status}</span>
                        </div>
                        <p className="text-[12px] text-foreground/80 mt-0.5">{i.title ?? i.subject ?? "Ticket"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground/70">
                          {i.updatedAt ? new Date(i.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70" />
                      </div>
                    </div>
                  ))}
                  {myRequests.length === 0 && (
                    <div className="px-4 py-6 text-center text-[12px] text-muted-foreground/70">
                      No open requests. Use the Quick Requests above to submit one.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Popular KB */}
          <div className="bg-card border border-border rounded overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <BookOpen className="w-3.5 h-3.5 inline mr-1 text-muted-foreground/70" />Popular Articles
              </span>
              <Link href="/app/knowledge" className="text-[11px] text-primary hover:underline">Browse all</Link>
            </div>
            <div className="divide-y divide-border">
              {kbQuery.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
                    <div className="h-3 bg-muted rounded w-3/4" />
                  </div>
                ))
              ) : (kbQuery.data?.items ?? kbQuery.data as any ?? []).length === 0 ? (
                <div className="px-4 py-4 text-center text-[11px] text-muted-foreground/50">No knowledge articles available yet</div>
              ) : (kbQuery.data?.items ?? kbQuery.data as any ?? []).slice(0, 4).map((art: any) => (
                <div
                  key={art.id}
                  onClick={() => router.push(`/app/knowledge/${art.id}`)}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 cursor-pointer"
                >
                  <div>
                    <p className="text-[12px] text-foreground/80">{art.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground/70">
                      {art.views != null && <span>{(art.views as number).toLocaleString()} views</span>}
                      {art.helpful != null && <span className="text-green-600 font-medium">{art.helpful}% helpful</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-3">
          {/* Get help CTA */}
          <div className="bg-card border border-border rounded p-4">
            <div className="text-[12px] font-semibold text-foreground/80 mb-3">Get Help</div>
            <div className="space-y-2">

              <Link href="/app/tickets/new" className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors">
                <TicketIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <div>
                  <div className="text-[12px] font-medium text-blue-700">Submit a Ticket</div>
                  <div className="text-[10px] text-blue-500">For complex issues</div>
                </div>
              </Link>
              <a href="tel:+914357" className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded cursor-pointer hover:bg-green-100 transition-colors">
                <Bell className="w-4 h-4 text-green-600 flex-shrink-0" />
                <div>
                  <div className="text-[12px] font-medium text-green-700">Call Service Desk</div>
                  <div className="text-[10px] text-green-500">Ext. 4357 · Mon–Fri 7am–7pm</div>
                </div>
              </a>
            </div>
          </div>

          {/* Announcements */}
          <div className="bg-card border border-border rounded overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">IT Announcements</span>
            </div>
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/50">
              No active announcements
            </div>
          </div>

          {/* Service status */}
          <div className="bg-card border border-border rounded overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Service Status</span>
            </div>
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/50">
              Service health monitoring not configured
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
