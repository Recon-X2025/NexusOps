"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
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
  { key: "welcome",     label: "Welcome",        icon: Zap,       description: "Get started with CoheronConnect" },
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
        <h2 className="text-h3 font-bold text-foreground">Welcome to CoheronConnect</h2>
        <p className="mt-2 text-body-sm text-muted-foreground max-w-md">
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

function OrgProfileStep({ data, onChange, onNext, onBack, loading }: {
  data: OrgData;
  onChange: (d: Partial<OrgData>) => void;
  onNext: () => void;
  onBack: () => void;
  loading?: boolean;
}) {
  const industries = ["Technology/SaaS", "Manufacturing", "Professional Services", "Healthcare", "Retail/E-commerce", "Finance", "Education", "Real Estate", "Other"];
  const sizes = ["1–10", "11–50", "51–200", "201–500", "500+"];
  const states = ["Andhra Pradesh","Delhi","Gujarat","Karnataka","Kerala","Maharashtra","Rajasthan","Tamil Nadu","Telangana","Uttar Pradesh","West Bengal","Other"];

  const canNext =
    !!data.displayName.trim() &&
    !!data.industry &&
    !!data.size &&
    !!data.city.trim() &&
    !!data.state &&
    !!data.website.trim() &&
    !!data.supportEmail.trim();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-body-lg font-semibold text-foreground">Organisation Profile</h2>
        <p className="text-body-sm text-muted-foreground mt-1">This information appears on your invoices, tickets, and notifications.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Company Name *</label>
          <input value={data.displayName} onChange={e => onChange({ displayName: e.target.value })} placeholder="e.g. Acme Technologies Pvt. Ltd." className="w-full px-3 py-2 text-[13px] border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Industry *</label>
          <select value={data.industry} onChange={e => onChange({ industry: e.target.value })} className="w-full px-3 py-2 text-[13px] border border-border rounded-lg bg-background outline-none">
            <option value="">Select…</option>
            {industries.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Company Size *</label>
          <select value={data.size} onChange={e => onChange({ size: e.target.value })} className="w-full px-3 py-2 text-[13px] border border-border rounded-lg bg-background outline-none">
            <option value="">Select…</option>
            {sizes.map(s => <option key={s} value={s}>{s} employees</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">City *</label>
          <input value={data.city} onChange={e => onChange({ city: e.target.value })} placeholder="Bengaluru" className="w-full px-3 py-2 text-[13px] border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">State *</label>
          <select value={data.state} onChange={e => onChange({ state: e.target.value })} className="w-full px-3 py-2 text-[13px] border border-border rounded-lg bg-background outline-none">
            <option value="">Select…</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Website *</label>
          <input value={data.website} onChange={e => onChange({ website: e.target.value })} placeholder="https://yourcompany.com" className="w-full px-3 py-2 text-[13px] border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Support Email *</label>
          <input type="email" value={data.supportEmail} onChange={e => onChange({ supportEmail: e.target.value })} placeholder="support@yourcompany.com" className="w-full px-3 py-2 text-[13px] border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>
      <StepNav onBack={onBack} onNext={onNext} canNext={canNext} loading={loading} />
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

function IndiaSetupStep({ data, onChange, onNext, onBack, loading }: {
  data: IndiaData;
  onChange: (d: Partial<IndiaData>) => void;
  onNext: () => void;
  onBack: () => void;
  loading?: boolean;
}) {
  const gstinValid = /^[A-Z0-9]{15}$/.test(data.gstin.trim().toUpperCase());
  const panValid = /^[A-Z0-9]{10}$/.test(data.pan.trim().toUpperCase());
  const cinValid = /^[A-Z0-9]{21}$/.test(data.cin.trim().toUpperCase());
  const tanValid = /^[A-Z0-9]{10}$/.test(data.tan.trim().toUpperCase());
  const pfValid = data.pf.trim().length > 0;
  const stateCodeValid = /^[A-Z0-9]{2}$/.test(data.stateCode.trim().toUpperCase());
  const canNext = gstinValid && panValid && cinValid && tanValid && pfValid && stateCodeValid;

  const upperCaseFields = ["gstin", "pan", "cin", "tan", "stateCode"];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-body-lg font-semibold text-foreground">India Compliance Setup</h2>
        <p className="text-body-sm text-muted-foreground mt-1">These numbers are used for GSTR, TDS returns, payroll, and e-invoicing.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { k: "gstin", l: "GSTIN *", ph: "29ABCDE1234F1Z5", hint: "15-character GST registration" },
          { k: "pan",   l: "PAN *",   ph: "ABCDE1234F",      hint: "10-character PAN" },
          { k: "cin",   l: "CIN *",   ph: "U74999KA2020PTC123456", hint: "21-char Company Identification Number" },
          { k: "tan",   l: "TAN (TDS) *", ph: "BLRE12345A",  hint: "10-character TAN for TDS filing" },
          { k: "pf",    l: "EPF Establishment Code *", ph: "KA/BNG/12345/000/0001", hint: "" },
          { k: "stateCode", l: "Primary State Code *", ph: "MH", hint: "2-letter ISO 3166-2:IN code" },
        ].map(f => (
          <div key={f.k}>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">{f.l}</label>
            <input
              value={(data as any)[f.k]}
              onChange={e => onChange({ [f.k]: upperCaseFields.includes(f.k) ? e.target.value.toUpperCase() : e.target.value } as any)}
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

      <StepNav onBack={onBack} onNext={onNext} canNext={canNext} loading={loading} />
    </div>
  );
}

function TeamStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-body-lg font-semibold text-foreground">Invite Your Team</h2>
        <p className="text-body-sm text-muted-foreground mt-1">You can invite colleagues now or skip and do it later from Settings → Users.</p>
      </div>
      <div className="flex flex-col items-center justify-center py-8 gap-3 border-2 border-dashed border-border rounded-lg">
        <Users className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-body-sm text-muted-foreground">Team invitations are sent from <strong>Settings → Users & Roles</strong></p>
        <a href="/app/admin" className="px-3 py-1.5 text-[12px] bg-primary text-white rounded-lg hover:bg-primary/90">Open User Management</a>
      </div>
      <StepNav onBack={onBack} onNext={onNext} canNext={true} nextLabel="Skip for now" />
    </div>
  );
}

function ITSMStep({ sla, setSla, onNext, onBack, loading }: { sla: any, setSla: any, onNext: () => void; onBack: () => void, loading: boolean }) {
  const canNext = Object.values(sla).every((v: any) => {
    const num = parseInt(v, 10);
    return !isNaN(num) && num >= 1;
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-body-lg font-semibold text-foreground">ITSM Configuration</h2>
        <p className="text-body-sm text-muted-foreground mt-1">Set default SLA response times (business hours). These apply to all new tickets.</p>
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
            <input
              type="number"
              value={(sla as any)[p.k]}
              onChange={e => setSla(s => ({ ...s, [p.k]: e.target.value }))}
              onBlur={e => {
                const num = parseInt(e.target.value, 10);
                if (isNaN(num) || num < 1) {
                  setSla(s => ({ ...s, [p.k]: "1" }));
                }
              }}
              className="w-16 px-2 py-1 text-[12px] border border-border rounded outline-none text-right"
              min={1}
            />
            <span className="text-[11px] text-muted-foreground">hrs</span>
          </div>
        ))}
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-[12px] text-blue-700">
        💡 India public holidays from your calendar are automatically excluded from SLA clocks.
      </div>
      <StepNav onBack={onBack} onNext={onNext} canNext={canNext} loading={loading} />
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
        <h2 className="text-body-lg font-semibold text-foreground">Finance Setup</h2>
        <p className="text-body-sm text-muted-foreground mt-1">We're ready to configure your financial foundation.</p>
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
        <h2 className="text-h3 font-bold text-foreground">You're all set! 🎉</h2>
        <p className="mt-2 text-body-sm text-muted-foreground max-w-sm">
          Your CoheronConnect workspace is configured. Head to the dashboard to start managing your operations.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/app/dashboard")} className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium">
          Go to Dashboard <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => router.push("/app/settings/integrations")} className="px-4 py-2.5 border border-border rounded-lg hover:bg-muted/50 text-body-sm font-medium transition-colors">
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
      <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-lg text-body-sm hover:bg-muted/50 transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <button onClick={onNext} disabled={!canNext || loading} className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white rounded-lg text-body-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {nextLabel} <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Main wizard ────────────────────────────────────────────────────────────
export default function OnboardingWizardPage() {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const [applying, setApplying] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const [orgData, setOrgData] = useState<OrgData>({
    displayName: "", industry: "", size: "", city: "", state: "KA", website: "", supportEmail: "",
  });

  const [indiaData, setIndiaData] = useState<IndiaData>({
    gstin: "", pan: "", cin: "", tan: "", pf: "", stateCode: "KA",
    seedHolidays: true, seedCoa: true,
  });

  const [sla, setSla] = useState({ p1: "4", p2: "8", p3: "24", p4: "72" });

  const { data, isLoading } = trpc.onboarding.getWizardData.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const utils = trpc.useUtils();
  const seedCoaMut      = trpc.accounting.coa.seed.useMutation();
  const seedHolidaysMut = trpc.hr.holidays.seedIndiaHolidays.useMutation();
  const saveWizardMut   = trpc.onboarding.saveWizardData.useMutation();
  const completeWizardMut = trpc.onboarding.completeWizard.useMutation();

  const currentStep = STEPS[stepIdx]!;

  useEffect(() => {
    if (data && !initialized) {
      if (data.profile) {
        setOrgData({
          displayName: data.profile.displayName ?? "",
          industry: data.profile.industry ?? "",
          size: data.profile.size ?? "",
          city: data.profile.city ?? "",
          state: data.profile.state ?? "KA",
          website: data.profile.website ?? "",
          supportEmail: data.profile.supportEmail ?? "",
        });
      }
      if (data.india) {
        setIndiaData(p => ({
          ...p,
          gstin: data.india.gstin ?? "",
          pan: data.india.pan ?? "",
          cin: data.india.cin ?? "",
          tan: data.india.tan ?? "",
          pf: data.india.pf ?? "",
          stateCode: data.india.stateCode ?? "KA",
        }));
      }
      if (data.itsm) {
        setSla({
          p1: String(data.itsm.p1 ?? 4),
          p2: String(data.itsm.p2 ?? 8),
          p3: String(data.itsm.p3 ?? 24),
          p4: String(data.itsm.p4 ?? 72),
        });
      }
      if (!data.onboardingCompletedAt) {
        setStepIdx(Math.max(0, (data.onboardingStep ?? 1) - 1));
      }
      setInitialized(true);
    }
  }, [data, initialized]);

  if (isLoading || (data && !initialized)) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (data?.onboardingCompletedAt) {
    return (
      <div className="min-h-full flex items-start justify-center py-8 px-4">
        <div className="w-full max-w-2xl bg-card border border-border rounded-2xl p-8 shadow-sm flex flex-col gap-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-700">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-h4 font-bold text-foreground">Setup Completed</h2>
              <p className="text-body-xs text-muted-foreground">
                This workspace completed onboarding on {new Date(data.onboardingCompletedAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <h3 className="text-body-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" /> Organisation Profile
              </h3>
              <div className="grid grid-cols-2 gap-3 bg-muted/20 p-4 rounded-xl text-body-xs">
                <div>
                  <span className="text-muted-foreground block">Company Name</span>
                  <span className="font-medium text-foreground">{orgData.displayName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Industry</span>
                  <span className="font-medium text-foreground">{orgData.industry}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Company Size</span>
                  <span className="font-medium text-foreground">{orgData.size} employees</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Location</span>
                  <span className="font-medium text-foreground">{orgData.city}, {orgData.state}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Website</span>
                  <span className="font-medium text-foreground">{orgData.website}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Support Email</span>
                  <span className="font-medium text-foreground">{orgData.supportEmail}</span>
                </div>
              </div>
            </div>

            <div className="col-span-2">
              <h3 className="text-body-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" /> India Compliance
              </h3>
              <div className="grid grid-cols-2 gap-3 bg-muted/20 p-4 rounded-xl text-body-xs">
                <div>
                  <span className="text-muted-foreground block">GSTIN</span>
                  <span className="font-medium text-foreground font-mono">{indiaData.gstin}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">PAN</span>
                  <span className="font-medium text-foreground font-mono">{indiaData.pan}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">CIN</span>
                  <span className="font-medium text-foreground font-mono">{indiaData.cin}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">TAN (TDS)</span>
                  <span className="font-medium text-foreground font-mono">{indiaData.tan}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground block">EPF Establishment Code</span>
                  <span className="font-medium text-foreground font-mono">{indiaData.pf}</span>
                </div>
              </div>
            </div>

            <div className="col-span-2">
              <h3 className="text-body-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> ITSM Configuration
              </h3>
              <div className="grid grid-cols-4 gap-3 bg-muted/20 p-4 rounded-xl text-body-xs">
                <div>
                  <span className="text-muted-foreground block">P1</span>
                  <span className="font-semibold text-red-600">{sla.p1} hrs</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">P2</span>
                  <span className="font-semibold text-orange-600">{sla.p2} hrs</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">P3</span>
                  <span className="font-semibold text-yellow-600">{sla.p3} hrs</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">P4</span>
                  <span className="font-semibold text-muted-foreground">{sla.p4} hrs</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
            <a
              href="/app/settings"
              className="text-body-sm text-primary hover:underline font-medium"
            >
              Edit in Settings
            </a>
            <button
              onClick={() => router.push("/app/dashboard")}
              className="px-5 py-2 bg-primary text-white rounded-lg text-body-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  async function handleProfileNext() {
    setApplying(true);
    try {
      await saveWizardMut.mutateAsync({
        profile: {
          displayName: orgData.displayName,
          industry: orgData.industry,
          size: orgData.size,
          city: orgData.city,
          state: orgData.state,
          website: orgData.website,
          supportEmail: orgData.supportEmail,
        },
        step: 3,
      });
      next();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save profile");
    } finally {
      setApplying(false);
    }
  }

  async function handleIndiaNext() {
    setApplying(true);
    try {
      await saveWizardMut.mutateAsync({
        india: {
          gstin: indiaData.gstin,
          pan: indiaData.pan,
          cin: indiaData.cin,
          tan: indiaData.tan,
          pf: indiaData.pf,
          stateCode: indiaData.stateCode,
        },
        step: 4,
      });
      next();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save India compliance data");
    } finally {
      setApplying(false);
    }
  }

  async function handleItsmNext() {
    setApplying(true);
    try {
      await saveWizardMut.mutateAsync({
        itsm: {
          p1: parseInt(sla.p1, 10),
          p2: parseInt(sla.p2, 10),
          p3: parseInt(sla.p3, 10),
          p4: parseInt(sla.p4, 10),
        },
        step: 6,
      });
      next();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save ITSM SLA");
    } finally {
      setApplying(false);
    }
  }

  async function handleFinanceNext() {
    setApplying(true);
    try {
      if (indiaData.seedCoa)      await seedCoaMut.mutateAsync();
      if (indiaData.seedHolidays) await seedHolidaysMut.mutateAsync({ year: new Date().getFullYear() });
      await completeWizardMut.mutateAsync();
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
          {currentStep.key === "org_profile" && <OrgProfileStep data={orgData} onChange={d => setOrgData(p => ({ ...p, ...d }))} onNext={handleProfileNext} onBack={back} loading={applying} />}
          {currentStep.key === "india_setup" && <IndiaSetupStep data={indiaData} onChange={d => setIndiaData(p => ({ ...p, ...d }))} onNext={handleIndiaNext} onBack={back} loading={applying} />}
          {currentStep.key === "team"        && <TeamStep onNext={next} onBack={back} />}
          {currentStep.key === "itsm"        && <ITSMStep sla={sla} setSla={setSla} onNext={handleItsmNext} onBack={back} loading={applying} />}
          {currentStep.key === "finance"     && <FinanceStep seedCoa={indiaData.seedCoa} onNext={handleFinanceNext} onBack={back} loading={applying} />}
          {currentStep.key === "done"        && <DoneStep />}
        </div>
      </div>
    </div>
  );
}
