"use client";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

import { SUPPORTED_CURRENCY_CODES } from "@nexusops/types";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  FileText, Plus, Search, Download, Clock, CheckCircle2, AlertTriangle,
  XCircle, Edit2, ChevronRight, Send, Paperclip, RefreshCw, Building2,
  Calendar, DollarSign, Shield, MoreHorizontal, ArrowRight,
  ScrollText, ListChecks, Package, Handshake, Headphones,
} from "lucide-react";
import { toast } from "sonner";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { downloadCSV } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  CONTRACT_TEMPLATES,
  clausesFromTemplate,
  TEMPLATE_ID_TO_DB_TYPE,
  toStoredClauses,
  getDisplayedClauseBody,
  type ContractTemplate,
  type WizardClauseState,
} from "@/lib/contract-templates";
import {
  ClauseEditor,
  buildContractDocumentHtml,
  openContractPdfPrint,
} from "@/components/contracts/clause-editor";

const CONTRACT_TABS = [
  { key: "register",    label: "Contract Register",  module: "contracts" as const, action: "read"  as const },
  { key: "create",      label: "Create Contract",    module: "contracts" as const, action: "write" as const },
  { key: "expiring",    label: "Expiring / Renewals",module: "contracts" as const, action: "read"  as const },
  { key: "obligations", label: "Obligations",        module: "contracts" as const, action: "read"  as const },
];

type ContractState = "draft" | "under_review" | "legal_review" | "awaiting_signature" | "active" | "expiring_soon" | "expired" | "terminated";
type ContractType = "vendor" | "customer" | "employment" | "nda" | "sla" | "msa" | "sow" | "lease" | "licensing";

interface Contract {
  id: string;
  number: string;
  title: string;
  counterparty: string;
  counterpartyType: "vendor" | "customer" | "employee" | "partner";
  type: ContractType;
  owner: string;
  legalOwner: string;
  state: ContractState;
  value: number;
  currency: string;
  startDate: string;
  endDate: string;
  renewalDeadline?: string;
  autoRenew: boolean;
  paymentTerms?: string;
  governingLaw: string;
  signed: boolean;
  signedDate?: string;
  linkedPO?: string;
  linkedVendor?: string;
  obligations: ContractObligation[];
  amendments: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  noticePeriodDays: number;
  created: string;
  nextReview?: string;
}

interface ContractObligation {
  id: string;
  description: string;
  party: "us" | "counterparty" | "both";
  dueDate?: string;
  recurring?: string;
  status: "pending" | "on_track" | "at_risk" | "breached" | "completed";
}

