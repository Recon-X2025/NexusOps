"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Star, Plus, Download, BarChart2, CheckCircle2, Clock,
  Send, Users, TrendingUp, MessageSquare, ChevronDown,
  Eye, Edit2, Copy, Trash2, Globe,
} from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { downloadCSV } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

const SURVEY_TABS = [
  { key: "dashboard", label: "Dashboard",          module: "reports"   as const, action: "read"  as const },
  { key: "surveys",   label: "All Surveys",         module: "reports"   as const, action: "read"  as const },
  { key: "builder",   label: "Survey Builder",      module: "reports"   as const, action: "write" as const },
  { key: "results",   label: "Results & Analytics", module: "analytics" as const, action: "read"  as const },
];

type SurveyType = "csat" | "nps" | "employee_pulse" | "post_incident" | "exit" | "onboarding" | "training" | "vendor";
type SurveyStatus = "draft" | "active" | "paused" | "closed" | "scheduled";

interface Survey {
  id: string;
  number: string;
  title: string;
  type: SurveyType;
  status: SurveyStatus;
  trigger: string;
  target: string;
  sent: number;
  responses: number;
  avgScore?: number;
  npsScore?: number;
  created: string;
  lastResponse?: string;
  closingDate?: string;
  questions: number;
  creator: string;
}

const SURVEYS: Survey[] = [
  { id: "sv-001", number: "SV-2026-0088", title: "IT Service Desk CSAT — Ongoing",     type: "csat",            status: "active",    trigger: "Auto: 2hrs after incident closure", target: "All employees", sent: 1240, responses: 820, avgScore: 4.3, created: "2026-01-01", lastResponse: "2 min ago", questions: 5, creator: "IT Service Desk" },
  { id: "sv-002", number: "SV-2026-0087", title: "Q1 2026 Employee Pulse Survey",       type: "employee_pulse",  status: "active",    trigger: "Manual", target: "All employees", sent: 950, responses: 612, avgScore: 3.8, created: "2026-03-01", lastResponse: "15 min ago", closingDate: "2026-03-31", questions: 12, creator: "HR Team" },
  { id: "sv-003", number: "SV-2026-0086", title: "NexusOps Platform NPS",               type: "nps",             status: "active",    trigger: "Auto: Monthly — active users", target: "Platform users", sent: 850, responses: 340, npsScore: 62, created: "2026-01-01", lastResponse: "1 hr ago", questions: 3, creator: "Product Team" },
  { id: "sv-004", number: "SV-2026-0085", title: "Post-Incident Survey — P1/P2",        type: "post_incident",   status: "active",    trigger: "Auto: On P1/P2 closure", target: "Incident stakeholders", sent: 48, responses: 31, avgScore: 3.9, created: "2026-01-01", lastResponse: "Yesterday", questions: 6, creator: "IT Ops" },
  { id: "sv-005", number: "SV-2026-0084", title: "Onboarding Experience — New Hires",   type: "onboarding",      status: "active",    trigger: "Auto: 30 days after start date", target: "New hires < 60 days", sent: 12, responses: 9, avgScore: 4.6, created: "2026-01-01", lastResponse: "3 days ago", questions: 10, creator: "HR Team" },
  { id: "sv-006", number: "SV-2026-0083", title: "Exit Interview — Voluntary Leavers",  type: "exit",            status: "active",    trigger: "Manual: on resignation", target: "Departing employees", sent: 6, responses: 4, avgScore: 3.2, created: "2026-01-01", lastResponse: "2026-03-18", questions: 15, creator: "HR Team" },
  { id: "sv-007", number: "SV-2026-0082", title: "Vendor Performance Review — Annual",  type: "vendor",          status: "scheduled", trigger: "Scheduled: 2026-04-01", target: "Contract owners", sent: 0, responses: 0, created: "2026-03-20", closingDate: "2026-04-30", questions: 8, creator: "Procurement" },
  { id: "sv-008", number: "SV-2025-0214", title: "Training Effectiveness — AwarenessProg", type: "training",     status: "closed",    trigger: "Manual", target: "Security Awareness cohort", sent: 280, responses: 248, avgScore: 4.1, created: "2025-12-01", lastResponse: "2025-12-15", questions: 8, creator: "Security Team" },
];

