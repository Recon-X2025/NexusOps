"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
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
];

const DEAL_IMPORT_FIELDS: ImportField[] = [
  { key: "title", label: "Title", required: true },
  { key: "stage", label: "Stage", enumValues: ["prospect", "qualification", "proposal", "negotiation", "verbal_commit", "closed_won", "closed_lost"] },
  { key: "value", label: "Value" },
  { key: "probability", label: "Probability" },
  { key: "expectedClose", label: "Expected Close" },
];

const CRM_TABS = [
  { key: "dashboard", label: "Dashboard", module: "accounts" as const, action: "read" as const },
  { key: "pipeline", label: "Pipeline", module: "accounts" as const, action: "write" as const },
  { key: "accounts", label: "Accounts", module: "accounts" as const, action: "read" as const },
  { key: "contacts", label: "Contacts", module: "accounts" as const, action: "read" as const },
  { key: "leads", label: "Leads", module: "accounts" as const, action: "read" as const },
  { key: "activities", label: "Activities", module: "accounts" as const, action: "read" as const },
  { key: "quotes", label: "Quotes", module: "accounts" as const, action: "write" as const },
  { key: "analytics", label: "Sales Analytics", module: "analytics" as const, action: "read" as const },
];

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
  lastActivity: string;
  campaign?: string | null;
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

const QUOTE_STATUS_CFG: Record<string, string> = {
  draft: "text-muted-foreground bg-muted",
  sent: "text-blue-700 bg-blue-100",
  viewed: "text-purple-700 bg-purple-100",
  accepted: "text-green-700 bg-green-100",
  declined: "text-red-700 bg-red-100",
  expired: "text-muted-foreground/70 bg-muted/30",
};

const TIER_CFG: Record<string, string> = {
  enterprise: "text-purple-700 bg-purple-100",
  mid_market: "text-blue-700 bg-blue-100",
  smb: "text-muted-foreground bg-muted",
};

const SENIORITY_CFG: Record<string, string> = {
  c_level: "text-red-700 bg-red-100",
  vp: "text-orange-700 bg-orange-100",
  director: "text-yellow-700 bg-yellow-100",
  manager: "text-blue-700 bg-blue-100",
  individual: "text-muted-foreground bg-muted",
};

const SCORE_COLOR = (s: number) => s >= 80 ? "text-green-700" : s >= 60 ? "text-yellow-600" : "text-red-600";

