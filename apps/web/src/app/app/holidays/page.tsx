"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { CalendarDays, Plus, RefreshCw, Download, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { EmptyState, TableSkeleton, ConfirmDialog } from "@nexusops/ui";

const TYPE_CFG: Record<string, { label: string; color: string }> = {
  national:   { label: "National",   color: "text-blue-700 bg-blue-100" },
  restricted: { label: "Restricted", color: "text-yellow-700 bg-yellow-100" },
  state:      { label: "State",      color: "text-purple-700 bg-purple-100" },
  company:    { label: "Company",    color: "text-green-700 bg-green-100" },
};

const INDIA_STATES = [
  { code: "MH", name: "Maharashtra" }, { code: "KA", name: "Karnataka" },
  { code: "DL", name: "Delhi" },       { code: "TN", name: "Tamil Nadu" },
  { code: "WB", name: "West Bengal" }, { code: "GJ", name: "Gujarat" },
  { code: "RJ", name: "Rajasthan" },   { code: "UP", name: "Uttar Pradesh" },
  { code: "AP", name: "Andhra Pradesh" }, { code: "TS", name: "Telangana" },
  { code: "KL", name: "Kerala" },      { code: "PB", name: "Punjab" },
  { code: "HR", name: "Haryana" },     { code: "MP", name: "Madhya Pradesh" },
  { code: "BR", name: "Bihar" },       { code: "OR", name: "Odisha" },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function HolidaysPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const canView  = can("hr", "read");
  const canWrite = can("hr", "write");

  const [year, setYear]         = useState(new Date().getFullYear());
  const [showAdd, setShowAdd]   = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", date: "", type: "national" as const, stateCode: "", year, isOptional: false, notes: "",
  });

  const utils     = trpc.useUtils();
  const holidaysQ = trpc.hr.holidays.list.useQuery({ year }, mergeTrpcQueryOpts("hr.holidays.list", { enabled: canView }));

  const createMut = trpc.hr.holidays.create.useMutation({ onSuccess: () => { toast.success("Holiday added"); setShowAdd(false); setForm(f => ({ ...f, name: "", date: "", stateCode: "", notes: "" })); void utils.hr.holidays.list.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });
  const deleteMut = trpc.hr.holidays.delete.useMutation({ onSuccess: () => { toast.success("Holiday removed"); setDeleteId(null); void utils.hr.holidays.list.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });
  const seedMut   = trpc.hr.holidays.seedIndiaHolidays.useMutation({ onSuccess: (d) => { toast.success(`Seeded ${(d as any).seeded} India national holidays`); void utils.hr.holidays.list.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });

  if (!canView) return <AccessDenied module="Holiday Calendar" />;

  const holidays = (holidaysQ.data ?? []) as any[];
  const byMonth  = MONTHS.map((m, i) => holidays.filter(h => new Date(h.date).getMonth() === i));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">India Holiday Calendar</h1>
          <span className="text-[11px] text-muted-foreground/70">National · State · Company holidays · SLA integration</span>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(+e.target.value)} className="px-2 py-1 text-[12px] border border-border rounded bg-background text-foreground outline-none">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => void holidaysQ.refetch()} className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground" aria-label="Refresh"><RefreshCw className="w-3 h-3" /> Refresh</button>
          <PermissionGate module="hr" action="write">
            <button onClick={() => seedMut.mutate({ year })} disabled={seedMut.isPending} className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground disabled:opacity-50">{seedMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Seed India {year}</button>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"><Plus className="w-3 h-3" /> Add Holiday</button>
          </PermissionGate>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {(["national", "state", "restricted", "company"] as const).map(t => {
          const n = holidays.filter(h => h.type === t).length;
          const cfg = TYPE_CFG[t];
          return (
            <div key={t} className="bg-card border border-border rounded px-3 py-2">
              <div className="text-xl font-bold text-foreground">{n}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide"><span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${cfg.color}`}>{cfg.label}</span></div>
            </div>
          );
        })}
      </div>

      {holidaysQ.isLoading ? (
        <TableSkeleton rows={8} cols={4} />
      ) : holidays.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No holidays configured" description={`No holidays for ${year} yet. Click "Seed India ${year}" to auto-populate national holidays, or add them manually.`} action={canWrite ? <button onClick={() => seedMut.mutate({ year })} className="px-3 py-1.5 bg-primary text-white text-[12px] rounded hover:bg-primary/90">Seed India {year}</button> : undefined} />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {MONTHS.map((m, i) => {
            const hs = byMonth[i];
            if (!hs || hs.length === 0) return null;
            return (
              <div key={m} className="bg-card border border-border rounded-lg p-3">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{m} {year}</h3>
                <div className="flex flex-col gap-1.5">
                  {hs.map((h: any) => {
                    const cfg = TYPE_CFG[h.type] ?? TYPE_CFG.national;
                    return (
                      <div key={h.id} className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="text-[11px] font-mono text-muted-foreground shrink-0 mt-0.5 w-8">{new Date(h.date).getDate()}</span>
                          <div className="min-w-0">
                            <span className="text-[12px] text-foreground font-medium block truncate">{h.name}</span>
                            <span className={`inline-block px-1 py-0.5 rounded text-[9px] font-semibold ${cfg.color}`}>{cfg.label}{h.stateCode ? ` · ${h.stateCode}` : ""}</span>
                          </div>
                        </div>
                        {canWrite && (
                          <button onClick={() => setDeleteId(h.id)} aria-label={`Remove ${h.name}`} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5"><X className="w-3 h-3" /></button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-sm font-semibold mb-4">Add Holiday</h2>
            <div className="flex flex-col gap-3">
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Holiday Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Diwali" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Date *</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none" /></div>
                <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Type</label><select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))} className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none">{Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
              </div>
              {form.type === "state" && <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">State</label><select value={form.stateCode} onChange={e => setForm(f => ({ ...f, stateCode: e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none"><option value="">All India</option>{INDIA_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></div>}
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer"><input type="checkbox" checked={form.isOptional} onChange={e => setForm(f => ({ ...f, isOptional: e.target.checked }))} className="rounded accent-primary" /> Optional / Restricted holiday</label>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Notes</label><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none" /></div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-[12px] border border-border rounded hover:bg-muted/50">Cancel</button>
              <button disabled={!form.name || !form.date || createMut.isPending} onClick={() => createMut.mutate({ name: form.name, date: new Date(form.date), type: form.type, stateCode: form.stateCode || null, year: new Date(form.date).getFullYear(), isOptional: form.isOptional, notes: form.notes || undefined })} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] rounded hover:bg-primary/90 disabled:opacity-50">
                {createMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Add Holiday
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Remove holiday?" description="This holiday will be removed from the calendar. SLA clocks will no longer pause on this date." confirmLabel="Remove" variant="destructive" loading={deleteMut.isPending} onConfirm={() => deleteId && deleteMut.mutate({ id: deleteId })} />
    </div>
  );
}
