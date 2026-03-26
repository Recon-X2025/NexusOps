"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Building2, MapPin, Users, Calendar, Clock, Plus, Search,
  CheckCircle2, XCircle, AlertTriangle, ChevronRight, Layers,
} from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";

const FAC_TABS = [
  { key: "spaces",    label: "Space Management",   module: "facilities" as const, action: "read"  as const },
  { key: "bookings",  label: "Room Bookings",      module: "facilities" as const, action: "read"  as const },
  { key: "buildings", label: "Buildings & Sites",  module: "facilities" as const, action: "read"  as const },
  { key: "moves",     label: "Move Requests",      module: "facilities" as const, action: "write" as const },
  { key: "requests",  label: "Facilities Requests",module: "facilities" as const, action: "read"  as const },
];

const ROOM_STATUS_CFG: Record<string, { label: string; color: string; dot: string }> = {
  available: { label: "Available",  color: "text-green-700 bg-green-100",  dot: "bg-green-500" },
  in_use:    { label: "In Use",     color: "text-red-700 bg-red-100",      dot: "bg-red-500" },
  reserved:  { label: "Reserved",   color: "text-blue-700 bg-blue-100",    dot: "bg-blue-500" },
};

const SPACE_STATUS_CFG: Record<string, string> = {
  occupied:      "text-green-700 bg-green-100",
  near_capacity: "text-orange-700 bg-orange-100",
  available:     "text-blue-700 bg-blue-100",
};

