"use client";

import Link from "next/link";
import {
  Users, Users2, Building2, MapPin, UserPlus, UserMinus,
  ChevronRight, Calendar, Star, Loader2,
} from "lucide-react";
import { useRBAC } from "@/lib/rbac-context";
import { AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { formatRelativeTime } from "@/lib/utils";

function KPICard({ label, value, color, href, icon: Icon, isLoading }: {
  label: string; value: string | number; color: string; href?: string; icon: React.ElementType; isLoading?: boolean;
}) {
  const content = (
    <div className="bg-card border border-border rounded p-3 hover:shadow-sm transition-shadow cursor-pointer">
      <div className="flex items-start justify-between">
        <Icon className="w-4 h-4 text-muted-foreground/70" />
      </div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : value}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

const MODULES = [
  {
    label: "HR Service Delivery", href: "/app/hr",           icon: Users2,    color: "text-blue-600 bg-blue-50",
    description: "HR cases, onboarding/offboarding workflows, lifecycle events, employee documents.",
  },
  {
    label: "Employee Portal",     href: "/app/employee-portal", icon: Star,   color: "text-indigo-600 bg-indigo-50",
    description: "Employee self-service portal, announcements, my requests, knowledge search.",
  },
  {
    label: "Facilities & RE",     href: "/app/facilities",  icon: Building2, color: "text-purple-600 bg-purple-50",
    description: "Office space management, desk booking, visitor management, facilities work orders.",
  },
  {
    label: "Walk-Up Experience",  href: "/app/walk-up",     icon: MapPin,    color: "text-teal-600 bg-teal-50",
    description: "In-person service desk, walk-up queue, appointment scheduling.",
  },
];

export default function PeopleWorkplaceDashboard() {
  const { can } = useRBAC();
  if (!can("hr", "read") && !can("facilities", "read")) {
    return <AccessDenied module="People & Workplace" />;
  }

  const { data: hrCases, isLoading: loadingCases } = trpc.hr.cases.list.useQuery({});
  const { data: employees, isLoading: loadingEmp } = trpc.hr.employees.list.useQuery({});

  const openCases = hrCases ? hrCases.length : 0;
  const onboardingEmployees = employees ? employees.filter((e) => e.status === "onboarding").length : 0;
  const offboardingEmployees = employees ? employees.filter((e) => e.status === "offboarding").length : 0;
  const totalEmployees = employees ? employees.length : 0;

  const alerts = [
    offboardingEmployees > 0 ? { color: "bg-orange-500", text: `${offboardingEmployees} offboarding${offboardingEmployees !== 1 ? "s" : ""} in progress` } : null,
    onboardingEmployees > 0 ? { color: "bg-blue-500",   text: `${onboardingEmployees} onboarding${onboardingEmployees !== 1 ? "s" : ""} in progress` } : null,
  ].filter(Boolean) as { color: string; text: string }[];

  const moduleStats = [
    [
      { k: "Cases",      v: loadingCases ? "…" : String(openCases) },
      { k: "Onboarding", v: loadingEmp   ? "…" : String(onboardingEmployees) },
    ],
    [
      { k: "Active", v: loadingEmp ? "…" : String(employees?.filter((e) => e.status === "active").length ?? 0) },
      { k: "Total",  v: loadingEmp ? "…" : String(totalEmployees) },
    ],
    [
      { k: "Spaces", v: "—" },
    ],
    [
      { k: "Queue", v: "—" },
    ],
  ];

  return (
    <div className="flex flex-col gap-3 min-h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
            <Users className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Link href="/app/dashboard" className="hover:text-primary">Platform</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-foreground/70">People & Workplace</span>
            </div>
            <h1 className="text-sm font-semibold text-foreground leading-tight">People & Workplace Dashboard</h1>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground/60">4 modules · live data</span>
      </div>

      {alerts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-card border border-border rounded text-[11px] text-foreground/80">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.color}`} />
              {a.text}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        <KPICard label="Open HR Cases" value={openCases} color="text-blue-700" icon={Users2} href="/app/hr" isLoading={loadingCases} />
        <KPICard label="Active Onboardings" value={onboardingEmployees} color="text-green-700" icon={UserPlus} href="/app/hr" isLoading={loadingEmp} />
        <KPICard label="Pending Offboardings" value={offboardingEmployees} color="text-orange-700" icon={UserMinus} href="/app/hr" isLoading={loadingEmp} />
        <KPICard label="Total Employees" value={totalEmployees} color="text-purple-700" icon={Users} href="/app/hr" isLoading={loadingEmp} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {MODULES.map((m, idx) => {
          const Icon = m.icon;
          return (
            <Link key={m.label} href={m.href}
              className="bg-card border border-border rounded p-3 hover:shadow-sm hover:border-primary/30 transition-all group flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${m.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
              <div>
                <div className="text-[12px] font-semibold text-foreground">{m.label}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5 leading-snug">{m.description}</div>
              </div>
              <div className="flex gap-3 mt-auto pt-1 border-t border-border">
                {moduleStats[idx]?.map((s) => (
                  <div key={s.k} className="text-center">
                    <div className="text-[13px] font-bold text-foreground">{s.v}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{s.k}</div>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Recent HR Cases */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Users2 className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Recent HR Cases</span>
            </div>
            <Link href="/app/hr" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
              All <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loadingCases ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead><tr><th>ID</th><th>Type</th><th>Subject</th><th>State</th></tr></thead>
              <tbody>
                {(hrCases ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-muted-foreground py-4 text-[12px]">No HR cases found</td></tr>
                ) : (hrCases ?? []).slice(0, 5).map((row) => (
                  <tr key={row.hrCase.id}>
                    <td className="font-mono text-[11px] text-primary">{row.hrCase.id.slice(0, 8)}</td>
                    <td><span className="status-badge text-muted-foreground bg-muted capitalize">{row.hrCase.caseType?.replace(/_/g, " ") ?? "—"}</span></td>
                    <td className="max-w-[180px]"><span className="truncate block text-foreground">{row.employee.department ?? "—"}</span></td>
                    <td>
                      <span className={`status-badge ${row.hrCase.priority === "high" ? "text-orange-700 bg-orange-100" : row.hrCase.priority === "critical" ? "text-red-700 bg-red-100" : "text-muted-foreground bg-muted"}`}>
                        {row.hrCase.priority ?? "Medium"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* People Events — upcoming based on employees table */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Recent Employee Activity</span>
            </div>
            <Link href="/app/hr" className="text-[11px] text-primary hover:underline">HR →</Link>
          </div>
          {loadingEmp ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(employees ?? []).length === 0 ? (
                <div className="text-center text-muted-foreground py-4 text-[12px]">No employee records found</div>
              ) : (employees ?? []).slice(0, 5).map((e) => (
                <div key={e.id} className="flex items-start gap-3 px-3 py-2.5">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`status-badge text-[10px] ${e.status === "onboarding" ? "text-green-700 bg-green-100" : e.status === "offboarding" ? "text-red-700 bg-red-100" : "text-muted-foreground bg-muted"}`}>
                        {e.status?.replace(/_/g, " ") ?? "Active"}
                      </span>
                      <span className="text-[12px] font-semibold text-foreground">{e.employeeId}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/70">{e.title ?? e.department ?? "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