const TYPE_CFG: Record<SurveyType, { label: string; color: string; icon: string }> = {
  csat:           { label: "CSAT",          color: "text-blue-700 bg-blue-100",    icon: "⭐" },
  nps:            { label: "NPS",           color: "text-purple-700 bg-purple-100",icon: "📊" },
  employee_pulse: { label: "Pulse Survey",  color: "text-green-700 bg-green-100",  icon: "💚" },
  post_incident:  { label: "Post-Incident", color: "text-orange-700 bg-orange-100",icon: "🔥" },
  exit:           { label: "Exit Interview",color: "text-red-700 bg-red-100",      icon: "👋" },
  onboarding:     { label: "Onboarding",    color: "text-teal-700 bg-teal-100",    icon: "🎉" },
  training:       { label: "Training",      color: "text-indigo-700 bg-indigo-100",icon: "📚" },
  vendor:         { label: "Vendor Review", color: "text-muted-foreground bg-muted",  icon: "🏢" },
};

const STATUS_CFG: Record<SurveyStatus, string> = {
  draft:      "text-muted-foreground bg-muted",
  active:     "text-green-700 bg-green-100",
  paused:     "text-yellow-700 bg-yellow-100",
  closed:     "text-muted-foreground/70 bg-muted/30",
  scheduled:  "text-blue-700 bg-blue-100",
};

const RESPONSE_RATE = (sent: number, responses: number) =>
  sent > 0 ? Math.round((responses / sent) * 100) : 0;

const SCORE_COLOR = (s?: number) => !s ? "text-muted-foreground/70" : s >= 4.5 ? "text-green-700" : s >= 3.5 ? "text-blue-700" : s >= 3 ? "text-yellow-600" : "text-red-700";
const NPS_COLOR = (n?: number) => !n ? "text-muted-foreground/70" : n >= 50 ? "text-green-700" : n >= 20 ? "text-blue-700" : "text-red-700";

const CSAT_RESULTS = {
  overall: 0,
  responses: 0,
  trend: "No data yet",
  byCategory: [] as { cat: string; score: number }[],
  distribution: [] as { stars: number; count: number; pct: number }[],
  recentComments: [] as { score: number; comment: string; submitted: string }[],
};

const PULSE_RESULTS = {
  responses: 0,
  responseRate: 0,
  eNPS: 0,
  categories: [] as { cat: string; score: number; prev: number }[],
};

const BUILDER_TEMPLATE = {
  title: "IT Service Desk CSAT",
  questions: [
    { id: 1, type: "rating", text: "How would you rate the overall quality of the support you received?", required: true, scale: 5 },
    { id: 2, type: "rating", text: "How satisfied are you with the speed of resolution?", required: true, scale: 5 },
    { id: 3, type: "single_choice", text: "Was your issue fully resolved on first contact?", required: true, options: ["Yes", "No — escalated", "No — ongoing"] },
    { id: 4, type: "rating", text: "How professional and courteous was the support agent?", required: true, scale: 5 },
    { id: 5, type: "open_text", text: "Any additional feedback or suggestions for improvement?", required: false },
  ],
};

