"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  UserCircle, ChevronLeft, CheckCircle2,
  FileText, Send, Calendar, Building2, Shield, Users,
} from "lucide-react";
import { useRBAC, PermissionGate, AccessDenied } from "@/lib/rbac-context";
import { formatRelativeTime } from "@/lib/utils";

import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";
import { DetailGrid } from "@/components/ui/detail-grid";

export default function HRCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [tab, setTab] = useState("tasks");
  const [noteText, setNoteText] = useState("");
  const { can, mergeTrpcQueryOpts } = useRBAC();

  const caseQuery = trpc.hr.cases.get.useQuery({ id }, mergeTrpcQueryOpts("hr.cases.get", { enabled: !!id }));

  const completeTask = trpc.hr.cases.completeTask.useMutation({
    onSuccess: () => { toast.success("Task marked complete"); caseQuery.refetch(); },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });

  const addNote = trpc.hr.cases.addNote.useMutation({
    onSuccess: () => { toast.success("Note added"); setNoteText(""); caseQuery.refetch(); },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });

  if (!can("hr", "read")) return <AccessDenied module="HR Service Delivery" />;

  return (
    <div className="flex flex-col gap-6 p-6">
      <ResourceView
        query={caseQuery}
        resourceName="HR Case"
        backHref="/app/hr"
      >
        {({ hrCase, employee, tasks }) => {
          const doneTasks = tasks.filter((t: any) => t.status === "done").length;
          const pct = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0;
          const notesLines = hrCase.notes
            ? hrCase.notes.split("\n\n").filter(Boolean)
            : [];

          return (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <PageHeader
                title={`${hrCase.caseType.charAt(0).toUpperCase() + hrCase.caseType.slice(1)} Case`}
                subtitle={`HR Service Delivery / ${hrCase.id.slice(0, 8).toUpperCase()}`}
                icon={UserCircle}
                backHref="/app/hr"
                badge={
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100">
                      {hrCase.caseType}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-yellow-700 bg-yellow-100">
                      Priority: {hrCase.priority}
                    </span>
                  </div>
                }
                actions={
                  <div className="flex flex-col items-end">
                    <div className="text-2xl font-black text-primary leading-none">{pct}%</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Completion</div>
                  </div>
                }
              />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 flex flex-col gap-6">
                  {/* Overview Card */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      Case Overview
                    </h3>
                    <div className="space-y-4">
                      {hrCase.notes && (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {hrCase.notes.split("\n\n")[0]?.replace(/^\[.+?\]\s*/, "")}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
                        <div className="flex flex-col gap-1">
                          <span className="uppercase tracking-widest text-[9px] font-bold text-muted-foreground/50">Opened On</span>
                          <span className="font-medium text-foreground">{new Date(hrCase.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="uppercase tracking-widest text-[9px] font-bold text-muted-foreground/50">Assigned To</span>
                          <span className="font-medium text-foreground">{hrCase.assigneeId ? hrCase.assigneeId.slice(0, 8) : "Unassigned"}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="uppercase tracking-widest text-[9px] font-bold text-muted-foreground/50">Tasks</span>
                          <span className="font-medium text-foreground">{doneTasks} of {tasks.length} complete</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tabs Section */}
                  <div className="flex flex-col">
                    <div className="flex border-b border-border mb-4">
                      {[
                        { key: "tasks", label: `Tasks (${tasks.length})` },
                        { key: "notes", label: "Work Notes" },
                      ].map((t) => (
                        <button
                          key={t.key}
                          onClick={() => setTab(t.key)}
                          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all
                            ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                      {tab === "tasks" && (
                        tasks.length === 0 ? (
                          <div className="p-12 text-center text-sm text-muted-foreground/60 italic">No tasks for this case yet.</div>
                        ) : (
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-muted/50 border-b border-border">
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Task</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Due Date</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {tasks.map((t: any) => (
                                <tr key={t.id} className={cn("hover:bg-muted/30 transition-colors", t.status === "done" && "opacity-60")}>
                                  <td className="px-4 py-3 text-sm font-medium text-foreground">{t.title}</td>
                                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                                    {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                                      t.status === "done" ? "text-green-700 bg-green-100" :
                                      t.status === "in_progress" ? "text-blue-700 bg-blue-100" :
                                      "text-muted-foreground bg-muted"
                                    )}>
                                      {t.status.replace("_", " ")}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {t.status !== "done" && (
                                      <PermissionGate module="hr" action="write">
                                        <button
                                          onClick={() => completeTask.mutate({ taskId: t.id })}
                                          disabled={completeTask.isPending}
                                          className="text-[11px] font-bold text-primary hover:underline disabled:opacity-50"
                                        >
                                          Complete
                                        </button>
                                      </PermissionGate>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      )}

                      {tab === "notes" && (
                        <div className="p-5">
                          <PermissionGate module="hr" action="write">
                            <div className="border border-border rounded-xl overflow-hidden mb-6 bg-muted/20">
                              <textarea
                                rows={3}
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                className="w-full px-4 py-3 text-sm bg-transparent outline-none resize-none border-none focus:ring-0"
                                placeholder="Add internal work note..."
                              />
                              <div className="flex justify-end px-4 py-2 bg-muted/40 border-t border-border">
                                <button
                                  onClick={() => {
                                    if (!noteText.trim()) { toast.error("Note cannot be empty"); return; }
                                    addNote.mutate({ caseId: hrCase.id, note: noteText.trim() });
                                  }}
                                  disabled={addNote.isPending || !noteText.trim()}
                                  className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 transition-all disabled:opacity-60"
                                >
                                  <Send className="w-3.5 h-3.5" /> {addNote.isPending ? "Saving…" : "Post Note"}
                                </button>
                              </div>
                            </div>
                          </PermissionGate>

                          {notesLines.length === 0 ? (
                            <div className="text-center p-8">
                              <p className="text-sm text-muted-foreground italic">No work notes yet.</p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {notesLines.slice().reverse().map((line: string, i: number) => {
                                const match = line.match(/^\[(.+?)\]\s*([\s\S]*)/);
                                const ts = match ? match[1] : "";
                                const text = match ? match[2] : line;
                                return (
                                  <div key={i} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                                    {ts && (
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                          {formatRelativeTime(new Date(ts))}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground/50">
                                          {new Date(ts).toLocaleString()}
                                        </span>
                                      </div>
                                    )}
                                    <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{text}</p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  {/* Employee Details using DetailGrid */}
                  <DetailGrid
                    title="Employee Profile"
                    icon={Building2}
                    items={[
                      { label: "Employee ID", value: employee.employeeId, className: "font-mono" },
                      { label: "Department", value: employee.department },
                      { label: "Title", value: employee.title },
                      { label: "Location", value: employee.location },
                      { label: "Employment Type", value: employee.employmentType },
                      {
                        label: "Status",
                        value: (
                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                            employee.status === "active" ? "text-green-700 bg-green-100" : "text-muted-foreground bg-muted"
                          )}>
                            {employee.status}
                          </span>
                        )
                      },
                    ].filter(i => i.value)}
                  />

                  {/* Quick Access Card */}
                  <div className="bg-muted/30 border border-border border-dashed rounded-xl p-5">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Quick Links</h3>
                    <div className="flex flex-col gap-2">
                      <Link href={`/app/hr/employees/${employee.id}`} className="text-xs font-medium text-primary hover:underline flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" /> Full Employee Record
                      </Link>
                      <button className="text-xs font-medium text-primary hover:underline flex items-center gap-2 text-left">
                        <Shield className="w-3.5 h-3.5" /> Access Control Settings
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      </ResourceView>
    </div>
  );
}
