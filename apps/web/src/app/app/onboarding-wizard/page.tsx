"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, Circle, Zap, Building2, Users, Shield, BookOpen, Globe,
  ChevronRight, ChevronLeft, Loader2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// ── Steps ──────────────────────────────────────────────────────────────────

type StepKey =
  | "welcome"
  | "org_profile"
  | "india_setup"
  | "team"
  | "itsm"
  | "finance"
  | "done";

interface Step {
  key:   StepKey;
  label: string;
  icon:  React.ElementType;
  description: string;
}

const STEPS: Step[] = [
  { key: "welcome",     label: "Welcome",        icon: Zap,       description: "Get started with NexusOps" },
  { key: "org_profile", label: "Organisation",   icon: Building2, description: "Company profile & branding" },
  { key: "india_setup", label: "India Setup",    icon: Globe,     description: "GSTIN, PAN, and compliance" },
  { key: "team",        label: "Invite Team",    icon: Users,     description: "Add your first colleagues" },
  { key: "itsm",        label: "ITSM Config",    icon: Shield,    description: "Service desk defaults" },
  { key: "finance",     label: "Finance",        icon: BookOpen,  description: "Chart of accounts seed" },
  { key: "done",        label: "Done",           icon: CheckCircle2, description: "You're all set!" },
];

// ── Individual step forms ──────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-6 py-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-500/30">
        <Zap className="h-8 w-8 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-foreground">Welcome to NexusOps</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md">
          This wizard will help you set up your workspace in under 5 minutes. You can always change these settings later.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm text-left">
        {[
          { icon: Shield,    label: "IT Service Management" },
          { icon: Users,     label: "HR & People Ops" },
          { icon: BookOpen,  label: "Finance & Accounting" },
          { icon: Globe,     label: "India Compliance" },
        ].map(f => (
          <div key={f.label} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
            <f.icon className="w-4 h-4 text-primary shrink-0" />
            <span className="text-[12px] font-medium text-foreground">{f.label}</span>
          </div>
        ))}
      </div>
      <button onClick={onNext} className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium">
        Start Setup <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

interface OrgData {
  displayName: string;
  industry: string;
  size: string;
  city: string;
  state: string;
  website: string;
  supportEmail: string;
}

