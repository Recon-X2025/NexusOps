"use client";

import { useState } from "react";
import { Phone, Users, Clock, AlertTriangle, CheckCircle2, Plus, Bell, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type OnCallPerson = { name: string; initials: string; phone: string };

type Rotation = {
  team: string;
  color: string;
  schedule: Array<{ startDate: string; person: OnCallPerson }>;
};

function getCurrentOncall(rotation: Rotation) {
  const now = new Date();
  const slots = rotation.schedule ?? [];
  if (!slots.length) return { name: "—", initials: "—", phone: "" };
  let current = slots[0]!;
  for (const slot of slots) {
    if (new Date(slot.startDate) <= now) current = slot;
    else break;
  }
  return current.person;
}

export default function OnCallPage() {
  const { can } = useRBAC();
  const canView = can("incidents", "read");
  const [week, setWeek] = useState(0);

  // @ts-ignore
  const schedulesQuery = trpc.oncall.schedules.list.useQuery(undefined, { enabled: canView });
  // @ts-ignore
  const escalationsQuery = trpc.oncall.escalations.list.useQuery({ limit: 50 }, { enabled: canView });
  // @ts-ignore
  const incidentsQuery = trpc.oncall.incidents.list.useQuery({ limit: 10 }, { enabled: canView });
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
  const recentIncidents: any[] = (incidentsQuery.data as any[]) ?? [];

  if (!canView) return <AccessDenied module="On-Call Management" />;

  const weekStart = new Date(2026, 2, 23 + week * 7);
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
          <h1 className="text-sm font-semibold text-foreground">On-Call Scheduling</h1>
          <span className="text-[11px] text-muted-foreground/70">Rotation Management · Escalation Policies · Coverage</span>
        </div>
        <button className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
          <Plus className="w-3 h-3" /> New Rotation
        </button>
      </div>

      {/* Currently on-call */}
      {schedulesQuery.isLoading ? (
        <div className="grid grid-cols-4 gap-2">
          <div className="animate-pulse space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-muted rounded" />)}
          </div>
        </div>
      ) : rotations.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-[12px]">
          <Users className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
          No on-call rotations configured
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {rotations.map((rot) => {
            const person = getCurrentOncall(rot);
            return (
              <div key={rot.team} className="bg-card border border-border rounded p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${rot.color} animate-pulse`} />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{rot.team}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-full ${rot.color} text-white text-[11px] flex items-center justify-center font-bold`}>
                    {person.initials}
                  </span>
                  <div>
                    <div className="text-[12px] font-semibold text-foreground">{person.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{person.phone}</div>
                  </div>
                </div>
                <button className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-[11px] rounded hover:bg-green-200">
                  <Phone className="w-3 h-3" /> Page Now
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
                      <div className={`text-base font-bold ${d.toDateString() === new Date().toDateString() ? "text-primary" : "text-foreground"}`}>
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
                    <tr key={rot.team} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${rot.color}`} />
                          <span className="text-[11px] text-foreground/80">{rot.team}</span>
                        </div>
                      </td>
                      {weekDates.map((d) => (
                        <td key={d.toISOString()} className={`px-1 py-1 text-center ${d.toDateString() === new Date().toDateString() ? "bg-primary/5" : ""}`}>
                          <div className={`mx-auto w-full rounded px-1 py-1.5 text-[10px] ${rot.color} bg-opacity-10 border border-opacity-20`}
                            style={{ backgroundColor: `${rot.color}20` }}>
                            <div className="font-semibold text-foreground">{person.initials}</div>
                            <div className="text-muted-foreground truncate">{person.name.split(" ")[0]}</div>
                          </div>
                        </td>
                      ))}
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
                {recentIncidents.map((p: any) => (
                  <tr key={p.id}>
                    <td className="text-primary font-mono text-[11px]">{p.id?.slice(-8).toUpperCase()}</td>
                    <td className="text-[11px] text-muted-foreground truncate max-w-24">{p.scheduleId?.slice(-8) ?? "—"}</td>
                    <td className="text-muted-foreground">{p.userId?.slice(-6) ?? "—"}</td>
                    <td className="text-muted-foreground font-mono text-[11px]">
                      {p.createdAt ? new Date(p.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
                    </td>
                    <td>
                      <span className={`status-badge ${p.status === "resolved" || p.resolvedAt ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100"}`}>
                        {p.resolvedAt ? "Resolved" : "Active"}
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