const CONTRACTS: Contract[] = [
  {
    id: "con-001", number: "CTR-2026-0088", title: "Enterprise Software License Agreement — Microsoft EA",
    counterparty: "Microsoft Corporation", counterpartyType: "vendor", type: "licensing",
    owner: "Sam Okafor", legalOwner: "Legal Team",
    state: "active", value: 69720000, currency: "INR",
    startDate: "2026-01-01", endDate: "2028-12-31",
    renewalDeadline: "2028-09-30", autoRenew: false,
    paymentTerms: "Annual upfront — Net 30", governingLaw: "India",
    signed: true, signedDate: "2025-12-15",
    linkedVendor: "Microsoft Corporation",
    riskLevel: "medium", noticePeriodDays: 90, created: "2025-11-01", nextReview: "2026-06-30",
    amendments: 0,
    obligations: [
      { id: "obl-001", description: "Microsoft: Provide 99.9% uptime SLA for M365 services", party: "counterparty", recurring: "Monthly", status: "on_track" },
      { id: "obl-002", description: "Nexus: Maintain licensed user count within agreement terms", party: "us", recurring: "Quarterly audit", status: "at_risk" },
      { id: "obl-003", description: "Nexus: Complete mandatory security training for admin users", party: "us", dueDate: "2026-06-30", status: "pending" },
    ],
  },
  {
    id: "con-002", number: "CTR-2026-0087", title: "VMware vSphere Renewal — Broadcom / Carahsoft",
    counterparty: "Broadcom Inc. (via Carahsoft)", counterpartyType: "vendor", type: "licensing",
    owner: "Sam Okafor", legalOwner: "Legal Team",
    state: "under_review", value: 8974000, currency: "INR",
    startDate: "2026-04-01", endDate: "2027-03-31",
    renewalDeadline: "2026-04-01", autoRenew: false,
    paymentTerms: "Net 30", governingLaw: "India",
    signed: false,
    linkedPO: "PO-2026-0088", linkedVendor: "Broadcom / Carahsoft",
    riskLevel: "high", noticePeriodDays: 30, created: "2026-03-01",
    amendments: 0,
    obligations: [
      { id: "obl-004", description: "Broadcom: Honor prior-year pricing during transition period", party: "counterparty", status: "at_risk" },
      { id: "obl-005", description: "Nexus: Pay within Net 30 of invoice date", party: "us", status: "pending" },
    ],
  },
  {
    id: "con-003", number: "CTR-2026-0086", title: "CrowdStrike Falcon Enterprise — EDR/EPP Annual",
    counterparty: "CrowdStrike Inc.", counterpartyType: "vendor", type: "sla",
    owner: "Dana Kim", legalOwner: "Legal Team",
    state: "active", value: 6432500, currency: "INR",
    startDate: "2026-01-01", endDate: "2026-12-31",
    renewalDeadline: "2026-10-31", autoRenew: true,
    paymentTerms: "Annual upfront", governingLaw: "India",
    signed: true, signedDate: "2025-12-20",
    linkedVendor: "CrowdStrike Inc.",
    riskLevel: "low", noticePeriodDays: 60, created: "2025-11-15", nextReview: "2026-10-01",
    amendments: 1,
    obligations: [
      { id: "obl-006", description: "CrowdStrike: Maintain < 1min detection-to-alert SLA", party: "counterparty", recurring: "Monthly SLA report", status: "on_track" },
      { id: "obl-007", description: "Nexus: Deploy agent within 30 days of new endpoint provisioning", party: "us", recurring: "Per new device", status: "on_track" },
    ],
  },
  {
    id: "con-004", number: "CTR-2026-0085", title: "Co-Location & Power Agreement — Equinix DC1",
    counterparty: "Equinix Inc.", counterpartyType: "vendor", type: "lease",
    owner: "Jordan Chen", legalOwner: "Legal Team",
    state: "active", value: 31540000, currency: "INR",
    startDate: "2024-01-01", endDate: "2026-12-31",
    renewalDeadline: "2026-09-30", autoRenew: false,
    paymentTerms: "Monthly — Net 15", governingLaw: "India",
    signed: true, signedDate: "2023-11-01",
    linkedVendor: "Equinix",
    riskLevel: "high", noticePeriodDays: 90, created: "2023-10-01", nextReview: "2026-07-01",
    amendments: 2,
    obligations: [
      { id: "obl-008", description: "Equinix: Maintain PUE < 1.5 — Tier IV uptime guarantee 99.9999%", party: "counterparty", recurring: "Quarterly report", status: "on_track" },
      { id: "obl-009", description: "Nexus: Pay monthly colocation fee within Net 15", party: "us", recurring: "Monthly", status: "on_track" },
      { id: "obl-010", description: "Nexus: Notify 90 days before expiry if not renewing", party: "us", dueDate: "2026-09-30", status: "pending" },
    ],
  },
  {
    id: "con-005", number: "CTR-2026-0084", title: "NDA — Umbrella Corporation (Pre-Sales)",
    counterparty: "Umbrella Corporation", counterpartyType: "customer", type: "nda",
    owner: "Dana Kim", legalOwner: "Legal Team",
    state: "active", value: 0, currency: "INR",
    startDate: "2026-01-08", endDate: "2027-01-08",
    autoRenew: false,
    paymentTerms: undefined, governingLaw: "India",
    signed: true, signedDate: "2026-01-08",
    riskLevel: "low", noticePeriodDays: 30, created: "2026-01-05",
    amendments: 0,
    obligations: [
      { id: "obl-011", description: "Both parties: Keep all shared information confidential for 2 years post-expiry", party: "both", status: "on_track" },
    ],
  },
  {
    id: "con-006", number: "CTR-2025-0112", title: "Cisco SmartNet Total Care — Network Infrastructure",
    counterparty: "Cisco Systems Inc.", counterpartyType: "vendor", type: "sla",
    owner: "Jordan Chen", legalOwner: "Legal Team",
    state: "expiring_soon", value: 5146000, currency: "INR",
    startDate: "2025-04-01", endDate: "2026-03-31",
    renewalDeadline: "2026-03-01", autoRenew: false,
    paymentTerms: "Annual upfront", governingLaw: "India",
    signed: true, signedDate: "2025-03-20",
    linkedVendor: "Cisco",
    riskLevel: "critical", noticePeriodDays: 30, created: "2025-03-01",
    amendments: 0,
    obligations: [
      { id: "obl-012", description: "Cisco: 4hr hardware replacement SLA for P1 devices", party: "counterparty", recurring: "Per incident", status: "on_track" },
    ],
  },
];

const STATE_CFG: Record<ContractState, { label: string; color: string; bar: string }> = {
  draft:              { label: "Draft",              color: "text-muted-foreground bg-muted",   bar: "bg-slate-400" },
  under_review:       { label: "Internal Review",    color: "text-yellow-700 bg-yellow-100", bar: "bg-yellow-400" },
  legal_review:       { label: "Legal Review",       color: "text-orange-700 bg-orange-100", bar: "bg-orange-400" },
  awaiting_signature: { label: "Awaiting Signature", color: "text-blue-700 bg-blue-100",     bar: "bg-blue-500" },
  active:             { label: "Active",             color: "text-green-700 bg-green-100",   bar: "bg-green-500" },
  expiring_soon:      { label: "Expiring Soon",      color: "text-red-700 bg-red-100",       bar: "bg-red-500" },
  expired:            { label: "Expired",            color: "text-muted-foreground/70 bg-muted/30",    bar: "bg-border" },
  terminated:         { label: "Terminated",         color: "text-red-400 bg-red-50",        bar: "bg-red-400" },
};

