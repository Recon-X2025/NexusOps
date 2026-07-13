"use client";

import { useState } from "react";
import { Phone, Users, Clock, AlertTriangle, CheckCircle2, Plus, Bell, ChevronLeft, ChevronRight, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type OnCallPerson = { name: string; initials: string; phone: string };

type Rotation = {
  id: string;
  name: string;
  team: string;
  color?: string;
  members: Array<{ userId: string; name: string; phone: string; email: string }>;
};

function getCurrentOncall(rotation: Rotation) {
  const members = rotation.members ?? [];
  if (!members.length) return { name: "—", initials: "—", phone: "" };
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceEpoch = Math.floor(Date.now() / weekMs);
  const idx = weeksSinceEpoch % members.length;
  const p = members[idx]!;
  const initials = p.name ? p.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() : "—";
  return { name: p.name || "—", initials, phone: p.phone || "" };
}

export default function OnCallPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const router = useRouter();
  const canView = can("incidents", "read");
  const canWrite = can("incidents", "write");
  const [week, setWeek] = useState(0);
  const [showNewRotation, setShowNewRotation] = useState(false);
  const [newRotationName, setNewRotationName] = useState("");
  const [newRotationTeam, setNewRotationTeam] = useState("");
  const [newRotationType, setNewRotationType] = useState<"daily"|"weekly"|"custom">("weekly");

  // @ts-ignore
  const schedulesQuery = trpc.oncall.schedules.list.useQuery({}, mergeTrpcQueryOpts("oncall.schedules.list", { enabled: canView }));
  // @ts-ignore
  const escalationsQuery = trpc.oncall.escalations.list.useQuery({ limit: 50 }, mergeTrpcQueryOpts("oncall.escalations.list", { enabled: canView }));
  
  // @ts-ignore
  const incidentsQuery = trpc.oncall.incidents.list.useQuery({}, mergeTrpcQueryOpts("oncall.incidents.list", { enabled: canView }));
  const recentIncidents = incidentsQuery.data ?? [];

  // @ts-ignore
  const createRotation = trpc.oncall.schedules.create.useMutation({
    onSuccess: () => {
      toast.success("Rotation created");
      setShowNewRotation(false);
      setNewRotationName("");
      setNewRotationTeam("");
      schedulesQuery.refetch();
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  // @ts-ignore
  const createIncident = trpc.oncall.incidents.create.useMutation({
    onSuccess: () => {
      toast.success("Page sent successfully");
      incidentsQuery.refetch();
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to page"),
  });

  const rotations: Rotation[] = (schedulesQuery.data as Rotation[]) ?? [];
  const escalationSteps: any[] = escalationsQuery.data ?? [];
  // Group escalation steps by scheduleName
  const escalationPolicies = Object.values(
    escalationSteps.reduce((acc: Record<string, any>, step: any) => {
      const key = step.scheduleName ?? step.scheduleId ?? "Unknown";
      if (!acc[key]) acc[key] = { name: key, steps: [] };
      acc[key].steps.push(step);
      return acc;
    }, {})
  );

  if (!canView) return <AccessDenied module="On-Call Management" />;

  const today = new Date();
  const startOfCurrentWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  const weekStart = new Date(startOfCurrentWeek);
  weekStart.setDate(weekStart.getDate() + week * 7);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-body-sm font-semibold text-foreground">On-Call Scheduling</h1>
          <span className="text-[11px] text-muted-foreground/70">Rotation Management · Escalation Policies · Coverage</span>
        </div>
        <button
          onClick={() => setShowNewRotation(true)}
          className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
        >
          <Plus className="w-3 h-3" /> New Rotation
        </button>
      </div>

      {/* New Rotation Modal */}
      {showNewRotation && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-body-sm font-semibold">New On-Call Rotation</h2>
              <button onClick={() => setShowNewRotation(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Schedule Name *</label>
                <input
                  value={newRotationName}
                  onChange={(e) => setNewRotationName(e.target.value)}
                  placeholder="e.g. Platform Engineering On-Call"
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-body-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Team</label>
                <input
                  value={newRotationTeam}
                  onChange={(e) => setNewRotationTeam(e.target.value)}
                  placeholder="e.g. Platform Engineering"
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-body-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Rotation Type</label>
                <select
                  value={newRotationType}
                  onChange={(e) => setNewRotationType(e.target.value as any)}
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-body-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={() => setShowNewRotation(false)} className="px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={() => {
                  if (!newRotationName.trim()) { toast.error("Schedule name is required"); return; }
                  createRotation.mutate({ name: newRotationName.trim(), team: newRotationTeam.trim() || undefined, rotationType: newRotationType });
                }}
                disabled={createRotation.isPending}
                className="px-4 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {createRotation.isPending ? "Creating…" : "Create Rotation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Currently on-call */}
      {schedulesQuery.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="animate-pulse space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-muted rounded" />)}
          </div>
        </div>
      ) : rotations.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-[12px]">
          <Users className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
          <p>No on-call rotations configured</p>
          <button
            onClick={() => setShowNewRotation(true)}
            className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" /> New Rotation
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {rotations.map((rot) => {
            const person = getCurrentOncall(rot);
            return (
              <div key={rot.id} className="bg-card border border-border rounded p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${rot.color || 'bg-primary'} animate-pulse`} />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{rot.team || rot.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-full ${rot.color || 'bg-primary'} text-primary-foreground text-[11px] flex items-center justify-center font-bold`}>
                    {person.initials}
                  </span>
                  <div>
                    <div className="text-[12px] font-semibold text-foreground">{person.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{person.phone}</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    createIncident.mutate({ scheduleId: rot.id, userId: person.name });
                  }}
                  disabled={createIncident.isPending}
                  className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-[11px] rounded hover:bg-green-200 disabled:opacity-50"
                >
                  <Phone className="w-3 h-3" /> {createIncident.isPending ? "Paging..." : "Page Now"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Calendar */}
      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
          <button onClick={() => setWeek((w) => w - 1)} className="p-1 hover:bg-muted rounded">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <span className="text-[12px] font-semibold text-foreground/80">
            Week of {weekDates[0]!.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </span>
          <button onClick={() => setWeek((w) => w + 1)} className="p-1 hover:bg-muted rounded">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        {schedulesQuery.isLoading ? (
          <div className="animate-pulse p-4 space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-muted rounded" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase w-40">Team</th>
                  {weekDates.map((d) => (
                    <th key={d.toISOString()} className={`px-2 py-2 text-center text-[11px] font-medium min-w-24 ${d.toDateString() === new Date().toDateString() ? "bg-primary/5 text-primary" : "text-muted-foreground"}`}>
                      <div>{DAYS[d.getDay()]}</div>
                      <div className={`text-body font-bold ${d.toDateString() === new Date().toDateString() ? "text-primary" : "text-foreground"}`}>
                        {d.getDate()}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rotations.map((rot) => {
                  const person = getCurrentOncall(rot);
                  return (
                    <tr key={rot.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${rot.color || 'bg-primary'}`} />
                          <span className="text-[11px] text-foreground/80">{rot.team || rot.name}</span>
                        </div>
                      </td>
                      {weekDates.map((d) => {
                        const dayIncidents = recentIncidents.filter((inc: any) => 
                          inc.scheduleId === rot.id && 
                          new Date(inc.createdAt).toDateString() === d.toDateString()
                        );
                        const callCount = dayIncidents.length;
                        return (
                        <td key={d.toISOString()} className={`px-1 py-1 text-center ${d.toDateString() === new Date().toDateString() ? "bg-primary/5" : ""}`}>
                          <div className={`mx-auto w-full rounded px-1 py-1.5 text-[10px] ${rot.color || 'bg-primary'} bg-opacity-10 border border-opacity-20 flex flex-col items-center justify-center gap-1 h-full min-h-[50px]`}
                            style={{ backgroundColor: rot.color ? `${rot.color}20` : undefined }}>
                            <div className="flex flex-col items-center justify-center">
                              <div className="font-semibold text-foreground">{person.initials}</div>
                              <div className="text-muted-foreground w-full max-w-[80px]">{person.name.split(" ")[0]}</div>
                            </div>
                            {callCount > 0 && (
                              <div className="flex items-center justify-center gap-1 text-[9px] font-medium text-red-600 bg-red-100 rounded px-1.5 py-0.5">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {callCount} {callCount === 1 ? 'call' : 'calls'}
                              </div>
                            )}
                          </div>
                        </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Escalation policies */}
        <div className="bg-card border border-border rounded">
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Escalation Policies</span>
          </div>
          {escalationsQuery.isLoading ? (
            <div className="p-4 animate-pulse space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-6 bg-muted rounded" />)}</div>
          ) : escalationPolicies.length === 0 ? (
            <div className="p-4 text-center text-[12px] text-muted-foreground/60">
              No escalation policies configured yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(escalationPolicies as any[]).map((ep: any) => (
                <div key={ep.name} className="px-3 py-2">
                  <div className="text-[12px] font-semibold text-foreground/80 mb-1.5">{ep.name}</div>
                  <div className="space-y-1">
                    {ep.steps.map((step: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="w-14 text-muted-foreground/70 font-mono">{step.delay ?? `Step ${i + 1}`}</span>
                        <span className="text-muted-foreground">{step.notify ?? step.userId ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent incidents / pages */}
        <div className="bg-card border border-border rounded">
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Recent On-Call Incidents</span>
          </div>
          {incidentsQuery.isLoading ? (
            <div className="p-4 animate-pulse space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-6 bg-muted rounded" />)}</div>
          ) : recentIncidents.length === 0 ? (
            <div className="p-4 text-center text-[12px] text-muted-foreground/60">
              No on-call incidents yet.
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Schedule</th>
                  <th>Paged To</th>
                  <th>Triggered</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {recentIncidents.slice(0, 5).map((p: any) => (
                  <tr key={p.id}>
                    <td className="text-primary font-mono text-[11px]">{p.id?.slice(0, 8).toUpperCase()}</td>
                    <td className="text-[11px] text-muted-foreground max-w-24">
                      {rotations.find(r => r.id === p.scheduleId)?.team || rotations.find(r => r.id === p.scheduleId)?.name || p.scheduleId?.slice(0, 8)}
                    </td>
                    <td className="text-muted-foreground">{p.userId ?? "—"}</td>
                    <td className="text-muted-foreground font-mono text-[11px]">
                      {p.createdAt ? new Date(p.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
                    </td>
                    <td>
                      <span className={`status-badge ${p.status === "resolved" || p.resolvedAt ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100"}`}>
                        {p.resolvedAt || p.status === "resolved" ? "Resolved" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