function OrgProfileStep({ data, onChange, onNext, onBack }: {
  data: OrgData;
  onChange: (d: Partial<OrgData>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const industries = ["Technology/SaaS", "Manufacturing", "Professional Services", "Healthcare", "Retail/E-commerce", "Finance", "Education", "Real Estate", "Other"];
  const sizes = ["1–10", "11–50", "51–200", "201–500", "500+"];
  const states = ["Andhra Pradesh","Delhi","Gujarat","Karnataka","Kerala","Maharashtra","Rajasthan","Tamil Nadu","Telangana","Uttar Pradesh","West Bengal","Other"];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Organisation Profile</h2>
        <p className="text-sm text-muted-foreground mt-1">This information appears on your invoices, tickets, and notifications.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Company Name *</label>
          <input value={data.displayName} onChange={e => onChange({ displayName: e.target.value })} placeholder="e.g. Acme Technologies Pvt. Ltd." className="w-full px-3 py-2 text-[13px] border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Industry</label>
          <select value={data.industry} onChange={e => onChange({ industry: e.target.value })} className="w-full px-3 py-2 text-[13px] border border-border rounded-lg bg-background outline-none">
            <option value="">Select…</option>
            {industries.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Company Size</label>
          <select value={data.size} onChange={e => onChange({ size: e.target.value })} className="w-full px-3 py-2 text-[13px] border border-border rounded-lg bg-background outline-none">
            <option value="">Select…</option>
            {sizes.map(s => <option key={s} value={s}>{s} employees</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">City</label>
          <input value={data.city} onChange={e => onChange({ city: e.target.value })} placeholder="Bengaluru" className="w-full px-3 py-2 text-[13px] border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">State</label>
          <select value={data.state} onChange={e => onChange({ state: e.target.value })} className="w-full px-3 py-2 text-[13px] border border-border rounded-lg bg-background outline-none">
            <option value="">Select…</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Website</label>
          <input value={data.website} onChange={e => onChange({ website: e.target.value })} placeholder="https://yourcompany.com" className="w-full px-3 py-2 text-[13px] border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Support Email</label>
          <input type="email" value={data.supportEmail} onChange={e => onChange({ supportEmail: e.target.value })} placeholder="support@yourcompany.com" className="w-full px-3 py-2 text-[13px] border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>
      <StepNav onBack={onBack} onNext={onNext} canNext={!!data.displayName} />
    </div>
  );
}

interface IndiaData {
  gstin: string;
  pan: string;
  cin: string;
  tan: string;
  pf: string;
  stateCode: string;
  seedHolidays: boolean;
  seedCoa: boolean;
}

function IndiaSetupStep({ data, onChange, onNext, onBack }: {
  data: IndiaData;
  onChange: (d: Partial<IndiaData>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">India Compliance Setup</h2>
        <p className="text-sm text-muted-foreground mt-1">These numbers are used for GSTR, TDS returns, payroll, and e-invoicing.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { k: "gstin", l: "GSTIN", ph: "29ABCDE1234F1Z5", hint: "15-character GST registration" },
          { k: "pan",   l: "PAN",   ph: "ABCDE1234F",      hint: "10-character PAN" },
          { k: "cin",   l: "CIN",   ph: "U74999KA2020PTC123456", hint: "21-char Company Identification Number" },
          { k: "tan",   l: "TAN (TDS)", ph: "BLRE12345A",  hint: "10-character TAN for TDS filing" },
          { k: "pf",    l: "EPF Establishment Code", ph: "KA/BNG/12345/000/0001", hint: "" },
          { k: "stateCode", l: "Primary State Code", ph: "MH", hint: "2-letter ISO 3166-2:IN code" },
        ].map(f => (
          <div key={f.k}>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">{f.l}</label>
            <input
              value={(data as any)[f.k]}
              onChange={e => onChange({ [f.k]: e.target.value } as any)}
              placeholder={f.ph}
              className="w-full px-3 py-2 text-[13px] border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 font-mono"
            />
            {f.hint && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{f.hint}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 bg-muted/30 rounded-lg px-4 py-3">
        <p className="text-[12px] font-medium text-foreground mb-1">One-click seeding</p>
        {[
          { k: "seedHolidays", l: "Seed India national holidays for this year", val: data.seedHolidays },
          { k: "seedCoa",      l: "Seed India standard Chart of Accounts (40 accounts)", val: data.seedCoa },
        ].map(opt => (
          <label key={opt.k} className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={opt.val} onChange={e => onChange({ [opt.k]: e.target.checked } as any)} className="rounded accent-primary" />
            {opt.l}
          </label>
        ))}
      </div>

      <StepNav onBack={onBack} onNext={onNext} canNext={true} />
    </div>
  );
}

function TeamStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Invite Your Team</h2>
        <p className="text-sm text-muted-foreground mt-1">You can invite colleagues now or skip and do it later from Settings → Users.</p>
      </div>
      <div className="flex flex-col items-center justify-center py-8 gap-3 border-2 border-dashed border-border rounded-lg">
        <Users className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Team invitations are sent from <strong>Settings → Users & Roles</strong></p>
        <a href="/app/settings/users" className="px-3 py-1.5 text-[12px] bg-primary text-white rounded-lg hover:bg-primary/90">Open User Management</a>
      </div>
      <StepNav onBack={onBack} onNext={onNext} canNext={true} nextLabel="Skip for now" />
    </div>
  );
}

function ITSMStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [sla, setSla] = useState({ p1: "4", p2: "8", p3: "24", p4: "72" });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">ITSM Configuration</h2>
        <p className="text-sm text-muted-foreground mt-1">Set default SLA response times (business hours). These apply to all new tickets.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { k: "p1", l: "P1 — Critical", color: "text-red-600" },
          { k: "p2", l: "P2 — High",     color: "text-orange-600" },
          { k: "p3", l: "P3 — Medium",   color: "text-yellow-600" },
          { k: "p4", l: "P4 — Low",      color: "text-muted-foreground" },
        ].map(p => (
          <div key={p.k} className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2">
            <span className={`text-[12px] font-semibold w-28 ${p.color}`}>{p.l}</span>
            <input type="number" value={(sla as any)[p.k]} onChange={e => setSla(s => ({ ...s, [p.k]: e.target.value }))} className="w-16 px-2 py-1 text-[12px] border border-border rounded outline-none text-right" min={1} />
            <span className="text-[11px] text-muted-foreground">hrs</span>
          </div>
        ))}
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-[12px] text-blue-700">
        💡 India public holidays from your calendar are automatically excluded from SLA clocks.
      </div>
      <StepNav onBack={onBack} onNext={onNext} canNext={true} />
    </div>
  );
}

function FinanceStep({ seedCoa, onNext, onBack, loading }: {
  seedCoa: boolean;
  onNext: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Finance Setup</h2>
        <p className="text-sm text-muted-foreground mt-1">We're ready to configure your financial foundation.</p>
      </div>
      <div className="flex flex-col gap-2">
        {[
          { l: "Chart of Accounts (India standard — 40 accounts)", active: seedCoa },
          { l: "GSTIN registry configured", active: true },
          { l: "India public holiday calendar for current year", active: true },
          { l: "GST ITC / payable accounts pre-configured", active: seedCoa },
          { l: "PF / TDS liability accounts", active: seedCoa },
        ].map(item => (
          <div key={item.l} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${item.active ? "bg-green-50 text-green-800" : "bg-muted/30 text-muted-foreground"}`}>
            {item.active ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" /> : <Circle className="w-4 h-4 shrink-0" />}
            <span className="text-[12px]">{item.l}</span>
          </div>
        ))}
      </div>
      <StepNav onBack={onBack} onNext={onNext} canNext={true} nextLabel="Apply & Continue" loading={loading} />
    </div>
  );
}

function DoneStep() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center text-center gap-6 py-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 shadow-lg shadow-green-500/20">
        <CheckCircle2 className="h-8 w-8 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-foreground">You're all set! 🎉</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          Your NexusOps workspace is configured. Head to the dashboard to start managing your operations.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/app/dashboard")} className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium">
          Go to Dashboard <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => router.push("/app/settings")} className="px-4 py-2.5 border border-border rounded-lg hover:bg-muted/50 text-sm font-medium transition-colors">
          Settings
        </button>
      </div>
    </div>
  );
}

// ── Navigation ──────────────────────────────────────────────────────────────
function StepNav({ onBack, onNext, canNext = true, nextLabel = "Continue", loading = false }: {
  onBack: () => void;
  onNext: () => void;
  canNext?: boolean;
  nextLabel?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted/50 transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <button onClick={onNext} disabled={!canNext || loading} className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {nextLabel} <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Main wizard ────────────────────────────────────────────────────────────
export default function OnboardingWizardPage() {
  const [stepIdx, setStepIdx] = useState(0);
  const [applying, setApplying] = useState(false);

  const [orgData, setOrgData] = useState<OrgData>({
    displayName: "", industry: "", size: "", city: "", state: "KA", website: "", supportEmail: "",
  });

  const [indiaData, setIndiaData] = useState<IndiaData>({
    gstin: "", pan: "", cin: "", tan: "", pf: "", stateCode: "KA",
    seedHolidays: true, seedCoa: true,
  });

  const utils = trpc.useUtils();
  const seedCoaMut      = trpc.accounting.coa.seed.useMutation();
  const seedHolidaysMut = trpc.hr.holidays.seedIndiaHolidays.useMutation();

  const currentStep = STEPS[stepIdx]!;

  async function handleFinanceNext() {
    setApplying(true);
    try {
      if (indiaData.seedCoa)      await seedCoaMut.mutateAsync();
      if (indiaData.seedHolidays) await seedHolidaysMut.mutateAsync({ year: new Date().getFullYear() });
      toast.success("Setup applied successfully!");
    } catch (e: any) {
      toast.error(e?.message ?? "Setup failed");
    } finally {
      setApplying(false);
    }
    next();
  }

  function next() { setStepIdx(i => Math.min(i + 1, STEPS.length - 1)); }
  function back() { setStepIdx(i => Math.max(i - 1, 0)); }

  return (
    <div className="min-h-full flex items-start justify-center py-8 px-4">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => {
            const done    = i < stepIdx;
            const current = i === stepIdx;
            return (
              <div key={s.key} className="flex items-center gap-1 flex-1 min-w-0">
                <button
                  onClick={() => i < stepIdx && setStepIdx(i)}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                    done    ? "bg-primary text-white cursor-pointer"         :
                    current ? "bg-primary text-white ring-2 ring-primary/30" :
                              "bg-muted text-muted-foreground cursor-default",
                  )}
                >
                  {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 rounded ${done ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step label */}
        <div className="mb-6">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Step {stepIdx + 1} of {STEPS.length}</span>
          <p className="text-[13px] text-muted-foreground">{currentStep.description}</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          {currentStep.key === "welcome"     && <WelcomeStep onNext={next} />}
          {currentStep.key === "org_profile" && <OrgProfileStep data={orgData} onChange={d => setOrgData(p => ({ ...p, ...d }))} onNext={next} onBack={back} />}
          {currentStep.key === "india_setup" && <IndiaSetupStep data={indiaData} onChange={d => setIndiaData(p => ({ ...p, ...d }))} onNext={next} onBack={back} />}
          {currentStep.key === "team"        && <TeamStep onNext={next} onBack={back} />}
          {currentStep.key === "itsm"        && <ITSMStep onNext={next} onBack={back} />}
          {currentStep.key === "finance"     && <FinanceStep seedCoa={indiaData.seedCoa} onNext={handleFinanceNext} onBack={back} loading={applying} />}
          {currentStep.key === "done"        && <DoneStep />}
        </div>
      </div>
    </div>
  );
}