const PIPELINE_STAGES: DealStage[] = ["prospect", "qualification", "proposal", "negotiation", "verbal_commit"];

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
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [editLeadForm, setEditLeadForm] = useState({ firstName: "", lastName: "", email: "", company: "", title: "", phone: "", source: "website" as string, status: "new" as any });
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [dealForm, setDealForm] = useState({
    title: "", value: "", probability: "30", expectedClose: "",
    accountId: "", contactId: "", source: "", stage: "prospect" as string,
  });
  const [movingDeal, setMovingDeal] = useState<string | null>(null);
  const [showStageConfig, setShowStageConfig] = useState(false);
  const [stageDraft, setStageDraft] = useState<Array<{ key: string; label: string; color: string; rank: number; active: boolean }>>([]);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: "", industry: "", tier: "smb" as "enterprise" | "mid_market" | "smb", website: "" });
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [editAccountForm, setEditAccountForm] = useState({ name: "", industry: "", tier: "smb" as "enterprise" | "mid_market" | "smb", website: "" });
  const [showArchivedAccounts, setShowArchivedAccounts] = useState(false);
  const [showArchivedContacts, setShowArchivedContacts] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [contactForm, setContactForm] = useState({ firstName: "", lastName: "", email: "", phone: "", title: "", accountId: "" });
  const [editingContact, setEditingContact] = useState<any | null>(null);
  const [editContactForm, setEditContactForm] = useState({ firstName: "", lastName: "", email: "", phone: "", title: "", accountId: "" });
  const [showArchivedLeads, setShowArchivedLeads] = useState(false);
  const [showNewLead, setShowNewLead] = useState(false);
  const [leadForm, setLeadForm] = useState({ firstName: "", lastName: "", email: "", company: "", title: "", phone: "", source: "website" as string });
  const [importKind, setImportKind] = useState<null | "leads" | "contacts" | "deals">(null);
  const importLeads = trpc.ingest.importLeads.useMutation();
  const importContacts = trpc.ingest.importContacts.useMutation();
  const importDeals = trpc.ingest.importDeals.useMutation();
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [newQuoteDesc, setNewQuoteDesc] = useState("");
  const [showNewActivity, setShowNewActivity] = useState(false);
  const [activityForm, setActivityForm] = useState({
    type: "call", subject: "", description: "", dealId: "", accountId: "", contactId: "",
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
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: dealsData, refetch: refetchDeals } = trpc.crm.listDeals.useQuery({ limit: 200 }, mergeTrpcQueryOpts("crm.listDeals", undefined));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: accountsData, refetch: refetchAccounts } = trpc.crm.listAccounts.useQuery({ limit: 200, showArchived: showArchivedAccounts }, mergeTrpcQueryOpts("crm.listAccounts", undefined));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: contactsData, refetch: refetchContacts } = trpc.crm.listContacts.useQuery({ limit: 200, showArchived: showArchivedContacts }, mergeTrpcQueryOpts("crm.listContacts", undefined));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: leadsData, refetch: refetchLeads } = trpc.crm.listLeads.useQuery({ limit: 200, showArchived: showArchivedLeads }, mergeTrpcQueryOpts("crm.listLeads", undefined));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: activitiesData, refetch: refetchActivities } = trpc.crm.listActivities.useQuery({ limit: 200, showArchived: showArchivedActivities }, mergeTrpcQueryOpts("crm.listActivities", undefined));
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: quotesData, refetch: refetchQuotes } = trpc.crm.listQuotes.useQuery({}, mergeTrpcQueryOpts("crm.listQuotes", undefined));

  // Mutations
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const convertLead = trpc.crm.convertLead.useMutation({
    onSuccess: (res: any) => { toast.success(`Lead converted to account: ${res?.account?.name ?? ""}`); refetchLeads(); refetchAccounts(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const updateLeadMutation = trpc.crm.updateLead.useMutation({
    onSuccess: () => { toast.success("Lead updated"); refetchLeads(); setEditingLead(null); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update lead"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const createQuoteMutation = trpc.crm.createQuote.useMutation({
    onSuccess: (q: any) => { toast.success(`Quote ${q?.quoteNumber ?? ""} created`); refetchQuotes(); setShowNewQuote(false); setNewQuoteDesc(""); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create quote"),
  });
  const createActivity = trpc.crm.createActivity.useMutation({
    onSuccess: () => {
      toast.success("Activity logged");
      refetchActivities();
      setShowNewActivity(false);
      setActivityForm({ type: "call", subject: "", description: "", dealId: "", accountId: "", contactId: "", outcome: "", scheduledAt: "", completedAt: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const updateActivity = trpc.crm.updateActivity.useMutation({
    onSuccess: () => {
      toast.success("Activity updated");
      refetchActivities();
      setEditingActivity(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const movePipeline = trpc.crm.movePipeline.useMutation({
    onSuccess: () => { toast.success("Deal stage updated"); refetchDeals(); setMovingDeal(null); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  const dealThresholdsQ = trpc.crm.dealApprovalThresholds.get.useQuery(
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
      ? [...rows].sort((a, b) => a.rank - b.rank).map((r) => ({ key: r.key, label: r.label, color: r.color, rank: r.rank, active: r.active }))
      : allStagesOrdered.map((k, i) => ({ key: k, label: stageCfg[k]?.label ?? k, color: stageCfg[k]?.color ?? "text-muted-foreground bg-muted", rank: i, active: pipelineStages.includes(k) }));
    setStageDraft(base);
    setShowStageConfig(true);
  }

  const approveDealWon = trpc.crm.approveDealWon.useMutation({
    onSuccess: () => {
      toast.success("Deal close approval recorded");
      refetchDeals();
    },
    onError: (e: { message?: string }) => toast.error(e.message ?? "Approval failed"),
  });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const createDeal = trpc.crm.createDeal.useMutation({
    onSuccess: () => {
      toast.success("Deal created");
      refetchDeals();
      setShowNewDeal(false);
      setDealForm({ title: "", value: "", probability: "30", expectedClose: "", accountId: "", contactId: "", source: "", stage: "prospect" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create deal"),
  });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const createAccountMutation = trpc.crm.createAccount.useMutation({
    onSuccess: () => { toast.success("Account created"); refetchAccounts(); setShowNewAccount(false); setAccountForm({ name: "", industry: "", tier: "smb", website: "" }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create account"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const updateAccountMutation = trpc.crm.updateAccount.useMutation({
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
  const createContactMutation = trpc.crm.createContact.useMutation({
    onSuccess: () => { toast.success("Contact created"); refetchContacts(); setShowNewContact(false); setContactForm({ firstName: "", lastName: "", email: "", phone: "", title: "", accountId: "" }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create contact"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const updateContactMutation = trpc.crm.updateContact.useMutation({
    onSuccess: () => { toast.success("Contact updated"); refetchContacts(); setEditingContact(null); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update contact"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const updateQuote = trpc.crm.updateQuote.useMutation({
    onSuccess: (q: any) => { toast.success(`Quote ${q?.quoteNumber ?? ""} updated`); refetchQuotes(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const createLeadMutation = trpc.crm.createLead.useMutation({
    onSuccess: () => {
      toast.success("Lead created");
      refetchLeads();
      setShowNewLead(false);
      setLeadForm({ firstName: "", lastName: "", email: "", company: "", title: "", phone: "", source: "website" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create lead"),
  });

  if (!can("accounts", "read")) return <AccessDenied module="CRM & Sales" />;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const DEALS_LIVE = ((dealsData as any[]) ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ACCOUNTS_LIVE = ((accountsData as any[]) ?? []) as any[];

  // Build live leaderboard from closed_won deals
  const leaderboardMap = new Map<string, { ownerId: string; won: number; deals: number }>();
  DEALS_LIVE.filter((d: any) => d.stage === "closed_won").forEach((d: any) => {
    const key = d.ownerId ?? "unknown";
    const existing = leaderboardMap.get(key) ?? { ownerId: key, won: 0, deals: 0 };
    leaderboardMap.set(key, { ...existing, won: existing.won + Number(d.value ?? 0), deals: existing.deals + 1 });
  });
  const leaderboard = Array.from(leaderboardMap.values()).sort((a, b) => b.won - a.won).slice(0, 5);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CONTACTS_LIVE = ((contactsData as any[]) ?? []) as any[];
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
  const QUOTES_LIVE = ((quotesData as any[]) ?? []) as any[];

  const activeDeals = DEALS_LIVE.filter((d: any) => !["closed_won", "closed_lost"].includes(d.stage ?? ""));
  const wonDeals = DEALS_LIVE.filter((d: any) => d.stage === "closed_won");
  const lostDeals = DEALS_LIVE.filter((d: any) => d.stage === "closed_lost");
  const totalPipeline = activeDeals.reduce((s: number, d: any) => s + (Number(d.value) || d.amount || 0) * ((d.probability ?? 50) / 100), 0);
  const grossPipeline = activeDeals.reduce((s: number, d: any) => s + (Number(d.value) || d.amount || 0), 0);
  const totalWon = wonDeals.reduce((s: number, d: any) => s + (Number(d.value) || d.amount || 0), 0);
  const closedCount = DEALS_LIVE.filter((d: any) => ["closed_won", "closed_lost"].includes(d.stage ?? "")).length;
  const winRate = closedCount > 0 ? Math.round((wonDeals.length / closedCount) * 100) : 0;

  // Look up account name from loaded accounts (avoids needing a join in listDeals)
  const accountNameMap = new Map<string, string>(ACCOUNTS_LIVE.map((a: any) => [a.id, a.name]));
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
              })),
            );
            refetchContacts();
            toast.success(`${res.imported} contacts imported`);
            return { imported: res.imported };
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg p-5">
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
                <input type="number" min="0" max="100" className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={dealForm.probability} onChange={(e) => setDealForm(f => ({ ...f, probability: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Stage *</label>
                <select className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={dealForm.stage} onChange={(e) => setDealForm(f => ({ ...f, stage: e.target.value }))}>
                  {pipelineStages.map(s => (
                    <option key={s} value={s}>{stageCfg[s]?.label ?? s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Expected Close Date *</label>
                <input type="date" className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={dealForm.expectedClose} onChange={(e) => setDealForm(f => ({ ...f, expectedClose: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Lead Source *</label>
                <select className="w-full mt-1 text-caption border border-border rounded px-2 py-1.5 bg-background" value={dealForm.source} onChange={(e) => setDealForm(f => ({ ...f, source: e.target.value }))}>
                  <option value="">— Select source —</option>
                  {["Inbound / Website", "Inbound / Trial", "Direct / Outbound", "Partner Referral", "LinkedIn Outbound", "Upsell / Existing Customer", "Event / Conference", "SDR / Cold Outreach", "Webinar Attendee", "Other"].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                disabled={!dealForm.title || !dealForm.accountId || !dealForm.contactId || !dealForm.value || !dealForm.probability || !dealForm.stage || !dealForm.expectedClose || !dealForm.source || createDeal.isPending}
                onClick={() => createDeal.mutate({
                  title: dealForm.title,
                  value: dealForm.value || undefined,
                  probability: Number(dealForm.probability) || 30,
                  expectedClose: dealForm.expectedClose || undefined,
                  accountId: dealForm.accountId || undefined,
                  contactId: dealForm.contactId || undefined,
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
                <button onClick={() => setMovingDeal(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
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
              <div className="flex flex-col gap-1.5">
                {allStagesOrdered.map(s => {
                  const isClosedWon = moving?.stage === "closed_won";
                  const isActiveStage = pipelineStages.includes(s);
                  const isRestricted = isClosedWon && isActiveStage;
                  return (
                    <button
                      key={s}
                      onClick={() => movePipeline.mutate({ id: movingDeal, stage: s })}
                      disabled={movePipeline.isPending || isRestricted}
                      className={cn(
                        "px-3 py-1.5 rounded text-[11px] text-left hover:bg-primary hover:text-white border border-border transition-colors disabled:opacity-50",
                        stageCfg[s]?.color ?? "",
                        isRestricted && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-inherit"
                      )}
                      title={isRestricted ? "Cannot move a Closed Won deal back to an active stage" : undefined}
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

      {showStageConfig && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowStageConfig(false)}>
          <div data-testid="stage-config-modal" className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-body-sm font-semibold text-foreground">Configure Pipeline Stages</h3>
              <button onClick={() => setShowStageConfig(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-[11px] text-muted-foreground">Rename stages, adjust order, and choose which appear as active pipeline columns. Stage keys are fixed; only presentation changes.</p>
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
          <span className="text-[11px] text-muted-foreground/70">Pipeline · Accounts · Contacts · Leads · Quotes</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadCSV(ACCOUNTS_LIVE.map((a: any) => ({ Name: a.name ?? a.companyName ?? "", Industry: a.industry ?? "", ARR: a.arr ?? "", Health: a.healthScore ?? "", CSM: a.csm ?? "", Status: a.status ?? "" })), "crm_export")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Download className="w-3 h-3" /> Export
          </button>
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
                        <div className="font-mono font-bold text-[12px] text-foreground">₹{(deal.value / 1000).toFixed(0)}K</div>
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
                <button onClick={() => createActivity.mutate({ type: "call", subject: "Quick activity log", description: "" })} disabled={createActivity.isPending} className="text-primary hover:underline text-[11px] disabled:opacity-50">+ New</button>
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
                    <span className="text-[12px] text-foreground/80 flex-1 font-mono">{row.ownerId.slice(0, 8)}…</span>
                    <span className="font-mono font-bold text-[12px] text-foreground">₹{(row.won / 1000).toFixed(0)}K</span>
                    <span className="text-[11px] text-muted-foreground/70">{row.deals} deal{row.deals !== 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PIPELINE */}
        {tab === "pipeline" && (
          <div>
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">{DEALS_LIVE.filter(d => !["closed_won", "closed_lost"].includes(d.stage ?? "")).length} Active Deals</span>
              <PermissionGate module="accounts" action="write">
                {isAdmin() && (
                  <button data-testid="configure-stages-btn" onClick={openStageConfig} className="flex items-center gap-1 px-2.5 py-1 text-[11px] border border-border rounded hover:bg-accent">
                    <Settings className="w-3 h-3" /> Configure Stages
                  </button>
                )}
                <button onClick={() => setImportKind("deals")} className="flex items-center gap-1 px-2.5 py-1 text-[11px] border border-border rounded hover:bg-accent">
                  <Upload className="w-3 h-3" /> Import
                </button>
                <button onClick={() => setShowNewDeal(true)} className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-primary text-white rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> Add Deal
                </button>
              </PermissionGate>
            </div>
            <div className="flex overflow-x-auto p-4 gap-3 min-h-96">
              {allStagesOrdered.map((stage) => {
                const stageDeals = DEALS_LIVE.filter(d => d.stage === stage);
                const stageVal = stageDeals.reduce((s, d) => s + d.value, 0);
                const cfg = stageCfg[stage] ?? { label: stage.replace(/_/g, " "), color: "text-muted-foreground bg-muted" };
                return (
                  <div key={stage} className="flex-shrink-0 w-56 flex flex-col gap-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`status-badge ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-[11px] text-muted-foreground/70">₹{(stageVal / 1000).toFixed(0)}K</span>
                    </div>
                    {stageDeals.map((deal) => (
                      <Link key={deal.id} href={`/app/crm/deals/${deal.id}`} className="block border rounded p-3 hover:shadow-sm transition-shadow cursor-pointer bg-card border-border">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[10px] text-primary">{deal.number ?? "—"}</span>
                          <span className="text-[11px] text-muted-foreground/70">{deal.probability}%</span>
                        </div>
                        <p className="text-[12px] font-semibold text-foreground mb-0.5">{getDealAccountName(deal)}</p>
                        <p className="text-[11px] text-muted-foreground mb-0.5">{deal.title}</p>
                        {getDealContactName(deal) && (
                          <p className="text-[10px] text-muted-foreground/60 mb-1">{getDealContactName(deal)}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[12px] text-primary">₹{(deal.value / 1000).toFixed(0)}K</span>
                          <span className="text-[10px] text-muted-foreground/70">Close: {deal.closeDate?.slice(5) ?? deal.expectedClose?.toString()?.slice(5) ?? "—"}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1">
                          <span className="w-4 h-4 rounded-full bg-primary text-white text-[8px] flex items-center justify-center font-bold">
                            {(deal.owner ?? "").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70 flex-1">{deal.lastActivity ?? deal.updatedAt ?? ""}</span>
                          <PermissionGate module="accounts" action="write">
                            <button
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
        {tab === "accounts" && (
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
                  <th>Type</th>
                  <th>Tier</th>
                  <th>Country</th>
                  <th>Employees</th>
                  <th>Annual Revenue</th>
                  <th className="text-center">Open Opps</th>
                  <th>Total Revenue</th>
                  <th>Health</th>
                  <th>Owner</th>
                  <th>Last Contact</th>
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
                    <td><span className={`status-badge capitalize ${a.type === "customer" ? "text-green-700 bg-green-100" : a.type === "prospect" ? "text-blue-700 bg-blue-100" : "text-muted-foreground bg-muted"}`}>{a.type}</span></td>
                    <td><span className={`status-badge capitalize ${TIER_CFG[a.tier]}`}>{a.tier.replace("_", " ")}</span></td>
                    <td className="text-muted-foreground">{a.country}</td>
                    <td className="font-mono text-[11px] text-muted-foreground">{a.employees != null ? a.employees.toLocaleString() : "—"}</td>
                    <td className="font-mono text-[11px] text-muted-foreground">₹{((a.annualRevenue ?? 0) / 10000000).toFixed(0)}Cr</td>
                    <td className="text-center"><span className={`font-bold ${a.openOpps > 0 ? "text-primary" : "text-slate-300"}`}>{a.openOpps}</span></td>
                    <td className="font-mono text-[11px] font-bold text-foreground">{a.totalRevenue > 0 ? `₹${(a.totalRevenue / 1000).toFixed(0)}K` : "—"}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-6 h-1.5 rounded-full ${a.healthScore >= 80 ? "bg-green-500" : a.healthScore >= 60 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${a.healthScore * 0.4}px` }} />
                        <span className={`text-[11px] font-bold ${SCORE_COLOR(a.healthScore)}`}>{a.healthScore}</span>
                      </div>
                    </td>
                    <td className="text-muted-foreground">{a.owner}</td>
                    <td className="text-[11px] text-muted-foreground/70">{a.lastContact}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => { setEditingAccount(a); setEditAccountForm({ name: a.name ?? "", industry: a.industry ?? "", tier: a.tier ?? "smb", website: a.website ?? "" }); }} className="text-blue-500 hover:text-blue-600 px-1" title="Edit"><Pencil size={14} /></button>
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
        {tab === "contacts" && (
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
                  <button onClick={() => setImportKind("contacts")} className="flex items-center gap-1 px-2.5 py-1 text-[11px] border border-border rounded hover:bg-accent">
                    <Upload className="w-3 h-3" /> Import
                  </button>
                  <button onClick={() => setShowNewContact(true)} className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-primary text-white rounded hover:bg-primary/90">
                    <Plus className="w-3 h-3" /> Add Contact
                  </button>
                </PermissionGate>
              </div>
            </div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>Name</th>
                  <th>Title</th>
                  <th>Seniority</th>
                  <th>Account</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Department</th>
                  <th className="text-center">Open Deals</th>
                  <th>Owner</th>
                  <th>Last Activity</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {CONTACTS_LIVE.map((c) => (
                  <tr key={c.id} className={c.doNotContact ? "opacity-50" : ""}>
                    <td className="p-0"><div className={`priority-bar ${c.seniority === "c_level" ? "bg-red-500" : c.seniority === "vp" ? "bg-orange-500" : "bg-blue-400"}`} /></td>
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
                    <td>
                      <span
                        className={`status-badge capitalize ${SENIORITY_CFG[c.seniority ?? ""] ?? "text-muted-foreground bg-muted"}`}
                      >
                        {c.seniority ? c.seniority.replace("_", " ") : "—"}
                      </span>
                    </td>
                    <td className="text-primary hover:underline cursor-pointer">{c.account}</td>
                    <td className="text-muted-foreground text-[11px] font-mono">{c.email}</td>
                    <td className="text-muted-foreground text-[11px]">{c.phone}</td>
                    <td className="text-muted-foreground">{c.department}</td>
                    <td className="text-center"><span className={`font-bold ${c.openDeals > 0 ? "text-primary" : "text-slate-300"}`}>{c.openDeals}</span></td>
                    <td className="text-muted-foreground">{c.owner}</td>
                    <td className="text-[11px] text-muted-foreground/70">{c.lastActivity}</td>
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
                  <button onClick={() => setImportKind("leads")} className="flex items-center gap-1 px-2.5 py-1 text-[11px] border border-border rounded hover:bg-accent">
                    <Upload className="w-3 h-3" /> Import
                  </button>
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
                  <th>Campaign</th>
                  <th className="text-center">Score</th>
                  <th>Status</th>
                  <th>Owner</th>
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
                    <td className="text-[11px] text-muted-foreground/70">{l.campaign ?? "—"}</td>
                    <td className="text-center">
                      <span className={`font-mono font-bold text-[12px] ${SCORE_COLOR(l.score)}`}>{l.score}</span>
                    </td>
                    <td><span className={`status-badge capitalize ${LEAD_STATUS_CFG[l.status as LeadStatus]}`}>{l.status}</span></td>
                    <td className="text-muted-foreground">{l.owner}</td>
                    <td className="text-[11px] text-muted-foreground/70">{l.lastActivity}</td>
                    <td>
                      <div className="flex gap-1.5">
                        {l.status === "qualified" && <button onClick={() => convertLead.mutate({ id: l.id, dealTitle: l.company ?? "New Deal" })} disabled={convertLead.isPending} className="text-[11px] text-green-700 hover:underline font-medium disabled:opacity-50">Convert</button>}
                        <button
                          onClick={() => { setEditingLead(l); setEditLeadForm({ firstName: l.firstName, lastName: l.lastName, email: l.email ?? "", company: l.company ?? "", title: l.title ?? "", phone: l.phone ?? "", status: l.status, source: l.source }); }}
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

        {/* ACTIVITIES */}
        {tab === "activities" && (
          <div>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/30">
              <span className="text-[12px] font-semibold text-foreground/80">{ACTIVITIES_LIVE.length} {showArchivedActivities ? "Archived Activities" : "Activities"}</span>
              <div className="flex items-center gap-2 ml-auto">
                <select
                  className="text-[11px] px-2 py-1 border border-border rounded bg-background"
                  value={showArchivedActivities ? "archived" : "active"}
                  onChange={(e) => setShowArchivedActivities(e.target.value === "archived")}
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
                <button onClick={() => setShowNewActivity(true)} className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                  <Plus className="w-3 h-3" /> Log Activity
                </button>
              </div>
            </div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>Type</th>
                  <th>Subject</th>
                  <th>Account</th>
                  <th>Contact</th>
                  <th>Deal</th>
                  <th>Due / Completed</th>
                  <th>Outcome / Notes</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVITIES_LIVE.map((a: any) => {
                  const cfg = ACTIVITY_TYPE_CFG[a.type as ActivityType] ?? { color: "bg-muted", label: a.type ?? "Activity", icon: "" };
                  return (
                    <tr key={a.id} className={a.completed ? "opacity-60" : ""}>
                      <td className="p-0"><div className={`priority-bar ${a.completed ? "bg-green-500" : "bg-blue-400"}`} /></td>
                      <td><span className={`status-badge capitalize ${cfg.color}`}>{("icon" in cfg ? cfg.icon : "")} {a.type.replace("_", " ")}</span></td>
                      <td className="font-medium text-foreground">{a.subject}</td>
                      <td className="text-primary hover:underline cursor-pointer">{a.account || "—"}</td>
                      <td className="text-muted-foreground">{a.contact || "—"}</td>
                      <td className="font-mono text-[11px] text-primary">{a.deal ?? "—"}</td>
                      <td className="text-[11px] text-muted-foreground">
                        <div>Due: {a.dueDate}</div>
                        <div>Completed: {a.completedDate}</div>
                      </td>
                      <td className="max-w-xs text-[11px] text-muted-foreground" title={a.description}>{a.outcome ?? a.description ?? "—"}</td>
                      <td>
                        <span className={`status-badge ${a.completedAt ? "text-green-700 bg-green-100" : "text-blue-700 bg-blue-100"}`}>
                          {a.completedAt ? "✓ Done" : "Pending"}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              setEditingActivity(a);
                              setEditActivityForm({
                                type: a.type ?? "call",
                                subject: a.subject ?? "",
                                description: a.description ?? "",
                                dealId: a.dealId ?? "",
                                accountId: a.accountId ?? "",
                                contactId: a.contactId ?? "",
                                outcome: a.outcome ?? "",
                                scheduledAt: a.scheduledAt ? new Date(a.scheduledAt).toISOString().slice(0, 16) : "",
                                completedAt: a.completedAt ? new Date(a.completedAt).toISOString().slice(0, 16) : "",
                              });
                            }}
                            className="text-[11px] text-primary hover:underline"
                          >Edit</button>
                          {a.archived ? (
                            <button onClick={() => updateActivity.mutate({ id: a.id, archived: false })} className="text-green-500 hover:text-green-600">Unarchive</button>
                          ) : (
                            <button onClick={() => updateActivity.mutate({ id: a.id, archived: true })} className="text-amber-500 hover:text-amber-600">Archive</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* QUOTES */}
        {tab === "quotes" && (
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
                        <span className="font-mono text-[11px] text-primary">{q.number}</span>
                        <span className={`status-badge capitalize ${QUOTE_STATUS_CFG[q.status]}`}>{q.status}</span>
                        <span className="text-[11px] text-muted-foreground/70">Valid until: {q.validUntil}</span>
                        {q.deal && <span className="font-mono text-[11px] text-primary">{q.deal}</span>}
                      </div>
                      <p className="text-[13px] font-semibold text-foreground">{q.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Account: <strong>{q.account}</strong> · Owner: {q.owner} · Created: {q.created}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[18px] font-bold text-foreground">₹{(q.total ?? 0).toLocaleString("en-IN")}</div>
                      <div className="text-[11px] text-muted-foreground/70">{q.currency} · {q.lineItems.length} line items</div>
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
                              <td className="font-mono text-[11px]">₹{(li.unitPrice ?? 0).toLocaleString("en-IN")}</td>
                              <td className="text-center text-[11px]">{li.discount > 0 ? `${li.discount}%` : "—"}</td>
                              <td className="font-mono font-bold text-foreground">₹{(li.total ?? 0).toLocaleString("en-IN")}</td>
                            </tr>
                          ))}
                          <tr className="bg-card">
                            <td colSpan={5} />
                            <td className="text-right text-[11px] text-muted-foreground font-semibold">Subtotal:</td>
                            <td className="font-mono text-foreground/80">₹{(q.subtotal ?? 0).toLocaleString("en-IN")}</td>
                          </tr>
                          {q.discount > 0 && (
                            <tr className="bg-card">
                              <td colSpan={5} />
                              <td className="text-right text-[11px] text-green-600 font-semibold">Discount:</td>
                              <td className="font-mono text-green-600">-₹{(q.discount ?? 0).toLocaleString("en-IN")}</td>
                            </tr>
                          )}
                          <tr className="bg-card font-bold">
                            <td colSpan={5} />
                            <td className="text-right text-[12px] text-foreground font-bold">TOTAL:</td>
                            <td className="font-mono text-[14px] font-black text-foreground">₹{(q.total ?? 0).toLocaleString("en-IN")}</td>
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
                          onClick={() => downloadCSV([{ Quote_Number: q.quoteNumber ?? q.id, Deal_ID: q.dealId ?? "", Total: q.total, Currency: "INR", Status: q.status, Valid_Until: q.validUntil ?? "" }], `quote_${q.quoteNumber ?? q.id}`)}
                          className="px-3 py-1 border border-border text-[11px] rounded hover:bg-muted/30 text-muted-foreground"
                        >
                          <FileText className="w-3 h-3 inline mr-1" />Download PDF
                        </button>
                        <button
                          onClick={() => {
                            const newStatus = prompt(`Change quote status (current: ${q.status}):\ndraft / sent / viewed / accepted / declined / expired`);
                            if (newStatus && ["draft", "sent", "viewed", "accepted", "declined", "expired"].includes(newStatus)) {
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
        {tab === "analytics" && (
          <div className="p-4 grid grid-cols-2 gap-4">
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Revenue by Stage (Weighted)</div>
              <div className="p-3 space-y-2">
                {pipelineStages.map(stage => {
                  const deals = DEALS_LIVE.filter(d => d.stage === stage);
                  const weighted = deals.reduce((s, d) => s + d.value * (d.probability / 100), 0);
                  const cfg = stageCfg[stage] ?? { label: stage.replace(/_/g, " "), color: "text-muted-foreground bg-muted" };
                  return (
                    <div key={stage} className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground w-28 flex-shrink-0">{cfg.label}</span>
                      <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (weighted / 500000) * 100)}%` }} />
                      </div>
                      <span className="font-mono text-foreground/80 w-16 text-right">₹{(weighted / 1000).toFixed(0)}K</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Deals by Source</div>
              <div className="p-3 space-y-2">
                {["Inbound / Website", "Inbound / Trial", "Direct / Outbound", "Partner Referral", "LinkedIn Outbound", "Upsell / Existing Customer", "Event / Conference"].map((src) => {
                  const srcDeals = DEALS_LIVE.filter(d => d.source === src);
                  if (srcDeals.length === 0) return null;
                  const srcVal = srcDeals.reduce((s, d) => s + d.value, 0);
                  return (
                    <div key={src} className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground flex-1">{src}</span>
                      <span className="font-mono text-foreground/80">₹{(srcVal / 1000).toFixed(0)}K</span>
                      <span className="text-muted-foreground/70">({srcDeals.length})</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border border-border rounded overflow-hidden col-span-2">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Full Deals List</div>
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th className="w-4" />
                    <th>Opportunity</th>
                    <th>Account</th>
                    <th>Owner</th>
                    <th>Stage</th>
                    <th>Value</th>
                    <th>Probability</th>
                    <th>Weighted</th>
                    <th>Close Date</th>
                    <th>Source</th>
                    <th>Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {DEALS_LIVE.map((d) => {
                    const cfg = stageCfg[d.stage as DealStage] ?? { label: (d.stage ?? "—").replace(/_/g, " "), color: "text-muted-foreground bg-muted" };
                    return (
                      <tr key={d.id} className={d.stage === "closed_lost" ? "opacity-50" : ""}>
                        <td className="p-0"><div className={`priority-bar ${d.stage === "closed_won" ? "bg-green-500" : d.stage === "closed_lost" ? "bg-red-500" : "bg-blue-400"}`} /></td>
                        <td className="font-mono text-[11px] text-primary">{d.number}</td>
                        <td className="font-medium text-foreground">{d.account}</td>
                        <td className="text-muted-foreground">{d.owner}</td>
                        <td><span className={`status-badge ${cfg.color}`}>{cfg.label}</span></td>
                        <td className="font-mono font-bold text-foreground">₹{(d.value ?? 0).toLocaleString("en-IN")}</td>
                        <td className="font-mono text-muted-foreground">{d.probability}%</td>
                        <td className="font-mono font-semibold text-primary">₹{((d.value ?? 0) * ((d.probability ?? 0) / 100)).toLocaleString("en-IN")}</td>
                        <td className="text-muted-foreground text-[11px]">{d.closeDate}</td>
                        <td className="text-muted-foreground/70 text-[11px]">{d.source}</td>
                        <td className="text-muted-foreground/70 text-[11px]">{d.lastActivity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit Lead Modal */}
      {editingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-body-sm font-semibold">Edit Lead: {editingLead.firstName} {editingLead.lastName}</h2>
              <button onClick={() => setEditingLead(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-3">
              {(["firstName", "lastName", "email", "company", "title"] as const).map((f) => (
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
                  {["new", "contacted", "qualified", "disqualified"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border bg-muted/20 flex justify-end gap-2">
              <button onClick={() => setEditingLead(null)} className="px-3 py-1.5 text-[12px] border border-border rounded hover:bg-muted/30">Cancel</button>
              <button
                disabled={updateLeadMutation.isPending}
                onClick={() => {
                  if (/^[0-9a-f-]{36}$/i.test(editingLead.id)) {
                    updateLeadMutation.mutate({ id: editingLead.id, ...editLeadForm, status: editLeadForm.status as any });
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

      {/* New Quote Modal */}
      {showNewQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm mx-4">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-body-sm font-semibold">New Quote</h2>
              <button onClick={() => setShowNewQuote(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Description / Item</label>
                <input
                  value={newQuoteDesc}
                  onChange={(e) => setNewQuoteDesc(e.target.value)}
                  placeholder="e.g. CoheronConnect Enterprise License"
                  className="w-full border border-border rounded px-3 py-1.5 text-[13px] bg-card outline-none"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border bg-muted/20 flex justify-end gap-2">
              <button onClick={() => setShowNewQuote(false)} className="px-3 py-1.5 text-[12px] border border-border rounded hover:bg-muted/30">Cancel</button>
              <button
                disabled={createQuoteMutation.isPending || !newQuoteDesc.trim()}
                onClick={() => createQuoteMutation.mutate({ items: [{ description: newQuoteDesc, quantity: 1, unitPrice: "0", total: "0" }] })}
                className="px-4 py-1.5 text-[12px] bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60"
              >
                {createQuoteMutation.isPending ? "Creating…" : "Create Quote"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showNewAccount && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm p-5">
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
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowNewAccount(false)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={() => { if (!accountForm.name.trim()) { toast.error("Company name is required"); return; } if (!accountForm.industry.trim()) { toast.error("Industry is required"); return; } if (!accountForm.website.trim()) { toast.error("Website is required"); return; } if (!accountForm.website.startsWith("https://")) { toast.error("Please enter a valid website URL starting with https://"); return; } createAccountMutation.mutate({ name: accountForm.name.trim(), industry: accountForm.industry.trim(), tier: accountForm.tier, website: accountForm.website.trim() }); }}
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
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm p-5">
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
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditingAccount(null)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={() => { if (!editAccountForm.name.trim()) { toast.error("Company name is required"); return; } if (!editAccountForm.industry.trim()) { toast.error("Industry is required"); return; } if (!editAccountForm.website.trim()) { toast.error("Website is required"); return; } if (!editAccountForm.website.startsWith("http://") && !editAccountForm.website.startsWith("https://")) { toast.error("Please enter a valid website URL starting with http:// or https://"); return; } updateAccountMutation.mutate({ id: editingAccount.id, name: editAccountForm.name.trim(), industry: editAccountForm.industry.trim(), tier: editAccountForm.tier, website: editAccountForm.website.trim() }); }}
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
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm p-5">
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
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-body-sm font-bold">New Lead</h2>
              <button onClick={() => setShowNewLead(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
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
                  {["website", "linkedin", "partner_referral", "event", "cold_outreach", "webinar", "trial", "other"].map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowNewLead(false)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                disabled={!leadForm.firstName.trim() || !leadForm.lastName.trim() || !leadForm.company.trim() || !leadForm.email.trim() || !leadForm.phone.trim() || createLeadMutation.isPending}
                onClick={() => createLeadMutation.mutate({ firstName: leadForm.firstName.trim(), lastName: leadForm.lastName.trim(), email: leadForm.email.trim(), phone: leadForm.phone.trim(), company: leadForm.company.trim(), title: leadForm.title.trim() || undefined, source: leadForm.source as "other" | "website" | "event" | "partner" | "referral" | "cold_outreach" | "advertising" })}
                className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              >{createLeadMutation.isPending ? "Creating…" : "Create Lead"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Lead Modal */}
      {editingLead && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-body-sm font-bold">Edit Lead</h2>
              <button onClick={() => setEditingLead(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">First Name *</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editLeadForm.firstName} onChange={(e) => setEditLeadForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Last Name *</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editLeadForm.lastName} onChange={(e) => setEditLeadForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Company *</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editLeadForm.company} onChange={(e) => setEditLeadForm(f => ({ ...f, company: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Job Title</label>
                <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editLeadForm.title} onChange={(e) => setEditLeadForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Phone *</label>
                <input type="tel" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editLeadForm.phone} onChange={(e) => setEditLeadForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Email *</label>
                <input type="email" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={editLeadForm.email} onChange={(e) => setEditLeadForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditingLead(null)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                disabled={!editLeadForm.firstName.trim() || !editLeadForm.lastName.trim() || !editLeadForm.company.trim() || !editLeadForm.email.trim() || !editLeadForm.phone.trim() || updateLeadMutation.isPending}
                onClick={() => updateLeadMutation.mutate({ id: editingLead.id, firstName: editLeadForm.firstName.trim(), lastName: editLeadForm.lastName.trim(), email: editLeadForm.email.trim(), phone: editLeadForm.phone.trim(), company: editLeadForm.company.trim(), title: editLeadForm.title.trim() || undefined })}
                className="flex-1 px-3 py-1.5 text-caption bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              >{updateLeadMutation.isPending ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {/* New Activity Modal */}
      {showNewActivity && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-body-sm font-bold">Log Activity</h2>
              <button onClick={() => setShowNewActivity(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
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
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Account *</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={activityForm.accountId} onChange={(e) => setActivityForm(f => ({ ...f, accountId: e.target.value }))}>
                  <option value="">— Select Account —</option>
                  {ACCOUNTS_LIVE.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Contact *</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={activityForm.contactId} onChange={(e) => setActivityForm(f => ({ ...f, contactId: e.target.value }))}>
                  <option value="">— Select Contact —</option>
                  {CONTACTS_LIVE.map((c: any) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Deal</label>
                <select className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" value={activityForm.dealId} onChange={(e) => setActivityForm(f => ({ ...f, dealId: e.target.value }))}>
                  <option value="">— Select Deal —</option>
                  {DEALS_LIVE.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}
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
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowNewActivity(false)} className="flex-1 px-3 py-1.5 text-caption border border-border rounded hover:bg-accent">Cancel</button>
              <button
                disabled={!activityForm.accountId || !activityForm.contactId || createActivity.isPending}
                onClick={() => createActivity.mutate({
                  type: (activityForm.type || undefined) as "email" | "note" | "call" | "meeting" | "demo" | "follow_up" | undefined,
                  subject: activityForm.subject.trim() || undefined,
                  description: activityForm.description.trim() || undefined,
                  dealId: activityForm.dealId || undefined,
                  accountId: activityForm.accountId,
                  contactId: activityForm.contactId,
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
