"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  TrendingUp, Users, Building2, Phone, Mail, Calendar, Star,
  Plus, Search, Download, ChevronRight, MoreHorizontal,
  Target, DollarSign, BarChart2, Activity, Tag, Repeat,
  Clock, CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight,
  FileText, Send, Filter, Globe, Briefcase, Award, X, Pencil, Archive, Upload, Settings,
} from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { downloadCSV, cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { CsvImportModal, type ImportField } from "@/components/csv-import-modal";
import { CrmActivityTimeline } from "@/components/crm/activity-timeline";
import { CrmManagementView } from "@/components/crm/management-view";
import { GSTIN_STATE_CODES } from "@coheronconnect/payroll-math";
import { LOST_REASONS, LOST_REASON_OTHER } from "@/lib/crm-lost-reasons";

const LEAD_IMPORT_FIELDS: ImportField[] = [
  { key: "firstName", label: "First Name", required: true },
  { key: "lastName", label: "Last Name", required: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "title", label: "Title" },
  { key: "company", label: "Company" },
  { key: "source", label: "Source", enumValues: ["website", "referral", "event", "cold_outreach", "partner", "advertising", "other"] },
  { key: "status", label: "Status", enumValues: ["new", "contacted", "qualified", "converted", "disqualified"] },
];

const CONTACT_IMPORT_FIELDS: ImportField[] = [
  { key: "firstName", label: "First Name", required: true },
  { key: "lastName", label: "Last Name", required: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "title", label: "Title" },
  // REQUIRED, and matched by name against existing active accounts. Without it
  // the importer wrote contacts with no account, which appear on the Contacts
  // tab but on no account page. The server rejects a row whose name matches no
  // account (or matches more than one) and says so per row.
  { key: "accountName", label: "Account Name", required: true },
];

const DEAL_IMPORT_FIELDS: ImportField[] = [
  { key: "title", label: "Title", required: true },
  { key: "stage", label: "Stage", enumValues: ["prospect", "qualification", "proposal", "negotiation", "verbal_commit", "closed_won", "closed_lost"] },
  { key: "value", label: "Value" },
  { key: "probability", label: "Probability" },
  { key: "expectedClose", label: "Expected Close" },
];

/*
 * FIVE tabs. Was eight.
 *
 * Contacts folded into Accounts and Quotes into Pipeline — as SUB-VIEWS, not as
 * deletions. Each parent tab carries a segmented control, because the merge must
 * not cost reachability: the Contacts tab was the only list of ALL contacts, and
 * the Quotes tab the only list of all quotes. A contact whose account you do not
 * know, and a quote whose deal you do not know (three such quotes exist on the
 * dev and test databases), would otherwise become unfindable.
 *
 * Activities folded away with no sub-view: `assertActivityHasAssociation` means
 * every activity hangs off a lead, deal, account or contact, and all four now
 * carry a timeline, so an activity is context on a record rather than a
 * destination of its own. Measured on the dev org: 1 activity, 0 with no
 * association.
 */
const CRM_TABS = [
  { key: "dashboard", label: "Dashboard", module: "accounts" as const, action: "read" as const },
  { key: "pipeline", label: "Pipeline", module: "accounts" as const, action: "write" as const },
  { key: "accounts", label: "Accounts", module: "accounts" as const, action: "read" as const },
  { key: "leads", label: "Leads", module: "accounts" as const, action: "read" as const },
  { key: "analytics", label: "Analytics", module: "analytics" as const, action: "read" as const },
];

/** Retired tab keys -> where that content now lives. Drives ?tab= redirects. */
const RETIRED_TABS: Record<string, { tab: string; view?: string }> = {
  contacts: { tab: "accounts", view: "contacts" },
  quotes: { tab: "pipeline", view: "quotes" },
  // An activity is reached from the record it concerns; the Dashboard carries
  // the org-wide recent list, so that is where a bare ?tab=activities lands.
  activities: { tab: "dashboard" },
};

type DealStage = "prospect" | "qualification" | "proposal" | "negotiation" | "verbal_commit" | "closed_won" | "closed_lost";
type LeadStatus = "new" | "contacted" | "qualified" | "nurturing" | "converted" | "dead";
type ActivityType = "call" | "email" | "meeting" | "demo" | "follow_up" | "task";

interface Deal {
  id: string;
  number: string;
  name: string;
  account: string;
  contact: string;
  owner: string;
  stage: DealStage;
  value: number;
  currency: string;
  probability: number;
  closeDate: string;
  created: string;
  lastActivity: string;
  source: string;
  products: string[];
  notes?: string;
}

interface Account {
  id: string;
  name: string;
  industry: string;
  type: "customer" | "prospect" | "partner" | "vendor";
  website: string;
  country: string;
  employees: number;
  annualRevenue: number;
  owner: string;
  openOpps: number;
  totalDeals: number;
  totalRevenue: number;
  healthScore: number;
  tier: "enterprise" | "mid_market" | "smb";
  lastContact: string;
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  account: string;
  email: string;
  phone: string;
  mobile?: string;
  department: string;
  seniority: "c_level" | "vp" | "director" | "manager" | "individual";
  owner: string;
  linkedIn?: string;
  lastActivity: string;
  openDeals: number;
  doNotContact: boolean;
}

/**
 * Row-level lead progression.
 *
 * The milestone test: a transition should reflect something the PROSPECT did, not
 * something the rep intends. So the control offers the ONE next milestone plus the
 * negative outcome — not a dropdown of every status, which would let a rep advance a
 * lead by declaring it advanced.
 *
 * The real `lead_status` enum is FIVE values (new, contacted, qualified, converted,
 * disqualified). There is no `nurturing` and no `dead`; `disqualified` is the
 * negative terminal state.
 *
 * `converted` is deliberately absent from every transition list. Conversion is a
 * structured action that requires an estimated value and an expected close date and
 * creates the account, contact and deal together; setting the status directly would
 * produce a lead marked converted with no deal behind it.
 */
const LEAD_NEXT_STEP: Record<string, { to: string; label: string; hint: string }[]> = {
  new: [
    { to: "contacted", label: "Log first contact", hint: "They replied or you reached them" },
    { to: "disqualified", label: "Disqualify", hint: "Not a fit, or no longer responsive" },
  ],
  contacted: [
    { to: "qualified", label: "Mark qualified", hint: "They confirmed a need, a budget and a timeline" },
    { to: "disqualified", label: "Disqualify", hint: "Not a fit, or no longer responsive" },
  ],
  qualified: [
    // No advance to `converted` here — that is the Convert action, which requires
    // an estimated value and an expected close date.
    { to: "disqualified", label: "Disqualify", hint: "Lost or went quiet after qualifying" },
  ],
  // Terminal — nothing advances out of these from the row.
  converted: [],
  disqualified: [],
};

// ── Quote line-item editor model ────────────────────────────────────────────
/** GST rates the engine accepts (`quote-tax.ts` → `VALID_GST_RATES`). */
const QUOTE_GST_RATES = [0, 5, 12, 18, 28] as const;

/**
 * A line as the editor holds it. Every money/number field is a STRING because
 * these are bound to text inputs: coercing on each keystroke turns "12." into
 * NaN and eats the decimal point. Coercion happens once, in `lineTotal`.
 */
interface QuoteLineDraft {
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  hsnCode: string;
  gstRate: string;
}

function blankQuoteLine(): QuoteLineDraft {
  return { description: "", quantity: "1", unitPrice: "", discountPct: "0", hsnCode: "", gstRate: "18" };
}

/** Line total = qty × unit price, less this line's own discount. Rounded to paise. */
function lineTotal(l: QuoteLineDraft): number {
  const qty = Number(l.quantity);
  const price = Number(l.unitPrice);
  const disc = Number(l.discountPct);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  const pct = Number.isFinite(disc) ? Math.min(100, Math.max(0, disc)) : 0;
  return Math.round(qty * price * (1 - pct / 100) * 100) / 100;
}

/** Draft → the wire shape `crm.deals.quotes.*` accepts. */
function toQuoteApiLine(l: QuoteLineDraft) {
  return {
    description: l.description.trim() || "Line item",
    quantity: Number(l.quantity) || 0,
    unitPrice: String(Number(l.unitPrice) || 0),
    total: String(lineTotal(l)),
    hsnCode: l.hsnCode.trim() || undefined,
    gstRate: Number(l.gstRate),
    discountPct: Number(l.discountPct) || 0,
  };
}

const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * One line of the quote totals panel. `data-value` carries the RAW number so a
 * test can assert the arithmetic without being coupled to rupee formatting
 * (there is no shared money formatter yet — recorded in the parity audit).
 */
function Row({ label, value, testid, bold }: { label: string; value: unknown; testid: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 text-[12px] ${bold ? "font-bold text-foreground" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span data-testid={testid} data-value={Number(value ?? 0)} className={`font-mono ${bold ? "text-[14px]" : ""}`}>{inr(value)}</span>
    </div>
  );
}

/** GST state options for the account form — the IRP vocabulary, not INDIAN_STATES. */
const GST_STATE_OPTIONS: [string, string][] = Object.entries(GSTIN_STATE_CODES)
  .filter(([, name]) => !/Other Territory|Centre Jurisdiction/.test(name))
  .sort((a, b) => a[1].localeCompare(b[1]));
const GST_STATE_NAME: Record<string, string> = GSTIN_STATE_CODES;

interface Lead {
  id: string;
  number: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  phone?: string;
  source: string;
  status: LeadStatus;
  score: number;
  owner: string;
  created: string;
  /** Real most-recent COMPLETED activity, resolved by crm.leads.list. */
  lastActivityAt?: string | Date | null;
  // ── Qualification (BANT) + opportunity shape ──────────────────────────────
  budgetBand?: string | null;
  budgetNote?: string | null;
  authority?: string | null;
  need?: string | null;
  timeline?: string | null;
  estimatedValue?: string | null;
  expectedClose?: string | Date | null;
  nextAction?: string | null;
  nextActionDate?: string | Date | null;
  notes?: string;
}

interface SalesActivity {
  id: string;
  type: ActivityType;
  subject: string;
  account: string;
  contact: string;
  owner: string;
  deal?: string;
  dueDate: string;
  completed: boolean;
  completedDate?: string;
  outcome?: string;
  duration?: number;
  notes?: string;
}

interface Quote {
  id: string;
  number: string;
  name: string;
  account: string;
  deal?: string;
  owner: string;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
  validUntil: string;
  created: string;
  lineItems: QuoteLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  paymentTerms: string;
  notes?: string;
}

interface QuoteLineItem {
  line: number;
  product: string;
  description: string;
  qty: number;
  unitPrice: number;
  discount: number;
  total: number;
}





const STAGE_CFG: Record<DealStage, { label: string; color: string; order: number; icon: string }> = {
  prospect: { label: "Prospect", color: "text-muted-foreground bg-muted", order: 0, icon: "○" },
  qualification: { label: "Qualification", color: "text-blue-700 bg-blue-100", order: 1, icon: "◑" },
  proposal: { label: "Proposal", color: "text-indigo-700 bg-indigo-100", order: 2, icon: "◑" },
  negotiation: { label: "Negotiation", color: "text-purple-700 bg-purple-100", order: 3, icon: "◕" },
  verbal_commit: { label: "Verbal Commit", color: "text-orange-700 bg-orange-100", order: 4, icon: "◕" },
  closed_won: { label: "Closed Won", color: "text-green-700 bg-green-100", order: 5, icon: "●" },
  closed_lost: { label: "Closed Lost", color: "text-red-700 bg-red-100", order: 5, icon: "✕" },
};

const LEAD_STATUS_CFG: Record<LeadStatus, string> = {
  new: "text-muted-foreground bg-muted",
  contacted: "text-blue-700 bg-blue-100",
  qualified: "text-green-700 bg-green-100",
  nurturing: "text-purple-700 bg-purple-100",
  converted: "text-emerald-700 bg-emerald-100",
  dead: "text-red-400 bg-red-50",
};

const ACTIVITY_TYPE_CFG: Record<ActivityType, { color: string; icon: string }> = {
  call: { color: "text-blue-600 bg-blue-100", icon: "📞" },
  email: { color: "text-indigo-600 bg-indigo-100", icon: "📧" },
  meeting: { color: "text-purple-600 bg-purple-100", icon: "🤝" },
  demo: { color: "text-orange-600 bg-orange-100", icon: "🖥" },
  follow_up: { color: "text-green-600 bg-green-100", icon: "🔔" },
  task: { color: "text-muted-foreground bg-muted", icon: "✓" },
};

/**
 * Download the quotation as a real PDF.
 *
 * This control used to call `downloadCSV` and emit a six-column CSV named `.csv`
 * while the button said "Download PDF" — no line items, no tax split, no GSTINs.
 * It now fetches the PDFKit-generated document from the API.
 *
 * `fetch` rather than `window.open` because the API answers **409** with a JSON
 * explanation when the quote's tax basis cannot be verified (no linked account,
 * or an account with a missing/unrecognised state — either of which would make
 * the CGST/SGST split an unverified guess on a document a customer may claim
 * input credit against). `window.open` would dump that JSON into a blank tab;
 * this surfaces the message that names the field to fix.
 */
async function downloadQuotePdf(id: string, quoteNumber: string): Promise<void> {
  try {
    const res = await fetch(`/api/crm/quote-pdf/${id}`, { credentials: "include" });
    if (!res.ok) {
      let message = `Could not generate the quotation (HTTP ${res.status}).`;
      if (res.headers.get("content-type")?.includes("application/json")) {
        const body = (await res.json()) as { message?: string };
        if (body?.message) message = body.message;
      }
      toast.error(message, { duration: 12_000 });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quote-${quoteNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    toast.error("Could not reach the server to generate the quotation.");
  }
}

/**
 * Keys are exactly `quote_status`: draft | sent | accepted | rejected | expired.
 * "viewed" and "declined" were offered by the status picker and do not exist in
 * the enum — picking either produced a zod error toast and no change.
 */
const QUOTE_STATUS_CFG: Record<string, string> = {
  draft: "text-muted-foreground bg-muted",
  sent: "text-blue-700 bg-blue-100",
  accepted: "text-green-700 bg-green-100",
  rejected: "text-red-700 bg-red-100",
  expired: "text-muted-foreground/70 bg-muted/30",
};
const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;

const TIER_CFG: Record<string, string> = {
  enterprise: "text-purple-700 bg-purple-100",
  mid_market: "text-blue-700 bg-blue-100",
  smb: "text-muted-foreground bg-muted",
};

/* SENIORITY_CFG deleted with the Contacts Seniority column: `crm_contacts.seniority`
   is written by nothing except the analytics seed, so the badge was always "—".
   (Its "individual" key never matched the enum's `individual_contributor` either.) */

const SCORE_COLOR = (s: number) => s >= 80 ? "text-green-700" : s >= 60 ? "text-yellow-600" : "text-red-600";

// Qualification omitted: it is a LEAD status, not a deal stage. This is only the
// pre-load fallback; the live ladder comes from the org's own stage config.
const PIPELINE_STAGES: DealStage[] = ["prospect", "proposal", "negotiation", "verbal_commit"];

/**
 * Mirrors DEFAULT_PIPELINE_STAGES in apps/api/src/routers/crm/deals.ts and the
 * backfill in migration 0089. Used only until `crm.deals.stages.list` resolves;
 * the tenant's own configured values win as soon as they arrive.
 */
const FALLBACK_STAGE_PROBABILITY: Record<string, number> = {
  prospect: 10, qualification: 25, proposal: 50, negotiation: 70,
  verbal_commit: 90, closed_won: 100, closed_lost: 0,
};


function dealCloseTierClient(
  value: number,
  low: number,
  execAbove: number,
): "none" | "manager" | "executive" {
  if (value < low) return "none";
  if (value >= execAbove) return "executive";
  return "manager";
}

export default function CRMPage() {
  const { can, mergeTrpcQueryOpts, isAdmin } = useRBAC();
  const visibleTabs = CRM_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "dashboard");
  /*
   * Sub-views inside the merged tabs. "accounts"/"board" are the defaults, so
   * the merge is invisible to anyone who never used Contacts or Quotes.
   */
  const [accountsView, setAccountsView] = useState<"accounts" | "contacts">("accounts");
  const [pipelineView, setPipelineView] = useState<"board" | "quotes">("board");

  /*
   * ?tab= — HONOURED, and it was not before.
   *
   * The tab lived in plain useState and nothing ever read the query string, so
   * every ?tab= link silently landed on Dashboard. That included the
   * "+ Add Contact" link on the account detail page, which has pointed at
   * /app/crm?tab=contacts since it was added and has never once opened the
   * contacts list. Verified in the browser before this change: navigating to
   * /app/crm?tab=contacts left the Dashboard tab active.
   *
   * Retired keys redirect to wherever their content moved rather than 404ing or
   * quietly falling back, so old links and bookmarks keep working.
   */
  const searchParams = useSearchParams();
  useEffect(() => {
    const requested = searchParams.get("tab");
    if (!requested) return;
    const retired = RETIRED_TABS[requested];
    if (retired) {
      setTab(retired.tab);
      if (retired.view === "contacts") setAccountsView("contacts");
      if (retired.view === "quotes") setPipelineView("quotes");
      return;
    }
    if (CRM_TABS.some((t) => t.key === requested)) setTab(requested);
  }, [searchParams]);

  /*
   * QUOTE FROM A DEAL. The deal page hands off here with ?newQuote=1&dealId=…,
   * and the one quote editor opens with that deal already chosen.
   *
   * A handoff rather than a second editor on the deal page: the quote dialog is
   * a line-item editor with server-computed GST, and a duplicate of it would be
   * the same divergence this codebase keeps paying for. `quotes.create` requires
   * a dealId (Phase 2), so arriving pre-filled is the only shape that does not
   * make the user re-pick a deal they just navigated away from.
   */
  useEffect(() => {
    if (searchParams.get("newQuote") !== "1") return;
    const dealId = searchParams.get("dealId");
    if (!dealId) return;
    setTab("pipeline");
    setPipelineView("quotes");
    setQuoteForm((f) => ({ ...f, dealId }));
    setShowNewQuote(true);
  }, [searchParams]);
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [editLeadForm, setEditLeadForm] = useState({ firstName: "", lastName: "", email: "", company: "", title: "", phone: "", source: "website" as string, status: "new" as any,
    // Qualification (BANT) + opportunity shape. Blank/"unknown" is a valid state —
    // a web-form lead arrives with none of this and must still save.
    budgetBand: "unknown" as string, budgetNote: "", authority: "unknown" as string, need: "",
    timeline: "unknown" as string, estimatedValue: "", expectedClose: "", nextAction: "", nextActionDate: "" });
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [dealForm, setDealForm] = useState({
    title: "", value: "", probability: "", expectedClose: "",
    accountId: "", contactId: "", stage: "prospect" as string,
  });
  /**
   * True once the rep types their own probability. The stage default then stops
   * following the stage dropdown — a deliberate entry must never be silently
   * overwritten, which is the whole difference between a default and a lock.
   */
  const [probabilityTouched, setProbabilityTouched] = useState(false);
  const [movingDeal, setMovingDeal] = useState<string | null>(null);
  /** Deal id awaiting a lost reason before its closed_lost move is sent. */
  const [lostReasonFor, setLostReasonFor] = useState<string | null>(null);
  const [lostReasonPick, setLostReasonPick] = useState("");
  const [lostReasonText, setLostReasonText] = useState("");
  const lostReasonOther = lostReasonPick === LOST_REASON_OTHER;
  const [showStageConfig, setShowStageConfig] = useState(false);
  const [stageDraft, setStageDraft] = useState<Array<{ key: string; label: string; color: string; rank: number; active: boolean; probability: number }>>([]);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: "", industry: "", tier: "smb" as "enterprise" | "mid_market" | "smb", website: "", billingAddress: "", stateCode: "", gstin: "" });
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  // stateCode/gstin are editable here too: every account created BEFORE this round
  // has no state, so the Add-form fix alone would leave existing customers billed
  // as intra-state for ever with no way to correct them.
  const [editAccountForm, setEditAccountForm] = useState({ name: "", industry: "", tier: "smb" as "enterprise" | "mid_market" | "smb", website: "", billingAddress: "", stateCode: "", gstin: "" });
  const [showArchivedAccounts, setShowArchivedAccounts] = useState(false);
  const [showArchivedContacts, setShowArchivedContacts] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [contactForm, setContactForm] = useState({ firstName: "", lastName: "", email: "", phone: "", title: "", accountId: "" });
  const [editingContact, setEditingContact] = useState<any | null>(null);
  const [editContactForm, setEditContactForm] = useState({ firstName: "", lastName: "", email: "", phone: "", title: "", accountId: "" });
  const [showArchivedLeads, setShowArchivedLeads] = useState(false);
  const [showNewLead, setShowNewLead] = useState(false);
  /**
   * The nine qualification fields lived on the EDIT form only, so a rep captured a
   * lead and then had to reopen it to qualify. They are here now — and every one
   * is OPTIONAL. On first contact you rarely know budget or timeline, and a
   * capture form that demands them gets abandoned mid-call.
   */
  const [leadForm, setLeadForm] = useState({
    firstName: "", lastName: "", email: "", company: "", title: "", phone: "", source: "website" as string,
    budgetBand: "unknown", budgetNote: "", authority: "unknown", need: "", timeline: "unknown",
    estimatedValue: "", expectedClose: "", nextAction: "", nextActionDate: "",
  });
  const [showLeadQualification, setShowLeadQualification] = useState(false);
  const [importKind, setImportKind] = useState<null | "leads" | "contacts" | "deals">(null);
  const [showImportPicker, setShowImportPicker] = useState(false);
  const importLeads = trpc.ingest.importLeads.useMutation();
  const importContacts = trpc.ingest.importContacts.useMutation();
  const importDeals = trpc.ingest.importDeals.useMutation();
  const [showNewQuote, setShowNewQuote] = useState(false);
  /**
   * The New Quote dialog used to be a single free-text box that sent ONE hardcoded
   * line at quantity 1 / unit price 0, so every quote the product could produce
   * totalled ₹0 and carried ₹0 of GST. The engine behind it was always capable of
   * the real thing (`buildQuoteTaxColumns` → `computeGST`); nothing reached it.
   *
   * Money is kept as strings here so a half-typed "12." does not become NaN mid
   * keystroke. `lineTotal()` derives the line total — it is never typed.
   */
  const [quoteForm, setQuoteForm] = useState({ dealId: "", discountPct: "0", validUntil: "" });
  const [quoteLines, setQuoteLines] = useState<QuoteLineDraft[]>([blankQuoteLine()]);
  const [showNewActivity, setShowNewActivity] = useState(false);
  const [activityForm, setActivityForm] = useState({
    type: "call", subject: "", description: "", leadId: "", dealId: "", accountId: "", contactId: "",
    outcome: "", scheduledAt: "", completedAt: "",
  });
  const [showArchivedActivities, setShowArchivedActivities] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any | null>(null);
  const [editActivityForm, setEditActivityForm] = useState({
    type: "call", subject: "", description: "", dealId: "", accountId: "", contactId: "",
    outcome: "", scheduledAt: "", completedAt: "",
  });

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  // ── tRPC data ──────────────────────────────────────────────────────────────
  // NOTE on the mergeTrpcQueryOpts key: it is an RBAC-RULE LOOKUP, not the
  // procedure being called. `trpc-procedure-rbac.generated.ts` is produced by
  // walking the router files, and its generator does not follow sub-routers
  // imported from OTHER files — so no nested `crm.*.*` path is in the map at all
  // (`crm.deals.stages.list` has been missing since it shipped). Passing the flat
  // path keeps the exact `accounts:read` gate these queries had before they were
  // repointed; the canonical path would silently fall back to "any logged-in
  // user". Recorded as RBAC-MAP-DRIFT — fixing the generator is its own change.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: dealsData, refetch: refetchDeals } = trpc.crm.deals.list.useQuery({ limit: 200 }, mergeTrpcQueryOpts("crm.listDeals", undefined));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: accountsData, refetch: refetchAccounts } = trpc.crm.accounts.list.useQuery({ limit: 200, showArchived: showArchivedAccounts }, mergeTrpcQueryOpts("crm.listAccounts", undefined));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: contactsData, refetch: refetchContacts } = trpc.crm.contacts.list.useQuery({ limit: 200, showArchived: showArchivedContacts }, mergeTrpcQueryOpts("crm.listContacts", undefined));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: leadsData, refetch: refetchLeads } = trpc.crm.leads.list.useQuery({ limit: 200, showArchived: showArchivedLeads }, mergeTrpcQueryOpts("crm.listLeads", undefined));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: activitiesData, refetch: refetchActivities } = trpc.crm.activities.list.useQuery({ limit: 200, showArchived: showArchivedActivities }, mergeTrpcQueryOpts("crm.listActivities", undefined));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: quotesData, refetch: refetchQuotes } = trpc.crm.deals.quotes.list.useQuery({}, mergeTrpcQueryOpts("crm.listQuotes", undefined));

  // ── Live quote totals: computed on the SERVER, never in the browser ────────
  // The intra- vs inter-state split depends on two DB reads the browser cannot
  // do — the org's GSTIN state and the buyer account's state — and a second
  // client-side implementation of the GST rules would drift from the one that
  // actually writes the quote. So the editor asks `previewTax` and renders what
  // it is told. Debounced so typing a unit price is not one request per key.
  const quotePreviewInput = useMemo(() => ({
    dealId: quoteForm.dealId || undefined,
    items: quoteLines.map(toQuoteApiLine),
    discountPct: quoteForm.discountPct || "0",
  }), [quoteForm.dealId, quoteForm.discountPct, quoteLines]);
  const [debouncedQuoteInput, setDebouncedQuoteInput] = useState(quotePreviewInput);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuoteInput(quotePreviewInput), 250);
    return () => clearTimeout(t);
  }, [quotePreviewInput]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const quotePreviewQ = trpc.crm.deals.quotes.previewTax.useQuery(
    debouncedQuoteInput,
    mergeTrpcQueryOpts("crm.listQuotes", { enabled: showNewQuote, refetchOnWindowFocus: false }),
  );
  const quotePreview = quotePreviewQ.data;

  // Mutations
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const convertLead = trpc.crm.leads.convert.useMutation({
    onSuccess: (res: any) => {
      toast.success(`Lead converted to account: ${res?.account?.name ?? ""}`);
      // Conversion creates an account, a contact AND a deal in one transaction, so
      // all four lists are stale afterwards. Only leads and accounts were being
      // refetched, so the new deal did not appear on the Pipeline until something
      // else happened to refetch — a real gap that leftover test data had been
      // masking, and that a fresh database exposed.
      refetchLeads();
      refetchAccounts();
      refetchContacts();
      refetchDeals();
    },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  // Points at the CANONICAL crm.leads.update, not the deprecated crm.updateLead.
  // The deprecated input has no BANT fields, so zod silently stripped every
  // qualification value the edit dialog sent — the form saved and the data vanished.
  const updateLeadMutation = trpc.crm.leads.update.useMutation({
    onSuccess: () => { toast.success("Lead updated"); refetchLeads(); setEditingLead(null); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update lead"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const createQuoteMutation = trpc.crm.deals.quotes.create.useMutation({
    onSuccess: (q: any) => {
      toast.success(`Quote ${q?.quoteNumber ?? ""} created`);
      refetchQuotes();
      setShowNewQuote(false);
      setQuoteForm({ dealId: "", discountPct: "0", validUntil: "" });
      setQuoteLines([blankQuoteLine()]);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create quote"),
  });
  const createActivity = trpc.crm.activities.create.useMutation({
    onSuccess: () => {
      toast.success("Activity logged");
      refetchActivities();
      setShowNewActivity(false);
      setActivityForm({ type: "call", subject: "", description: "", leadId: "", dealId: "", accountId: "", contactId: "", outcome: "", scheduledAt: "", completedAt: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const updateActivity = trpc.crm.activities.update.useMutation({
    onSuccess: () => {
      toast.success("Activity updated");
      refetchActivities();
      setEditingActivity(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const movePipeline = trpc.crm.deals.movePipeline.useMutation({
    onSuccess: () => {
      toast.success("Deal stage updated");
      refetchDeals();
      setMovingDeal(null);
      setLostReasonFor(null);
      setLostReasonPick("");
      setLostReasonText("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  const dealThresholdsQ = trpc.crm.deals.approvalThresholds.get.useQuery(
    undefined,
    mergeTrpcQueryOpts("crm.dealApprovalThresholds.get", { refetchOnWindowFocus: false }),
  );

  // Per-org configurable pipeline stages (labels/colours/order/visibility).
  // Falls back to STAGE_CFG / PIPELINE_STAGES defaults until loaded.
  const stagesQ = trpc.crm.deals.stages.list.useQuery(
    undefined,
    mergeTrpcQueryOpts("crm.deals.stages.list", { refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000 }),
  );
  const stageCfg: Record<string, { label: string; color: string }> = (() => {
    const rows = stagesQ.data;
    if (!rows || rows.length === 0) return STAGE_CFG;
    const out: Record<string, { label: string; color: string }> = {};
    for (const r of rows) out[r.key] = { label: r.label, color: r.color };
    return out;
  })();
  const pipelineStages: DealStage[] = (() => {
    const rows = stagesQ.data;
    if (!rows || rows.length === 0) return PIPELINE_STAGES;
    return rows
      .filter((r) => r.active)
      .sort((a, b) => a.rank - b.rank)
      .map((r) => r.key as DealStage);
  })();
  const allStagesOrdered: DealStage[] = (() => {
    const rows = stagesQ.data;
    if (!rows || rows.length === 0) return ["prospect", "qualification", "proposal", "negotiation", "verbal_commit", "closed_won", "closed_lost"];
    return [...rows].sort((a, b) => a.rank - b.rank).map((r) => r.key as DealStage);
  })();
  /**
   * Per-stage default close probability, configured per tenant on
   * `crm_pipeline_stages`. Falls back to the same factory numbers the API seeds,
   * so the form still pre-fills sensibly on the first render before the query
   * resolves — a blank box that fills in a moment later is worse than a default.
   */
  const stageProbability: Record<string, number> = (() => {
    const out: Record<string, number> = { ...FALLBACK_STAGE_PROBABILITY };
    for (const r of stagesQ.data ?? []) {
      if (typeof r.probability === "number") out[r.key] = r.probability;
    }
    return out;
  })();
  const updateStages = trpc.crm.deals.stages.update.useMutation({
    onSuccess: () => { toast.success("Pipeline stages updated"); stagesQ.refetch(); setShowStageConfig(false); },
    onError: (e: { message?: string }) => toast.error(e.message ?? "Failed to update stages"),
  });
  const resetStages = trpc.crm.deals.stages.reset.useMutation({
    onSuccess: () => { toast.success("Pipeline stages reset to defaults"); stagesQ.refetch(); setShowStageConfig(false); },
    onError: (e: { message?: string }) => toast.error(e.message ?? "Failed to reset stages"),
  });
  function openStageConfig() {
    const rows = stagesQ.data;
    const base = rows && rows.length > 0
      ? [...rows].sort((a, b) => a.rank - b.rank).map((r) => ({ key: r.key, label: r.label, color: r.color, rank: r.rank, active: r.active, probability: r.probability ?? FALLBACK_STAGE_PROBABILITY[r.key] ?? 10 }))
      : allStagesOrdered.map((k, i) => ({ key: k, label: stageCfg[k]?.label ?? k, color: stageCfg[k]?.color ?? "text-muted-foreground bg-muted", rank: i, active: pipelineStages.includes(k), probability: FALLBACK_STAGE_PROBABILITY[k] ?? 10 }));
    setStageDraft(base);
    setShowStageConfig(true);
  }

  const approveDealWon = trpc.crm.deals.approveDealWon.useMutation({
    onSuccess: () => {
      toast.success("Deal close approval recorded");
      refetchDeals();
    },
    onError: (e: { message?: string }) => toast.error(e.message ?? "Approval failed"),
  });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const createDeal = trpc.crm.deals.create.useMutation({
    onSuccess: () => {
      toast.success("Deal created");
      refetchDeals();
      setShowNewDeal(false);
      setDealForm({ title: "", value: "", probability: "", expectedClose: "", accountId: "", contactId: "", stage: "prospect" });
      setProbabilityTouched(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create deal"),
  });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const createAccountMutation = // Canonical crm.accounts.create, NOT the deprecated crm.createAccount — the
  // deprecated input has no stateCode/gstin, so zod would strip both silently
  // while the toast said success. Exactly the Round 9b defect.
  trpc.crm.accounts.create.useMutation({
    onSuccess: () => { toast.success("Account created"); refetchAccounts(); setShowNewAccount(false); setAccountForm({ name: "", industry: "", tier: "smb", website: "", billingAddress: "", stateCode: "", gstin: "" }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create account"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const updateAccountMutation = trpc.crm.accounts.update.useMutation({
    onSuccess: () => { toast.success("Account updated"); refetchAccounts(); setEditingAccount(null); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update account"),
  });
  const handleArchiveAccount = (id: string) => {
    if (!confirm("Are you sure you want to archive this account?")) return;
    updateAccountMutation.mutate({ id, archived: true });
  };
  const handleUnarchiveAccount = (id: string) => {
    if (!confirm("Are you sure you want to unarchive this account?")) return;
    updateAccountMutation.mutate({ id, archived: false });
  };
  const handleArchiveContact = (id: string) => {
    if (!confirm("Are you sure you want to archive this contact?")) return;
    updateContactMutation.mutate({ id, archived: true });
  };
  const handleUnarchiveContact = (id: string) => {
    if (!confirm("Are you sure you want to unarchive this contact?")) return;
    updateContactMutation.mutate({ id, archived: false });
  };
  const handleArchiveLead = (id: string) => {
    if (!confirm("Are you sure you want to archive this lead?")) return;
    updateLeadMutation.mutate({ id, archived: true });
  };
  const handleUnarchiveLead = (id: string) => {
    if (!confirm("Are you sure you want to unarchive this lead?")) return;
    updateLeadMutation.mutate({ id, archived: false });
  };
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const createContactMutation = trpc.crm.contacts.create.useMutation({
    onSuccess: () => { toast.success("Contact created"); refetchContacts(); setShowNewContact(false); setContactForm({ firstName: "", lastName: "", email: "", phone: "", title: "", accountId: "" }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create contact"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const updateContactMutation = trpc.crm.contacts.update.useMutation({
    onSuccess: () => { toast.success("Contact updated"); refetchContacts(); setEditingContact(null); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update contact"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const updateQuote = trpc.crm.deals.quotes.update.useMutation({
    onSuccess: (q: any) => { toast.success(`Quote ${q?.quoteNumber ?? ""} updated`); refetchQuotes(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const createLeadMutation = trpc.crm.leads.create.useMutation({
    onSuccess: () => {
      toast.success("Lead created");
      refetchLeads();
      setShowNewLead(false);
      setShowLeadQualification(false);
      setLeadForm({
        firstName: "", lastName: "", email: "", company: "", title: "", phone: "", source: "website",
        budgetBand: "unknown", budgetNote: "", authority: "unknown", need: "", timeline: "unknown",
        estimatedValue: "", expectedClose: "", nextAction: "", nextActionDate: "",
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create lead"),
  });

  if (!can("accounts", "read")) return <AccessDenied module="CRM & Sales" />;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const DEALS_LIVE = ((dealsData as any[]) ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ACCOUNTS_LIVE = ((accountsData as any[]) ?? []) as any[];
  // Declared here rather than further down: the contacts and quotes mappings below
  // both need to turn an accountId into a name, and both run before the old
  // `accountNameMap` was defined.
  const accountNameMap = new Map<string, string>(ACCOUNTS_LIVE.map((a: any) => [a.id, a.name]));
  const getDealAccountNameById = (accountId: string | null | undefined) =>
    (accountId ? accountNameMap.get(accountId) : undefined) ?? null;

  // Build live leaderboard from closed_won deals
  const leaderboardMap = new Map<string, { ownerId: string; ownerName: string | null; won: number; deals: number }>();
  DEALS_LIVE.filter((d: any) => d.stage === "closed_won").forEach((d: any) => {
    const key = d.ownerId ?? "unknown";
    // `ownerName` rides along from deals.list so the board can name the rep
    // rather than print a uuid fragment.
    const existing = leaderboardMap.get(key) ?? { ownerId: key, ownerName: d.ownerName ?? null, won: 0, deals: 0 };
    leaderboardMap.set(key, { ...existing, ownerName: existing.ownerName ?? d.ownerName ?? null, won: existing.won + Number(d.value ?? 0), deals: existing.deals + 1 });
  });
  const leaderboard = Array.from(leaderboardMap.values()).sort((a, b) => b.won - a.won).slice(0, 5);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // `account` was read straight off the row and is not a column — crm_contacts
  // carries `accountId`. The name is resolved from the accounts this page has
  // already loaded, the same way the deals list does it.
  const CONTACTS_LIVE = (((contactsData as any[]) ?? []) as any[]).map((c: any) => ({
    ...c,
    accountName: getDealAccountNameById(c.accountId),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LEADS_LIVE = (((leadsData as any[]) ?? []) as any[]).map((l: any) => ({ ...l, number: l.number || `LD-${l.id?.substring(0, 6).toUpperCase()}` }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ACTIVITIES_LIVE = (((activitiesData as any[]) ?? []) as any[]).map((a: any) => ({
    ...a,
    account: ACCOUNTS_LIVE.find((x: any) => x.id === a.accountId)?.name,
    contact: CONTACTS_LIVE.find((x: any) => x.id === a.contactId) ? `${CONTACTS_LIVE.find((x: any) => x.id === a.contactId)?.firstName} ${CONTACTS_LIVE.find((x: any) => x.id === a.contactId)?.lastName}` : undefined,
    deal: DEALS_LIVE.find((x: any) => x.id === a.dealId)?.title,
    dueDate: a.scheduledAt ? new Date(a.scheduledAt).toLocaleString() : "—",
    completedDate: a.completedAt ? new Date(a.completedAt).toLocaleString() : "—",
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // The quote card read q.number / q.name / q.account / q.owner / q.created /
  // q.currency — none of which is a column on crm_quotes, so all six rendered
  // blank. What IS real: quoteNumber, createdAt, validUntil, the tax columns, and
  // dealId, through which the deal title and account name are resolvable from
  // data this page has already loaded. crm_quotes has no owner column at all.
  const QUOTES_LIVE = (((quotesData as any[]) ?? []) as any[]).map((q: any) => {
    const deal = DEALS_LIVE.find((d: any) => d.id === q.dealId);
    return {
      ...q,
      dealTitle: deal?.title ?? null,
      accountName: deal ? getDealAccountNameById(deal.accountId) : null,
    };
  });

  const activeDeals = DEALS_LIVE.filter((d: any) => !["closed_won", "closed_lost"].includes(d.stage ?? ""));
  const wonDeals = DEALS_LIVE.filter((d: any) => d.stage === "closed_won");
  const lostDeals = DEALS_LIVE.filter((d: any) => d.stage === "closed_lost");
  const totalPipeline = activeDeals.reduce((s: number, d: any) => s + (Number(d.value) || d.amount || 0) * ((d.probability ?? 50) / 100), 0);
  const grossPipeline = activeDeals.reduce((s: number, d: any) => s + (Number(d.value) || d.amount || 0), 0);
  const totalWon = wonDeals.reduce((s: number, d: any) => s + (Number(d.value) || d.amount || 0), 0);
  const closedCount = DEALS_LIVE.filter((d: any) => ["closed_won", "closed_lost"].includes(d.stage ?? "")).length;
  const winRate = closedCount > 0 ? Math.round((wonDeals.length / closedCount) * 100) : 0;

  // Look up account name from loaded accounts (avoids needing a join in deals.list).
  // `accountNameMap` is declared with ACCOUNTS_LIVE above — the contacts and quotes
  // mappings need it earlier than this.
  const contactNameMap = new Map<string, string>(CONTACTS_LIVE.map((c: any) => [c.id, `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()]));

  const getDealAccountName = (deal: any) =>
    deal.account ?? accountNameMap.get(deal.accountId) ?? "—";
  const getDealContactName = (deal: any) =>
    deal.contact ?? contactNameMap.get(deal.contactId) ?? "";
  return (
    <div className="flex flex-col gap-3">

      {/* CSV Import Modals */}
      {importKind === "leads" && (
        <CsvImportModal
          title="Import Leads"
          fields={LEAD_IMPORT_FIELDS}
          onClose={() => setImportKind(null)}
          onImport={async (rows) => {
            const res = await importLeads.mutateAsync(
              rows.map((r) => ({
                firstName: r.firstName,
                lastName: r.lastName,
                email: r.email || undefined,
                phone: r.phone || undefined,
                title: r.title || undefined,
                company: r.company || undefined,
                source: (r.source?.toLowerCase() as any) || undefined,
                status: (r.status?.toLowerCase() as any) || undefined,
              })),
            );
            refetchLeads();
            toast.success(`${res.imported} leads imported`);
            return { imported: res.imported };
          }}
        />
      )}
      {importKind === "contacts" && (
        <CsvImportModal
          title="Import Contacts"
          fields={CONTACT_IMPORT_FIELDS}
          onClose={() => setImportKind(null)}
          onImport={async (rows) => {
            const res = await importContacts.mutateAsync(
              rows.map((r) => ({
                firstName: r.firstName,
                lastName: r.lastName,
                email: r.email || undefined,
                phone: r.phone || undefined,
                title: r.title || undefined,
                accountName: r.accountName,
              })),
            );
            refetchContacts();
            // Rejected rows are NAMED, not folded into a count. A silent
            // "3 contacts imported" on a 5-row file hides which two are missing
            // and why.
            if (res.skipped > 0) {
              toast.error(
                `${res.skipped} row${res.skipped === 1 ? "" : "s"} not imported: ` +
                  res.errors.map((e) => `row ${e.row} (${e.accountName})`).join(", "),
                { duration: 10_000 },
              );
              res.errors.forEach((e) => console.warn(`[contact import] row ${e.row}: ${e.reason}`));
            }
            if (res.imported > 0) toast.success(`${res.imported} contacts imported`);
            return { imported: res.imported, skipped: res.skipped };
          }}
        />
      )}
      {importKind === "deals" && (
        <CsvImportModal
          title="Import Deals"
          fields={DEAL_IMPORT_FIELDS}
          hint="Stage defaults to prospect; probability 0–100"
          onClose={() => setImportKind(null)}
          onImport={async (rows) => {
            const res = await importDeals.mutateAsync(
              rows.map((r) => ({
                title: r.title,
                stage: (r.stage?.toLowerCase() as any) || undefined,
                value: r.value || undefined,
                probability: r.probability ? Number(r.probability) : undefined,
                expectedClose: r.expectedClose || undefined,
              })),
            );
            refetchDeals();
            toast.success(`${res.imported} deals imported`);
            return { imported: res.imported };
          }}
        />
      )}

      {/* Add Deal Modal */}
      {showNewDeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          {/* Capped height + scroll: this dialog lost a field this round rather than
              gaining one, but the guard stays so the next addition cannot push Create
              below the fold the way a prior round did. */}
          <div data-testid="new-deal-dialog" className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold">New Deal</h3>
              <button onClick={() => setShowNewDeal(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Deal Title *</label>
                <input autoFocus className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={dealForm.title} onChange={(e) => setDealForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. CoheronConnect Enterprise — Acme Corp" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Company (Account) *</label>
                <select className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={dealForm.accountId} onChange={(e) => setDealForm(f => ({ ...f, accountId: e.target.value, contactId: "" }))}>
                  <option value="">— Select account —</option>
                  {ACCOUNTS_LIVE.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Primary Contact *</label>
                  {dealForm.accountId && (
                    <button 
                      onClick={() => {
                        setContactForm(f => ({ ...f, accountId: dealForm.accountId }));
                        setShowNewContact(true);
                      }} 
                      className="text-[10px] text-primary hover:underline"
                    >
                      + New
                    </button>
                  )}
                </div>
                <select className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={dealForm.contactId} onChange={(e) => setDealForm(f => ({ ...f, contactId: e.target.value }))}>
                  <option value="">— Select contact —</option>
                  {CONTACTS_LIVE
                    .filter((c: any) => !dealForm.accountId || c.accountId === dealForm.accountId)
                    .map((c: any) => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName} {c.title ? `(${c.title})` : ""}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Value (₹) *</label>
                <input type="number" className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={dealForm.value} onChange={(e) => setDealForm(f => ({ ...f, value: e.target.value }))} placeholder="e.g. 5000000" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Probability (%) *</label>
                {/* Pre-filled from the stage default, and editable. A rep opening a
                    deal had to invent this number out of nothing, so across seven
                    tenants it would be blank or 50 for everything and the weighted
                    pipeline tile would be computed from noise. */}
                <input
                  data-testid="deal-probability"
                  type="number" min="0" max="100"
                  className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background"
                  value={dealForm.probability === "" ? String(stageProbability[dealForm.stage] ?? 10) : dealForm.probability}
                  onChange={(e) => { setProbabilityTouched(true); setDealForm(f => ({ ...f, probability: e.target.value })); }}
                />
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {probabilityTouched
                    ? "Your value — the stage default no longer applies."
                    : `Default for ${stageCfg[dealForm.stage]?.label ?? dealForm.stage.replace(/_/g, " ")}. You can override it.`}
                </p>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Stage *</label>
                <select data-testid="deal-stage" className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={dealForm.stage}
                  onChange={(e) => {
                    // Changing the stage re-defaults the probability ONLY while the
                    // rep has not typed their own. A deliberate entry is never
                    // silently rewritten underneath them.
                    const next = e.target.value;
                    setDealForm(f => ({ ...f, stage: next, probability: probabilityTouched ? f.probability : "" }));
                  }}>
                  {pipelineStages.map(s => (
                    <option key={s} value={s}>{stageCfg[s]?.label ?? s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Expected Close Date *</label>
                <input type="date" className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={dealForm.expectedClose} onChange={(e) => setDealForm(f => ({ ...f, expectedClose: e.target.value }))} />
              </div>
              {/* "Lead Source *" removed. It was a REQUIRED field with nowhere to go:
                  `crm_deals` has no source column, so ten minutes of every rep's day
                  went into a dropdown whose value was discarded on submit. Deal source
                  is not re-added as a column because it is already recorded upstream —
                  a converted lead carries `crm_leads.source` and is linked by
                  `crm_leads.convertedDealId`, so a second copy on the deal would be a
                  second source of truth that can disagree with the first. The rule is
                  add a field only where the record is unusable without it; a deal is
                  usable without one. */}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                data-testid="new-deal-save"
                // `probability` is no longer part of the disabled check: it is always
                // populated, either by the stage default or by the rep's override.
                disabled={!dealForm.title || !dealForm.accountId || !dealForm.contactId || !dealForm.value || !dealForm.stage || !dealForm.expectedClose || createDeal.isPending}
                onClick={() => createDeal.mutate({
                  title: dealForm.title,
                  value: dealForm.value || undefined,
                  // Whatever is on screen: the rep's override if they typed one,
                  // otherwise the selected stage's configured default.
                  probability: Number(dealForm.probability || stageProbability[dealForm.stage] || 10),
                  expectedClose: dealForm.expectedClose || undefined,
                  accountId: dealForm.accountId || undefined,
                  contactId: dealForm.contactId || undefined,
                  // Stage is a REQUIRED field on this form that was never sent — every
                  // deal landed on the `prospect` column default regardless of what the
                  // rep picked. Fixed in Round 11; pinned by a router test and by
                  // e2e/crm-pipeline.spec.ts.
                  stage: (dealForm.stage || undefined) as any,
                })}
                className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {createDeal.isPending ? "Creating…" : "Create Deal"}
              </button>
              <button onClick={() => setShowNewDeal(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent ml-auto">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Move Stage popover */}
      {movingDeal && (() => {
        const moving = DEALS_LIVE.find((x: any) => x.id === movingDeal);
        const mv = Number(moving?.value ?? 0);
        const low = dealThresholdsQ.data?.dealCloseNoApprovalBelow ?? 500_000;
        const execAbove = dealThresholdsQ.data?.dealCloseExecutiveAbove ?? 5_000_000;
        const needTier = dealCloseTierClient(mv, low, execAbove);
        const pendingApproval = needTier !== "none" && !moving?.wonApprovedAt;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-xs p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold">Move to Stage</h3>
                <button data-testid="move-close" onClick={() => setMovingDeal(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
              {pendingApproval && (
                <div className="mb-3 rounded border border-amber-200 bg-amber-50/80 dark:bg-amber-950/30 px-2 py-2 text-[10px] text-amber-900 dark:text-amber-100">
                  <div className="font-semibold">Closed-won approval</div>
                  <div className="mt-0.5 opacity-90">
                    This deal value ({dealThresholdsQ.data?.dealApprovalCurrency ?? "INR"} {mv.toLocaleString()}) requires{" "}
                    <strong>{needTier === "executive" ? "executive" : "manager"}</strong> approval before <strong>Closed Won</strong>.
                  </div>
                  {isAdmin() && (
                    <div className="mt-2 flex flex-col gap-1">
                      {needTier === "manager" && (
                        <button
                          type="button"
                          disabled={approveDealWon.isPending}
                          onClick={() => approveDealWon.mutate({ id: movingDeal, tier: "manager" })}
                          className="text-[10px] px-2 py-1 rounded bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50"
                        >
                          Record manager approval
                        </button>
                      )}
                      {needTier === "executive" && (
                        <button
                          type="button"
                          disabled={approveDealWon.isPending}
                          onClick={() => approveDealWon.mutate({ id: movingDeal, tier: "executive" })}
                          className="text-[10px] px-2 py-1 rounded bg-amber-800 text-white hover:bg-amber-900 disabled:opacity-50"
                        >
                          Record executive approval
                        </button>
                      )}
                    </div>
                  )}
                  {!isAdmin() && (
                    <div className="mt-1 text-[10px] opacity-80">Ask an organization owner/admin to record approval (Admin → CRM deal thresholds).</div>
                  )}
                </div>
              )}
              {/* Closed Won needs a value and an expected close. Both are server-
                  enforced; naming them here saves a round trip and an error toast. */}
              {(() => {
                const missing: string[] = [];
                if (!(Number(moving?.value ?? 0) > 0)) missing.push("a value");
                if (!moving?.expectedClose) missing.push("an expected close date");
                if (missing.length === 0) return null;
                return (
                  <div data-testid="move-won-blocked" className="mb-3 rounded border border-border bg-muted/40 px-2 py-2 text-[10px] text-muted-foreground">
                    <span className="font-semibold text-foreground">Closed Won needs {missing.join(" and ")}.</span>{" "}
                    Edit the deal to add {missing.length > 1 ? "them" : "it"} before closing it won.
                  </div>
                );
              })()}
              <div className="flex flex-col gap-1.5">
                {allStagesOrdered.map(s => {
                  const isClosedWon = moving?.stage === "closed_won";
                  const isActiveStage = pipelineStages.includes(s);
                  const isRestricted = isClosedWon && isActiveStage;
                  const wonIncomplete = s === "closed_won"
                    && (!(Number(moving?.value ?? 0) > 0) || !moving?.expectedClose);
                  return (
                    <button
                      key={s}
                      data-testid={`move-to-${s}`}
                      onClick={() => {
                        // Closed Lost collects a reason first — the move is only
                        // sent once one is chosen.
                        if (s === "closed_lost") { setLostReasonFor(movingDeal); return; }
                        movePipeline.mutate({ id: movingDeal, stage: s });
                      }}
                      disabled={movePipeline.isPending || isRestricted || wonIncomplete}
                      className={cn(
                        "px-3 py-1.5 rounded text-[11px] text-left hover:bg-primary hover:text-white border border-border transition-colors disabled:opacity-50",
                        stageCfg[s]?.color ?? "",
                        isRestricted && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-inherit"
                      )}
                      title={
                        isRestricted ? "Cannot move a Closed Won deal back to an active stage"
                        : wonIncomplete ? "Add a value and an expected close date first"
                        : undefined
                      }
                    >
                      {stageCfg[s]?.label ?? s.replace(/_/g, " ")}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Closed Lost — capture the reason. Required: a lost deal with no reason
          teaches nothing, and the flow is not hostile because this dialog is
          already open and one click away from the outcome. */}
      {lostReasonFor && (() => {
        const chosen = lostReasonOther ? lostReasonText.trim() : lostReasonPick;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
            <div data-testid="lost-reason-dialog" className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold">Why was this deal lost?</h3>
                <button onClick={() => { setLostReasonFor(null); setLostReasonPick(""); setLostReasonText(""); }}>
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <select
                data-testid="lost-reason-select"
                value={lostReasonPick}
                onChange={(e) => { setLostReasonPick(e.target.value); setLostReasonText(""); }}
                className="w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
              >
                <option value="">— Select a reason —</option>
                {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                <option value={LOST_REASON_OTHER}>{LOST_REASON_OTHER}…</option>
              </select>
              {lostReasonOther && (
                <input
                  data-testid="lost-reason-other"
                  autoFocus
                  value={lostReasonText}
                  onChange={(e) => setLostReasonText(e.target.value)}
                  placeholder="What actually happened?"
                  className="mt-2 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
                />
              )}
              <p className="text-[10px] text-muted-foreground mt-2">
                Recorded on the deal. Required — this is what makes lost deals reportable.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { setLostReasonFor(null); setLostReasonPick(""); setLostReasonText(""); }}
                  className="flex-1 px-3 py-1.5 text-[11px] border border-border rounded hover:bg-accent"
                >Cancel</button>
                <button
                  data-testid="lost-reason-confirm"
                  disabled={!chosen || movePipeline.isPending}
                  onClick={() => movePipeline.mutate({ id: lostReasonFor, stage: "closed_lost", lostReason: chosen })}
                  className="flex-1 px-3 py-1.5 text-[11px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
                >{movePipeline.isPending ? "Saving…" : "Mark Closed Lost"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {showStageConfig && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowStageConfig(false)}>
          <div data-testid="stage-config-modal" className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-body-sm font-semibold text-foreground">Configure Pipeline Stages</h3>
              <button onClick={() => setShowStageConfig(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-[11px] text-muted-foreground">Rename stages, adjust order, set each stage&apos;s default close probability, and choose which appear as active pipeline columns. Stage keys are fixed.</p>
              <p className="text-[10px] text-muted-foreground/70">
                <strong>Prob %</strong> pre-fills the probability on a new deal at that stage. A rep can override it, and
                moving a deal between stages never rewrites a probability already set.
              </p>
              {stageDraft.sort((a, b) => a.rank - b.rank).map((s, i) => (
                <div key={s.key} className="flex items-center gap-2 border border-border rounded px-2 py-1.5">
                  <span className="font-mono text-[10px] text-muted-foreground/70 w-24 flex-shrink-0">{s.key}</span>
                  <input
                    data-testid={`stage-label-${s.key}`}
                    className="flex-1 text-caption border border-border rounded px-2 py-1 bg-background"
                    value={s.label}
                    onChange={(e) => setStageDraft((d) => d.map((x) => x.key === s.key ? { ...x, label: e.target.value } : x))}
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => setStageDraft((d) => {
                        const sorted = [...d].sort((a, b) => a.rank - b.rank);
                        const idx = sorted.findIndex((x) => x.key === s.key);
                        if (idx <= 0) return d;
                        const tmp = sorted[idx]!.rank; sorted[idx]!.rank = sorted[idx - 1]!.rank; sorted[idx - 1]!.rank = tmp;
                        return [...sorted];
                      })}
                      className="px-1 text-[11px] border border-border rounded disabled:opacity-30"
                      title="Move up"
                    >↑</button>
                    <button
                      type="button"
                      disabled={i === stageDraft.length - 1}
                      onClick={() => setStageDraft((d) => {
                        const sorted = [...d].sort((a, b) => a.rank - b.rank);
                        const idx = sorted.findIndex((x) => x.key === s.key);
                        if (idx < 0 || idx >= sorted.length - 1) return d;
                        const tmp = sorted[idx]!.rank; sorted[idx]!.rank = sorted[idx + 1]!.rank; sorted[idx + 1]!.rank = tmp;
                        return [...sorted];
                      })}
                      className="px-1 text-[11px] border border-border rounded disabled:opacity-30"
                      title="Move down"
                    >↓</button>
                  </div>
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0" title="Default close probability for deals at this stage">
                    <input
                      data-testid={`stage-probability-${s.key}`}
                      type="number" min="0" max="100"
                      className="w-12 text-caption border border-border rounded px-1 py-1 bg-background text-right font-mono"
                      value={s.probability}
                      onChange={(e) => setStageDraft((d) => d.map((x) => x.key === s.key ? { ...x, probability: Number(e.target.value) } : x))}
                    />
                    %
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground w-16 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={s.active}
                      onChange={(e) => setStageDraft((d) => d.map((x) => x.key === s.key ? { ...x, active: e.target.checked } : x))}
                    />
                    Active
                  </label>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <button
                onClick={() => resetStages.mutate()}
                disabled={resetStages.isPending}
                className="text-[11px] px-2.5 py-1 border border-border rounded hover:bg-muted/30 text-muted-foreground disabled:opacity-50"
              >
                Reset to defaults
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowStageConfig(false)} className="text-[11px] px-2.5 py-1 border border-border rounded hover:bg-muted/30 text-muted-foreground">Cancel</button>
                <button
                  data-testid="stage-config-save"
                  onClick={() => updateStages.mutate({ stages: stageDraft.map((s, i) => ({ key: s.key as any, label: s.label, color: s.color, rank: i, active: s.active })) })}
                  disabled={updateStages.isPending || stageDraft.some((s) => !s.label.trim())}
                  className="text-[11px] px-3 py-1 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-body-sm font-semibold text-foreground">CRM & Sales</h1>
          <span className="text-[11px] text-muted-foreground/70">Pipeline · Accounts · Leads · Analytics</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadCSV(ACCOUNTS_LIVE.map((a: any) => ({ Name: a.name ?? a.companyName ?? "", Industry: a.industry ?? "", ARR: a.arr ?? "", Health: a.healthScore ?? "", CSM: a.csm ?? "", Status: a.status ?? "" })), "crm_export")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          {/*
            * MODULE-LEVEL IMPORT. Was three separate buttons, one buried inside
            * each of the Deals, People and Leads lists — so importing meant
            * knowing which tab hid the control for the thing you had a file of.
            * One entry point; the user picks the entity.
            *
            * Only the three `accounts:write` importers belong to this module.
            * `ingest` also exposes matters, contracts, invoices and structures,
            * which have NO UI anywhere — reported, not built here.
            */}
          <PermissionGate module="accounts" action="write">
            <div className="relative">
              <button
                data-testid="crm-import"
                onClick={() => setShowImportPicker((v) => !v)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
              >
                <Upload className="w-3 h-3" /> Import
              </button>
              {showImportPicker && (
                <div className="absolute right-0 mt-1 z-40 w-44 bg-card border border-border rounded shadow-lg py-1">
                  {([
                    ["leads", "Leads"],
                    ["contacts", "Contacts"],
                    ["deals", "Deals"],
                  ] as const).map(([kind, label]) => (
                    <button
                      key={kind}
                      data-testid={`crm-import-${kind}`}
                      onClick={() => { setImportKind(kind); setShowImportPicker(false); }}
                      className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-muted/50"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </PermissionGate>
          <PermissionGate module="csm" action="write">
            <button onClick={() => { setShowNewDeal(true); setTab("pipeline"); }} className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
              <Plus className="w-3 h-3" /> New Deal
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: "Pipeline (Weighted)", value: `₹${(totalPipeline / 1000).toFixed(0)}K`, color: "text-blue-700", sub: `${activeDeals.length} open deals` },
          { label: "Total Pipeline", value: `₹${(grossPipeline / 1000).toFixed(0)}K`, color: "text-foreground/80", sub: "gross value" },
          { label: "Closed Won (MTD)", value: `₹${(totalWon / 1000).toFixed(0)}K`, color: "text-green-700", sub: `${wonDeals.length} deals` },
          { label: "Win Rate", value: `${winRate}%`, color: winRate >= 50 ? "text-green-700" : "text-orange-600", sub: "closed deals" },
          { label: "Open Leads", value: LEADS_LIVE.filter(l => !["converted", "dead"].includes(l.status)).length, color: "text-indigo-700", sub: "active leads" },
          { label: "Overdue Activities", value: ACTIVITIES_LIVE.filter((a: any) => !a.completed && new Date(a.dueDate ?? a.scheduledAt ?? "9999") < new Date()).length, color: "text-red-700", sub: "need action" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-h4 font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
            <div className="text-[10px] text-muted-foreground/70">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card rounded-t overflow-x-auto">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {/*
          * Sub-view switch for the merged tabs. The Contacts and Quotes tabs
          * were the ONLY complete lists of those entities, so folding them in
          * without this control would have made a contact whose account you do
          * not know — and a quote whose deal you do not know — unreachable.
          */}
        {(tab === "accounts" || tab === "pipeline") && (
          <div className="flex items-center gap-1 px-4 pt-3" data-testid="crm-subview-switch">
            {(tab === "accounts"
              ? ([["accounts", "Accounts"], ["contacts", "People"]] as const)
              : ([["board", "Deals"], ["quotes", "Quotes"]] as const)
            ).map(([key, label]) => {
              const active = tab === "accounts" ? accountsView === key : pipelineView === key;
              return (
                <button
                  key={key}
                  data-testid={`crm-subview-${key}`}
                  onClick={() =>
                    tab === "accounts"
                      ? setAccountsView(key as "accounts" | "contacts")
                      : setPipelineView(key as "board" | "quotes")
                  }
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground/80 hover:bg-muted/50"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div className="p-4 grid grid-cols-2 gap-4">
            {/* Pipeline funnel */}
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Pipeline Stages</div>
              <div className="p-3 space-y-2">
                {pipelineStages.map((stage) => {
                  const stageDeals = DEALS_LIVE.filter(d => d.stage === stage);
                  const stageValue = stageDeals.reduce((s, d) => s + d.value, 0);
                  const maxVal = Math.max(...pipelineStages.map(s => DEALS_LIVE.filter(d => d.stage === s).reduce((sum, d) => sum + d.value, 0)), 1);
                  const cfg = stageCfg[stage] ?? { label: stage.replace(/_/g, " "), color: "text-muted-foreground bg-muted" };
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground w-28">{cfg.label}</span>
                      <div className="flex-1 h-5 bg-muted rounded overflow-hidden flex items-center">
                        <div className="h-full bg-primary/20 border-r-2 border-primary flex items-center px-2"
                          style={{ width: `${Math.max(5, (stageValue / maxVal) * 100)}%` }}>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] w-16 text-right text-foreground/80">₹{(stageValue / 1000).toFixed(0)}K</span>
                      <span className="text-[11px] text-muted-foreground/70 w-6">{stageDeals.length}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top deals at risk */}
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Deals Requiring Attention</div>
              <div className="divide-y divide-border">
                {activeDeals.slice(0, 5).map((deal) => {
                  const cfg = stageCfg[deal.stage as DealStage] ?? { label: deal.stage ?? "—", color: "text-muted-foreground bg-muted" };
                  const daysToClose = deal.closeDate ? Math.round((new Date(deal.closeDate).getTime() - new Date().getTime()) / 86400000) : null;
                  return (
                    <div key={deal.id} className="flex items-start justify-between px-3 py-2.5 hover:bg-muted/30">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-[10px] text-primary">{deal.number}</span>
                          <span className={`status-badge ${cfg.color}`}>{cfg.label}</span>
                        </div>
                        <p className="text-[12px] font-medium text-foreground max-w-56">{deal.account}</p>
                        <p className="text-[11px] text-muted-foreground/70">{deal.owner} · {deal.lastActivity}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {/* data-value carries the raw amount so a test can assert the
                            number without depending on the abbreviated ₹250K rendering.
                            The test id is DASHBOARD-scoped: this widget and the Pipeline
                            kanban card both used `pipeline-deal-value`, which is why a
                            test id "added to the Pipeline card" appeared to have no
                            effect — the selector was ambiguous across two tabs. */}
                        <div data-testid="dashboard-deal-value" data-value={String(deal.value ?? 0)}
                          className="font-mono font-bold text-[12px] text-foreground">₹{(deal.value / 1000).toFixed(0)}K</div>
                        <div className="text-[10px] text-muted-foreground/70">{deal.probability}% · {daysToClose}d</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Today's activities */}
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                Today&apos;s Activities
                {/* Was a direct mutate with NO association — it minted "Quick activity
                    log" rows attached to nothing, which appear under no lead, deal,
                    account or contact and are now refused by the API. Opens the dialog
                    instead, where an association is chosen. */}
                <button onClick={() => setShowNewActivity(true)} className="text-primary hover:underline text-[11px]">+ New</button>
              </div>
              <div className="divide-y divide-border">
                {ACTIVITIES_LIVE.filter((a: any) => !a.completed).slice(0, 4).map((a: any) => {
                  const cfg = ACTIVITY_TYPE_CFG[a.type as ActivityType] ?? { color: "bg-muted", label: a.type ?? "Activity", icon: "" };
                  return (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/30">
                      <div className="flex items-start gap-2">
                        <span className={`status-badge flex-shrink-0 ${cfg.color}`}>{("icon" in cfg ? cfg.icon : "")} {a.type}</span>
                        <div>
                          <p className="text-[12px] text-foreground font-medium max-w-56">{a.subject}</p>
                          <p className="text-[11px] text-muted-foreground/70">{a.account} · {a.owner}</p>
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground/70 flex-shrink-0">{(a.dueDate ?? "").split(" ")[1]}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick stats */}
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Sales Leaderboard (MTD)</div>
              <div className="p-3 space-y-2">
                {leaderboard.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/50 text-center py-2">No closed deals yet this period</p>
                ) : leaderboard.map((row, i) => (
                  <div key={row.ownerId} className="flex items-center gap-3">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-yellow-400 text-white" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                    {/* Leaderboard names the rep. Was a uuid fragment. */}
                    <span className="text-[12px] text-foreground/80 flex-1">{row.ownerName ?? "Unassigned"}</span>
                    <span className="font-mono font-bold text-[12px] text-foreground">₹{(row.won / 1000).toFixed(0)}K</span>
                    <span className="text-[11px] text-muted-foreground/70">{row.deals} deal{row.deals !== 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PIPELINE */}
        {tab === "pipeline" && pipelineView === "board" && (
          <div>
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">{DEALS_LIVE.filter(d => !["closed_won", "closed_lost"].includes(d.stage ?? "")).length} Active Deals</span>
              <PermissionGate module="accounts" action="write">
                {isAdmin() && (
                  <button data-testid="configure-stages-btn" onClick={openStageConfig} className="flex items-center gap-1 px-2.5 py-1 text-[11px] border border-border rounded hover:bg-accent">
                    <Settings className="w-3 h-3" /> Configure Stages
                  </button>
                )}
                <button onClick={() => setShowNewDeal(true)} className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-primary text-white rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> Add Deal
                </button>
              </PermissionGate>
            </div>
            <div className="flex overflow-x-auto p-4 gap-3 min-h-96">
              {/*
                * The board mapped EVERY stage, so `active: false` was honoured by
                * the stage pickers and ignored here. A column is shown when the
                * stage is active, when it is terminal (Closed Won / Closed Lost
                * have always been columns), or WHEN IT STILL HOLDS DEALS — that
                * last clause is what stops a deal parked at a retired stage from
                * becoming unreachable. Qualification, now inactive and empty,
                * drops out; a Qualification deal would keep its column.
                */}
              {allStagesOrdered
                .filter((stage) =>
                  pipelineStages.includes(stage) ||
                  stage.startsWith("closed_") ||
                  DEALS_LIVE.some((d: any) => d.stage === stage),
                )
                .map((stage) => {
                const stageDeals = DEALS_LIVE.filter(d => d.stage === stage);
                const stageVal = stageDeals.reduce((s, d) => s + d.value, 0);
                const cfg = stageCfg[stage] ?? { label: stage.replace(/_/g, " "), color: "text-muted-foreground bg-muted" };
                return (
                  <div key={stage} data-testid="pipeline-stage-column" data-stage={stage} className="flex-shrink-0 w-56 flex flex-col gap-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`status-badge ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-[11px] text-muted-foreground/70">₹{(stageVal / 1000).toFixed(0)}K</span>
                    </div>
                    {stageDeals.map((deal) => (
                      /* Four phantom fields removed from this card. `deal.number`,
                         `deal.owner`, `deal.closeDate` and `deal.lastActivity` are NOT
                         columns on crm_deals and nothing computes them — DEALS_LIVE is
                         the raw API rows with no mapping. `number` and the owner avatar
                         rendered permanently blank; the other two were already falling
                         back to the real columns, which are now read directly.
                         Account and contact names stay: they resolve through the real
                         accountId/contactId FKs from data this page already loads. */
                      <Link key={deal.id} href={`/app/crm/deals/${deal.id}`} data-testid="pipeline-deal-card" data-stage={deal.stage} className="block border rounded p-3 hover:shadow-sm transition-shadow cursor-pointer bg-card border-border">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-semibold text-foreground">{getDealAccountName(deal)}</span>
                          <span className="text-[11px] text-muted-foreground/70">{deal.probability}%</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mb-0.5" data-testid="pipeline-deal-title">{deal.title}</p>
                        {getDealContactName(deal) && (
                          <p className="text-[10px] text-muted-foreground/60 mb-1">{getDealContactName(deal)}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <span data-testid="pipeline-deal-value" data-value={String(deal.value ?? 0)}
                            className="font-mono font-bold text-[12px] text-primary">₹{(deal.value / 1000).toFixed(0)}K</span>
                          <span className="text-[10px] text-muted-foreground/70">
                            Close: {deal.expectedClose ? new Date(deal.expectedClose).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                          </span>
                        </div>
                        {/* The lost reason belongs on the card as well as the deal
                            record: the Closed Lost column is where a manager scans
                            for the pattern, and a reason only visible one click deeper
                            is a reason nobody reads. Only ever set on closed_lost. */}
                        {deal.stage === "closed_lost" && deal.lostReason && (
                          <p data-testid="pipeline-deal-lost-reason" className="mt-1 text-[10px] text-red-700 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">
                            {deal.lostReason}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground/70 flex-1">
                            {deal.updatedAt ? `Updated ${new Date(deal.updatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}
                          </span>
                          <PermissionGate module="accounts" action="write">
                            <button
                              data-testid="pipeline-deal-move"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMovingDeal(deal.id); }}
                              className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted/50 flex-shrink-0"
                            >Move</button>
                          </PermissionGate>
                        </div>
                      </Link>
                    ))}
                    {stageDeals.length === 0 && (
                      <div className="border border-dashed border-slate-200 rounded p-3 text-center text-[11px] text-slate-300">No deals</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ACCOUNTS */}
        {tab === "accounts" && accountsView === "accounts" && (
          <div>
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">{ACCOUNTS_LIVE.length} {showArchivedAccounts ? "Archived Accounts" : "Accounts"}</span>
              <div className="flex items-center gap-2">
                <select
                  className="text-[11px] px-2 py-1 border border-border rounded bg-background"
                  value={showArchivedAccounts ? "archived" : "active"}
                  onChange={(e) => setShowArchivedAccounts(e.target.value === "archived")}
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
                <PermissionGate module="accounts" action="write">
                  <button onClick={() => setShowNewAccount(true)} className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-primary text-white rounded hover:bg-primary/90">
                    <Plus className="w-3 h-3" /> Add Account
                  </button>
                </PermissionGate>
              </div>
            </div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>Account Name</th>
                  <th>Industry</th>
                  <th>Tier</th>
                  <th>Website</th>
                  <th>State</th>
                  <th>Annual Revenue</th>
                  <th className="text-center">Open Opps</th>
                  <th>Total Revenue</th>
                  <th>Health</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ACCOUNTS_LIVE.map((a) => (
                  <tr key={a.id}>
                    <td className="p-0"><div className={`priority-bar ${a.healthScore >= 80 ? "bg-green-500" : a.healthScore >= 60 ? "bg-yellow-500" : "bg-red-500"}`} /></td>
                    <td className="font-semibold text-primary hover:underline cursor-pointer">
                      <Link href={`/app/crm/accounts/${a.id}`}>{a.name}</Link>
                    </td>
                    <td><span className="status-badge text-muted-foreground bg-muted text-[10px]">{a.industry}</span></td>
                    {/* Type, Country, Employees, Owner and Last Contact deleted — none was
                        a column on crm_accounts and nothing computed them, so every one
                        rendered blank. Open Opps and Total Revenue are KEPT and are now real
                        aggregates over crm_deals (accounts.ts). Website is a real stored
                        column that was simply never shown. */}
                    <td><span className={`status-badge capitalize ${TIER_CFG[a.tier]}`}>{a.tier.replace("_", " ")}</span></td>
                    <td className="text-[11px] text-muted-foreground">
                      {a.website ? <a href={a.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{a.website.replace(/^https?:\/\//, "")}</a> : "—"}
                    </td>
                    <td className="text-[11px] text-muted-foreground" title={a.stateCode ? undefined : "No place of supply — quotes for this account assume intra-state GST"}>
                      {a.stateCode ? (GST_STATE_NAME[a.stateCode] ?? a.stateCode) : <span className="text-amber-600">Not set</span>}
                    </td>
                    <td className="font-mono text-[11px] text-muted-foreground">₹{((a.annualRevenue ?? 0) / 10000000).toFixed(0)}Cr</td>
                    {/* Both come back from the grouped crm_deals aggregate on
                        crm.accounts.list. totalRevenue is a Postgres numeric, so it
                        arrives as a STRING — coerce before comparing or dividing. */}
                    <td className="text-center" data-testid="account-open-opps"><span className={`font-bold ${Number(a.openOpps ?? 0) > 0 ? "text-primary" : "text-slate-300"}`}>{Number(a.openOpps ?? 0)}</span></td>
                    <td className="font-mono text-[11px] font-bold text-foreground" data-testid="account-total-revenue" data-value={Number(a.totalRevenue ?? 0)}>{Number(a.totalRevenue ?? 0) > 0 ? `₹${(Number(a.totalRevenue) / 1000).toFixed(0)}K` : "—"}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-6 h-1.5 rounded-full ${a.healthScore >= 80 ? "bg-green-500" : a.healthScore >= 60 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${a.healthScore * 0.4}px` }} />
                        <span className={`text-[11px] font-bold ${SCORE_COLOR(a.healthScore)}`}>{a.healthScore}</span>
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => { setEditingAccount(a); setEditAccountForm({ name: a.name ?? "", industry: a.industry ?? "", tier: a.tier ?? "smb", website: a.website ?? "", billingAddress: a.billingAddress ?? "", stateCode: a.stateCode ?? "", gstin: a.gstin ?? "" }); }} className="text-blue-500 hover:text-blue-600 px-1" title="Edit"><Pencil size={14} /></button>
                        {a.archived ? (
                          <button onClick={() => handleUnarchiveAccount(a.id)} className="text-green-500 hover:text-green-600 px-1" title="Unarchive"><Repeat size={14} /></button>
                        ) : (
                          <button onClick={() => handleArchiveAccount(a.id)} className="text-amber-500 hover:text-amber-600 px-1" title="Archive"><Archive size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* CONTACTS */}
        {tab === "accounts" && accountsView === "contacts" && (
          <div>
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">{((contactsData as any[]) ?? []).length} {showArchivedContacts ? "Archived Contacts" : "Contacts"}</span>
              <div className="flex items-center gap-2">
                <select
                  className="text-[11px] px-2 py-1 border border-border rounded bg-background"
                  value={showArchivedContacts ? "archived" : "active"}
                  onChange={(e) => setShowArchivedContacts(e.target.value === "archived")}
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
                <PermissionGate module="accounts" action="write">
                  <button onClick={() => setShowNewContact(true)} className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-primary text-white rounded hover:bg-primary/90">
                    <Plus className="w-3 h-3" /> Add Contact
                  </button>
                </PermissionGate>
              </div>
            </div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  {/* Deleted: Seniority, Department, Open Deals, Owner, Last Activity.
                      `department`, `openDeals`, `owner` and `lastActivity` are not columns
                      on crm_contacts and nothing computed them — five blank cells on every
                      row. `seniority` IS a real column but the ONLY thing that writes it is
                      `seed-smb-analytics.ts`; no product path sets it, so in a real tenant
                      it is always "—". Account stays and is now resolved through the real
                      `accountId` FK. */}
                  <th className="w-4" />
                  <th>Name</th>
                  <th>Title</th>
                  <th>Account</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {CONTACTS_LIVE.map((c) => (
                  <tr key={c.id} className={c.doNotContact ? "opacity-50" : ""}>
                    <td className="p-0"><div className="priority-bar bg-blue-400" /></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-bold flex-shrink-0">
                          {c.firstName?.[0] ?? "?"}{c.lastName?.[0] ?? ""}
                        </span>
                        <span className="font-semibold text-primary hover:underline cursor-pointer">{c.firstName} {c.lastName}</span>
                        {c.doNotContact && <span className="status-badge text-red-600 bg-red-50 text-[9px]">DNC</span>}
                      </div>
                    </td>
                    <td className="text-muted-foreground">{c.title}</td>
                    <td className="text-primary" data-testid="contact-account">{c.accountName ?? "—"}</td>
                    <td className="text-muted-foreground text-[11px] font-mono">{c.email}</td>
                    <td className="text-muted-foreground text-[11px]">{c.phone}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => { setEditingContact(c); setEditContactForm({ firstName: c.firstName ?? "", lastName: c.lastName ?? "", email: c.email ?? "", phone: c.phone ?? "", title: c.title ?? "", accountId: c.accountId ?? "" }); }} className="text-blue-500 hover:text-blue-600 px-1" title="Edit"><Pencil size={14} /></button>
                        {c.archived ? (
                          <button onClick={() => handleUnarchiveContact(c.id)} className="text-green-500 hover:text-green-600 px-1" title="Unarchive"><Repeat size={14} /></button>
                        ) : (
                          <button onClick={() => handleArchiveContact(c.id)} className="text-amber-500 hover:text-amber-600 px-1" title="Archive"><Archive size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* LEADS */}
        {tab === "leads" && (
          <div>
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">{LEADS_LIVE.length} {showArchivedLeads ? "Archived Leads" : "Leads"}</span>
              <div className="flex items-center gap-2">
                <select
                  className="text-[11px] px-2 py-1 border border-border rounded bg-background"
                  value={showArchivedLeads ? "archived" : "active"}
                  onChange={(e) => setShowArchivedLeads(e.target.value === "archived")}
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
                <PermissionGate module="accounts" action="write">
                  <button onClick={() => setShowNewLead(true)} className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-primary text-white rounded hover:bg-primary/90">
                    <Plus className="w-3 h-3" /> Add Lead
                  </button>
                </PermissionGate>
              </div>
            </div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>Lead #</th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Title</th>
                  <th>Email</th>
                  <th>Source</th>
                  <th className="text-right">Est. Value</th>
                  <th>Expected Close</th>
                  <th>Next Action</th>
                  <th className="text-center">Score</th>
                  <th>Status</th>
                  {/* Owner deleted: crm_leads has `ownerId` but nothing resolves it to a
                      name and the list never joined users, so the cell was always blank —
                      the same defect the Accounts tab had. Last Activity stays: it IS a
                      real aggregate, but only on the CANONICAL crm.leads.list, which this
                      screen was not calling until this round. */}
                  <th>Last Activity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {LEADS_LIVE.map((l) => (
                  <tr key={l.id} className={l.status === "dead" ? "opacity-40" : ""}>
                    <td className="p-0"><div className={`priority-bar ${l.score >= 80 ? "bg-green-500" : l.score >= 60 ? "bg-yellow-500" : "bg-slate-400"}`} /></td>
                    <td className="font-mono text-[11px] text-primary">{l.number}</td>
                    <td className="font-semibold text-foreground">{l.firstName} {l.lastName}</td>
                    <td className="text-muted-foreground">{l.company}</td>
                    <td className="text-muted-foreground text-[11px]">{l.title}</td>
                    <td className="text-muted-foreground text-[11px] font-mono">{l.email}</td>
                    <td><span className="status-badge text-muted-foreground bg-muted text-[10px]">{l.source}</span></td>
                    <td className="text-right font-mono text-[11px]">{l.estimatedValue ? `₹${Number(l.estimatedValue).toLocaleString("en-IN")}` : "—"}</td>
                    <td className="text-[11px] text-muted-foreground">{l.expectedClose ? new Date(l.expectedClose).toLocaleDateString() : "—"}</td>
                    <td className="text-[11px] text-muted-foreground">{l.nextActionDate ? new Date(l.nextActionDate).toLocaleDateString() : "—"}</td>
                    <td className="text-center">
                      <span className={`font-mono font-bold text-[12px] ${SCORE_COLOR(l.score)}`}>{l.score}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className={`status-badge capitalize ${LEAD_STATUS_CFG[l.status as LeadStatus]}`}>{l.status}</span>
                        {/* Row-level progression: the ONE next milestone, named for what
                            the prospect did — not a dropdown of every status. */}
                        {(LEAD_NEXT_STEP[l.status] ?? []).map((step) => (
                          <button
                            key={step.to}
                            data-testid={`lead-advance-${step.to}`}
                            title={step.hint}
                            disabled={updateLeadMutation.isPending}
                            onClick={() => updateLeadMutation.mutate({ id: l.id, status: step.to } as any)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors disabled:opacity-50 ${
                              step.to === "disqualified"
                                ? "border-border text-muted-foreground hover:bg-muted"
                                : "border-primary/40 text-primary hover:bg-primary/10"
                            }`}
                          >
                            {step.label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="text-[11px] text-muted-foreground/70" data-testid="lead-last-activity">{l.lastActivityAt ? new Date(l.lastActivityAt).toLocaleDateString() : "—"}</td>
                    <td>
                      <div className="flex gap-1.5">
                        {l.status === "qualified" && <button onClick={() => convertLead.mutate({ id: l.id, dealTitle: l.company ?? "New Deal" })} disabled={convertLead.isPending} className="text-[11px] text-green-700 hover:underline font-medium disabled:opacity-50">Convert</button>}
                        <button
                          onClick={() => { setEditingLead(l); setEditLeadForm({ firstName: l.firstName, lastName: l.lastName, email: l.email ?? "", company: l.company ?? "", title: l.title ?? "", phone: l.phone ?? "", status: l.status, source: l.source,
                            budgetBand: l.budgetBand ?? "unknown", budgetNote: l.budgetNote ?? "", authority: l.authority ?? "unknown", need: l.need ?? "",
                            timeline: l.timeline ?? "unknown", estimatedValue: l.estimatedValue ?? "",
                            expectedClose: l.expectedClose ? new Date(l.expectedClose).toISOString().slice(0, 10) : "",
                            nextAction: l.nextAction ?? "", nextActionDate: l.nextActionDate ? new Date(l.nextActionDate).toISOString().slice(0, 10) : "" }); }}
                          className="text-[11px] text-primary hover:underline"
                        >Edit</button>
                        {l.archived ? (
                          <button onClick={() => handleUnarchiveLead(l.id)} className="text-green-500 hover:text-green-600 px-1" title="Unarchive"><Repeat size={14} /></button>
                        ) : (
                          <button onClick={() => handleArchiveLead(l.id)} className="text-amber-500 hover:text-amber-600 px-1" title="Archive"><Archive size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}


        {/* QUOTES */}
        {tab === "pipeline" && pipelineView === "quotes" && (
          <div>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
              <span className="text-[12px] font-semibold text-foreground/80">{QUOTES_LIVE.length} quotes</span>
              <button
                onClick={() => setShowNewQuote(true)}
                className="ml-auto flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
              >
                <Plus className="w-3 h-3" /> New Quote
              </button>
            </div>
            {QUOTES_LIVE.map((q: any) => {
              const isExpanded = expandedQuote === q.id;
              return (
                <div key={q.id} className="border-b border-border last:border-0">
                  <div className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedQuote(isExpanded ? null : q.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-[11px] text-primary" data-testid="quote-number">{q.quoteNumber}</span>
                        <span className={`status-badge capitalize ${QUOTE_STATUS_CFG[q.status]}`}>{q.status}</span>
                        {q.validUntil && <span className="text-[11px] text-muted-foreground/70">Valid until: {new Date(q.validUntil).toLocaleDateString()}</span>}
                        <span className={`status-badge text-[10px] ${q.isInterstate ? "text-indigo-700 bg-indigo-100" : "text-green-700 bg-green-100"}`}>
                          {q.isInterstate ? "Inter-state · IGST" : "Intra-state · CGST+SGST"}
                        </span>
                      </div>
                      <p className="text-[13px] font-semibold text-foreground">{q.dealTitle ?? "Unlinked quote"}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Account: <strong>{q.accountName ?? "—"}</strong>
                        {" · "}Place of supply: {GST_STATE_NAME[q.placeOfSupply] ?? q.placeOfSupply ?? "—"}
                        {" · "}Created: {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[18px] font-bold text-foreground" data-testid="quote-card-total" data-value={Number(q.total ?? 0)}>{inr(q.total)}</div>
                      <div className="text-[11px] text-muted-foreground/70">{q.lineItems.length} line items</div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-6 pb-4 bg-muted/30/50 border-t border-dashed border-slate-200">
                      <div className="mt-3 mb-3 text-[10px] font-semibold text-muted-foreground uppercase">Line Items</div>
                      <table className="ent-table w-full mb-3">
                        <thead>
                          <tr>
                            <th>Line</th>
                            <th>Product / Service</th>
                            <th>Description</th>
                            <th className="text-center">Qty</th>
                            <th>Unit Price</th>
                            <th className="text-center">Discount %</th>
                            <th>Line Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(q.lineItems ?? []).map((li: any) => (
                            <tr key={li.line}>
                              <td className="text-center text-muted-foreground/70">{li.line}</td>
                              <td className="font-semibold text-foreground">{li.product}</td>
                              <td className="text-muted-foreground text-[11px]">{li.description}</td>
                              <td className="text-center font-mono">{li.qty}</td>
                              <td className="font-mono text-[11px]">{inr(li.unitPrice)}</td>
                              <td className="text-center text-[11px]">{li.discount > 0 ? `${li.discount}%` : "—"}</td>
                              <td className="font-mono font-bold text-foreground">{inr(li.total)}</td>
                            </tr>
                          ))}
                          {/* The stored tax columns, shown. The quote already carried a
                              CGST/SGST/IGST split; the detail view showed none of it, so a
                              rep could not see what the customer was being charged. */}
                          <tr className="bg-card">
                            <td colSpan={5} />
                            <td className="text-right text-[11px] text-muted-foreground font-semibold">Subtotal:</td>
                            <td className="font-mono text-foreground/80">{inr(q.subtotal)}</td>
                          </tr>
                          {Number(q.discountPct ?? 0) > 0 && (
                            <tr className="bg-card">
                              <td colSpan={5} />
                              <td className="text-right text-[11px] text-green-600 font-semibold">Discount ({Number(q.discountPct)}%):</td>
                              <td className="font-mono text-green-600">-{inr(Number(q.subtotal ?? 0) - Number(q.taxableValue ?? 0))}</td>
                            </tr>
                          )}
                          <tr className="bg-card">
                            <td colSpan={5} />
                            <td className="text-right text-[11px] text-muted-foreground font-semibold">Taxable value:</td>
                            <td className="font-mono text-foreground/80">{inr(q.taxableValue)}</td>
                          </tr>
                          {q.isInterstate ? (
                            <tr className="bg-card">
                              <td colSpan={5} />
                              <td className="text-right text-[11px] text-muted-foreground font-semibold">IGST:</td>
                              <td className="font-mono text-foreground/80" data-testid="quote-detail-igst" data-value={Number(q.igstAmount ?? 0)}>{inr(q.igstAmount)}</td>
                            </tr>
                          ) : (
                            <>
                              <tr className="bg-card">
                                <td colSpan={5} />
                                <td className="text-right text-[11px] text-muted-foreground font-semibold">CGST:</td>
                                <td className="font-mono text-foreground/80" data-testid="quote-detail-cgst" data-value={Number(q.cgstAmount ?? 0)}>{inr(q.cgstAmount)}</td>
                              </tr>
                              <tr className="bg-card">
                                <td colSpan={5} />
                                <td className="text-right text-[11px] text-muted-foreground font-semibold">SGST:</td>
                                <td className="font-mono text-foreground/80" data-testid="quote-detail-sgst" data-value={Number(q.sgstAmount ?? 0)}>{inr(q.sgstAmount)}</td>
                              </tr>
                            </>
                          )}
                          <tr className="bg-card font-bold">
                            <td colSpan={5} />
                            <td className="text-right text-[12px] text-foreground font-bold">TOTAL:</td>
                            <td className="font-mono text-[14px] font-black text-foreground" data-testid="quote-detail-total" data-value={Number(q.total ?? 0)}>{inr(q.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                      {q.notes && <p className="text-[11px] text-muted-foreground bg-blue-50 border border-blue-100 rounded px-3 py-2 mb-3">{q.notes}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => { updateQuote.mutate({ id: q.id, status: "sent" }); toast.success(`Quote ${q.quoteNumber ?? q.id} marked as sent — customer notification dispatch is pending email config.`); }}
                          className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
                        >
                          <Send className="w-3 h-3 inline mr-1" />Send to Customer
                        </button>
                        <button
                          onClick={() => downloadQuotePdf(q.id, q.quoteNumber ?? q.id)}
                          className="px-3 py-1 border border-border text-[11px] rounded hover:bg-muted/30 text-muted-foreground"
                        >
                          <FileText className="w-3 h-3 inline mr-1" />Download PDF
                        </button>
                        <button
                          onClick={() => {
                            const newStatus = prompt(`Change quote status (current: ${q.status}):\n${QUOTE_STATUSES.join(" / ")}`);
                            if (newStatus && (QUOTE_STATUSES as readonly string[]).includes(newStatus)) {
                              updateQuote.mutate({ id: q.id, status: newStatus as any });
                            }
                          }}
                          className="px-3 py-1 border border-border text-[11px] rounded hover:bg-muted/30 text-muted-foreground"
                        >Edit</button>
                        {q.status !== "accepted" && (
                          <button onClick={() => updateQuote.mutate({ id: q.id, status: "accepted" })} disabled={updateQuote.isPending} className="px-3 py-1 bg-green-100 text-green-700 text-[11px] rounded hover:bg-green-200 disabled:opacity-50">Mark Accepted</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ANALYTICS */}
        {/*
          * SALES ANALYTICS — the CRM management view (Phase 3).
          *
          * This tab previously held three panels that could not be trusted:
          *
          *  • "Revenue by Stage (Weighted)" weighted by the DEAL's own
          *    probability while calling itself a stage figure, and drew its bars
          *    as a fraction of a HARDCODED 500000 — so the bar lengths meant
          *    nothing on any org whose pipeline was not that size.
          *  • "Deals by Source" read `d.source`. `crm_deals` HAS NO source
          *    column, so every row was undefined, every group was empty, and the
          *    panel rendered blank with nothing to say it had no data — exactly
          *    the "cannot tell no-data from not-wired" failure this round exists
          *    to remove.
          *  • "Full Deals List" printed `source` and `lastActivity` columns for
          *    the same non-existent fields, plus `d.number`, which is also not a
          *    column on crm_deals.
          *
          * All three also aggregated client-side over `deals.list({ limit: 200 })`,
          * so any org past 200 deals would have been quietly under-reported.
          * The replacement aggregates in SQL over the whole table, scoped to the
          * caller's org.
          */}
        {tab === "analytics" && <CrmManagementView />}
      </div>

      {/* Edit Lead Modal */}
      {editingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          {/* max-h + scrolling body: Round 9a added nine qualification fields to this
              dialog, which pushed the footer (and its Save button) below the fold on a
              laptop viewport — the button was rendered but unreachable. */}
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
              <h2 className="text-body-sm font-semibold">Edit Lead: {editingLead.firstName} {editingLead.lastName}</h2>
              <button onClick={() => setEditingLead(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              {(["firstName", "lastName", "email", "phone", "company", "title"] as const).map((f) => (
                <div key={f}>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">{f.replace(/([A-Z])/g, " $1")}</label>
                  <input
                    value={(editLeadForm as any)[f]}
                    onChange={(e) => setEditLeadForm((prev: any) => ({ ...prev, [f]: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Status</label>
                <select
                  value={editLeadForm.status}
                  onChange={(e) => setEditLeadForm((prev: any) => ({ ...prev, status: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card"
                >
                  {/*
                    * "converted" IS an option here, disabled.
                    *
                    * It was missing from this list while the select's value is
                    * seeded from the record, so a converted lead rendered a
                    * dropdown the browser could not match — it showed the first
                    * option instead, and the dialog claimed a status the record
                    * did not hold. Saving then submitted the real "converted"
                    * from state and was rejected by the server guard, which is
                    * how a lead came to look as though it had gone backwards.
                    *
                    * Disabled rather than absent: it is a legitimate stored
                    * value that must be DISPLAYED, but conversion happens
                    * through Convert, never by picking it here.
                    */}
                  {["new", "contacted", "qualified", "disqualified"].map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value="converted" disabled>converted (via Convert only)</option>
                </select>
              </div>

              {/* ── Qualification (BANT) + opportunity shape ────────────────────
                  Everything above describes WHO the person is. These describe what
                  they might buy, what it is worth and when — and they feed the score. */}
              <div className="pt-2 mt-2 border-t border-border">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Qualification</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Budget band</label>
                    <select data-testid="lead-budget-band" value={editLeadForm.budgetBand}
                      onChange={(e) => setEditLeadForm((prev: any) => ({ ...prev, budgetBand: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card">
                      {[["unknown", "Unknown"], ["under_1l", "Under ₹1L"], ["1l_5l", "₹1L–5L"], ["5l_25l", "₹5L–25L"], ["over_25l", "Over ₹25L"]]
                        .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Authority</label>
                    <select data-testid="lead-authority" value={editLeadForm.authority}
                      onChange={(e) => setEditLeadForm((prev: any) => ({ ...prev, authority: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card">
                      {[["unknown", "Unknown"], ["decision_maker", "Decision maker"], ["influencer", "Influencer"], ["evaluator", "Evaluator"]]
                        .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Timeline</label>
                    <select data-testid="lead-timeline" value={editLeadForm.timeline}
                      onChange={(e) => setEditLeadForm((prev: any) => ({ ...prev, timeline: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card">
                      {[["unknown", "Unknown"], ["immediate", "Immediate"], ["this_quarter", "This quarter"], ["next_quarter", "Next quarter"], ["later", "Later"]]
                        .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Budget note</label>
                    <input value={editLeadForm.budgetNote}
                      onChange={(e) => setEditLeadForm((prev: any) => ({ ...prev, budgetNote: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Need</label>
                    <input data-testid="lead-need" value={editLeadForm.need}
                      onChange={(e) => setEditLeadForm((prev: any) => ({ ...prev, need: e.target.value }))}
                      placeholder="What problem are they trying to solve?"
                      className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Estimated value (₹)</label>
                    <input data-testid="lead-estimated-value" type="number" min="0" step="0.01" value={editLeadForm.estimatedValue}
                      onChange={(e) => setEditLeadForm((prev: any) => ({ ...prev, estimatedValue: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Expected close</label>
                    <input data-testid="lead-expected-close" type="date" value={editLeadForm.expectedClose}
                      onChange={(e) => setEditLeadForm((prev: any) => ({ ...prev, expectedClose: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Next action</label>
                    <input value={editLeadForm.nextAction}
                      onChange={(e) => setEditLeadForm((prev: any) => ({ ...prev, nextAction: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Next action date</label>
                    <input type="date" value={editLeadForm.nextActionDate}
                      onChange={(e) => setEditLeadForm((prev: any) => ({ ...prev, nextActionDate: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card outline-none" />
                  </div>
                </div>
              </div>

              {/* The lead's own history. `crm_activities.lead_id` has had a column,
                  an FK, an index and an aggregate feeding the Leads list since it
                  was added — and no screen that showed it. Same component the
                  Deal, Account and Contact records use. */}
              <div className="pt-3 mt-1 border-t border-border">
                <CrmActivityTimeline scope={{ leadId: editingLead.id }} title="Activity" />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border bg-muted/20 flex justify-end gap-2 shrink-0">
              <button onClick={() => setEditingLead(null)} className="px-3 py-1.5 text-[12px] border border-border rounded hover:bg-muted/30">Cancel</button>
              <button
                data-testid="lead-edit-save"
                disabled={
                  updateLeadMutation.isPending ||
                  // Required-field validation carried from the deleted dialog: it
                  // refused to save a lead missing any of these, and that guard
                  // should not have depended on which of two dialogs you clicked.
                  !editLeadForm.firstName.trim() || !editLeadForm.lastName.trim() ||
                  !editLeadForm.company.trim() || !editLeadForm.email.trim()
                }
                onClick={() => {
                  if (/^[0-9a-f-]{36}$/i.test(editingLead.id)) {
                    updateLeadMutation.mutate({
                      id: editingLead.id, ...editLeadForm,
                      /*
                       * A converted lead's status is not sent at all. The server
                       * refuses to change it, and resubmitting the value the
                       * dialog happens to be holding is how an edit that meant
                       * to log an activity ended up arguing about status.
                       */
                      status: editingLead.convertedDealId ? undefined : (editLeadForm.status as any),
                      // Trimming carried from the deleted dialog — a trailing space in a
                      // name or email is never intended.
                      firstName: editLeadForm.firstName.trim(),
                      lastName: editLeadForm.lastName.trim(),
                      email: editLeadForm.email.trim(),
                      phone: editLeadForm.phone.trim(),
                      company: editLeadForm.company.trim(),
                      title: editLeadForm.title.trim() || undefined,
                      // Empty strings are "not set", not values — the API takes undefined.
                      budgetNote: editLeadForm.budgetNote || undefined,
                      need: editLeadForm.need || undefined,
                      estimatedValue: editLeadForm.estimatedValue || undefined,
                      expectedClose: editLeadForm.expectedClose || undefined,
                      nextAction: editLeadForm.nextAction || undefined,
                      nextActionDate: editLeadForm.nextActionDate || undefined,
                    } as any);
                  } else {
                    toast.success("Lead updated");
                    setEditingLead(null);
                  }
                }}
                className="px-4 py-1.5 text-[12px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {updateLeadMutation.isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Quote Modal — line-item editor with server-computed totals */}
      {showNewQuote && (() => {
        const grossTotal = quoteLines.reduce((s, l) => s + lineTotal(l), 0);
        // Mirrors the server: a quote needs a deal (its only route to a buyer)
        // AND a value. Both are stated below when unmet, rather than letting the
        // click through to a 400.
        const canCreate = quoteLines.length > 0 && grossTotal > 0 && !!quoteForm.dealId;
        const setLine = (i: number, patch: Partial<QuoteLineDraft>) =>
          setQuoteLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          {/* max-h + a scrolling body, with the footer pinned OUTSIDE it. A prior
              round put fields in a dialog that had neither and pushed Save below the
              fold: rendered, unclickable, unreachable for a whole deploy cycle. */}
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" data-testid="new-quote-dialog">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
              <h2 className="text-body-sm font-semibold">New Quote</h2>
              <button onClick={() => setShowNewQuote(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* ── Which deal, and therefore which buyer ──────────────────── */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Deal *</label>
                  {/* The deal is how the quote reaches an account, and the account is
                      how the tax engine learns the place of supply. Without it every
                      quote defaults to the org's own state — intra-state CGST/SGST.
                      `quotes.create` REQUIRES a deal as of this round, so the "no
                      deal" option is gone: leaving it would have offered a choice the
                      server rejects with a raw zod error. */}
                  <select data-testid="quote-deal" value={quoteForm.dealId}
                    onChange={(e) => setQuoteForm(f => ({ ...f, dealId: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card">
                    <option value="">— Select a deal —</option>
                    {DEALS_LIVE.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.title} · {getDealAccountName(d)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Valid until</label>
                  <input type="date" data-testid="quote-valid-until" value={quoteForm.validUntil}
                    onChange={(e) => setQuoteForm(f => ({ ...f, validUntil: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card" />
                </div>
              </div>

              {/* ── Place of supply, resolved server-side ───────────────────── */}
              {/* Bd: nothing anywhere warned that an account had no state. A missing
                  state is treated by the engine as a legitimate unknown and logs
                  NOTHING, so the quote silently bills intra-state. Say it out loud. */}
              {quotePreview && (
                quotePreview.buyerStateMissing || quotePreview.buyerStateUnrecognised ? (
                  <div data-testid="quote-pos-warning" className="border border-amber-300 bg-amber-50 text-amber-900 rounded px-3 py-2 text-[11px]">
                    <strong>No place of supply for {quotePreview.accountName ?? "this account"}.</strong>{" "}
                    {quotePreview.buyerStateUnrecognised
                      ? <>Its state is recorded as “{quotePreview.buyerStateRaw}”, which is not a GST state. </>
                      : <>The account has no state on file. </>}
                    This quote will be taxed as an <strong>intra-state</strong> supply
                    ({quotePreview.orgStateName ?? "your own state"}) — CGST + SGST. If the
                    customer is in another state that is the wrong split. Set the state on
                    the account first.
                  </div>
                ) : (
                  <div data-testid="quote-pos" className="border border-border bg-muted/30 rounded px-3 py-2 text-[11px] text-muted-foreground">
                    Place of supply:{" "}
                    <strong className="text-foreground">{quotePreview.buyerStateName ?? quotePreview.orgStateName ?? "—"}</strong>
                    {" · "}
                    <span className={quotePreview.isInterstate ? "text-indigo-700 font-semibold" : "text-green-700 font-semibold"}>
                      {quotePreview.isInterstate ? "Inter-state — IGST" : "Intra-state — CGST + SGST"}
                    </span>
                    {quotePreview.orgStateName && <> · supplying from {quotePreview.orgStateName}</>}
                  </div>
                )
              )}

              {/* ── Lines ───────────────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase">Line items</label>
                  <button data-testid="quote-add-line" onClick={() => setQuoteLines(ls => [...ls, blankQuoteLine()])}
                    className="flex items-center gap-1 px-2 py-0.5 text-[11px] border border-border rounded hover:bg-accent">
                    <Plus className="w-3 h-3" /> Add line
                  </button>
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase text-muted-foreground">
                      <th className="text-left font-semibold pb-1">Description</th>
                      <th className="text-left font-semibold pb-1 w-20">HSN/SAC</th>
                      <th className="text-right font-semibold pb-1 w-16">Qty</th>
                      <th className="text-right font-semibold pb-1 w-24">Unit price</th>
                      <th className="text-right font-semibold pb-1 w-16">Disc %</th>
                      <th className="text-right font-semibold pb-1 w-20">GST %</th>
                      <th className="text-right font-semibold pb-1 w-28">Line total</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {quoteLines.map((l, i) => (
                      <tr key={i} data-testid="quote-line">
                        <td className="pr-1 py-0.5">
                          <input data-testid="quote-line-description" value={l.description} placeholder="e.g. Enterprise licence, 25 seats"
                            onChange={(e) => setLine(i, { description: e.target.value })}
                            className="w-full border border-border rounded px-2 py-1 bg-background" />
                        </td>
                        <td className="pr-1 py-0.5">
                          <input data-testid="quote-line-hsn" value={l.hsnCode} placeholder="9983"
                            onChange={(e) => setLine(i, { hsnCode: e.target.value })}
                            className="w-full border border-border rounded px-2 py-1 bg-background font-mono text-[11px]" />
                        </td>
                        <td className="pr-1 py-0.5">
                          <input data-testid="quote-line-qty" type="number" min="0" step="1" value={l.quantity}
                            onChange={(e) => setLine(i, { quantity: e.target.value })}
                            className="w-full border border-border rounded px-2 py-1 bg-background text-right font-mono" />
                        </td>
                        <td className="pr-1 py-0.5">
                          <input data-testid="quote-line-price" type="number" min="0" step="0.01" value={l.unitPrice}
                            onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                            className="w-full border border-border rounded px-2 py-1 bg-background text-right font-mono" />
                        </td>
                        <td className="pr-1 py-0.5">
                          <input data-testid="quote-line-discount" type="number" min="0" max="100" step="0.01" value={l.discountPct}
                            onChange={(e) => setLine(i, { discountPct: e.target.value })}
                            className="w-full border border-border rounded px-2 py-1 bg-background text-right font-mono" />
                        </td>
                        <td className="pr-1 py-0.5">
                          <select data-testid="quote-line-gst" value={l.gstRate}
                            onChange={(e) => setLine(i, { gstRate: e.target.value })}
                            className="w-full border border-border rounded px-1 py-1 bg-background text-right font-mono">
                            {QUOTE_GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                          </select>
                        </td>
                        {/* Computed, never typed — read-only by construction. */}
                        <td data-testid="quote-line-total" data-value={lineTotal(l)}
                          className="text-right font-mono font-semibold pr-1">{inr(lineTotal(l))}</td>
                        <td className="text-right">
                          <button data-testid="quote-remove-line" title="Remove line"
                            disabled={quoteLines.length === 1}
                            onClick={() => setQuoteLines(ls => ls.filter((_, idx) => idx !== i))}
                            className="text-muted-foreground hover:text-red-600 disabled:opacity-30 px-1">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Totals: every figure below comes from the server ─────────── */}
              <div className="flex items-start gap-4">
                <div className="w-40">
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Quote discount %</label>
                  <input data-testid="quote-discount" type="number" min="0" max="100" step="0.01" value={quoteForm.discountPct}
                    onChange={(e) => setQuoteForm(f => ({ ...f, discountPct: e.target.value }))}
                    className="w-full border border-border rounded px-2 py-1 text-[12px] bg-background text-right font-mono" />
                  <p className="text-[10px] text-muted-foreground mt-1">Applied before GST.</p>
                </div>
                <div className="flex-1 border border-border rounded divide-y divide-border" data-testid="quote-totals">
                  <Row label="Subtotal" value={quotePreview?.subtotal} testid="quote-subtotal" />
                  <Row label="Taxable value (after discount)" value={quotePreview?.taxableValue} testid="quote-taxable" />
                  {quotePreview?.isInterstate ? (
                    <Row label="IGST" value={quotePreview?.igstAmount} testid="quote-igst" />
                  ) : (
                    <>
                      <Row label="CGST" value={quotePreview?.cgstAmount} testid="quote-cgst" />
                      <Row label="SGST" value={quotePreview?.sgstAmount} testid="quote-sgst" />
                    </>
                  )}
                  <Row label="Total GST" value={quotePreview?.taxTotal} testid="quote-tax-total" />
                  <Row label="TOTAL" value={quotePreview?.total} testid="quote-grand-total" bold />
                </div>
              </div>
              {!canCreate && (
                <p data-testid="quote-zero-warning" className="text-[11px] text-amber-700">
                  {/* Name the reason that actually applies. One message covering two
                      conditions told a rep with a priced quote and no deal that their
                      lines were worth ₹0. */}
                  {!(quoteLines.length > 0 && grossTotal > 0)
                    ? "A quote must have at least one line worth more than ₹0 before it can be created."
                    : "Select the deal this quote is for. A quote reaches its customer through its deal, and without one it has no buyer and no place of supply."}
                </p>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border bg-muted/20 flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowNewQuote(false)} className="px-3 py-1.5 text-[12px] border border-border rounded hover:bg-muted/30">Cancel</button>
              <button
                data-testid="quote-create"
                disabled={createQuoteMutation.isPending || !canCreate}
                onClick={() => createQuoteMutation.mutate({
                  // Required now; `canCreate` guarantees it is set.
                  dealId: quoteForm.dealId,
                  items: quoteLines.map(toQuoteApiLine),
                  discountPct: quoteForm.discountPct || "0",
                  validUntil: quoteForm.validUntil || undefined,
                })}
                className="px-4 py-1.5 text-[12px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {createQuoteMutation.isPending ? "Creating…" : "Create Quote"}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Add Account Modal */}
      {showNewAccount && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          {/* Six fields now (was four). Capped height + a scrolling body so the
              Create button can never be pushed below the fold. */}
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-5" data-testid="new-account-dialog">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-body-sm font-bold">Add Account</h2>
              <button onClick={() => setShowNewAccount(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Company Name *</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={accountForm.name} onChange={(e) => setAccountForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Industry *</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="e.g. Technology" value={accountForm.industry} onChange={(e) => setAccountForm(f => ({ ...f, industry: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Tier</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={accountForm.tier} onChange={(e) => setAccountForm(f => ({ ...f, tier: e.target.value as any }))}>
                  <option value="smb">SMB</option>
                  <option value="mid_market">Mid Market</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Website *</label>
                <input type="url" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="https://" value={accountForm.website} onChange={(e) => setAccountForm(f => ({ ...f, website: e.target.value }))} />
              </div>
              <div>
                {/* The buyer address a quote PRINTS. The column and the account
                    detail page both existed; no form ever wrote it, so the address
                    block on every quote PDF rendered empty. Free text and a
                    textarea because an Indian billing address is multi-line and
                    must survive as typed. */}
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Billing Address</label>
                <textarea data-testid="account-billing-address" rows={3} className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background resize-y"
                  placeholder={"Unit 4, Prestige Tech Park\nOuter Ring Road, Bengaluru 560103"} value={accountForm.billingAddress}
                  onChange={(e) => setAccountForm(f => ({ ...f, billingAddress: e.target.value }))} />
              </div>
              <div>
                {/* Place of supply. The account's state drives the intra- vs inter-state
                    GST split on every quote (quote-tax.ts resolves buyer state from here).
                    Options come from GSTIN_STATE_CODES — the IRP's vocabulary — NOT from
                    INDIAN_STATES, which was realigned to the PT vocabulary in Round 6 and
                    disagrees on three UTs. We display the name and store the two-digit code,
                    which normaliseStateToCode passes through unchanged. */}
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">State (place of supply)</label>
                <select data-testid="account-state-code" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
                  value={accountForm.stateCode} onChange={(e) => setAccountForm(f => ({ ...f, stateCode: e.target.value }))}>
                  <option value="">— Not set (quotes will assume intra-state) —</option>
                  {GST_STATE_OPTIONS.map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">GSTIN</label>
                <input data-testid="account-gstin" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background font-mono"
                  placeholder="29ABCDE1234F1Z5" value={accountForm.gstin}
                  onChange={(e) => setAccountForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowNewAccount(false)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={() => { if (!accountForm.name.trim()) { toast.error("Company name is required"); return; } if (!accountForm.industry.trim()) { toast.error("Industry is required"); return; } if (!accountForm.website.trim()) { toast.error("Website is required"); return; } if (!accountForm.website.startsWith("https://")) { toast.error("Please enter a valid website URL starting with https://"); return; } createAccountMutation.mutate({ name: accountForm.name.trim(), industry: accountForm.industry.trim(), tier: accountForm.tier, website: accountForm.website.trim(), billingAddress: accountForm.billingAddress.trim() || undefined, stateCode: accountForm.stateCode || undefined, gstin: accountForm.gstin.trim() || undefined }); }}
                disabled={createAccountMutation.isPending}
                className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              >{createAccountMutation.isPending ? "Creating…" : "Create Account"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {editingAccount && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-5" data-testid="edit-account-dialog">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-body-sm font-bold">Edit Account</h2>
              <button onClick={() => setEditingAccount(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Company Name *</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editAccountForm.name} onChange={(e) => setEditAccountForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Industry *</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="e.g. Technology" value={editAccountForm.industry} onChange={(e) => setEditAccountForm(f => ({ ...f, industry: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Tier</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editAccountForm.tier} onChange={(e) => setEditAccountForm(f => ({ ...f, tier: e.target.value as any }))}>
                  <option value="smb">SMB</option>
                  <option value="mid_market">Mid Market</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Website *</label>
                <input type="url" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="https://" value={editAccountForm.website} onChange={(e) => setEditAccountForm(f => ({ ...f, website: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Billing Address</label>
                <textarea data-testid="edit-account-billing-address" rows={3} className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background resize-y"
                  placeholder={"Unit 4, Prestige Tech Park\nOuter Ring Road, Bengaluru 560103"} value={editAccountForm.billingAddress}
                  onChange={(e) => setEditAccountForm(f => ({ ...f, billingAddress: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">State (place of supply)</label>
                <select data-testid="edit-account-state-code" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background"
                  value={editAccountForm.stateCode} onChange={(e) => setEditAccountForm(f => ({ ...f, stateCode: e.target.value }))}>
                  <option value="">— Not set (quotes will assume intra-state) —</option>
                  {GST_STATE_OPTIONS.map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">GSTIN</label>
                <input data-testid="edit-account-gstin" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background font-mono"
                  placeholder="29ABCDE1234F1Z5" value={editAccountForm.gstin}
                  onChange={(e) => setEditAccountForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditingAccount(null)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={() => { if (!editAccountForm.name.trim()) { toast.error("Company name is required"); return; } if (!editAccountForm.industry.trim()) { toast.error("Industry is required"); return; } if (!editAccountForm.website.trim()) { toast.error("Website is required"); return; } if (!editAccountForm.website.startsWith("http://") && !editAccountForm.website.startsWith("https://")) { toast.error("Please enter a valid website URL starting with http:// or https://"); return; } updateAccountMutation.mutate({ id: editingAccount.id, name: editAccountForm.name.trim(), industry: editAccountForm.industry.trim(), tier: editAccountForm.tier, website: editAccountForm.website.trim(), billingAddress: editAccountForm.billingAddress.trim() || undefined, stateCode: editAccountForm.stateCode || undefined, gstin: editAccountForm.gstin.trim() || undefined }); }}
                disabled={updateAccountMutation.isPending}
                className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              >{updateAccountMutation.isPending ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showNewContact && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-body-sm font-bold">Add Contact</h2>
              <button onClick={() => setShowNewContact(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">First Name *</label>
                  <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={contactForm.firstName} onChange={(e) => setContactForm(f => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Last Name *</label>
                  <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={contactForm.lastName} onChange={(e) => setContactForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Account *</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={contactForm.accountId} onChange={(e) => setContactForm(f => ({ ...f, accountId: e.target.value }))}>
                  <option value="">— Select account —</option>
                  {ACCOUNTS_LIVE.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Email *</label>
                <input type="email" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={contactForm.email} onChange={(e) => setContactForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Phone *</label>
                <input type="tel" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={contactForm.phone} onChange={(e) => setContactForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Job Title *</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="e.g. VP Engineering" value={contactForm.title} onChange={(e) => setContactForm(f => ({ ...f, title: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowNewContact(false)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={() => { if (!contactForm.firstName.trim() || !contactForm.lastName.trim() || !contactForm.accountId || !contactForm.email.trim() || !contactForm.phone.trim() || !contactForm.title.trim()) { toast.error("All fields are required"); return; } createContactMutation.mutate({ firstName: contactForm.firstName.trim(), lastName: contactForm.lastName.trim(), email: contactForm.email.trim(), phone: contactForm.phone.trim(), title: contactForm.title.trim(), accountId: contactForm.accountId }); }}
                disabled={createContactMutation.isPending}
                className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              >{createContactMutation.isPending ? "Creating…" : "Create Contact"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {editingContact && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          {/* max-h + a scrolling body: this dialog carries the contact's activity
              timeline as well as its fields, and without a cap the Save button
              was pushed below the fold on a laptop viewport — the same defect the
              Edit Lead dialog was fixed for in Round 9a. */}
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-body-sm font-bold">Edit Contact</h2>
              <button onClick={() => setEditingContact(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">First Name *</label>
                  <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editContactForm.firstName} onChange={(e) => setEditContactForm(f => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Last Name *</label>
                  <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editContactForm.lastName} onChange={(e) => setEditContactForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Account *</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editContactForm.accountId} onChange={(e) => setEditContactForm(f => ({ ...f, accountId: e.target.value }))}>
                  <option value="">— Select account —</option>
                  {ACCOUNTS_LIVE.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Email *</label>
                <input type="email" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editContactForm.email} onChange={(e) => setEditContactForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Phone *</label>
                <input type="tel" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editContactForm.phone} onChange={(e) => setEditContactForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Job Title *</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editContactForm.title} onChange={(e) => setEditContactForm(f => ({ ...f, title: e.target.value }))} />
              </div>
            </div>

            {/* The contact's own history, same component as the other three. */}
            <div className="mt-4 pt-4 border-t border-border">
              <CrmActivityTimeline scope={{ contactId: editingContact.id }} title="Activity" />
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditingContact(null)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={() => { if (!editContactForm.firstName.trim() || !editContactForm.lastName.trim() || !editContactForm.accountId || !editContactForm.email.trim() || !editContactForm.phone.trim() || !editContactForm.title.trim()) { toast.error("All fields are required"); return; } updateContactMutation.mutate({ id: editingContact.id, firstName: editContactForm.firstName.trim(), lastName: editContactForm.lastName.trim(), email: editContactForm.email.trim(), phone: editContactForm.phone.trim(), title: editContactForm.title.trim(), accountId: editContactForm.accountId }); }}
                disabled={updateContactMutation.isPending}
                className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              >{updateContactMutation.isPending ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}


      {/* New Lead Modal */}
      {showNewLead && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          {/* Scrolling body with the footer pinned outside it — the qualification
              block below can double this dialog's height, and a Save button pushed
              past the fold is a button that does not exist. */}
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" data-testid="new-lead-dialog">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h2 className="text-body-sm font-bold">New Lead</h2>
              <button onClick={() => setShowNewLead(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="p-5 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">First Name *</label>
                <input autoFocus className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={leadForm.firstName} onChange={(e) => setLeadForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Last Name *</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={leadForm.lastName} onChange={(e) => setLeadForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Company *</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="Company / Organisation" value={leadForm.company} onChange={(e) => setLeadForm(f => ({ ...f, company: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Job Title</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={leadForm.title} onChange={(e) => setLeadForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Phone *</label>
                <input type="tel" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={leadForm.phone} onChange={(e) => setLeadForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Email *</label>
                <input type="email" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={leadForm.email} onChange={(e) => setLeadForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Lead Source</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={leadForm.source} onChange={(e) => setLeadForm(f => ({ ...f, source: e.target.value }))}>
                  {["website", "referral", "event", "cold_outreach", "partner", "advertising", "other"].map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── Qualification (optional, collapsed) ────────────────────────
                Deliberately secondary: collapsed by default, every field
                optional, and nothing here can block Create. On a first call a
                rep has a name and a company and little else; the nine fields
                are here so that when they DO know, they do not have to save the
                lead and immediately reopen it. */}
            <div className="mt-4 border-t border-border pt-3">
              <button
                type="button"
                data-testid="lead-qualification-toggle"
                onClick={() => setShowLeadQualification(v => !v)}
                className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground"
              >
                <ChevronRight className={`w-3 h-3 transition-transform ${showLeadQualification ? "rotate-90" : ""}`} />
                Qualification <span className="font-normal normal-case tracking-normal">(optional — add later if you don&apos;t know yet)</span>
              </button>
              {showLeadQualification && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Budget band</label>
                    <select data-testid="new-lead-budget-band" value={leadForm.budgetBand}
                      onChange={(e) => setLeadForm(f => ({ ...f, budgetBand: e.target.value }))}
                      className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background">
                      {[["unknown", "Unknown"], ["under_1l", "Under ₹1L"], ["1l_5l", "₹1L–5L"], ["5l_25l", "₹5L–25L"], ["over_25l", "Over ₹25L"]]
                        .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Authority</label>
                    <select data-testid="new-lead-authority" value={leadForm.authority}
                      onChange={(e) => setLeadForm(f => ({ ...f, authority: e.target.value }))}
                      className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background">
                      {[["unknown", "Unknown"], ["decision_maker", "Decision maker"], ["influencer", "Influencer"], ["evaluator", "Evaluator"]]
                        .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Timeline</label>
                    <select data-testid="new-lead-timeline" value={leadForm.timeline}
                      onChange={(e) => setLeadForm(f => ({ ...f, timeline: e.target.value }))}
                      className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background">
                      {[["unknown", "Unknown"], ["immediate", "Immediate"], ["this_quarter", "This quarter"], ["next_quarter", "Next quarter"], ["later", "Later"]]
                        .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Estimated value (₹)</label>
                    <input data-testid="new-lead-estimated-value" type="number" min="0" step="0.01" value={leadForm.estimatedValue}
                      onChange={(e) => setLeadForm(f => ({ ...f, estimatedValue: e.target.value }))}
                      className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Budget note</label>
                    <input data-testid="new-lead-budget-note" value={leadForm.budgetNote}
                      onChange={(e) => setLeadForm(f => ({ ...f, budgetNote: e.target.value }))}
                      placeholder="e.g. approved capex, needs CFO sign-off"
                      className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Need</label>
                    <input data-testid="new-lead-need" value={leadForm.need}
                      onChange={(e) => setLeadForm(f => ({ ...f, need: e.target.value }))}
                      placeholder="What are they trying to solve?"
                      className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Expected close</label>
                    <input data-testid="new-lead-expected-close" type="date" value={leadForm.expectedClose}
                      onChange={(e) => setLeadForm(f => ({ ...f, expectedClose: e.target.value }))}
                      className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Next action date</label>
                    <input data-testid="new-lead-next-action-date" type="date" value={leadForm.nextActionDate}
                      onChange={(e) => setLeadForm(f => ({ ...f, nextActionDate: e.target.value }))}
                      className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Next action</label>
                    <input data-testid="new-lead-next-action" value={leadForm.nextAction}
                      onChange={(e) => setLeadForm(f => ({ ...f, nextAction: e.target.value }))}
                      placeholder="e.g. send pricing, book a demo"
                      className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" />
                  </div>
                </div>
              )}
            </div>
            </div>
            <div className="flex gap-2 px-5 py-3 border-t border-border bg-muted/20 shrink-0">
              <button onClick={() => setShowNewLead(false)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                data-testid="new-lead-save"
                disabled={!leadForm.firstName.trim() || !leadForm.lastName.trim() || !leadForm.company.trim() || !leadForm.email.trim() || !leadForm.phone.trim() || createLeadMutation.isPending}
                onClick={() => createLeadMutation.mutate({
                  firstName: leadForm.firstName.trim(),
                  lastName: leadForm.lastName.trim(),
                  email: leadForm.email.trim(),
                  phone: leadForm.phone.trim(),
                  company: leadForm.company.trim(),
                  title: leadForm.title.trim() || undefined,
                  source: leadForm.source as "other" | "website" | "event" | "partner" | "referral" | "cold_outreach" | "advertising",
                  // Sent to the CANONICAL crm.leads.create. The deprecated
                  // crm.createLead does not declare one of these nine, so zod
                  // would have dropped every last one while the toast said
                  // "Lead created" — the third occurrence of that trap.
                  // Empty string is "not set", not a value.
                  budgetBand: leadForm.budgetBand as any,
                  authority: leadForm.authority as any,
                  timeline: leadForm.timeline as any,
                  budgetNote: leadForm.budgetNote.trim() || undefined,
                  need: leadForm.need.trim() || undefined,
                  estimatedValue: leadForm.estimatedValue || undefined,
                  expectedClose: leadForm.expectedClose || undefined,
                  nextAction: leadForm.nextAction.trim() || undefined,
                  nextActionDate: leadForm.nextActionDate || undefined,
                })}
                className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              >{createLeadMutation.isPending ? "Creating…" : "Create Lead"}</button>
            </div>
          </div>
        </div>
      )}

      {/* The SECOND Edit Lead dialog that used to live here is deleted. Both gated on the
          same `editingLead` state, so both rendered at once and stacked on screen. It sent
          neither `source` nor any of the nine BANT/opportunity fields, so whichever one you
          happened to use changed what was saved. Its two genuinely better behaviours —
          trimming text input and a phone field — were carried into the survivor above. */}

      {/* New Activity Modal */}
      {showNewActivity && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          {/* A Lead selector was added below, so the body scrolls and the footer is
              pinned outside it — the same guard the lead and quote dialogs carry. */}
          <div data-testid="new-activity-dialog" className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h2 className="text-body-sm font-bold">Log Activity</h2>
              <button onClick={() => setShowNewActivity(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="p-5 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Type</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={activityForm.type} onChange={(e) => setActivityForm(f => ({ ...f, type: e.target.value }))}>
                  {Object.keys(ACTIVITY_TYPE_CFG).map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Subject</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={activityForm.subject} onChange={(e) => setActivityForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
              {/* ── Associations ────────────────────────────────────────────────
                  Account and Contact were both marked required and the Save button
                  was disabled without BOTH. The procedure requires neither — it
                  requires (now) at least ONE of lead/deal/account/contact. The old
                  rule made an activity against a LEAD impossible, because a lead has
                  no account until it converts: that is why `crm_activities.leadId`
                  shipped with an FK, an index and an aggregate feeding the Leads
                  list's "Last Activity" column, and no way to write it. */}
              <div className="col-span-2 text-[10px] text-muted-foreground border-t border-border pt-2">
                Link this activity to at least one of the following.
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Lead</label>
                <select data-testid="activity-lead" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={activityForm.leadId} onChange={(e) => setActivityForm(f => ({ ...f, leadId: e.target.value }))}>
                  <option value="">— Select Lead —</option>
                  {LEADS_LIVE.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.firstName} {l.lastName}{l.company ? ` · ${l.company}` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Deal</label>
                <select data-testid="activity-deal" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={activityForm.dealId} onChange={(e) => setActivityForm(f => ({ ...f, dealId: e.target.value }))}>
                  <option value="">— Select Deal —</option>
                  {DEALS_LIVE.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Account</label>
                <select data-testid="activity-account" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={activityForm.accountId} onChange={(e) => setActivityForm(f => ({ ...f, accountId: e.target.value }))}>
                  <option value="">— Select Account —</option>
                  {ACCOUNTS_LIVE.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Contact</label>
                <select data-testid="activity-contact" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={activityForm.contactId} onChange={(e) => setActivityForm(f => ({ ...f, contactId: e.target.value }))}>
                  <option value="">— Select Contact —</option>
                  {CONTACTS_LIVE.map((c: any) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Due Date</label>
                <input type="datetime-local" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={activityForm.scheduledAt} onChange={(e) => setActivityForm(f => ({ ...f, scheduledAt: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Completed Date</label>
                <input type="datetime-local" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={activityForm.completedAt} onChange={(e) => setActivityForm(f => ({ ...f, completedAt: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Outcome / Notes</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="Notes" value={activityForm.outcome} onChange={(e) => setActivityForm(f => ({ ...f, outcome: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Description</label>
                <textarea rows={3} className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={activityForm.description} onChange={(e) => setActivityForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            </div>
            <div className="flex gap-2 px-5 py-3 border-t border-border bg-muted/20 shrink-0">
              <button onClick={() => setShowNewActivity(false)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                data-testid="activity-save"
                // Mirrors the server rule exactly: at least ONE association.
                disabled={
                  !(activityForm.leadId || activityForm.dealId || activityForm.accountId || activityForm.contactId)
                  || createActivity.isPending
                }
                onClick={() => createActivity.mutate({
                  type: (activityForm.type || undefined) as "email" | "note" | "call" | "meeting" | "demo" | "follow_up" | undefined,
                  subject: activityForm.subject.trim() || undefined,
                  description: activityForm.description.trim() || undefined,
                  // Every association is optional and sent only when chosen. leadId is
                  // the one this dialog could not reach at all before.
                  leadId: activityForm.leadId || undefined,
                  dealId: activityForm.dealId || undefined,
                  accountId: activityForm.accountId || undefined,
                  contactId: activityForm.contactId || undefined,
                  outcome: activityForm.outcome.trim() || undefined,
                  scheduledAt: activityForm.scheduledAt ? new Date(activityForm.scheduledAt) : undefined,
                  completedAt: activityForm.completedAt ? new Date(activityForm.completedAt) : undefined,
                })}
                className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              >{createActivity.isPending ? "Saving…" : "Log Activity"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Activity Modal */}
      {editingActivity && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-body-sm font-bold">Edit Activity</h2>
              <button onClick={() => setEditingActivity(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Type</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editActivityForm.type} onChange={(e) => setEditActivityForm(f => ({ ...f, type: e.target.value }))}>
                  {Object.keys(ACTIVITY_TYPE_CFG).map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Subject</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editActivityForm.subject} onChange={(e) => setEditActivityForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Account</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editActivityForm.accountId} onChange={(e) => setEditActivityForm(f => ({ ...f, accountId: e.target.value }))}>
                  <option value="">— Select Account —</option>
                  {ACCOUNTS_LIVE.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Contact</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editActivityForm.contactId} onChange={(e) => setEditActivityForm(f => ({ ...f, contactId: e.target.value }))}>
                  <option value="">— Select Contact —</option>
                  {CONTACTS_LIVE.map((c: any) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Deal</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editActivityForm.dealId} onChange={(e) => setEditActivityForm(f => ({ ...f, dealId: e.target.value }))}>
                  <option value="">— Select Deal —</option>
                  {DEALS_LIVE.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Due Date</label>
                <input type="datetime-local" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editActivityForm.scheduledAt} onChange={(e) => setEditActivityForm(f => ({ ...f, scheduledAt: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Completed Date</label>
                <input type="datetime-local" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editActivityForm.completedAt} onChange={(e) => setEditActivityForm(f => ({ ...f, completedAt: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Outcome / Notes</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="Notes" value={editActivityForm.outcome} onChange={(e) => setEditActivityForm(f => ({ ...f, outcome: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Description</label>
                <textarea rows={3} className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editActivityForm.description} onChange={(e) => setEditActivityForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditingActivity(null)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                disabled={updateActivity.isPending}
                onClick={() => updateActivity.mutate({
                  id: editingActivity.id,
                  type: (editActivityForm.type || undefined) as "email" | "note" | "call" | "meeting" | "demo" | "follow_up" | undefined,
                  subject: editActivityForm.subject.trim() || undefined,
                  description: editActivityForm.description.trim() || undefined,
                  dealId: editActivityForm.dealId || undefined,
                  accountId: editActivityForm.accountId || undefined,
                  contactId: editActivityForm.contactId || undefined,
                  outcome: editActivityForm.outcome.trim() || undefined,
                  scheduledAt: editActivityForm.scheduledAt ? new Date(editActivityForm.scheduledAt) : undefined,
                  completedAt: editActivityForm.completedAt ? new Date(editActivityForm.completedAt) : undefined,
                })}
                className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              >{updateActivity.isPending ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
