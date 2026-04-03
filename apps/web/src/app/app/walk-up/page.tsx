"use client";

import { useState, useEffect } from "react";
import {
  Users, Clock, Calendar, CheckCircle2, Plus,
  Star, MapPin, X,
} from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const WALKUP_TABS = [
  { key: "queue",        label: "Live Queue",       module: "incidents"  as const, action: "read"  as const },
  { key: "appointments", label: "Appointments",     module: "incidents"  as const, action: "read"  as const },
  { key: "agent",        label: "Agent Workspace",  module: "incidents"  as const, action: "write" as const },
  { key: "locations",    label: "Locations",        module: "facilities" as const, action: "read"  as const },
  { key: "analytics",    label: "Analytics",        module: "reports"    as const, action: "read"  as const },
];

type VisitStatus = "waiting" | "in_service" | "on_hold" | "completed" | "no_show";
type IssueCategory = "hardware" | "software" | "access" | "network" | "mobile" | "new_device" | "other";

const CAT_CFG: Record<IssueCategory, { label: string; icon: string; color: string }> = {
  hardware:   { label: "Hardware",     icon: "🖥", color: "text-blue-700 bg-blue-100" },
  software:   { label: "Software",     icon: "💾", color: "text-purple-700 bg-purple-100" },
  access:     { label: "Access/Auth",  icon: "🔑", color: "text-orange-700 bg-orange-100" },
  network:    { label: "Network/VPN",  icon: "🌐", color: "text-teal-700 bg-teal-100" },
  mobile:     { label: "Mobile",       icon: "📱", color: "text-green-700 bg-green-100" },
  new_device: { label: "New Device",   icon: "✨", color: "text-indigo-700 bg-indigo-100" },
  other:      { label: "Other",        icon: "❓", color: "text-muted-foreground bg-muted" },
};

const STATUS_CFG: Record<VisitStatus, { label: string; color: string; bar: string }> = {
  waiting:    { label: "Waiting",    color: "text-yellow-700 bg-yellow-100",  bar: "bg-yellow-400" },
  in_service: { label: "In Service", color: "text-blue-700 bg-blue-100",     bar: "bg-blue-500" },
  on_hold:    { label: "On Hold",    color: "text-orange-700 bg-orange-100", bar: "bg-orange-400" },
  completed:  { label: "Completed",  color: "text-green-700 bg-green-100",  bar: "bg-green-500" },
  no_show:    { label: "No Show",    color: "text-muted-foreground/70 bg-muted/30",   bar: "bg-border" },
};

function SkeletonQueueItem() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border animate-pulse">
      <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-muted rounded w-1/3" />
        <div className="h-4 bg-muted rounded w-2/3" />
        <div className="h-3 bg-muted rounded w-full" />
      </div>
    </div>
  );
}