const RISK_CFG: Record<string, string> = {
  low:      "text-green-700 bg-green-100",
  medium:   "text-yellow-700 bg-yellow-100",
  high:     "text-orange-700 bg-orange-100",
  critical: "text-red-700 bg-red-100",
};

const TYPE_LABELS: Record<ContractType, string> = {
  vendor: "Vendor Agreement", customer: "Customer Agreement", employment: "Employment",
  nda: "NDA", sla: "SLA / Support", msa: "MSA", sow: "Statement of Work",
  lease: "Lease / Colocation", licensing: "Software Licensing",
};

const OBL_STATUS_CFG: Record<string, string> = {
  pending:    "text-muted-foreground bg-muted",
  on_track:   "text-green-700 bg-green-100",
  at_risk:    "text-orange-700 bg-orange-100",
  breached:   "text-red-700 bg-red-100",
  completed:  "text-blue-700 bg-blue-100",
};

// Contract creation wizard state
type WizardStep = "type" | "parties" | "terms" | "clauses" | "review";

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  Shield,
  ScrollText,
  ListChecks,
  Package,
  Handshake,
  Building2,
  Headphones,
  FileText,
};

function ContractCreationWizard() {
  const [step, setStep] = useState<WizardStep>("type");
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null);
  const [wizardClauses, setWizardClauses] = useState<WizardClauseState[]>([]);
  const [form, setForm] = useState({
    counterparty: "", counterpartyEmail: "", counterpartyAddress: "",
    owner: "Morgan Lee", legalOwner: "Legal Team",
    value: "", currency: "INR", paymentTerms: "",
    startDate: "", endDate: "", noticePeriodDays: "30",
    autoRenew: false, governingLaw: "India",
    title: "", notes: "",
  });

  const STEPS: { key: WizardStep; label: string }[] = [
    { key: "type",    label: "Template" },
    { key: "parties", label: "Parties" },
    { key: "terms",   label: "Terms" },
    { key: "clauses", label: "Clauses" },
    { key: "review",  label: "Review & Sign" },
  ];

  const stepIndex = STEPS.findIndex(s => s.key === step);

  const utils = trpc.useUtils();

  const createFromWizard = trpc.contracts.createFromWizard.useMutation({
    onSuccess: (data) => {
      void utils.contracts.list.invalidate();
      toast.success(
        data.status === "under_review"
          ? "Contract submitted for review."
          : "Contract saved as draft.",
      );
    },
    onError: (err) => toast.error(err.message || "Could not save contract"),
  });

  const submitWizard = (submitForReview: boolean) => {
    if (!selectedTemplate) return;
    const dbType = TEMPLATE_ID_TO_DB_TYPE[selectedTemplate.id];
    if (!dbType) {
      toast.error("Unknown template type");
      return;
    }
    createFromWizard.mutate({
      title: form.title.trim() || selectedTemplate.name,
      counterparty: form.counterparty.trim(),
      type: dbType,
      value: form.value || undefined,
      currency: form.currency as (typeof SUPPORTED_CURRENCY_CODES)[number],
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      autoRenew: form.autoRenew,
      governingLaw: form.governingLaw || undefined,
      noticePeriodDays: parseInt(form.noticePeriodDays, 10) || 30,
      clauses: toStoredClauses(wizardClauses),
      submitForReview,
      obligations: [],
    });
  };

  return (
    <div className="p-4">
      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors cursor-pointer
              ${step === s.key ? "bg-primary text-white border-primary" : i < stepIndex ? "bg-green-100 text-green-700 border-green-300" : "bg-muted text-muted-foreground/70 border-slate-200"}`}
              onClick={() => i <= stepIndex && setStep(s.key)}>
              {i < stepIndex ? "✓ " : `${i+1}. `}{s.label}
            </div>
            {i < STEPS.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300" />}
          </div>
        ))}
      </div>

      {/* STEP 1: Template */}
      {step === "type" && (
        <div>
          <p className="text-[12px] text-muted-foreground mb-3">Select a contract template to start from. All templates include standard legal clauses and can be customised.</p>
          <div className="grid grid-cols-3 gap-3">
            {CONTRACT_TEMPLATES.map((tmpl) => {
              const Icon = TEMPLATE_ICONS[tmpl.icon] ?? FileText;
              return (
                <div
                  key={tmpl.id}
                  onClick={() => {
                    setSelectedTemplate(tmpl);
                    setWizardClauses(clausesFromTemplate(tmpl));
                    setForm((f) => ({ ...f, title: `${tmpl.name} — ` }));
                  }}
                  className={`border rounded p-4 cursor-pointer transition-all ${selectedTemplate?.id === tmpl.id ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-slate-300 hover:bg-muted/30"}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="flex items-center gap-1.5">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className={`status-badge text-[10px] ${RISK_CFG["low"]}`}>{tmpl.shortName}</span>
                    </span>
                    {selectedTemplate?.id === tmpl.id && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <p className="text-[13px] font-semibold text-foreground mb-1">{tmpl.name}</p>
                  <p className="text-[11px] text-muted-foreground mb-2">{tmpl.description}</p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {tmpl.clauses.length} clauses · {tmpl.clauses.filter((c) => c.isRequired).length} required
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <button disabled={!selectedTemplate} onClick={() => setStep("parties")}
              className="px-4 py-2 bg-primary text-white text-[12px] rounded hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
              Next: Define Parties →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Parties */}
      {step === "parties" && (
        <div className="max-w-xl">
          <div className="mb-4 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-[12px] text-blue-700">
            Template: <strong>{selectedTemplate?.name}</strong>
          </div>
          <div className="space-y-3">
            <div>
              <label className="field-label">Contract Title</label>
              <input value={form.title} onChange={e => setForm(f=>({...f, title: e.target.value}))}
                className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary" />
            </div>
            <div>
              <label className="field-label">Counterparty / Company Name *</label>
              <input value={form.counterparty} onChange={e => setForm(f=>({...f, counterparty: e.target.value}))}
                className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary"
                placeholder="e.g. Acme Corporation Ltd" />
            </div>
            <div>
              <label className="field-label">Counterparty Contact Email</label>
              <input value={form.counterpartyEmail} onChange={e => setForm(f=>({...f, counterpartyEmail: e.target.value}))}
                className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary"
                placeholder="legal@counterparty.com" />
            </div>
            <div>
              <label className="field-label">Registered Address</label>
              <textarea rows={2} value={form.counterpartyAddress} onChange={e => setForm(f=>({...f, counterpartyAddress: e.target.value}))}
                className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary resize-none"
                placeholder="Registered address of counterparty" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Contract Owner (Internal)</label>
                <select value={form.owner} onChange={e => setForm(f=>({...f, owner: e.target.value}))}
                  className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary">
                  {["Morgan Lee","Dana Kim","Taylor Patel","Pat Murphy","Chris Wallace"].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Legal Owner</label>
                <select value={form.legalOwner} onChange={e => setForm(f=>({...f, legalOwner: e.target.value}))}
                  className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary">
                  {["Legal Team","General Counsel","Finance","Procurement Admin"].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-between">
            <button onClick={() => setStep("type")} className="px-4 py-2 border border-border text-[12px] rounded hover:bg-muted/30 text-muted-foreground">← Back</button>
            <button disabled={!form.counterparty} onClick={() => setStep("terms")}
              className="px-4 py-2 bg-primary text-white text-[12px] rounded hover:bg-primary/90 disabled:opacity-40">
              Next: Financial Terms →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Terms */}
      {step === "terms" && (
        <div className="max-w-xl">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Contract Value</label>
                <div className="flex gap-1">
                  <select value={form.currency} onChange={e => setForm(f=>({...f, currency: e.target.value}))}
                    className="border border-border rounded px-2 py-1.5 text-[12px] outline-none focus:border-primary">
                    {SUPPORTED_CURRENCY_CODES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input value={form.value} onChange={e => setForm(f=>({...f, value: e.target.value}))} type="number"
                    className="flex-1 border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary"
                    placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="field-label">Payment Terms</label>
                <select value={form.paymentTerms} onChange={e => setForm(f=>({...f, paymentTerms: e.target.value}))}
                  className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary">
                  <option value="">Select...</option>
                  {["Annual upfront — Net 30","Net 30","Net 45","Net 60","Monthly — Net 15","50% upfront / 50% on completion","Time & Materials — Monthly"].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Start Date *</label>
                <input type="date" value={form.startDate} onChange={e => setForm(f=>({...f, startDate: e.target.value}))}
                  className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary" />
              </div>
              <div>
                <label className="field-label">End Date *</label>
                <input type="date" value={form.endDate} onChange={e => setForm(f=>({...f, endDate: e.target.value}))}
                  className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Notice Period (Days)</label>
                <input type="number" value={form.noticePeriodDays} onChange={e => setForm(f=>({...f, noticePeriodDays: e.target.value}))}
                  className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary" />
              </div>
              <div>
                <label className="field-label">Governing Law / Jurisdiction</label>
                <select value={form.governingLaw} onChange={e => setForm(f=>({...f, governingLaw: e.target.value}))}
                  className="w-full border border-border rounded px-3 py-1.5 text-[12px] outline-none focus:border-primary">
                  {[
                    "India",
                    "Singapore",
                    "UAE (DIFC)",
                    "England & Wales",
                    "New York, USA",
                    "California, USA",
                    "Delaware, USA",
                    "Ireland (EU)",
                    "Australia (NSW)",
                  ].map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="autorenew" checked={form.autoRenew}
                onChange={e => setForm(f=>({...f, autoRenew: e.target.checked}))} />
              <label htmlFor="autorenew" className="text-[12px] text-foreground/80">Auto-renew unless cancelled within notice period</label>
            </div>
          </div>
          <div className="mt-4 flex justify-between">
            <button onClick={() => setStep("parties")} className="px-4 py-2 border border-border text-[12px] rounded hover:bg-muted/30 text-muted-foreground">← Back</button>
            <button
              onClick={() => {
                if (form.governingLaw) {
                  setWizardClauses(prev =>
                    prev.map(c => {
                      const govLawFieldId = c.fields.find(f => f.id.endsWith("_governing_law"))?.id;
                      if (!govLawFieldId) return c;
                      return { ...c, fieldValues: { ...c.fieldValues, [govLawFieldId]: form.governingLaw } };
                    })
                  );
                }
                setStep("clauses");
              }}
              className="px-4 py-2 bg-primary text-white text-[12px] rounded hover:bg-primary/90"
            >
              Next: Review Clauses →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Clauses */}
      {step === "clauses" && selectedTemplate && (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-amber-800 text-sm font-medium">
              ⚠️ Legal disclaimer: These templates are standardized starting points and do not constitute legal advice. All contracts should be reviewed by qualified legal counsel before execution. Clause content may need to be adapted to comply with the laws of your jurisdiction.
            </p>
          </div>
          <p className="text-[12px] text-muted-foreground mb-3">
            Review and customise clauses for <strong>{selectedTemplate.name}</strong>. Enable or disable optional clauses, adjust parameters, and edit the live preview text where needed.
          </p>
          <ClauseEditor
            clauses={wizardClauses}
            onChange={setWizardClauses}
            currencyCode={form.currency}
          />
          <div className="mt-4 flex justify-between">
            <button type="button" onClick={() => setStep("terms")} className="px-4 py-2 border border-border text-[12px] rounded hover:bg-muted/30 text-muted-foreground">← Back</button>
            <button type="button" onClick={() => setStep("review")} className="px-4 py-2 bg-primary text-white text-[12px] rounded hover:bg-primary/90">
              Review & Finalise →
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Review */}
      {step === "review" && selectedTemplate && (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-amber-800 text-sm font-medium">
              ⚠️ Legal disclaimer: These templates are starting points only and do not constitute legal advice. Consult qualified legal counsel before executing any agreement.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="border border-border rounded p-4">
              <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-2">Contract Summary</p>
              <div className="space-y-1.5 text-[12px]">
                <div><span className="text-muted-foreground/70">Template:</span> <span className="font-medium text-foreground">{selectedTemplate.name}</span></div>
                <div><span className="text-muted-foreground/70">Title:</span> <span className="font-medium text-foreground">{form.title || "[Untitled]"}</span></div>
                <div><span className="text-muted-foreground/70">Counterparty:</span> <span className="font-medium text-foreground">{form.counterparty || "[Not set]"}</span></div>
                <div><span className="text-muted-foreground/70">Value:</span> <span className="font-bold text-foreground">{form.currency} {form.value ? parseFloat(form.value).toLocaleString() : "0"}</span></div>
                <div><span className="text-muted-foreground/70">Term:</span> <span className="text-foreground/80">{form.startDate || "—"} → {form.endDate || "—"}</span></div>
                <div><span className="text-muted-foreground/70">Governing Law:</span> <span className="text-foreground/80">{form.governingLaw}</span></div>
                <div><span className="text-muted-foreground/70">Auto-renew:</span> <span className={form.autoRenew ? "text-green-700" : "text-muted-foreground"}>{form.autoRenew ? "Yes" : "No"}</span></div>
                <div><span className="text-muted-foreground/70">Owner:</span> <span className="text-foreground/80">{form.owner}</span></div>
                <div><span className="text-muted-foreground/70">Legal:</span> <span className="text-foreground/80">{form.legalOwner}</span></div>
              </div>
            </div>
            <div className="border border-border rounded p-4">
              <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-2">Approval & Signature Workflow</p>
              <div className="space-y-2">
                {[
                  { step: "1", label: "Contract Owner Review",   user: form.owner,      status: "pending" },
                  { step: "2", label: "Legal Review & Sign-off", user: form.legalOwner, status: "pending" },
                  { step: "3", label: "CFO Approval (if >₹50L)", user: "Finance Controller", status: parseFloat(form.value||"0") > 5000000 ? "pending" : "n/a" },
                  { step: "4", label: "Send for Counterparty E-signature", user: form.counterpartyEmail || "[counterparty email]", status: "pending" },
                  { step: "5", label: "Contract Executed — Filed", user: "System", status: "pending" },
                ].map((w) => (
                  <div key={w.step} className={`flex items-center gap-2 text-[11px] ${w.status === "n/a" ? "opacity-30" : ""}`}>
                    <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] flex items-center justify-center font-bold">{w.step}</span>
                    <span className="text-foreground/80 flex-1">{w.label}</span>
                    <span className="text-muted-foreground/70">{w.user}</span>
                    <span className={`status-badge ${w.status === "n/a" ? "text-slate-300 bg-muted/30" : "text-muted-foreground bg-muted"}`}>{w.status === "n/a" ? "N/A" : "Pending"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border border-border rounded p-4 mb-4 bg-muted/30/50">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase">Contract document preview</p>
              <button
                type="button"
                className="flex items-center gap-1 px-3 py-1 text-[11px] border border-border rounded bg-card hover:bg-muted/30 text-muted-foreground"
                onClick={() =>
                  openContractPdfPrint(
                    form.title.trim() || selectedTemplate.name,
                    buildContractDocumentHtml({
                      title: form.title.trim() || selectedTemplate.name,
                      counterparty: form.counterparty.trim() || "—",
                      clauses: wizardClauses,
                    }),
                  )
                }
              >
                <Download className="w-3 h-3" /> Download PDF
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto rounded border border-border bg-card p-4 text-[12px] text-foreground leading-relaxed space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-[15px] font-semibold text-foreground">{form.title.trim() || selectedTemplate.name}</h2>
                <p className="text-[11px] text-muted-foreground mt-1">Counterparty: {form.counterparty.trim() || "—"}</p>
              </div>
              {wizardClauses
                .filter((c) => c.isEnabled)
                .map((c) => (
                  <section key={c.id}>
                    <h3 className="text-[12px] font-semibold text-foreground mb-1.5">{c.title}</h3>
                    <div className="text-[11px] text-muted-foreground whitespace-pre-wrap">{getDisplayedClauseBody(c)}</div>
                  </section>
                ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setStep("clauses")} className="px-4 py-2 border border-border text-[12px] rounded hover:bg-muted/30 text-muted-foreground">← Back</button>
            <button
              type="button"
              disabled={createFromWizard.isPending || !form.counterparty.trim()}
              onClick={() => submitWizard(false)}
              className="px-4 py-2 border border-border text-[12px] rounded hover:bg-muted/30 text-muted-foreground disabled:opacity-40"
            >
              Save as Draft
            </button>
            <button
              type="button"
              disabled={createFromWizard.isPending || !form.counterparty.trim()}
              onClick={() => submitWizard(true)}
              className="px-4 py-2 bg-primary text-white text-[12px] rounded hover:bg-primary/90 flex items-center gap-1 disabled:opacity-40"
            >
              <Send className="w-3 h-3" /> Submit for Approval
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContractsPageInner() {
  const { can } = useRBAC();
  const router = useRouter();
  const searchParams = useSearchParams();
  const visibleTabs = CONTRACT_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "register");
  const [expandedContract, setExpandedContract] = useState<string | null>(
    searchParams.get("id"),
  );

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      setTab("register");
      setExpandedContract(id);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  // Live contracts from API, fallback to mock for demo
  const { data: contractsApiData } = trpc.contracts.list.useQuery({ limit: 100 });

  const utils = trpc.useUtils();
  const completeObligation = trpc.contracts.completeObligation.useMutation({
    onSuccess: () => { void utils.contracts.list.invalidate(); toast.success("Obligation marked as completed"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update obligation"),
  });

  if (!can("contracts", "read")) return <AccessDenied module="Contract Management" />;

  const allContracts: Contract[] = ((contractsApiData as any)?.items?.length
    ? (contractsApiData as any).items
    : []) as Contract[];

  const expiringContracts = allContracts.filter(c => c.state === "expiring_soon" || (c.renewalDeadline && new Date(c.renewalDeadline) < new Date(Date.now() + 90 * 86400000)));
  const totalContractValue = allContracts.reduce((s, c) => s + (c.value ?? 0), 0);
  const activeContracts = allContracts.filter(c => c.state === "active").length;
  const allObligations = allContracts.flatMap(c => c.obligations ?? []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Contract Management</h1>
          <span className="text-[11px] text-muted-foreground/70">Register · Creation Wizard · Obligations · Renewals</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadCSV(allContracts.map((c) => ({ Number: c.id, Title: c.title, Vendor: c.vendor, Type: c.type, Value: c.value, Currency: c.currency, Start: c.startDate, End: c.endDate, Status: c.state, Renewal_Deadline: c.renewalDeadline ?? "" })), "contracts_export")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          <PermissionGate module="contracts" action="write">
            <button onClick={() => setTab("create")} className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
              <Plus className="w-3 h-3" /> Create Contract
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Active Contracts",         value: activeContracts,              color: "text-green-700" },
          { label: "Total Contracted Value",    value: `₹${(totalContractValue/10000000).toFixed(1)}Cr`, color: "text-foreground/80" },
          { label: "Expiring / At Risk",        value: expiringContracts.length,    color: expiringContracts.length > 0 ? "text-red-700" : "text-green-700" },
          { label: "Pending Signature",         value: allContracts.filter(c => c.state === "awaiting_signature").length, color: "text-blue-700" },
          { label: "Open Obligations",          value: allObligations.filter(o => o.status !== "completed").length, color: "text-orange-700" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {expiringContracts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded px-3 py-2 flex items-center gap-2 text-[12px] text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <strong>{expiringContracts.length} contract{expiringContracts.length > 1 ? "s" : ""} requiring immediate action:</strong>
          {expiringContracts.map(c => (
            <span key={c.id} className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded font-mono">{c.number}</span>
          ))}
          — review and initiate renewal negotiations now.
        </div>
      )}

      <div className="flex border-b border-border bg-card rounded-t">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {tab === "register" && (
          <div>
            {allContracts.map((c) => {
              const rawState = (c as any).state ?? (c as any).status ?? "active";
              const sCfg = STATE_CFG[rawState as ContractState] ?? STATE_CFG.active;
              const isExpanded = expandedContract === c.id;
              const endDateVal = (c as any).endDate ?? (c as any).end_date;
              const daysToExpiry = endDateVal
                ? Math.round((new Date(endDateVal).getTime() - new Date().getTime()) / 86400000)
                : null;

              return (
                <div key={c.id} className="border-b border-border last:border-0">
                  <div className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedContract(isExpanded ? null : c.id)}>
                    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${sCfg.bar}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-[11px] text-primary">{c.number}</span>
                        <span className={`status-badge ${sCfg.color}`}>{sCfg.label}</span>
                        <span className={`status-badge ${RISK_CFG[c.riskLevel ?? "low"] ?? RISK_CFG.low}`}>Risk: {c.riskLevel ?? "low"}</span>
                        <span className="status-badge text-muted-foreground bg-muted text-[10px]">{TYPE_LABELS[c.type] ?? c.type}</span>
                        {!c.signed && <span className="status-badge text-orange-700 bg-orange-100 text-[10px]">⚠ Not signed</span>}
                        {c.autoRenew && <span className="status-badge text-blue-700 bg-blue-100 text-[10px]">↻ Auto-renew</span>}
                      </div>
                      <p className="text-[13px] font-semibold text-foreground">{c.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Counterparty: <strong>{c.counterparty}</strong> ·
                        Owner: {c.owner} ·
                        {endDateVal} ({daysToExpiry !== null ? (daysToExpiry > 0 ? `${daysToExpiry}d remaining` : `expired ${Math.abs(daysToExpiry)}d ago`) : "—"})
                        {c.renewalDeadline && ` · Renewal deadline: ${c.renewalDeadline}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono font-bold text-[14px] text-foreground">
                        {c.value > 0 ? `₹${c.value.toLocaleString("en-IN")}` : "No Fee"}
                      </div>
                      <div className="text-[11px] text-muted-foreground/70">{c.currency} · {c.amendments} amendment{c.amendments !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-6 pb-4 bg-muted/30/50 border-t border-dashed border-slate-200">
                      <div className="grid grid-cols-3 gap-3 mt-3 mb-4">
                        {[
                          { label: "Governing Law",     value: c.governingLaw },
                          { label: "Payment Terms",     value: c.paymentTerms ?? "N/A" },
                          { label: "Notice Period",     value: `${c.noticePeriodDays} days` },
                          { label: "Signed",            value: c.signed ? `Yes — ${c.signedDate}` : "No" },
                          { label: "Legal Owner",       value: c.legalOwner },
                          { label: "Next Review",       value: c.nextReview ?? "—" },
                        ].map(f => (
                          <div key={f.label} className="text-[11px]">
                            <span className="text-muted-foreground/70">{f.label}: </span>
                            <span className="text-foreground/80 font-medium">{f.value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Obligations ({(c.obligations ?? []).length})</div>
                      <table className="ent-table w-full mb-3">
                        <thead><tr><th>Obligation</th><th>Party</th><th>Frequency / Due</th><th>Status</th></tr></thead>
                        <tbody>
                          {(c.obligations ?? []).map(obl => (
                            <tr key={obl.id}>
                              <td className="text-foreground">{obl.description}</td>
                              <td><span className={`status-badge ${obl.party === "us" ? "text-blue-700 bg-blue-100" : obl.party === "counterparty" ? "text-purple-700 bg-purple-100" : "text-muted-foreground bg-muted"}`}>{obl.party === "us" ? "Our obligation" : obl.party === "counterparty" ? c.counterparty : "Both parties"}</span></td>
                              <td className="text-[11px] text-muted-foreground">{obl.recurring ?? obl.dueDate ?? "—"}</td>
                              <td><span className={`status-badge capitalize ${OBL_STATUS_CFG[obl.status] ?? "text-muted-foreground bg-muted"}`}>{(obl.status ?? "").replace("_"," ")}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex gap-2">
                        <PermissionGate module="contracts" action="write">
                          {!c.signed && c.state === "awaiting_signature" && (
                            <button
                              onClick={() => { toast.success(`E-signature workflow initiated for "${c.title}". A DocuSign/DigiLocker request will be sent to all signatories.`); }}
                              className="px-3 py-1 bg-green-100 text-green-700 text-[11px] rounded hover:bg-green-200"
                            >
                              <Send className="w-3 h-3 inline mr-1" />Send for E-Signature
                            </button>
                          )}
                          <button
                            onClick={() => toast.success(`Amendment workflow initiated for "${c.title}". New draft will appear in the Contract Wizard.`)}
                            className="px-3 py-1 border border-border text-[11px] rounded hover:bg-muted/30 text-muted-foreground"
                          >
                            Add Amendment
                          </button>
                        </PermissionGate>
                        <button
                          onClick={() => downloadCSV([{ Title: c.title, Vendor: c.vendor, Type: c.type, Value: c.value, Currency: c.currency, Start: c.startDate, End: c.endDate, Status: c.state }], `contract_${c.id}`)}
                          className="px-3 py-1 border border-border text-[11px] rounded hover:bg-muted/30 text-muted-foreground"
                        >
                          <FileText className="w-3 h-3 inline mr-1" />Download PDF
                        </button>
                        {c.state === "active" && c.renewalDeadline && (
                          <button
                            onClick={() => toast.success(`Renewal initiated for "${c.title}". Deadline: ${new Date(c.renewalDeadline!).toLocaleDateString("en-IN")}. New draft will appear in the Contract Wizard.`)}
                            className="px-3 py-1 bg-orange-100 text-orange-700 text-[11px] rounded hover:bg-orange-200"
                          >
                            <RefreshCw className="w-3 h-3 inline mr-1" />Initiate Renewal
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "create" && <ContractCreationWizard />}

        {tab === "expiring" && (
          <div className="p-4">
            <p className="text-[12px] text-muted-foreground mb-3">Contracts expiring or with renewal deadlines within the next 90 days. Act immediately to avoid service disruption.</p>
            {expiringContracts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground/70 text-[12px]">No contracts expiring in the next 90 days.</div>
            ) : (
              <div className="space-y-3">
                {expiringContracts.map(c => {
                  const daysToRenewal = c.renewalDeadline ? Math.round((new Date(c.renewalDeadline).getTime() - new Date().getTime()) / 86400000) : null;
                  return (
                    <div key={c.id} className={`border rounded p-4 ${c.riskLevel === "critical" ? "border-red-300 bg-red-50/20" : "border-orange-200 bg-orange-50/10"}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-[11px] text-primary">{c.number}</span>
                            <span className={`status-badge ${RISK_CFG[c.riskLevel]}`}>Risk: {c.riskLevel}</span>
                          </div>
                          <p className="text-[13px] font-semibold text-foreground">{c.title}</p>
                          <p className="text-[11px] text-muted-foreground">{c.counterparty} · Expires: {c.endDate}</p>
                          {daysToRenewal !== null && (
                            <p className={`text-[12px] font-semibold mt-1 ${daysToRenewal < 0 ? "text-red-700" : daysToRenewal < 30 ? "text-red-600" : "text-orange-600"}`}>
                              {daysToRenewal < 0 ? `Renewal deadline PASSED ${Math.abs(daysToRenewal)} days ago` : `Renewal deadline in ${daysToRenewal} days (${c.renewalDeadline})`}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => toast.success(`Renewal started for "${c.title}". Deadline: ${c.renewalDeadline ? new Date(c.renewalDeadline).toLocaleDateString("en-IN") : "—"}. Open the Contract Wizard to draft renewal terms.`)}
                            className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
                          >
                            <RefreshCw className="w-3 h-3 inline mr-1" />Start Renewal
                          </button>
                          <button
                            onClick={() => setExpandedContract(expandedContract === c.id ? null : c.id)}
                            className="px-3 py-1 border border-border text-[11px] rounded hover:bg-muted/30 text-muted-foreground"
                          >View</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "obligations" && (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Contract</th>
                <th>Obligation</th>
                <th>Party</th>
                <th>Frequency / Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allContracts.flatMap(c => (c.obligations ?? []).map(obl => (
                <tr key={obl.id} className={obl.status === "breached" ? "bg-red-50/30" : ""}>
                  <td className="p-0"><div className={`priority-bar ${obl.status === "breached" ? "bg-red-600" : obl.status === "at_risk" ? "bg-orange-500" : obl.status === "on_track" ? "bg-green-500" : "bg-border"}`} /></td>
                  <td className="font-mono text-[11px] text-primary">{c.number}</td>
                  <td className="text-foreground">{obl.description}</td>
                  <td><span className={`status-badge text-[10px] ${obl.party === "us" ? "text-blue-700 bg-blue-100" : obl.party === "counterparty" ? "text-purple-700 bg-purple-100" : "text-muted-foreground bg-muted"}`}>{obl.party === "us" ? "Our obligation" : obl.party === "counterparty" ? c.counterparty : "Both"}</span></td>
                  <td className="text-[11px] text-muted-foreground">{obl.recurring ?? obl.dueDate ?? "—"}</td>
                  <td><span className={`status-badge capitalize ${OBL_STATUS_CFG[obl.status]}`}>{obl.status.replace("_"," ")}</span></td>
                  <td>
                    <PermissionGate module="contracts" action="write">
                      <button
                        onClick={() => {
                          if (/^[0-9a-f-]{36}$/i.test(obl.id)) {
                            completeObligation.mutate({ id: obl.id });
                          } else {
                            toast.success("Obligation marked complete (demo data)");
                          }
                        }}
                        disabled={completeObligation.isPending || obl.status === "completed"}
                        className="text-[11px] text-primary hover:underline disabled:opacity-50"
                      >Update</button>
                    </PermissionGate>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function ContractsPage() {
  return (
    <Suspense fallback={null}>
      <ContractsPageInner />
    </Suspense>
  );
}
