"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { Clock, RefreshCw, Download, UserCheck, UserX, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { EmptyState, TableSkeleton, Pagination } from "@nexusops/ui";
import { downloadCSV } from "@/lib/utils";

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  present:  { label: "Present",   color: "text-green-700 bg-green-100" },
  absent:   { label: "Absent",    color: "text-red-700 bg-red-100" },
  half_day: { label: "Half Day",  color: "text-yellow-700 bg-yellow-100" },
  late:     { label: "Late",      color: "text-orange-700 bg-orange-100" },
  on_leave: { label: "On Leave",  color: "text-blue-700 bg-blue-100" },
  holiday:  { label: "Holiday",   color: "text-purple-700 bg-purple-100" },
  weekend:  { label: "Weekend",   color: "text-muted-foreground bg-muted" },
};

function fmtTime(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function AttendancePage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const canView  = can("hr", "read");
  const canWrite = can("hr", "write");

  const today   = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year,  setYear]  = useState(today.getFullYear());
  const [filterEmp, setFilterEmp] = useState("");
  const [page, setPage]   = useState(1);
  const PAGE_SIZE = 30;

  const utils       = trpc.useUtils();
  const employeesQ  = trpc.hr.listEmployees.useQuery({ limit: 200 }, mergeTrpcQueryOpts("hr.listEmployees", { enabled: canView }));
  const attendanceQ = trpc.hr.attendance.list.useQuery({ month, year, employeeId: filterEmp || undefined }, mergeTrpcQueryOpts("hr.attendance.list", { enabled: canView }));

  const clockInMut  = trpc.hr.attendance.clockIn.useMutation({ onSuccess: () => { toast.success("Clocked in"); void utils.hr.attendance.list.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });
  const clockOutMut = trpc.hr.attendance.clockOut.useMutation({ onSuccess: () => { toast.success("Clocked out"); void utils.hr.attendance.list.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });

  if (!canView) return <AccessDenied module="Attendance Management" />;

  const records  = (attendanceQ.data ?? []) as any[];
  const filtered = filterEmp ? records.filter(r => r.record?.employeeId === filterEmp) : records;
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const presentCount = records.filter(r => r.record?.status === "present" || r.record?.status === "late" || r.record?.status === "half_day").length;
  const absentCount  = records.filter(r => r.record?.status === "absent").length;
  const lateCount    = records.filter(r => r.record?.status === "late").length;

  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Attendance Management</h1>
          <span className="text-[11px] text-muted-foreground/70">Clock-In/Out · Daily Register · Monthly View</span>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(+e.target.value)} className="px-2 py-1 text-[12px] border border-border rounded bg-background text-foreground outline-none">
            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(+e.target.value)} className="px-2 py-1 text-[12px] border border-border rounded bg-background text-foreground outline-none">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => void attendanceQ.refetch()} className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground" aria-label="Refresh"><RefreshCw className="w-3 h-3" /> Refresh</button>
          <button onClick={() => downloadCSV(records.map(r => ({ Employee: `${r.employee?.firstName ?? ""} ${r.employee?.lastName ?? ""}`, Date: r.record?.date ? new Date(r.record.date).toLocaleDateString("en-IN") : "", Status: r.record?.status, CheckIn: fmtTime(r.record?.checkIn), CheckOut: fmtTime(r.record?.checkOut), Hours: r.record?.hoursWorked ?? "" })), "attendance")} className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground" aria-label="Export"><Download className="w-3 h-3" /> Export</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { l: "Total Records", v: records.length, c: "text-foreground", I: Clock },
          { l: "Present / Late", v: presentCount, c: "text-green-700", I: UserCheck },
          { l: "Absent", v: absentCount, c: "text-red-700", I: UserX },
          { l: "Late Arrivals", v: lateCount, c: "text-orange-700", I: AlertTriangle },
        ].map(k => (
          <div key={k.l} className="bg-card border border-border rounded px-3 py-2">
            <k.I className="w-4 h-4 text-muted-foreground/70 mb-1" />
            <div className={`text-xl font-bold ${k.c}`}>{k.v}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.l}</div>
          </div>
        ))}
      </div>

      {/* Employee filter */}
      <div className="flex items-center gap-2">
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} className="px-2 py-1.5 text-[12px] border border-border rounded bg-background text-foreground outline-none max-w-64">
          <option value="">All Employees</option>
          {((employeesQ.data as any)?.items ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
        </select>
      </div>

      {attendanceQ.isLoading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Clock} title="No attendance records" description={`No attendance data for ${months[month - 1]} ${year}.`} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/40 border-b border-border">
                <tr>{["Employee", "Date", "Status", "Shift", "Clock In", "Clock Out", "Hours", "Actions"].map(h => <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map((row: any) => {
                  const rec = row.record;
                  const emp = row.employee;
                  const cfg = STATUS_CFG[rec?.status] ?? STATUS_CFG.present;
                  return (
                    <tr key={rec?.id} className="bg-card hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-foreground">{emp?.firstName} {emp?.lastName}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{rec?.date ? new Date(rec.date).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-3 py-2.5"><span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.color}`}>{cfg.label}</span></td>
                      <td className="px-3 py-2.5 capitalize text-muted-foreground">{rec?.shiftType ?? "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">{fmtTime(rec?.checkIn)}</td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">{fmtTime(rec?.checkOut)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{rec?.hoursWorked ? `${rec.hoursWorked}h` : "—"}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {rec && !rec.checkOut && canWrite && (
                            <button onClick={() => clockOutMut.mutate({ id: rec.id })} className="px-2 py-0.5 text-[10px] bg-orange-100 text-orange-700 rounded hover:bg-orange-200">Clock Out</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
}