export default function SurveysPage() {
  const { can } = useRBAC();
  const utils = trpc.useUtils();
  const visibleTabs = SURVEY_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "dashboard");
  const [selectedResult, setSelectedResult] = useState("sv-001");
  const [editingSurveyId, setEditingSurveyId] = useState<string | null>(null);
  const [builderTitle, setBuilderTitle] = useState("New Survey");
  const [builderType, setBuilderType] = useState<string>("csat");
  const [builderQuestions, setBuilderQuestions] = useState<any[]>(BUILDER_TEMPLATE.questions);
  const [newQuestionText, setNewQuestionText] = useState("");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);

  const { data: surveysData, refetch: refetchSurveys } = trpc.surveys.list.useQuery(
    { limit: 50 },
    { refetchOnWindowFocus: false },
  );

  // Live results for selected survey
  const isRealSurveyId = /^[0-9a-f-]{36}$/.test(selectedResult);
  const { data: liveResults } = trpc.surveys.getResults.useQuery(
    { id: selectedResult },
    { enabled: isRealSurveyId, refetchOnWindowFocus: false },
  );

  // Dashboard: get results for first CSAT and first Pulse surveys
  const csatSurveyId = (surveysData as any[] | undefined)?.find((s: any) => s.type === "csat" && s.status === "active")?.id ?? null;
  const pulseSurveyId = (surveysData as any[] | undefined)?.find((s: any) => (s.type === "pulse" || s.type === "enps") && s.status === "active")?.id ?? null;
  const { data: csatResults } = trpc.surveys.getResults.useQuery(
    { id: csatSurveyId ?? "" },
    { enabled: !!csatSurveyId, refetchOnWindowFocus: false },
  );
  const { data: pulseResults } = trpc.surveys.getResults.useQuery(
    { id: pulseSurveyId ?? "" },
    { enabled: !!pulseSurveyId, refetchOnWindowFocus: false },
  );

  const createSurvey = trpc.surveys.create.useMutation({
    onSuccess: (survey) => {
      toast.success("Survey draft saved");
      setEditingSurveyId(survey.id);
      refetchSurveys();
    },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });

  const updateSurvey = trpc.surveys.update.useMutation({
    onSuccess: () => { toast.success("Survey draft saved"); refetchSurveys(); },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });

  const activateSurvey = trpc.surveys.activate.useMutation({
    onSuccess: () => {
      toast.success("Survey activated — responses will appear in the dashboard");
      setTab("surveys");
      refetchSurveys();
    },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });

  function handleSaveDraft() {
    const questions = builderQuestions.map((q, i) => ({
      id: String(q.id ?? i),
      type: q.type as any,
      question: q.text ?? q.question ?? "",
      required: q.required ?? true,
      options: q.options,
    }));
    if (editingSurveyId) {
      updateSurvey.mutate({ id: editingSurveyId, title: builderTitle, questions });
    } else {
      createSurvey.mutate({ title: builderTitle, type: builderType as any, questions });
    }
  }

  function handleActivate() {
    if (!editingSurveyId) {
      toast.message("Save the survey as draft first before activating.", { description: "Click Save Draft, then Activate." });
      return;
    }
    activateSurvey.mutate({ id: editingSurveyId });
  }

  function addQuestion() {
    if (!newQuestionText.trim()) {
      toast.error("Enter the question text before adding");
      return;
    }
    setBuilderQuestions((qs) => [
      ...qs,
      { id: Date.now(), type: "open_text", text: newQuestionText.trim(), required: false },
    ]);
    setNewQuestionText("");
    toast.success("Question added");
  }

  function removeQuestion(id: any) {
    setBuilderQuestions((qs) => qs.filter((q) => q.id !== id));
  }

  if (!can("reports", "read")) return <AccessDenied module="Surveys" />;

  const surveys = (surveysData ?? []) as any[];

  const activeSurveys = surveys.filter((s: any) => s.status === "active").length;
  const totalResponses = surveys.reduce((s: number, sv: any) => s + (sv.responses ?? 0), 0);
  const sentSurveys = surveys.filter((s: any) => (s.sent ?? 0) > 0);
  const avgResponseRate = sentSurveys.length > 0
    ? sentSurveys.reduce((s: number, sv: any) => s + RESPONSE_RATE(sv.sent ?? 0, sv.responses ?? 0), 0) / sentSurveys.length
    : 0;
  const csatSurveys = surveys.filter((s: any) => s.type === "csat" && s.avgScore);
  const avgCSAT = csatSurveys.length > 0
    ? csatSurveys.reduce((s: number, sv: any) => s + (sv.avgScore ?? 0), 0) / csatSurveys.length
    : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Surveys & Assessments</h1>
          <span className="text-[11px] text-muted-foreground/70">CSAT · NPS · Employee Pulse · Post-Incident · Exit</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadCSV(surveys.map((s: any) => ({ Title: s.title, Type: s.type ?? "", Status: s.status ?? "", Responses: s.responses ?? s.responseCount ?? 0, Avg_Score: s.avgScore ?? "", Created: s.createdAt ? new Date(s.createdAt).toLocaleDateString("en-IN") : "" })), "surveys_export")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          <PermissionGate module="hr" action="write">
            <button
              onClick={() => {
                setBuilderTitle("New Survey");
                setBuilderType("csat");
                setBuilderQuestions(BUILDER_TEMPLATE.questions);
                setEditingSurveyId(null);
                setTab("builder");
              }}
              className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
            >
              <Plus className="w-3 h-3" /> Create Survey
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Active Surveys",    value: activeSurveys, color: "text-green-700" },
          { label: "Total Responses",   value: totalResponses.toLocaleString(), color: "text-foreground" },
          { label: "Avg Response Rate", value: `${Math.round(avgResponseRate)}%`, color: avgResponseRate >= 60 ? "text-green-700" : "text-orange-700" },
          { label: "Platform CSAT",     value: `${avgCSAT.toFixed(1)}/5`, color: SCORE_COLOR(avgCSAT) },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground/70 uppercase">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex border-b border-border bg-card rounded-t overflow-x-auto">
        {visibleTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div className="p-4 grid grid-cols-2 gap-4">
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">CSAT — IT Service Desk {csatResults && <span className="ml-1 text-green-600 font-bold">LIVE</span>}</div>
              <div className="p-3">
                {(() => {
                  const score = csatResults ? Number(csatResults.averageScore ?? 0) : 0;
                  const responses = csatResults ? Number(csatResults.totalResponses ?? 0) : 0;
                  const hasData = responses > 0;
                  return (
                    <div className="flex items-center gap-4 mb-3">
                      <div className={`text-4xl font-black ${hasData ? "text-green-700" : "text-muted-foreground/30"}`}>{hasData ? score.toFixed(1) : "—"}</div>
                      <div>
                        <div className="flex gap-0.5 mb-0.5">
                          {[1,2,3,4,5].map(n => (
                            <span key={n} className={`text-lg ${hasData && n <= Math.round(score) ? "text-yellow-400" : "text-slate-200"}`}>★</span>
                          ))}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{hasData ? `${responses} responses` : (csatSurveyId ? "No responses yet" : "No active CSAT survey")}</div>
                      </div>
                    </div>
                  );
                })()}
                {csatResults && csatResults.responses.length > 0 && (() => {
                  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                  csatResults.responses.forEach((r: any) => { const s = Math.round(Number(r.score ?? 0)); if (s >= 1 && s <= 5) dist[s]++; });
                  const total = Object.values(dist).reduce((a, b) => a + b, 0);
                  return [5, 4, 3, 2, 1].map(stars => (
                    <div key={stars} className="flex items-center gap-2 mb-0.5 text-[11px]">
                      <span className="text-yellow-500 w-3">{stars}★</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-400 rounded-full" style={{width:`${total > 0 ? (dist[stars]/total)*100 : 0}%`}} />
                      </div>
                      <span className="text-muted-foreground/70 w-8 text-right">{total > 0 ? Math.round((dist[stars]/total)*100) : 0}%</span>
                    </div>
                  ));
                })()}
                {!csatSurveyId && (
                  <p className="text-[11px] text-muted-foreground/50">Create and activate a CSAT survey to see results here.</p>
                )}
              </div>
            </div>
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Employee Pulse {pulseResults && <span className="ml-1 text-green-600 font-bold">LIVE</span>}</div>
              <div className="p-3 space-y-2">
                {pulseResults ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-[11px] text-muted-foreground">Avg Score: </span>
                        <span className={`text-lg font-black ${pulseResults.averageScore ? (Number(pulseResults.averageScore) >= 4 ? "text-green-700" : "text-orange-600") : "text-muted-foreground/30"}`}>
                          {pulseResults.averageScore ?? "—"}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground/70">{pulseResults.totalResponses} responses</span>
                    </div>
                    {pulseResults.responses.slice(0, 5).map((r: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="text-muted-foreground flex-1 truncate">{r.respondentId?.slice(0, 8) ?? `Response ${i+1}`}</span>
                        <span className={`font-bold ${Number(r.score ?? 0) >= 4 ? "text-green-700" : "text-orange-600"}`}>{r.score ?? "—"}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground/50 py-2">{pulseSurveyId ? "No responses yet" : "Create and activate a Pulse/eNPS survey to see results here."}</p>
                )}
              </div>
            </div>
            <div className="border border-border rounded overflow-hidden col-span-2">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Recent Feedback (CSAT Comments)</div>
              <div className="divide-y divide-border">
                {csatResults && csatResults.responses.filter((r: any) => r.answers && Object.keys(r.answers).length > 0).slice(0, 5).map((r: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <div className="flex gap-0.5 flex-shrink-0 mt-0.5">
                      {[1,2,3,4,5].map(n => <span key={n} className={`text-[12px] ${n <= Math.round(Number(r.score ?? 0)) ? "text-yellow-400" : "text-slate-200"}`}>★</span>)}
                    </div>
                    <p className="text-[12px] text-foreground/80 flex-1">{JSON.stringify(r.answers).slice(0, 120)}…</p>
                    <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "—"}</span>
                  </div>
                ))}
                {(!csatResults || csatResults.responses.length === 0) && (
                  <div className="px-4 py-6 text-center text-[11px] text-muted-foreground/50">No survey responses yet</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ALL SURVEYS */}
        {tab === "surveys" && (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Survey #</th>
                <th>Title</th>
                <th>Type</th>
                <th>Trigger</th>
                <th className="text-center">Sent</th>
                <th className="text-center">Responses</th>
                <th className="text-center">Rate</th>
                <th className="text-center">Score / NPS</th>
                <th>Status</th>
                <th>Last Response</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {surveys.map((sv: any) => {
                const tCfg = TYPE_CFG[sv.type as SurveyType] ?? TYPE_CFG.csat;
                const rate = RESPONSE_RATE(sv.sent, sv.responses);
                return (
                  <tr key={sv.id} className={sv.status === "closed" ? "opacity-60" : ""}>
                    <td className="p-0"><div className={`priority-bar ${sv.status === "active" ? "bg-green-500" : sv.status === "scheduled" ? "bg-blue-400" : sv.status === "draft" ? "bg-border" : "bg-border"}`} /></td>
                    <td className="font-mono text-[11px] text-primary">{sv.number}</td>
                    <td className="font-medium text-foreground">{sv.title}</td>
                    <td><span className={`status-badge ${tCfg.color}`}>{tCfg.icon} {tCfg.label}</span></td>
                    <td className="text-[11px] text-muted-foreground/70 max-w-32 truncate">{sv.trigger}</td>
                    <td className="text-center font-mono text-[11px]">{sv.sent.toLocaleString()}</td>
                    <td className="text-center font-mono font-bold text-foreground">{sv.responses.toLocaleString()}</td>
                    <td className="text-center">
                      <span className={`text-[11px] font-bold ${rate >= 60 ? "text-green-700" : rate >= 40 ? "text-yellow-600" : "text-red-600"}`}>{rate}%</span>
                    </td>
                    <td className="text-center">
                      {sv.avgScore && <span className={`font-bold text-[12px] ${SCORE_COLOR(sv.avgScore)}`}>{sv.avgScore}★</span>}
                      {sv.npsScore !== undefined && <span className={`font-bold text-[12px] ${NPS_COLOR(sv.npsScore)}`}>NPS {sv.npsScore}</span>}
                      {!sv.avgScore && sv.npsScore === undefined && <span className="text-slate-300">—</span>}
                    </td>
                    <td><span className={`status-badge capitalize ${(STATUS_CFG as any)[sv.status] ?? ""}`}>{sv.status}</span></td>
                    <td className="text-[11px] text-muted-foreground/70">{sv.lastResponse ?? "—"}</td>
                    <td>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setSelectedResult(sv.id); setTab("results"); }} className="text-[11px] text-primary hover:underline flex items-center gap-0.5"><BarChart2 className="w-3 h-3" />Results</button>
                        <PermissionGate module="hr" action="write">
                          <button
                            onClick={() => {
                              setBuilderTitle(sv.title);
                              setBuilderType(sv.type ?? "csat");
                              setBuilderQuestions(sv.questions ?? BUILDER_TEMPLATE.questions);
                              setEditingSurveyId(sv.id);
                              setTab("builder");
                            }}
                            className="text-[11px] text-muted-foreground/70 hover:underline"
                          >Edit</button>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* SURVEY BUILDER */}
        {tab === "builder" && (
          <div className="p-4 max-w-2xl">
            <div className="mb-4">
              <label className="field-label">Survey Title</label>
              <input
                value={builderTitle}
                onChange={(e) => setBuilderTitle(e.target.value)}
                className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="field-label">Survey Type</label>
                <select
                  value={builderType}
                  onChange={(e) => setBuilderType(e.target.value)}
                  className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary"
                >
                  {Object.entries(TYPE_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Trigger</label>
                <select className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary">
                  <option>Manual</option>
                  <option>After incident closure</option>
                  <option>After request closure</option>
                  <option>Scheduled / Recurring</option>
                  <option>User action trigger</option>
                </select>
              </div>
              <div>
                <label className="field-label">Target Audience</label>
                <select className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary">
                  <option>All employees</option>
                  <option>Incident submitter only</option>
                  <option>All IT users</option>
                  <option>Specific group</option>
                </select>
              </div>
            </div>

            <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-2">Questions ({builderQuestions.length})</div>
            <div className="space-y-3">
              {builderQuestions.map((q, i) => (
                <div key={q.id} className="border border-border rounded overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-primary text-white text-[10px] flex items-center justify-center font-bold">{i+1}</span>
                      <span className={`status-badge text-[10px] capitalize ${q.type === "rating" ? "text-blue-700 bg-blue-100" : q.type === "single_choice" ? "text-green-700 bg-green-100" : "text-muted-foreground bg-muted"}`}>{(q.type as string).replace("_"," ")}</span>
                      {q.required && <span className="status-badge text-red-600 bg-red-50 text-[9px]">Required</span>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => removeQuestion(q.id)}
                        className="text-muted-foreground/70 hover:text-red-500"
                      ><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[12px] text-foreground">{q.text ?? q.question}</p>
                    {q.type === "rating" && (
                      <div className="flex gap-2 mt-2">
                        {[1,2,3,4,5].map(n => (
                          <div key={n} className="w-7 h-7 rounded-full border-2 border-slate-200 flex items-center justify-center text-[11px] text-muted-foreground/70">{n}</div>
                        ))}
                        <span className="text-[11px] text-muted-foreground/70 ml-1 self-center">(1=Poor, 5=Excellent)</span>
                      </div>
                    )}
                    {q.type === "open_text" && <div className="mt-1 h-8 border border-dashed border-slate-200 rounded bg-muted/30" />}
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addQuestion()}
                  placeholder="Type a new question and press Add…"
                  className="flex-1 border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary"
                />
                <button
                  onClick={addQuestion}
                  className="flex items-center gap-1 px-3 py-1.5 border border-border rounded text-[12px] text-muted-foreground hover:bg-accent transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Question
                </button>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSaveDraft}
                disabled={createSurvey.isPending || updateSurvey.isPending}
                className="px-4 py-2 border border-border text-[12px] rounded hover:bg-muted/30 text-muted-foreground disabled:opacity-60"
              >
                {(createSurvey.isPending || updateSurvey.isPending) ? "Saving…" : "Save Draft"}
              </button>
              <button
                onClick={() => setTab("surveys")}
                className="px-4 py-2 border border-border text-[12px] rounded hover:bg-muted/30 text-muted-foreground"
              >Preview</button>
              <button
                onClick={handleActivate}
                disabled={activateSurvey.isPending}
                className="px-4 py-2 bg-primary text-white text-[12px] rounded hover:bg-primary/90 flex items-center gap-1 disabled:opacity-60"
              >
                <Send className="w-3 h-3" /> {activateSurvey.isPending ? "Activating…" : "Activate Survey"}
              </button>
            </div>
          </div>
        )}

        {/* RESULTS */}
        {tab === "results" && (
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <select value={selectedResult} onChange={e => setSelectedResult(e.target.value)}
                className="border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary">
                {surveys.filter((s: any) => (s.responses ?? s.responseCount ?? 0) > 0).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.title} ({s.responses ?? s.responseCount ?? 0} responses)</option>
                ))}
                {surveys.filter((s: any) => (s.responses ?? s.responseCount ?? 0) > 0).length === 0 && (
                  <option value="">No surveys with responses yet</option>
                )}
              </select>
            </div>

            {isRealSurveyId && liveResults ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-border rounded p-4 text-center">
                    <div className={`text-4xl font-black ${liveResults.averageScore ? "text-green-700" : "text-muted-foreground"}`}>
                      {liveResults.averageScore ?? "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 mt-1">Average Score</div>
                    {liveResults.averageScore && (
                      <div className="flex justify-center gap-0.5 mt-1">
                        {[1,2,3,4,5].map(n => (
                          <span key={n} className={n <= Math.round(Number(liveResults.averageScore)) ? "text-yellow-400" : "text-slate-200"}>★</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="border border-border rounded p-4 text-center">
                    <div className="text-4xl font-black text-blue-700">{liveResults.totalResponses}</div>
                    <div className="text-[11px] text-muted-foreground/70 mt-1">Total Responses</div>
                  </div>
                  <div className="border border-border rounded p-4 text-center">
                    <div className="text-4xl font-black text-purple-700 capitalize">{liveResults.survey?.status ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground/70 mt-1">Survey Status</div>
                  </div>
                </div>
                {liveResults.responses.length > 0 && (
                  <div className="border border-border rounded overflow-hidden">
                    <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Recent Responses</div>
                    <div className="divide-y divide-border">
                      {liveResults.responses.slice(0, 10).map((r: any) => (
                        <div key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                          {r.score != null && (
                            <span className={`flex-shrink-0 text-[13px] ${r.score >= 4 ? "text-yellow-400" : r.score === 3 ? "text-yellow-200" : "text-slate-300"}`}>
                              {"★".repeat(r.score)}{"☆".repeat(5 - r.score)}
                            </span>
                          )}
                          <p className="text-[12px] text-foreground/80 flex-1">{r.responseData ? JSON.stringify(r.responseData).slice(0, 120) : "—"}</p>
                          <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">
                            {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {liveResults.responses.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground text-[12px]">No individual responses recorded yet.</div>
                )}
              </div>
            ) : !isRealSurveyId && selectedResult === "sv-001" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-border rounded p-4 text-center">
                    <div className="text-4xl font-black text-green-700">{CSAT_RESULTS.overall}</div>
                    <div className="text-[11px] text-muted-foreground/70 mt-1">Average CSAT Score</div>
                    <div className="flex justify-center gap-0.5 mt-1">
                      {[1,2,3,4,5].map(n => <span key={n} className={`${n <= Math.round(CSAT_RESULTS.overall) ? "text-yellow-400" : "text-slate-200"}`}>★</span>)}
                    </div>
                  </div>
                  <div className="border border-border rounded p-4 text-center">
                    <div className="text-4xl font-black text-blue-700">{CSAT_RESULTS.responses}</div>
                    <div className="text-[11px] text-muted-foreground/70 mt-1">Total Responses</div>
                  </div>
                  <div className="border border-border rounded p-4 text-center">
                    <div className="text-4xl font-black text-purple-700">66%</div>
                    <div className="text-[11px] text-muted-foreground/70 mt-1">Response Rate</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-border rounded overflow-hidden">
                    <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Score by Category</div>
                    <div className="p-3 space-y-2">
                      {CSAT_RESULTS.byCategory.map(c => (
                        <div key={c.cat} className="flex items-center gap-2 text-[11px]">
                          <span className="text-muted-foreground flex-1">{c.cat}</span>
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-yellow-400 rounded-full" style={{width:`${(c.score/5)*100}%`}} />
                          </div>
                          <span className={`font-bold w-8 text-right ${SCORE_COLOR(c.score)}`}>{c.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border border-border rounded overflow-hidden">
                    <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Rating Distribution</div>
                    <div className="p-3 space-y-2">
                      {CSAT_RESULTS.distribution.map(d => (
                        <div key={d.stars} className="flex items-center gap-2 text-[11px]">
                          <span className="text-yellow-500 w-4">{d.stars}★</span>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-yellow-400 rounded-full" style={{width:`${d.pct}%`}} />
                          </div>
                          <span className="text-muted-foreground font-mono w-8 text-right">{d.count}</span>
                          <span className="text-muted-foreground/70 w-8">{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="border border-border rounded overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">Written Feedback (Latest)</div>
                  <div className="divide-y divide-border">
                    {CSAT_RESULTS.recentComments.map((c, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                        <span className={`flex-shrink-0 text-[13px] ${c.score >= 4 ? "text-yellow-400" : c.score === 3 ? "text-yellow-200" : "text-slate-300"}`}>
                          {"★".repeat(c.score)}{"☆".repeat(5-c.score)}
                        </span>
                        <p className="text-[12px] text-foreground/80 flex-1">{c.comment}</p>
                        <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">{c.submitted}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground/70 text-[12px]">
                <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Select a survey above to view its detailed results.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
