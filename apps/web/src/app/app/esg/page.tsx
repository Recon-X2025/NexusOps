"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { Leaf, Sun, Droplets, Users2, Shield, TrendingDown, BarChart3, Download, RefreshCw } from "lucide-react";
import { EmptyState } from "@coheronconnect/ui";
import { cn } from "@/lib/utils";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

type Pillar = "overview" | "environment" | "social" | "governance";

const PILLARS = [
  { key: "overview" as Pillar,     label: "Overview",        icon: BarChart3 },
  { key: "environment" as Pillar,  label: "Environmental",   icon: Leaf },
  { key: "social" as Pillar,       label: "Social",          icon: Users2 },
  { key: "governance" as Pillar,   label: "Governance",      icon: Shield },
];

const METRICS = {
  environment: [
    { id: "e1", label: "Total GHG Emissions",        unit: "tCO₂e", target: 500,  current: 420,  framework: "GRI 305" },
    { id: "e2", label: "Energy Consumption",          unit: "MWh",   target: 1000, current: 870,  framework: "GRI 302" },
    { id: "e3", label: "Renewable Energy %",          unit: "%",     target: 50,   current: 22,   framework: "SDG 7" },
    { id: "e4", label: "Water Consumption",           unit: "KL",    target: 200,  current: 185,  framework: "GRI 303" },
    { id: "e5", label: "Waste Diverted from Landfill",unit: "%",     target: 80,   current: 64,   framework: "GRI 306" },
    { id: "e6", label: "Paper Consumption",           unit: "reams", target: 100,  current: 67,   framework: "Internal" },
  ],
  social: [
    { id: "s1", label: "Total Employees",             unit: "FTE",   target: 100,  current: 87,   framework: "GRI 102" },
    { id: "s2", label: "Female Employees %",          unit: "%",     target: 40,   current: 34,   framework: "GRI 405" },
    { id: "s3", label: "Employee Attrition Rate",     unit: "%",     target: 10,   current: 13.2, framework: "GRI 401" },
    { id: "s4", label: "Training Hours / Employee",   unit: "hrs",   target: 40,   current: 22,   framework: "GRI 404" },
    { id: "s5", label: "Work-from-Home Days / Week",  unit: "days",  target: 2,    current: 2.5,  framework: "Internal" },
    { id: "s6", label: "POSH Complaints Filed",       unit: "cases", target: 0,    current: 0,    framework: "SEBI BRSR" },
  ],
  governance: [
    { id: "g1", label: "Independent Board Members",  unit: "%",     target: 50,   current: 40,   framework: "Companies Act" },
    { id: "g2", label: "Women Directors",             unit: "%",     target: 33,   current: 20,   framework: "Companies Act" },
    { id: "g3", label: "Data Breaches (YTD)",         unit: "incidents", target: 0, current: 0,  framework: "DPDP Act" },
    { id: "g4", label: "Policy Violations (YTD)",    unit: "cases", target: 0,    current: 2,    framework: "Internal" },
    { id: "g5", label: "Whistleblower Reports",       unit: "reports", target: 0,  current: 0,   framework: "SEBI BRSR" },
    { id: "g6", label: "Vendor ESG Assessment Done",  unit: "%",     target: 75,   current: 45,   framework: "GRI 308" },
  ],
};

function MetricRow({ m }: { m: typeof METRICS.environment[0] }) {
  const pct = Math.min(100, Math.round((m.current / m.target) * 100));
  const onTrack = m.current <= m.target;
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-foreground">{m.label}</span>
          <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded">{m.framework}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="h-1.5 w-32 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${onTrack ? "bg-green-500" : "bg-orange-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <span className={`text-[11px] font-mono font-semibold ${onTrack ? "text-green-700" : "text-orange-700"}`}>{m.current.toLocaleString()} / {m.target.toLocaleString()} {m.unit}</span>
        </div>
      </div>
      <span className={`text-[11px] font-semibold ${onTrack ? "text-green-700" : "text-orange-700"}`}>{pct}%</span>
    </div>
  );
}

function OverviewPillar() {
  const scores = [
    { label: "Environmental", score: 62, color: "text-green-700", bg: "bg-green-100", icon: Leaf },
    { label: "Social",        score: 74, color: "text-blue-700",  bg: "bg-blue-100",  icon: Users2 },
    { label: "Governance",    score: 55, color: "text-purple-700",bg: "bg-purple-100", icon: Shield },
  ];
  const overall = Math.round(scores.reduce((s, p) => s + p.score, 0) / scores.length);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-1 bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center">
          <div className="text-4xl font-black text-primary">{overall}</div>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">ESG Score</div>
          <div className="text-[10px] text-muted-foreground/60 mt-0.5">out of 100</div>
        </div>
        {scores.map(p => (
          <div key={p.label} className={`bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center text-center`}>
            <p.icon className={`w-5 h-5 mb-2 ${p.color}`} />
            <div className={`text-3xl font-bold ${p.color}`}>{p.score}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{p.label}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { l: "Scope 1+2 GHG", v: "420 tCO₂e", sub: "↓ 8% vs last year", ok: true },
          { l: "Female Employees", v: "34%", sub: "Target: 40%", ok: false },
          { l: "Data Breaches", v: "0", sub: "12 months clean", ok: true },
        ].map(m => (
          <div key={m.l} className="bg-card border border-border rounded-lg px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.l}</div>
            <div className="text-xl font-bold text-foreground mt-0.5">{m.v}</div>
            <div className={`text-[11px] mt-0.5 ${m.ok ? "text-green-600" : "text-orange-600"}`}>{m.sub}</div>
          </div>
        ))}
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-[12px] text-blue-700">
        📋 <strong>SEBI BRSR</strong> — Business Responsibility & Sustainability Report alignment enabled. <strong>GRI Standards</strong> mapping active.
        Framework mappings: <span className="font-mono">GRI 102 / 302 / 303 / 305 / 306 / 401 / 404 / 405 / 308</span>
      </div>
    </div>
  );
}

export default function ESGPage() {
  const { can } = useRBAC();
  const [pillar, setPillar] = useState<Pillar>("overview");

  if (!can("grc", "read")) return <AccessDenied module="ESG Reporting" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Leaf className="w-4 h-4 text-green-600" />
          <h1 className="text-sm font-semibold text-foreground">ESG Reporting</h1>
          <span className="text-[11px] text-muted-foreground/70">SEBI BRSR · GRI Standards · SDG alignment</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"><RefreshCw className="w-3 h-3" /> Refresh</button>
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"><Download className="w-3 h-3" /> Export Report</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {PILLARS.map(p => (
          <button key={p.key} onClick={() => setPillar(p.key)} className={cn("flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors", pillar === p.key ? "border-green-600 text-green-700" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <p.icon className="w-3.5 h-3.5" /> {p.label}
          </button>
        ))}
      </div>

      {pillar === "overview" && <OverviewPillar />}

      {(pillar === "environment" || pillar === "social" || pillar === "governance") && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">{PILLARS.find(p => p.key === pillar)?.label} Metrics</h3>
          {METRICS[pillar].map(m => <MetricRow key={m.id} m={m} />)}
        </div>
      )}
    </div>
  );
}
