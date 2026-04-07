"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { Target, Plus, RefreshCw, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { EmptyState, TableSkeleton } from "@nexusops/ui";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  on_track:  "text-green-700 bg-green-100",
  at_risk:   "text-yellow-700 bg-yellow-100",
  behind:    "text-red-700 bg-red-100",
  completed: "text-blue-700 bg-blue-100",
  draft:     "text-muted-foreground bg-muted",
  active:    "text-green-700 bg-green-100",
  cancelled: "text-muted-foreground bg-muted",
};

const CYCLES = ["q1","q2","q3","q4","annual"] as const;

export default function OKRPage() {
  const { can } = useRBAC();
  const canView  = can("hr", "read");
  const canWrite = can("hr", "write");

  const [year, setYear]   = useState(new Date().getFullYear());
  const [cycle, setCycle] = useState<typeof CYCLES[number] | "">("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [showNewObj, setShowNewObj] = useState(false);
  const [showNewKR, setShowNewKR]   = useState<string | null>(null);

  const [objForm, setObjForm] = useState({ title: "", description: "", ownerId: "", cycle: "q1" as typeof CYCLES[number], year });
  const [krForm, setKRForm]   = useState({ title: "", targetValue: "100", unit: "%", dueDate: "" });
  const [updateKR, setUpdateKR] = useState<{ id: string; current: number } | null>(null);

  const utils = trpc.useUtils();
  const objectivesQ   = trpc.hr.okr.listObjectives.useQuery({ year, cycle: cycle || undefined }, { enabled: canView });
  const employeesQ    = trpc.hr.listEmployees.useQuery({ limit: 200 }, { enabled: canView && showNewObj });

  const createObjMut  = trpc.hr.okr.createObjective.useMutation({ onSuccess: () => { toast.success("Objective created"); setShowNewObj(false); void utils.hr.okr.listObjectives.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });
  const createKRMut   = trpc.hr.okr.createKeyResult.useMutation({ onSuccess: () => { toast.success("Key Result added"); setShowNewKR(null); void utils.hr.okr.listObjectives.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });
  const updateKRMut   = trpc.hr.okr.updateKeyResult.useMutation({ onSuccess: () => { toast.success("Progress updated"); setUpdateKR(null); void utils.hr.okr.listObjectives.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });

  if (!canView) return <AccessDenied module="OKRs & Goals" />;

  const objectives = (objectivesQ.data ?? []) as any[];

  function toggleExpand(id: string) {
    setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">OKRs & Goal Management</h1>
          <span className="text-[11px] text-muted-foreground/70">Objectives · Key Results · Progress tracking</span>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(+e.target.value)} className="px-2 py-1 text-[12px] border border-border rounded bg-background text-foreground outline-none">{[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}</select>
          <select value={cycle} onChange={e => setCycle(e.target.value as any)} className="px-2 py-1 text-[12px] border border-border rounded bg-background text-foreground outline-none"><option value="">All Cycles</option>{CYCLES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select>
          <button onClick={() => void objectivesQ.refetch()} className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground" aria-label="Refresh"><RefreshCw className="w-3 h-3" /></button>
          <PermissionGate module="hr" action="write"><button onClick={() => setShowNewObj(true)} className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"><Plus className="w-3 h-3" /> New Objective</button></PermissionGate>
        </div>
      </div>

      {objectivesQ.isLoading ? <TableSkeleton rows={4} cols={3} /> : objectives.length === 0 ? (
        <EmptyState icon={Target} title="No objectives yet" description={`No OKRs for ${year}${cycle ? " " + cycle.toUpperCase() : ""}. Create your first objective to start tracking goals.`} action={canWrite ? <button onClick={() => setShowNewObj(true)} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[12px] rounded"><Plus className="w-3 h-3" /> New Objective</button> : undefined} />
      ) : (
        <div className="flex flex-col gap-2">
          {objectives.map(({ objective, owner, keyResults }) => {
            const isOpen = expanded.has(objective.id);
            return (
              <div key={objective.id} className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20" onClick={() => toggleExpand(objective.id)}>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-foreground">{objective.title}</span>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[objective.status] ?? ""}`}>{objective.status}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">{objective.cycle?.toUpperCase()} {objective.year}</span>
                    </div>
                    {objective.description && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{objective.description}</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-32">
                      <div className="flex justify-between text-[10px] mb-0.5"><span className="text-muted-foreground">Progress</span><span className="font-semibold text-foreground">{objective.overallProgress}%</span></div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${objective.overallProgress}%` }} /></div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{owner?.name ?? "—"}</div>
                    {canWrite && <button onClick={e => { e.stopPropagation(); setShowNewKR(objective.id); setKRForm({ title: "", targetValue: "100", unit: "%", dueDate: "" }); }} className="flex items-center gap-0.5 px-2 py-0.5 text-[10px] border border-border rounded hover:bg-muted/50"><Plus className="w-3 h-3" /> KR</button>}
                  </div>
                </div>
                {isOpen && keyResults.length > 0 && (
                  <div className="border-t border-border divide-y divide-border/50">
                    {keyResults.map((kr: any) => {
                      const pct = Math.min(100, Math.round((Number(kr.currentValue) / Math.max(Number(kr.targetValue), 1)) * 100));
                      return (
                        <div key={kr.id} className="flex items-center gap-4 px-6 py-2.5 bg-muted/10">
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] text-foreground font-medium">{kr.title}</div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[11px] text-muted-foreground">{Number(kr.currentValue).toLocaleString()} / {Number(kr.targetValue).toLocaleString()} {kr.unit}</span>
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[kr.status] ?? ""}`}>{(kr.status ?? "").replace("_", " ")}</span>
                            </div>
                          </div>
                          <div className="w-24">
                            <div className="flex justify-between text-[10px] mb-0.5"><span className="text-muted-foreground/60"></span><span className="font-semibold">{pct}%</span></div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} /></div>
                          </div>
                          {canWrite && <button onClick={() => setUpdateKR({ id: kr.id, current: Number(kr.currentValue) })} className="px-2 py-0.5 text-[10px] border border-border rounded hover:bg-muted/50 shrink-0">Update</button>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {isOpen && keyResults.length === 0 && (
                  <div className="px-6 py-3 text-[11px] text-muted-foreground bg-muted/10 border-t border-border">No key results yet. {canWrite && <button onClick={() => setShowNewKR(objective.id)} className="text-primary hover:underline">Add Key Result</button>}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New Objective modal */}
      {showNewObj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-sm font-semibold mb-4">New Objective</h2>
            <div className="flex flex-col gap-3">
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Title *</label><input value={objForm.title} onChange={e => setObjForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Improve customer satisfaction" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50" /></div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Description</label><textarea value={objForm.description} onChange={e => setObjForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none resize-none" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Cycle</label><select value={objForm.cycle} onChange={e => setObjForm(f => ({ ...f, cycle: e.target.value as any }))} className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none">{CYCLES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select></div>
                <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Year</label><input type="number" value={objForm.year} onChange={e => setObjForm(f => ({ ...f, year: +e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none" /></div>
                <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Owner</label><select value={objForm.ownerId} onChange={e => setObjForm(f => ({ ...f, ownerId: e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none"><option value="">Select…</option>{((employeesQ.data as any)?.items ?? []).map((emp: any) => <option key={emp.userId ?? emp.id} value={emp.userId ?? emp.id}>{emp.firstName} {emp.lastName}</option>)}</select></div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setShowNewObj(false)} className="px-3 py-1.5 text-[12px] border border-border rounded hover:bg-muted/50">Cancel</button>
              <button disabled={!objForm.title || !objForm.ownerId || createObjMut.isPending} onClick={() => createObjMut.mutate(objForm)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] rounded disabled:opacity-50">{createObjMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Create</button>
            </div>
          </div>
        </div>
      )}

      {/* New Key Result modal */}
      {showNewKR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-sm font-semibold mb-4">Add Key Result</h2>
            <div className="flex flex-col gap-3">
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Title *</label><input value={krForm.title} onChange={e => setKRForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Achieve NPS > 60" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Target Value</label><input type="number" value={krForm.targetValue} onChange={e => setKRForm(f => ({ ...f, targetValue: e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none" /></div>
                <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Unit</label><input value={krForm.unit} onChange={e => setKRForm(f => ({ ...f, unit: e.target.value }))} placeholder="%, score, count…" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none" /></div>
              </div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Due Date</label><input type="date" value={krForm.dueDate} onChange={e => setKRForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none" /></div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setShowNewKR(null)} className="px-3 py-1.5 text-[12px] border border-border rounded hover:bg-muted/50">Cancel</button>
              <button disabled={!krForm.title || createKRMut.isPending} onClick={() => createKRMut.mutate({ objectiveId: showNewKR, title: krForm.title, targetValue: parseFloat(krForm.targetValue || "100"), unit: krForm.unit, dueDate: krForm.dueDate ? new Date(krForm.dueDate) : undefined })} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] rounded disabled:opacity-50">{createKRMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Update KR progress modal */}
      {updateKR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-xs p-6">
            <h2 className="text-sm font-semibold mb-4">Update Progress</h2>
            <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Current Value</label><input type="number" value={updateKR.current} onChange={e => setUpdateKR(p => p ? { ...p, current: +e.target.value } : null)} className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50" /></div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setUpdateKR(null)} className="px-3 py-1.5 text-[12px] border border-border rounded hover:bg-muted/50">Cancel</button>
              <button disabled={updateKRMut.isPending} onClick={() => updateKRMut.mutate({ id: updateKR.id, currentValue: updateKR.current })} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] rounded disabled:opacity-50">{updateKRMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Update</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
