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
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const visibleTabs = FAC_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "spaces");

  const utils = trpc.useUtils();

  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingForm, setBookingForm] = useState({ roomId: "", title: "", startTime: "", endTime: "", attendeeCount: "" });

  const [showSpaceForm, setShowSpaceForm] = useState(false);
  const [spaceForm, setSpaceForm] = useState({ spaceId: "", name: "", building: "", floor: "", type: "", area: "", capacity: "", assignedTo: "", occupancy: "", status: "acquired" });

  const [showMoveForm, setShowMoveForm] = useState(false);
  const [moveForm, setMoveForm] = useState({ fromLocation: "", toLocation: "", moveDate: "", notes: "" });

  const [showFacReqForm, setShowFacReqForm] = useState(false);
  const [facReqForm, setFacReqForm] = useState({ type: "maintenance", title: "", description: "", spaceId: "" });

  // @ts-ignore
  const spacesQuery = trpc.facilities.spaces.list.useQuery({}, mergeTrpcQueryOpts("facilities.spaces.list", undefined));

  // @ts-ignore — facilities router is being created in a parallel task
  const buildingsQuery = trpc.facilities.buildings.list.useQuery({}, mergeTrpcQueryOpts("facilities.buildings.list", undefined));

  // @ts-ignore — facilities router is being created in a parallel task
  const bookingsQuery = trpc.facilities.bookings.list.useQuery({ limit: 50 }, mergeTrpcQueryOpts("facilities.bookings.list", undefined));

  // @ts-ignore — facilities router is being created in a parallel task
  const movesQuery = trpc.facilities.moveRequests.list.useQuery({}, mergeTrpcQueryOpts("facilities.moveRequests.list", undefined));

  const [showBuildingForm, setShowBuildingForm] = useState(false);
  const [buildingForm, setBuildingForm] = useState({ name: "", address: "", floors: "", totalDesks: "", meetingRooms: "", type: "Office", isDataCenter: false });

  // @ts-ignore
  const facilityReqsQuery = trpc.facilities.facilityRequests.list.useQuery({}, mergeTrpcQueryOpts("facilities.facilityRequests.list", undefined));

  // @ts-ignore
  const createBuildingMutation = trpc.facilities.buildings.create.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.facilities.buildings.list.invalidate();
      toast.success("Building added successfully");
      setShowBuildingForm(false);
      setBuildingForm({ name: "", address: "", floors: "", totalDesks: "", meetingRooms: "", type: "Office", isDataCenter: false });
    },
    onError: (e: any) => { console.error("facilities.buildings.create failed:", e); toast.error(e.message || "Failed to add building"); },
  });

  // @ts-ignore
  const createSpaceMutation = trpc.facilities.spaces.create.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.facilities.spaces.list.invalidate();
      toast.success("Space added successfully");
      setShowSpaceForm(false);
      setSpaceForm({ spaceId: "", name: "", building: "", floor: "", type: "", area: "", capacity: "", assignedTo: "", occupancy: "", status: "acquired" });
    },
    onError: (e: any) => { console.error("facilities.spaces.create failed:", e); toast.error(e.message || "Failed to add space"); },
  });

  // @ts-ignore — facilities router is being created in a parallel task
  const createBookingMutation = trpc.facilities.bookings.create.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.facilities.bookings.list.invalidate();
      toast.success("Room booked successfully");
      setShowBookingForm(false);
      setBookingForm({ roomId: "", title: "", startTime: "", endTime: "", attendeeCount: "" });
    },
    onError: (e: any) => { console.error("facilities.bookings.create failed:", e); toast.error(e.message || "Failed to book room"); },
  });

  // @ts-ignore — facilities router is being created in a parallel task
  const createMoveMutation = trpc.facilities.moveRequests.create.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.facilities.moveRequests.list.invalidate();
      toast.success("Move request submitted");
      setShowMoveForm(false);
      setMoveForm({ fromLocation: "", toLocation: "", moveDate: "", notes: "" });
    },
    onError: (e: any) => { console.error("facilities.moveRequests.create failed:", e); toast.error(e.message || "Failed to submit move request"); },
  });

  // @ts-ignore
  const createFacReqMutation = trpc.facilities.facilityRequests.create.useMutation({
    onSuccess: () => {
      // @ts-ignore
      utils.facilities.facilityRequests.list.invalidate();
      toast.success("Facility request submitted");
      setShowFacReqForm(false);
      setFacReqForm({ type: "maintenance", title: "", description: "", spaceId: "" });
    },
    onError: (e: any) => { console.error("facilities.facilityRequests.create failed:", e); toast.error(e.message || "Failed to submit facility request"); },
  });

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);

  if (!can("facilities", "read")) return <AccessDenied module="Facilities & Real Estate" />;

  const RAW_BUILDINGS = (Array.isArray(buildingsQuery.data) ? buildingsQuery.data : (buildingsQuery.data as any)?.items ?? []) as any[];
  const BUILDINGS = RAW_BUILDINGS.map(b => ({
    ...b,
    totalDesks: b.capacity ?? b.totalDesks,
    rooms: b.rooms ?? (b.amenities?.find((a: string) => a.startsWith("Rooms:"))?.split(":")[1]),
    badge: b.badge ?? (b.amenities?.find((a: string) => a.startsWith("Type:"))?.split(":")[1]) ?? "Office",
    datacenterFloors: b.datacenterFloors ?? (b.amenities?.includes("Data Center") ? ["1"] : []),
  }));
  const BOOKINGS = (bookingsQuery.data as any)?.items ?? (Array.isArray(bookingsQuery.data) ? bookingsQuery.data : []) as any[];
  const MOVE_REQUESTS = (movesQuery.data as any)?.items ?? (Array.isArray(movesQuery.data) ? movesQuery.data : []) as any[];
  const FAC_REQUESTS = (facilityReqsQuery.data as any)?.items ?? (Array.isArray(facilityReqsQuery.data) ? facilityReqsQuery.data : []) as any[];
  const SPACES = (Array.isArray(spacesQuery.data) ? spacesQuery.data : (spacesQuery.data as any)?.items ?? []) as any[];

  const totalDesks = BUILDINGS.reduce((s: number, b: any) => s + (b.totalDesks ?? 0), 0);
  const occupiedDesks = BUILDINGS.reduce((s: number, b: any) => s + (b.occupiedDesks ?? 0), 0);
  const upcomingBookings = BOOKINGS.filter((b: any) => new Date(b.startTime) > new Date()).length;

  return (
    <>
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-body-sm font-semibold text-foreground">Facilities & Real Estate</h1>
          <span className="text-[11px] text-muted-foreground/70">Space · Rooms · Buildings · Move Requests</span>
        </div>
        <PermissionGate module="facilities" action="write">
          <button
            onClick={() => setShowFacReqForm(true)}
            className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-60">
            <Plus className="w-3 h-3" /> New Facilities Request
          </button>
        </PermissionGate>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { label: "Total Desks",         value: totalDesks, color: "text-foreground/80", loading: buildingsQuery.isLoading },
          { label: "Occupied Desks",      value: totalDesks > 0 ? `${occupiedDesks} (${Math.round(occupiedDesks/totalDesks*100)}%)` : "—", color: "text-blue-700", loading: buildingsQuery.isLoading },
          { label: "Upcoming Bookings",   value: upcomingBookings, color: "text-green-700", loading: bookingsQuery.isLoading },
          { label: "Open Move Requests",  value: MOVE_REQUESTS.filter((m: any) => m.state !== "completed").length, color: "text-orange-700", loading: movesQuery.isLoading },
          { label: "Open Fac. Requests",  value: FAC_REQUESTS.filter((r: any) => r.state !== "completed").length, color: "text-foreground/80", loading: facilityReqsQuery.isLoading },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            {k.loading ? (
              <div className="h-6 bg-muted rounded animate-pulse mb-1 w-10" />
            ) : (
              <div className={`text-h4 font-bold ${k.color}`}>{k.value}</div>
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
          <div>
            <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
              <span className="text-[12px] font-semibold text-foreground/80">Buildings & Sites</span>
              <PermissionGate module="facilities" action="write">
                <button
                  onClick={() => setShowBuildingForm(true)}
                  className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> New Building
                </button>
              </PermissionGate>
            </div>
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
                      <td className="text-center">
                        <button
                          onClick={() => setShowBookingForm(true)}
                          className="text-[11px] text-primary hover:underline font-medium"
                          title="Book a meeting room"
                        >
                          {b.rooms ?? "Book Room"}
                        </button>
                      </td>
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
          </div>
        )}

        {tab === "spaces" && (
          <div>
            <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
              <span className="text-[12px] font-semibold text-foreground/80">Space Inventory</span>
              <PermissionGate module="facilities" action="write">
                <button
                  onClick={() => setShowSpaceForm(true)}
                  className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> Add Space
                </button>
              </PermissionGate>
            </div>
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
              {SPACES.map((s: any) => (
                <tr key={s.id}>
                  <td className="p-0"><div className={`priority-bar ${s.status === "acquired" ? "bg-blue-500" : s.status === "occupied" ? "bg-green-500" : "bg-gray-400"}`} /></td>
                  <td className="font-mono text-[11px] text-primary">{s.spaceId}</td>
                  <td className="font-medium text-foreground">{s.name}</td>
                  <td className="text-muted-foreground text-[11px]">{s.building || "—"}</td>
                  <td className="text-muted-foreground text-[11px]">{s.floor || "—"}</td>
                  <td><span className="status-badge text-muted-foreground bg-muted">{s.type || "—"}</span></td>
                  <td className="text-muted-foreground text-[11px]">{s.area || "—"}</td>
                  <td className="text-center font-mono font-semibold">{s.capacity ?? "—"}</td>
                  <td className="text-muted-foreground text-[11px]">{s.assignedTo || "—"}</td>
                  <td className="text-muted-foreground text-[11px]">{s.occupancy || "—"}</td>
                  <td>
                    <span className={`status-badge capitalize ${
                      s.status === "acquired" ? "text-blue-700 bg-blue-100"
                      : s.status === "occupied" ? "text-green-700 bg-green-100"
                      : "text-gray-700 bg-gray-100"
                    }`}>{s.status}</span>
                  </td>
                </tr>
              ))}
              {SPACES.length === 0 && (
                <tr><td colSpan={11} className="text-center py-6 text-[11px] text-muted-foreground/50">No space inventory data available yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
        )}

        {tab === "bookings" && (
          <div>
            <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
              <span className="text-[12px] font-semibold text-foreground/80">Today — {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</span>
              <PermissionGate module="facilities" action="write">
                <button
                  onClick={() => setShowBookingForm(true)}
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
                    <th>Meeting Title</th>
                    <th>Space</th>
                    <th>Building</th>
                    <th className="text-center">Start Time</th>
                    <th className="text-center">End Time</th>
                    <th className="text-center">Attendees</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {BOOKINGS.map((booking: any) => {
                    return (
                      <tr key={booking.id}>
                        <td className="p-0"><div className="priority-bar bg-primary" /></td>
                        <td className="font-medium text-foreground">{booking.title || "Untitled Meeting"}</td>
                        <td className="text-primary font-medium text-[12px]">{booking.spaceName || booking.roomId}</td>
                        <td className="text-muted-foreground text-[11px]">{booking.spaceBuilding || "—"}</td>
                        <td className="text-center font-mono text-[11px]">{new Date(booking.startTime).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td className="text-center font-mono text-[11px]">{new Date(booking.endTime).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td className="text-center font-mono font-semibold text-foreground/80">{booking.attendeeCount || "—"}</td>
                        <td><span className={`status-badge capitalize ${booking.status === "confirmed" ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100"}`}>{booking.status}</span></td>
                      </tr>
                    );
                  })}
                  {BOOKINGS.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-[12px] text-muted-foreground/70">No bookings found.</td></tr>
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
                  onClick={() => setShowMoveForm(true)}
                  className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> New Move Request
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
                    <th>From</th>
                    <th>To</th>
                    <th>For</th>
                    <th>Reason</th>
                    <th>Move Date</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {MOVE_REQUESTS.map((mv: any) => (
                    <tr key={mv.id}>
                      <td className="p-0"><div className={`priority-bar ${mv.status === "completed" ? "bg-green-500" : mv.status === "scheduled" ? "bg-blue-500" : mv.status === "approved" ? "bg-indigo-500" : "bg-yellow-400"}`} /></td>
                      <td className="font-mono text-[11px] text-primary">{mv.id}</td>
                      <td className="text-[11px] text-muted-foreground">{mv.fromLocation || "—"}</td>
                      <td className="text-[11px] text-muted-foreground font-medium">{mv.toLocation || "—"}</td>
                      <td className="text-muted-foreground">{mv.requesterName || "—"}</td>
                      <td className="text-[11px] text-muted-foreground max-w-xs"><span className="block">{mv.notes || "—"}</span></td>
                      <td className="text-muted-foreground text-[11px]">{mv.moveDate ? new Date(mv.moveDate).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                      <td>
                        <span className={`status-badge capitalize ${
                          mv.status === "completed" ? "text-green-700 bg-green-100"
                          : mv.status === "scheduled" ? "text-blue-700 bg-blue-100"
                          : mv.status === "approved" ? "text-indigo-700 bg-indigo-100"
                          : "text-yellow-700 bg-yellow-100"
                        }`}>{mv.status?.replace("_", " ") || "—"}</span>
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
            <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
              <span className="text-[12px] font-semibold text-foreground/80">Facilities Requests</span>
              <PermissionGate module="facilities" action="write">
                <button
                  onClick={() => setShowFacReqForm(true)}
                  className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> New Facility Request
                </button>
              </PermissionGate>
            </div>
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
                    <th>State</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {FAC_REQUESTS.map((r: any) => (
                    <tr key={r.id}>
                      <td className="p-0"><div className="priority-bar bg-primary" /></td>
                      <td className="font-mono text-[11px] text-primary">{r.id}</td>
                      <td><span className="status-badge text-muted-foreground bg-muted capitalize">{r.type}</span></td>
                      <td className="font-medium text-foreground">{r.title || r.summary}</td>
                      <td className="text-muted-foreground">{r.submittedBy || "—"}</td>
                      <td className="text-[11px] text-muted-foreground">{r.building || "—"}</td>
                      <td className="text-[11px] text-muted-foreground">{r.floor || "—"}</td>
                      <td><span className={`status-badge capitalize ${r.status === "done" ? "text-green-700 bg-green-100" : r.status === "in_progress" ? "text-blue-700 bg-blue-100" : "text-yellow-700 bg-yellow-100"}`}>{r.status?.replace("_", " ")}</span></td>
                      <td className="text-[11px] text-muted-foreground/70">{new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td>
                    </tr>
                  ))}
                  {FAC_REQUESTS.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-[12px] text-muted-foreground/70">No facilities requests found.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>

    {showBookingForm && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-body-sm font-bold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Book a Meeting Room
            </h2>
            <button onClick={() => setShowBookingForm(false)}><XCircle className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Select Space *</label>
              <select
                className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
                value={bookingForm.roomId}
                onChange={(e) => setBookingForm((f) => ({ ...f, roomId: e.target.value }))}
              >
                <option value="">Select a space to book...</option>
                {SPACES.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name} ({space.spaceId})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Meeting Title</label>
              <input
                className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
                placeholder="e.g. Sprint Planning"
                value={bookingForm.title}
                onChange={(e) => setBookingForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Start Time *</label>
                <input type="datetime-local" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={bookingForm.startTime} onChange={(e) => setBookingForm((f) => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">End Time *</label>
                <input type="datetime-local" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={bookingForm.endTime} onChange={(e) => setBookingForm((f) => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Attendee Count</label>
              <input type="number" min="1" max="100" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="e.g. 8" value={bookingForm.attendeeCount} onChange={(e) => setBookingForm((f) => ({ ...f, attendeeCount: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setShowBookingForm(false)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
            <button
              onClick={() => {
                if (!bookingForm.roomId.trim() || !bookingForm.startTime || !bookingForm.endTime) { toast.error("Room ID, start and end time are required"); return; }
                // @ts-ignore
                createBookingMutation.mutate({ roomId: bookingForm.roomId.trim(), title: bookingForm.title || undefined, startTime: new Date(bookingForm.startTime).toISOString(), endTime: new Date(bookingForm.endTime).toISOString(), attendeeCount: bookingForm.attendeeCount ? Number(bookingForm.attendeeCount) : undefined });
              }}
              disabled={createBookingMutation.isPending}
              className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {createBookingMutation.isPending ? "Booking…" : "Book Room"}
            </button>
          </div>
        </div>
      </div>
    )}

    {showSpaceForm && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-body-sm font-bold flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" /> Add Space
            </h2>
            <button onClick={() => setShowSpaceForm(false)}><XCircle className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Space ID *</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={spaceForm.spaceId} onChange={(e) => setSpaceForm(f => ({ ...f, spaceId: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Name *</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={spaceForm.name} onChange={(e) => setSpaceForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Building</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={spaceForm.building} onChange={(e) => setSpaceForm(f => ({ ...f, building: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Floor</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={spaceForm.floor} onChange={(e) => setSpaceForm(f => ({ ...f, floor: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Type</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={spaceForm.type} onChange={(e) => setSpaceForm(f => ({ ...f, type: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Area</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={spaceForm.area} onChange={(e) => setSpaceForm(f => ({ ...f, area: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Capacity</label>
              <input type="number" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={spaceForm.capacity} onChange={(e) => setSpaceForm(f => ({ ...f, capacity: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Assigned To</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={spaceForm.assignedTo} onChange={(e) => setSpaceForm(f => ({ ...f, assignedTo: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Occupancy</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={spaceForm.occupancy} onChange={(e) => setSpaceForm(f => ({ ...f, occupancy: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Status</label>
              <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={spaceForm.status} onChange={(e) => setSpaceForm(f => ({ ...f, status: e.target.value }))}>
                <option value="acquired">Acquired</option>
                <option value="occupied">Occupied</option>
                <option value="let go">Let Go</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={() => setShowSpaceForm(false)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
            <button
              onClick={() => {
                if (!spaceForm.spaceId.trim() || !spaceForm.name.trim()) { toast.error("Space ID and Name are required"); return; }
                // @ts-ignore
                createSpaceMutation.mutate({
                  spaceId: spaceForm.spaceId,
                  name: spaceForm.name,
                  building: spaceForm.building || undefined,
                  floor: spaceForm.floor || undefined,
                  type: spaceForm.type || undefined,
                  area: spaceForm.area || undefined,
                  capacity: spaceForm.capacity ? Number(spaceForm.capacity) : undefined,
                  assignedTo: spaceForm.assignedTo || undefined,
                  occupancy: spaceForm.occupancy || undefined,
                  status: spaceForm.status as "acquired" | "occupied" | "let go"
                });
              }}
              disabled={createSpaceMutation.isPending}
              className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {createSpaceMutation.isPending ? "Adding…" : "Add Space"}
            </button>
          </div>
        </div>
      </div>
    )}

    {showMoveForm && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-body-sm font-bold flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> New Move Request
            </h2>
            <button onClick={() => setShowMoveForm(false)}><XCircle className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">From Location</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={moveForm.fromLocation} onChange={(e) => setMoveForm(f => ({ ...f, fromLocation: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">To Location *</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={moveForm.toLocation} onChange={(e) => setMoveForm(f => ({ ...f, toLocation: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Move Date</label>
              <input type="datetime-local" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={moveForm.moveDate} onChange={(e) => setMoveForm(f => ({ ...f, moveDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Reason / Notes</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={moveForm.notes} onChange={(e) => setMoveForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={() => setShowMoveForm(false)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
            <button
              onClick={() => {
                if (!moveForm.toLocation.trim()) { toast.error("To Location is required"); return; }
                // @ts-ignore
                createMoveMutation.mutate({ fromLocation: moveForm.fromLocation || undefined, toLocation: moveForm.toLocation, moveDate: moveForm.moveDate ? new Date(moveForm.moveDate).toISOString() : undefined, notes: moveForm.notes || undefined });
              }}
              disabled={createMoveMutation.isPending}
              className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {createMoveMutation.isPending ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </div>
      </div>
    )}

    {showFacReqForm && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-body-sm font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-primary" /> New Facility Request
            </h2>
            <button onClick={() => setShowFacReqForm(false)}><XCircle className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Type *</label>
              <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={facReqForm.type} onChange={(e) => setFacReqForm(f => ({ ...f, type: e.target.value }))}>
                <option value="maintenance">Maintenance</option>
                <option value="cleaning">Cleaning</option>
                <option value="catering">Catering</option>
                <option value="parking">Parking</option>
                <option value="access">Access</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Summary *</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={facReqForm.title} onChange={(e) => setFacReqForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Space / Building *</label>
              <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={facReqForm.spaceId} onChange={(e) => setFacReqForm(f => ({ ...f, spaceId: e.target.value }))}>
                <option value="">Select Space...</option>
                {SPACES.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name} ({space.building}{space.floor ? `, Flr ${space.floor}` : ""})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Description</label>
              <textarea className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" rows={3} value={facReqForm.description} onChange={(e) => setFacReqForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={() => setShowFacReqForm(false)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
            <button
              onClick={() => {
                if (!facReqForm.title.trim()) { toast.error("Summary is required"); return; }
                // @ts-ignore
                createFacReqMutation.mutate({ type: facReqForm.type, title: facReqForm.title, description: facReqForm.description || undefined, spaceId: facReqForm.spaceId || undefined });
              }}
              disabled={createFacReqMutation.isPending}
              className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {createFacReqMutation.isPending ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </div>
      </div>
    )}
    {showBuildingForm && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-body-sm font-bold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" /> Add New Building
            </h2>
            <button onClick={() => setShowBuildingForm(false)}><XCircle className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Building Name *</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={buildingForm.name} onChange={(e) => setBuildingForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Address / Location</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={buildingForm.address} onChange={(e) => setBuildingForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Number of Floors</label>
              <input type="number" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={buildingForm.floors} onChange={(e) => setBuildingForm(f => ({ ...f, floors: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Total Desks</label>
              <input type="number" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={buildingForm.totalDesks} onChange={(e) => setBuildingForm(f => ({ ...f, totalDesks: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Meeting Rooms</label>
              <input type="number" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={buildingForm.meetingRooms} onChange={(e) => setBuildingForm(f => ({ ...f, meetingRooms: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Type</label>
              <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={buildingForm.type} onChange={(e) => setBuildingForm(f => ({ ...f, type: e.target.value }))}>
                <option value="Office">Office</option>
                <option value="Retail">Retail</option>
                <option value="Data Center">Data Center</option>
                <option value="Warehouse">Warehouse</option>
              </select>
            </div>
            <div className="col-span-2 flex items-center gap-2 mt-2">
              <input type="checkbox" id="isDataCenter" checked={buildingForm.isDataCenter} onChange={(e) => setBuildingForm(f => ({ ...f, isDataCenter: e.target.checked }))} />
              <label htmlFor="isDataCenter" className="text-[12px] text-foreground">Includes Data Center</label>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={() => setShowBuildingForm(false)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
            <button
              onClick={() => {
                if (!buildingForm.name.trim()) { toast.error("Building name is required"); return; }
                const amenities = [];
                if (buildingForm.type) amenities.push(`Type:${buildingForm.type}`);
                if (buildingForm.meetingRooms) amenities.push(`Rooms:${buildingForm.meetingRooms}`);
                if (buildingForm.isDataCenter) amenities.push("Data Center");
                
                // @ts-ignore
                createBuildingMutation.mutate({ 
                  name: buildingForm.name, 
                  address: buildingForm.address || undefined, 
                  floors: buildingForm.floors ? Number(buildingForm.floors) : undefined, 
                  capacity: buildingForm.totalDesks ? Number(buildingForm.totalDesks) : undefined,
                  amenities
                });
              }}
              disabled={createBuildingMutation.isPending}
              className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {createBuildingMutation.isPending ? "Saving…" : "Save Building"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