export default function WalkUpPage() {
  const { can } = useRBAC();
  const router = useRouter();
  const visibleTabs = WALKUP_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "queue");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  // @ts-ignore
  const queueQuery = trpc.walkup.queue.list.useQuery({});
  // @ts-ignore
  const apptsQuery = trpc.walkup.appointments.list.useQuery({});
  // @ts-ignore
  const analyticsQuery = trpc.walkup.analytics.useQuery({});

  // @ts-ignore
  const joinQueueMutation = trpc.walkup.queue.joinQueue.useMutation({
    onSuccess: () => { queueQuery.refetch(); toast.success("Joined queue"); },
    onError: (e: any) => { console.error("walkup.joinQueue failed:", e); toast.error(e.message || "Failed to join queue"); },
  });
  // @ts-ignore
  const callNextMutation = trpc.walkup.queue.callNext.useMutation({
    onSuccess: () => { queueQuery.refetch(); toast.success("Next visitor called"); },
    onError: (e: any) => { console.error("walkup.callNext failed:", e); toast.error(e.message || "Failed to call next"); },
  });
  // @ts-ignore
  const completeMutation = trpc.walkup.queue.complete.useMutation({
    onSuccess: () => { queueQuery.refetch(); toast.success("Visit completed"); },
    onError: (e: any) => { console.error("walkup.complete failed:", e); toast.error(e.message || "Failed to complete visit"); },
  });

  // @ts-ignore
  const holdMutation = trpc.walkup.queue.hold.useMutation({
    onSuccess: () => { queueQuery.refetch(); toast.success("Visit put on hold"); },
    onError: (e: any) => toast.error(e.message || "Failed to put on hold"),
  });

  const [showBookAppt, setShowBookAppt] = useState(false);
  const [apptForm, setApptForm] = useState({ scheduledAt: "", issueCategory: "", notes: "" });
  // @ts-ignore
  const createAppointment = trpc.walkup.appointments.create.useMutation({
    onSuccess: () => { toast.success("Appointment booked successfully"); setShowBookAppt(false); setApptForm({ scheduledAt: "", issueCategory: "", notes: "" }); apptsQuery.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to book appointment"),
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const allVisits: any[] = (Array.isArray(queueQuery.data) ? queueQuery.data : (queueQuery.data as any)?.items ?? []);
  const allAppointments: any[] = (Array.isArray(apptsQuery.data) ? apptsQuery.data : (apptsQuery.data as any)?.items ?? []);
  const analyticsData: any = analyticsQuery.data ?? null;

  const liveQueue = allVisits.filter((v: any) => v.status === "waiting");
  const inService = allVisits.filter((v: any) => v.status === "in_service");
  const todayCompleted = allVisits.filter((v: any) => v.status === "completed");
  const avgWait = liveQueue.length > 0 ? Math.round(liveQueue.reduce((s: number, v: any) => s + (v.waitMinutes ?? 0), 0) / liveQueue.length) : 0;

  return (
    <>
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Walk-Up Experience</h1>
          <span className="text-[11px] text-muted-foreground/70">IT Service Desk Counter · Live Queue · Appointments</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => joinQueueMutation.mutate({} as any)}
            className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" /> Check In Walk-Up
          </button>
          <button
            onClick={() => setShowBookAppt(true)}
            className="flex items-center gap-1 px-3 py-1 border border-border text-[11px] rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Calendar className="w-3 h-3" /> Book Appointment
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Waiting Now",      value: liveQueue.length,      color: liveQueue.length > 3 ? "text-orange-700" : "text-foreground/80", sub: "in queue" },
          { label: "Avg Wait Time",    value: `${avgWait} min`,      color: avgWait > 20 ? "text-red-700" : "text-green-700", sub: "current est." },
          { label: "In Service",       value: inService.length,      color: "text-blue-700", sub: "with agent now" },
          { label: "Completed Today",  value: todayCompleted.length, color: "text-green-700", sub: "resolved" },
          { label: "Appointments Today", value: allAppointments.filter((a: any) => { const d = a.scheduledAt ?? a.slot ?? ""; return d.startsWith(todayStr); }).length, color: "text-purple-700", sub: "scheduled" },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase">{k.label}</div>
            <div className="text-[10px] text-muted-foreground/70">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex border-b border-border bg-card rounded-t overflow-x-auto">
        {visibleTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
            {t.key === "queue" && liveQueue.length > 0 && (
              <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">{liveQueue.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {/* LIVE QUEUE */}
        {tab === "queue" && (
          <div>
            {queueQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonQueueItem key={i} />)
            ) : (
              <>
                {liveQueue.length === 0 && inService.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground/70 text-[12px]">Queue is clear — no customers waiting.</div>
                )}
                {inService.map((v: any) => {
                  const cat = CAT_CFG[v.category as IssueCategory] ?? CAT_CFG.other;
                  return (
                    <div key={v.id} className="flex items-start gap-3 px-4 py-3 bg-blue-50/40 border-b border-border">
                      <div className="w-1 self-stretch bg-blue-500 rounded-full flex-shrink-0" />
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                        {(v.employee ?? "?").split(" ").map((n: string) => n[0]).join("").slice(0,2)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-[11px] text-primary">{v.number}</span>
                          <span className={`status-badge ${STATUS_CFG.in_service.color}`}>● In Service</span>
                          <span className={`status-badge ${cat.color}`}>{cat.icon} {cat.label}</span>
                          {v.appointment && <span className="status-badge text-purple-700 bg-purple-100 text-[10px]">Appointment</span>}
                        </div>
                        <p className="font-semibold text-foreground">{v.employee} <span className="font-normal text-muted-foreground/70">({v.department})</span></p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{v.description}</p>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">Agent: <strong>{v.assignedAgent}</strong> · Started: {v.startedAt} · Location: {v.location}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => completeMutation.mutate({ visitId: v.id })}
                          className="px-3 py-1 bg-green-100 text-green-700 text-[11px] rounded hover:bg-green-200"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => { window.location.href = "/app/tickets/new"; }}
                          className="px-3 py-1 border border-border text-[11px] rounded text-muted-foreground hover:bg-muted/30"
                        >Create Incident</button>
                      </div>
                    </div>
                  );
                })}
                {liveQueue.map((v: any, idx: number) => {
                  const cat = CAT_CFG[v.category as IssueCategory] ?? CAT_CFG.other;
                  return (
                    <div key={v.id} className="flex items-start gap-3 px-4 py-3 border-b border-border hover:bg-muted/30">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${idx === 0 ? "bg-primary text-white" : "bg-border text-muted-foreground"}`}>{idx+1}</div>
                      <div className="w-8 h-8 rounded-full bg-border text-muted-foreground flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                        {(v.employee ?? "?").split(" ").map((n: string) => n[0]).join("").slice(0,2)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-mono text-[11px] text-primary">{v.number}</span>
                          <span className={`status-badge ${STATUS_CFG.waiting.color}`}>Waiting</span>
                          <span className={`status-badge ${cat.color}`}>{cat.icon} {cat.label}</span>
                          {v.appointment && <span className="status-badge text-purple-700 bg-purple-100 text-[10px]">📅 Appt {v.appointmentTime}</span>}
                        </div>
                        <p className="font-semibold text-foreground">{v.employee} <span className="font-normal text-muted-foreground/70">({v.department})</span></p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{v.description}</p>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">Joined: {v.joinedAt} · Wait: <strong className={(v.waitMinutes ?? 0) > 20 ? "text-orange-600" : "text-muted-foreground"}>{v.waitMinutes ?? 0} min</strong> · {v.location}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => callNextMutation.mutate({ locationId: v.locationId })}
                          className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
                        >
                          Assign to Me
                        </button>
                        <button
                          onClick={() => holdMutation.mutate({ visitId: v.id })}
                          className="px-3 py-1 border border-border text-[11px] rounded text-muted-foreground hover:bg-muted/30"
                        >Hold</button>
                      </div>
                    </div>
                  );
                })}
                {todayCompleted.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-muted/30 text-[10px] font-semibold text-muted-foreground/70 uppercase border-t border-border">Completed Today</div>
                    {todayCompleted.map((v: any) => {
                      const cat = CAT_CFG[v.category as IssueCategory] ?? CAT_CFG.other;
                      return (
                        <div key={v.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-border last:border-0 opacity-60">
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-primary">{v.number}</span>
                              <span className={`status-badge ${cat.color}`}>{cat.icon} {cat.label}</span>
                              {v.satisfaction && (
                                <span className="flex items-center gap-0.5 text-[11px] text-yellow-600">
                                  {"★".repeat(v.satisfaction)}{"☆".repeat(5-v.satisfaction)} {v.satisfaction}/5
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-foreground/80">{v.employee} ({v.department}) · Agent: {v.assignedAgent} · {v.completedAt && `Completed: ${v.completedAt}`}</p>
                            {v.notes && <p className="text-[11px] text-muted-foreground/70">{v.notes}</p>}
                            {v.incident && <p className="text-[11px] text-primary">Incident: {v.incident}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* APPOINTMENTS */}
        {tab === "appointments" && (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Appt #</th>
                <th>Time</th>
                <th>Employee</th>
                <th>Department</th>
                <th>Category</th>
                <th>Description</th>
                <th>Location</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apptsQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 11 }).map((__, j) => (
                      <td key={j}><div className="h-3 bg-muted animate-pulse rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : (
                allAppointments.map((a: any) => {
                  const cat = CAT_CFG[a.category as IssueCategory] ?? CAT_CFG.other;
                  return (
                    <tr key={a.id} className={a.status === "cancelled" || a.status === "no_show" ? "opacity-50" : ""}>
                      <td className="p-0"><div className={`priority-bar ${a.status === "completed" ? "bg-green-500" : a.status === "confirmed" ? "bg-blue-500" : "bg-border"}`} /></td>
                      <td className="font-mono text-[11px] text-primary">{a.number}</td>
                      <td className="font-mono text-[11px] font-semibold text-foreground">{(a.slot ?? "").split(" ")[1] ?? a.slot}</td>
                      <td className="font-semibold text-foreground">{a.employee}</td>
                      <td className="text-muted-foreground">{a.department}</td>
                      <td><span className={`status-badge ${cat.color}`}>{cat.icon} {cat.label}</span></td>
                      <td className="text-[11px] text-muted-foreground max-w-xs truncate">{a.description}</td>
                      <td className="text-[11px] text-muted-foreground">{a.location}</td>
                      <td className="text-muted-foreground">{a.agent ?? "Unassigned"}</td>
                      <td><span className={`status-badge capitalize ${a.status === "confirmed" ? "text-blue-700 bg-blue-100" : a.status === "completed" ? "text-green-700 bg-green-100" : a.status === "cancelled" ? "text-muted-foreground/70 bg-muted/30" : "text-yellow-700 bg-yellow-100"}`}>{a.status}</span></td>
                      <td>
                        <div className="flex gap-1.5">
                          {a.status === "booked" && <button onClick={() => router.push(`/app/tickets/new?type=incident&title=${encodeURIComponent("Walk-Up Appointment: " + (a.employee ?? ""))}&description=${encodeURIComponent(a.description ?? "")}`)} className="text-[11px] text-primary hover:underline">Assign</button>}
                          {a.status === "confirmed" && <button onClick={() => { setTab("queue"); toast.success("Navigated to queue — find the walk-up visit to start the session."); }} className="text-[11px] text-green-700 hover:underline">Start</button>}
                          <button onClick={() => toast.success(`Appointment: ${a.employee} — ${a.description} (${a.status})`)} className="text-[11px] text-muted-foreground/70 hover:underline">View</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {/* AGENT WORKSPACE */}
        {tab === "agent" && (
          <div className="p-4">
            <div className="mb-4 py-6 text-center bg-muted/20 rounded border border-border">
              <p className="text-[12px] text-muted-foreground/50">Agent roster will appear when agents are assigned to walk-up locations in the system</p>
            </div>

            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">My Queue</div>
              <div className="divide-y divide-border">
                {[...inService, ...liveQueue.slice(0,2)].length === 0 ? (
                  <div className="px-4 py-4 text-center text-[11px] text-muted-foreground/50">No active visits in queue</div>
                ) : [...inService, ...liveQueue.slice(0,2)].map((v: any) => {
                  const cat = CAT_CFG[v.category as IssueCategory] ?? CAT_CFG.other;
                  return (
                    <div key={v.id} className={`flex items-center gap-3 px-4 py-3 ${v.status === "in_service" ? "bg-blue-50/30" : ""}`}>
                      <span className={`status-badge ${STATUS_CFG[v.status as VisitStatus]?.color ?? "text-muted-foreground bg-muted"}`}>{STATUS_CFG[v.status as VisitStatus]?.label ?? v.status}</span>
                      <span className="font-mono text-[11px] text-primary">{v.number}</span>
                      <span className="font-semibold text-foreground flex-1">{v.employee}</span>
                      <span className={`status-badge ${cat.color}`}>{cat.icon} {cat.label}</span>
                      <span className="text-[11px] text-muted-foreground/70">{(v.waitMinutes ?? 0) > 0 ? `${v.waitMinutes}min wait` : "In service"}</span>
                      {v.status === "in_service" && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => completeMutation.mutate({ visitId: v.id })}
                            className="px-2 py-1 bg-green-100 text-green-700 text-[11px] rounded hover:bg-green-200"
                          >
                            Complete
                          </button>
                          <button
                            onClick={() => router.push(`/app/tickets/new?type=incident&source=walkup&visit=${v.id}&description=${encodeURIComponent(v.description ?? "")}`)}
                            className="px-2 py-1 border border-border text-[11px] rounded text-muted-foreground hover:bg-muted/30"
                          >Incident</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* LOCATIONS */}
        {tab === "locations" && (
          <div className="p-8 text-center">
            <MapPin className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[12px] text-muted-foreground/50">No walk-up locations configured yet</p>
            <p className="text-[11px] text-muted-foreground/40 mt-1">Add locations via the Facilities module to manage walk-up service desks</p>
          </div>
        )}

        {/* ANALYTICS */}
        {tab === "analytics" && (
          <div className="p-4 grid grid-cols-2 gap-4">
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">MTD Summary</div>
              <div className="p-4 space-y-2">
                {analyticsQuery.isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex justify-between animate-pulse">
                      <div className="h-3 bg-muted rounded w-40" />
                      <div className="h-3 bg-muted rounded w-12" />
                    </div>
                  ))
                ) : (
                  [
                    { label: "Total Walk-Up Visits (MTD)",  value: analyticsData?.totalVisits ?? "—",      color: "text-foreground" },
                    { label: "Avg Resolution Time",         value: analyticsData?.avgResolutionTime ?? "—", color: "text-blue-700" },
                    { label: "First-Contact Resolution",     value: analyticsData?.fcrRate ?? "—",           color: "text-green-700" },
                    { label: "CSAT Score (Walk-Up)",        value: analyticsData?.csatScore ?? "—",        color: "text-green-700" },
                    { label: "Appointments vs Walk-in",     value: analyticsData?.apptRatio ?? "—",    color: "text-purple-700" },
                    { label: "Incidents Created from WU",   value: analyticsData?.incidentsCreated ?? "—",    color: "text-orange-700" },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between text-[12px]">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className={`font-bold ${r.color}`}>{r.value}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Issues by Category (MTD)</div>
              <div className="p-4 space-y-2">
                {(analyticsData?.byCategory ?? []).length === 0 ? (
                  <p className="text-center text-[11px] text-muted-foreground/50 py-4">No category data available yet</p>
                ) : (analyticsData?.byCategory ?? []).map((r: any) => (
                  <div key={r.cat ?? r.category} className="flex items-center gap-2 text-[11px]">
                    <span className="w-24 text-muted-foreground">{r.cat ?? r.category}</span>
                    <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{width:`${r.pct ?? r.percent ?? 0}%`}} />
                    </div>
                    <span className="font-mono text-foreground/80 w-6">{r.count}</span>
                    <span className="text-muted-foreground/70">{r.pct ?? r.percent ?? 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Book Appointment Modal */}
    {showBookAppt && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold">Book IT Desk Appointment</h2>
            <button onClick={() => setShowBookAppt(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Date &amp; Time *</label>
              <input
                type="datetime-local"
                className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
                value={apptForm.scheduledAt}
                onChange={(e) => setApptForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Issue Category</label>
              <select
                className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
                value={apptForm.issueCategory}
                onChange={(e) => setApptForm((f) => ({ ...f, issueCategory: e.target.value }))}
              >
                <option value="">-- Select --</option>
                <option value="hardware">Hardware Issue</option>
                <option value="software">Software / App Issue</option>
                <option value="network">Network / Connectivity</option>
                <option value="access">Access / Password</option>
                <option value="device_setup">New Device Setup</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
              <textarea
                className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background resize-none"
                rows={2}
                placeholder="Briefly describe your issue…"
                value={apptForm.notes}
                onChange={(e) => setApptForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setShowBookAppt(false)} className="flex-1 px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Cancel</button>
            <button
              onClick={() => {
                if (!apptForm.scheduledAt) { toast.error("Please select a date and time"); return; }
                createAppointment.mutate({ scheduledAt: new Date(apptForm.scheduledAt).toISOString(), issueCategory: apptForm.issueCategory || undefined, notes: apptForm.notes || undefined } as any);
              }}
              disabled={createAppointment.isPending}
              className="flex-1 px-3 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {createAppointment.isPending ? "Booking…" : "Book Appointment"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