export default function FacilitiesPage() {
  const { can } = useRBAC();
  const visibleTabs = FAC_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "spaces");

  const utils = trpc.useUtils();

  // @ts-ignore — facilities router is being created in a parallel task
  const buildingsQuery = trpc.facilities.buildings.list.useQuery({});

  // @ts-ignore — facilities router is being created in a parallel task
  const bookingsQuery = trpc.facilities.bookings.list.useQuery({ limit: 50 });

  // @ts-ignore — facilities router is being created in a parallel task
  const movesQuery = trpc.facilities.moveRequests.list.useQuery({});

  // @ts-ignore — facilities router is being created in a parallel task
  const facilityReqsQuery = trpc.facilities.facilityRequests.list.useQuery({});

  // @ts-ignore — facilities router is being created in a parallel task
  const createBookingMutation = trpc.facilities.bookings.create.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.facilities.bookings.list.invalidate();
      toast.success("Room booked successfully");
    },
    onError: (e: any) => { console.error("facilities.bookings.create failed:", e); toast.error(e.message || "Failed to book room"); },
  });

  // @ts-ignore — facilities router is being created in a parallel task
  const createMoveMutation = trpc.facilities.moveRequests.create.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.facilities.moveRequests.list.invalidate();
      toast.success("Move request submitted");
    },
    onError: (e: any) => { console.error("facilities.moveRequests.create failed:", e); toast.error(e.message || "Failed to submit move request"); },
  });

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);

  if (!can("facilities", "read")) return <AccessDenied module="Facilities & Real Estate" />;

  const BUILDINGS = (Array.isArray(buildingsQuery.data) ? buildingsQuery.data : (buildingsQuery.data as any)?.items ?? []) as any[];
  const ROOMS = (bookingsQuery.data as any)?.items ?? (Array.isArray(bookingsQuery.data) ? bookingsQuery.data : []) as any[];
  const MOVE_REQUESTS = (movesQuery.data as any)?.items ?? (Array.isArray(movesQuery.data) ? movesQuery.data : []) as any[];
  const FAC_REQUESTS = (facilityReqsQuery.data as any)?.items ?? (Array.isArray(facilityReqsQuery.data) ? facilityReqsQuery.data : []) as any[];

  const totalDesks = BUILDINGS.reduce((s: number, b: any) => s + (b.totalDesks ?? 0), 0);
  const occupiedDesks = BUILDINGS.reduce((s: number, b: any) => s + (b.occupiedDesks ?? 0), 0);
  const availableRooms = ROOMS.filter((r: any) => r.status === "available").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Facilities & Real Estate</h1>
          <span className="text-[11px] text-muted-foreground/70">Space · Rooms · Buildings · Move Requests</span>
        </div>
        <PermissionGate module="facilities" action="write">
          <button
            onClick={() => createMoveMutation.mutate({} as any)}
            disabled={createMoveMutation.isPending}
            className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-60">
            <Plus className="w-3 h-3" /> New Facilities Request
          </button>
        </PermissionGate>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Total Desks",         value: totalDesks, color: "text-foreground/80", loading: buildingsQuery.isLoading },
          { label: "Occupied Desks",      value: totalDesks > 0 ? `${occupiedDesks} (${Math.round(occupiedDesks/totalDesks*100)}%)` : "—", color: "text-blue-700", loading: buildingsQuery.isLoading },
          { label: "Available Rooms Now", value: availableRooms, color: "text-green-700", loading: bookingsQuery.isLoading },
          { label: "Open Move Requests",  value: MOVE_REQUESTS.filter((m: any) => m.state !== "completed").length, color: "text-orange-700", loading: movesQuery.isLoading },
          { label: "Open Fac. Requests",  value: FAC_REQUESTS.filter((r: any) => r.state !== "completed").length, color: "text-foreground/80", loading: facilityReqsQuery.isLoading },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            {k.loading ? (
              <div className="h-6 bg-muted rounded animate-pulse mb-1 w-10" />
            ) : (
              <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            )}
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

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
        {tab === "buildings" && (
          <>
            {buildingsQuery.isLoading ? (
              <div className="animate-pulse p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-4 bg-muted rounded w-20" />
                    <div className="h-4 bg-muted rounded flex-1" />
                    <div className="h-4 bg-muted rounded w-32" />
                    <div className="h-4 bg-muted rounded w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th>Site ID</th>
                    <th>Name</th>
                    <th>Address</th>
                    <th className="text-center">Floors</th>
                    <th className="text-center">Total Desks</th>
                    <th className="text-center">Occupied</th>
                    <th className="text-center">Meeting Rooms</th>
                    <th>Data Center</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {BUILDINGS.map((b: any) => (
                    <tr key={b.id}>
                      <td className="font-mono text-[11px] text-primary">{b.id}</td>
                      <td className="font-medium text-foreground">{b.name}</td>
                      <td className="text-muted-foreground text-[11px]">{b.address}</td>
                      <td className="text-center text-muted-foreground">{(b.floors ?? 0) > 0 ? b.floors : "—"}</td>
                      <td className="text-center font-mono font-semibold">{b.totalDesks ?? "—"}</td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="font-mono font-semibold text-foreground">{b.occupiedDesks ?? "—"}</span>
                          {b.totalDesks > 0 && (
                            <div className="w-10 h-1.5 bg-border rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${(b.occupiedDesks/b.totalDesks) > 0.9 ? "bg-red-500" : (b.occupiedDesks/b.totalDesks) > 0.75 ? "bg-yellow-500" : "bg-green-500"}`}
                                style={{ width: `${Math.round(((b.occupiedDesks ?? 0)/b.totalDesks)*100)}%` }} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="text-center text-muted-foreground">{b.rooms ?? "—"}</td>
                      <td>{(b.datacenterFloors ?? []).length > 0 ? <span className="text-[11px] text-blue-600">Floors: {b.datacenterFloors.join(", ")}</span> : <span className="text-slate-300">—</span>}</td>
                      <td>
                        <span className={`status-badge ${b.badge === "HQ" ? "text-purple-700 bg-purple-100" : b.badge === "DC" ? "text-blue-700 bg-blue-100" : "text-muted-foreground bg-muted"}`}>
                          {b.badge}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {BUILDINGS.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-[12px] text-muted-foreground/70">No buildings found.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === "spaces" && (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Space ID</th>
                <th>Name</th>
                <th>Building</th>
                <th>Floor</th>
                <th>Type</th>
                <th>Area</th>
                <th className="text-center">Capacity</th>
                <th>Assigned To</th>
                <th>Occupancy</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={11} className="text-center py-6 text-[11px] text-muted-foreground/50">No space inventory data available yet</td></tr>
            </tbody>
          </table>
        )}

        {tab === "bookings" && (
          <div>
            <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
              <span className="text-[12px] font-semibold text-foreground/80">Today — {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</span>
              <PermissionGate module="facilities" action="write">
                <button
                  onClick={() => createBookingMutation.mutate({} as any)}
                  disabled={createBookingMutation.isPending}
                  className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-60">
                  <Plus className="w-3 h-3" /> {createBookingMutation.isPending ? "Booking…" : "Book a Room"}
                </button>
              </PermissionGate>
            </div>
            {bookingsQuery.isLoading ? (
              <div className="animate-pulse p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-4 bg-muted rounded w-32" />
                    <div className="h-4 bg-muted rounded w-20" />
                    <div className="h-4 bg-muted rounded flex-1" />
                    <div className="h-4 bg-muted rounded w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th className="w-4" />
                    <th>Room</th>
                    <th>Building</th>
                    <th>Floor</th>
                    <th className="text-center">Capacity</th>
                    <th className="text-center">AV</th>
                    <th className="text-center">VC / Video</th>
                    <th className="text-center">Whiteboard</th>
                    <th>Status</th>
                    <th>Next Booking</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ROOMS.map((room: any) => {
                    const sCfg = (ROOM_STATUS_CFG[room.status] ?? ROOM_STATUS_CFG.available)!;
                    return (
                      <tr key={room.id} className={room.status === "in_use" ? "bg-red-50/20" : ""}>
                        <td className="p-0"><div className={`priority-bar ${sCfg.dot}`} /></td>
                        <td className="font-medium text-foreground">{room.name}</td>
                        <td className="text-muted-foreground text-[11px]">{room.building}</td>
                        <td className="text-muted-foreground">{room.floor}</td>
                        <td className="text-center font-mono font-semibold text-foreground/80">{room.capacity}</td>
                        <td className="text-center">{room.av ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" /> : <span className="text-slate-300 text-[11px]">—</span>}</td>
                        <td className="text-center">{room.vc ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" /> : <span className="text-slate-300 text-[11px]">—</span>}</td>
                        <td className="text-center">{room.whiteboard ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" /> : <span className="text-slate-300 text-[11px]">—</span>}</td>
                        <td><span className={`status-badge ${sCfg.color}`}><span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${sCfg.dot}`} />{sCfg.label}</span></td>
                        <td className="text-[11px] text-muted-foreground">{room.nextBooking}</td>
                        <td>
                          {room.status === "available" && (
                            <PermissionGate module="facilities" action="write">
                              <button
                                onClick={() => createBookingMutation.mutate({ roomId: room.id } as any)}
                                disabled={createBookingMutation.isPending}
                                className="text-[11px] text-primary hover:underline disabled:opacity-50">
                                Book Now
                              </button>
                            </PermissionGate>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {ROOMS.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-[12px] text-muted-foreground/70">No rooms found.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "moves" && (
          <>
            <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
              <span className="text-[12px] font-semibold text-foreground/80">Move Requests</span>
              <PermissionGate module="facilities" action="write">
                <button
                  onClick={() => createMoveMutation.mutate({} as any)}
                  disabled={createMoveMutation.isPending}
                  className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-60">
                  <Plus className="w-3 h-3" /> {createMoveMutation.isPending ? "Submitting…" : "New Move Request"}
                </button>
              </PermissionGate>
            </div>
            {movesQuery.isLoading ? (
              <div className="animate-pulse p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-4 bg-muted rounded w-20" />
                    <div className="h-4 bg-muted rounded w-28" />
                    <div className="h-4 bg-muted rounded flex-1" />
                    <div className="h-4 bg-muted rounded w-24" />
                  </div>
                ))}
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th className="w-4" />
                    <th>Request ID</th>
                    <th>Type</th>
                    <th>From</th>
                    <th>To</th>
                    <th>For</th>
                    <th>Reason</th>
                    <th>Move Date</th>
                    <th>Crew</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {MOVE_REQUESTS.map((mv: any) => (
                    <tr key={mv.id}>
                      <td className="p-0"><div className={`priority-bar ${mv.state === "completed" ? "bg-green-500" : mv.state === "scheduled" ? "bg-blue-500" : mv.state === "approved" ? "bg-indigo-500" : "bg-yellow-400"}`} /></td>
                      <td className="font-mono text-[11px] text-primary">{mv.id}</td>
                      <td><span className="status-badge text-muted-foreground bg-muted">{mv.type}</span></td>
                      <td className="text-[11px] text-muted-foreground">{mv.from}</td>
                      <td className="text-[11px] text-muted-foreground font-medium">{mv.to}</td>
                      <td className="text-muted-foreground">{mv.requestedFor}</td>
                      <td className="text-[11px] text-muted-foreground max-w-xs"><span className="truncate block">{mv.reason}</span></td>
                      <td className="text-muted-foreground text-[11px]">{mv.moveDate}</td>
                      <td className="text-muted-foreground text-[11px]">{mv.assignedCrew}</td>
                      <td>
                        <span className={`status-badge capitalize ${
                          mv.state === "completed" ? "text-green-700 bg-green-100"
                          : mv.state === "scheduled" ? "text-blue-700 bg-blue-100"
                          : mv.state === "approved" ? "text-indigo-700 bg-indigo-100"
                          : "text-yellow-700 bg-yellow-100"
                        }`}>{mv.state?.replace("_", " ")}</span>
                      </td>
                    </tr>
                  ))}
                  {MOVE_REQUESTS.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-[12px] text-muted-foreground/70">No move requests found.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === "requests" && (
          <>
            {facilityReqsQuery.isLoading ? (
              <div className="animate-pulse p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-4 bg-muted rounded w-20" />
                    <div className="h-4 bg-muted rounded w-24" />
                    <div className="h-4 bg-muted rounded flex-1" />
                    <div className="h-4 bg-muted rounded w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th className="w-4" />
                    <th>Request ID</th>
                    <th>Type</th>
                    <th>Summary</th>
                    <th>Submitted By</th>
                    <th>Building</th>
                    <th>Floor</th>
                    <th>Priority</th>
                    <th>Assigned</th>
                    <th>State</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {FAC_REQUESTS.map((r: any) => (
                    <tr key={r.id}>
                      <td className="p-0"><div className={`priority-bar ${r.priority === "high" ? "bg-red-500" : r.priority === "medium" ? "bg-yellow-500" : "bg-green-500"}`} /></td>
                      <td className="font-mono text-[11px] text-primary">{r.id}</td>
                      <td><span className="status-badge text-muted-foreground bg-muted">{r.type}</span></td>
                      <td className="font-medium text-foreground">{r.summary}</td>
                      <td className="text-muted-foreground">{r.submittedBy}</td>
                      <td className="text-[11px] text-muted-foreground">{r.building}</td>
                      <td className="text-muted-foreground">{r.floor}</td>
                      <td><span className={`status-badge capitalize ${r.priority === "high" ? "text-red-700 bg-red-100" : r.priority === "medium" ? "text-yellow-700 bg-yellow-100" : "text-green-700 bg-green-100"}`}>{r.priority}</span></td>
                      <td className="text-muted-foreground">{r.assigned}</td>
                      <td><span className="status-badge text-muted-foreground bg-muted capitalize">{r.state?.replace("_", " ")}</span></td>
                      <td className="text-[11px] text-muted-foreground/70">{r.created}</td>
                    </tr>
                  ))}
                  {FAC_REQUESTS.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-[12px] text-muted-foreground/70">No facilities requests found.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
