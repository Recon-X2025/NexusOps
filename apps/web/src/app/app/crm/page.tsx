"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  TrendingUp, Users, Building2, Phone, Mail, Calendar, Star,
  Plus, Search, Download, ChevronRight, MoreHorizontal,
  Target, DollarSign, BarChart2, Activity, Tag, Repeat,
  Clock, CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight,
  FileText, Send, Filter, Globe, Briefcase, Award,
} from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { downloadCSV } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

const CRM_TABS = [
  { key: "dashboard",  label: "Dashboard",       module: "accounts"  as const, action: "read"  as const },
  { key: "pipeline",   label: "Pipeline",         module: "accounts"  as const, action: "write" as const },
  { key: "accounts",   label: "Accounts",         module: "accounts"  as const, action: "read"  as const },
  { key: "contacts",   label: "Contacts",         module: "accounts"  as const, action: "read"  as const },
  { key: "leads",      label: "Leads",            module: "accounts"  as const, action: "read"  as const },
  { key: "activities", label: "Activities",       module: "accounts"  as const, action: "read"  as const },
  { key: "quotes",     label: "Quotes",           module: "accounts"  as const, action: "write" as const },
  { key: "analytics",  label: "Sales Analytics",  module: "analytics" as const, action: "read"  as const },
];

type DealStage = "prospect" | "qualified" | "proposal" | "negotiation" | "verbal_commit" | "closed_won" | "closed_lost";
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

const DEALS: Deal[] = [
  { id: "deal-001", number: "OPP-2026-0088", name: "NexusOps Platform — Enterprise License (Acme Corp)", account: "Acme Corporation", contact: "Jennifer Walsh (CTO)", owner: "Morgan Lee", stage: "negotiation", value: 31540000, currency: "INR", probability: 75, closeDate: "2026-04-30", created: "2026-01-15", lastActivity: "2 hours ago", source: "Direct / Outbound", products: ["NexusOps Enterprise", "Professional Services 80h", "3yr Support"] },
  { id: "deal-002", number: "OPP-2026-0087", name: "ITSM + SecOps Bundle — Globex Industries", account: "Globex Industries", contact: "Marcus Chen (VP IT)", owner: "Alex Rivera", stage: "proposal", value: 17845000, currency: "INR", probability: 55, closeDate: "2026-05-15", created: "2026-02-01", lastActivity: "Yesterday", source: "Partner Referral", products: ["NexusOps ITSM", "NexusOps SecOps", "1yr Support"] },
  { id: "deal-003", number: "OPP-2026-0086", name: "Procurement Module Add-on — Initech", account: "Initech LLC", contact: "Bill Lumbergh (CEO)", owner: "Taylor Patel", stage: "closed_won", value: 5644000, currency: "INR", probability: 100, closeDate: "2026-03-15", created: "2026-01-20", lastActivity: "2026-03-15", source: "Upsell / Existing Customer", products: ["Procurement Module", "6mo Support"] },
  { id: "deal-004", number: "OPP-2026-0085", name: "GRC & Compliance Platform — Umbrella Corp", account: "Umbrella Corporation", contact: "Albert Wesker (CISO)", owner: "Dana Kim", stage: "verbal_commit", value: 41085000, currency: "INR", probability: 90, closeDate: "2026-04-15", created: "2026-01-08", lastActivity: "Today", source: "Inbound / Website", products: ["NexusOps GRC", "NexusOps SecOps", "5yr Enterprise", "Implementation 200h"] },
  { id: "deal-005", number: "OPP-2026-0084", name: "HR Service Delivery — Massive Dynamic", account: "Massive Dynamic", contact: "Nina Sharp (CHRO)", owner: "Morgan Lee", stage: "qualified", value: 11786000, currency: "INR", probability: 35, closeDate: "2026-06-30", created: "2026-03-01", lastActivity: "3 days ago", source: "LinkedIn Outbound", products: ["NexusOps HRSD", "2yr Support"] },
  { id: "deal-006", number: "OPP-2026-0083", name: "NexusOps Full Stack — Soylent Corp", account: "Soylent Corp", contact: "Frank Grimes (CIO)", owner: "Alex Rivera", stage: "prospect", value: 68060000, currency: "INR", probability: 15, closeDate: "2026-09-30", created: "2026-03-20", lastActivity: "2 days ago", source: "Event / Conference", products: ["NexusOps Enterprise (Full Stack)"] },
  { id: "deal-007", number: "OPP-2026-0082", name: "CSM Platform — Vandelay Industries", account: "Vandelay Industries", contact: "Art Vandelay (CEO)", owner: "Taylor Patel", stage: "closed_lost", value: 14525000, currency: "INR", probability: 0, closeDate: "2026-03-20", created: "2026-01-25", lastActivity: "2026-03-20", source: "Inbound / Trial", products: ["NexusOps CSM"], notes: "Lost to Zendesk on price. Revisit in 18 months." },
];

const ACCOUNTS: Account[] = [
  { id: "acc-001", name: "Acme Corporation",      industry: "Manufacturing",        type: "customer",   website: "acme.com",       country: "USA", employees: 8500,  annualRevenue: 2400000000, owner: "Morgan Lee",   openOpps: 1, totalDeals: 3, totalRevenue: 480000, healthScore: 82, tier: "enterprise",  lastContact: "Today" },
  { id: "acc-002", name: "Globex Industries",      industry: "Chemical / Energy",    type: "customer",   website: "globex.com",     country: "USA", employees: 12000, annualRevenue: 5100000000, owner: "Alex Rivera",  openOpps: 1, totalDeals: 2, totalRevenue: 215000, healthScore: 71, tier: "enterprise",  lastContact: "Yesterday" },
  { id: "acc-003", name: "Umbrella Corporation",   industry: "Pharmaceutical / BioTech", type: "prospect", website: "umbrellacorp.eu", country: "UK", employees: 22000, annualRevenue: 18000000000, owner: "Dana Kim", openOpps: 1, totalDeals: 0, totalRevenue: 0, healthScore: 94, tier: "enterprise", lastContact: "Today" },
  { id: "acc-004", name: "Initech LLC",            industry: "IT Services",          type: "customer",   website: "initech.com",    country: "USA", employees: 420,   annualRevenue: 85000000,  owner: "Taylor Patel", openOpps: 0, totalDeals: 4, totalRevenue: 210000, healthScore: 88, tier: "mid_market", lastContact: "2026-03-15" },
  { id: "acc-005", name: "Massive Dynamic",        industry: "R&D / Technology",     type: "prospect",   website: "massivedynamic.com", country: "USA", employees: 3400, annualRevenue: 890000000, owner: "Morgan Lee", openOpps: 1, totalDeals: 0, totalRevenue: 0, healthScore: 65, tier: "enterprise", lastContact: "3 days ago" },
  { id: "acc-006", name: "Soylent Corp",           industry: "Food / Consumer Goods",type: "prospect",   website: "soylent.com",    country: "USA", employees: 6200,  annualRevenue: 1800000000, owner: "Alex Rivera", openOpps: 1, totalDeals: 0, totalRevenue: 0, healthScore: 55, tier: "enterprise", lastContact: "2 days ago" },
  { id: "acc-007", name: "Vandelay Industries",    industry: "Import / Export",      type: "prospect",   website: "vandelay.com",   country: "USA", employees: 180,   annualRevenue: 42000000,  owner: "Taylor Patel", openOpps: 0, totalDeals: 1, totalRevenue: 0, healthScore: 40, tier: "smb",        lastContact: "2026-03-20" },
  { id: "acc-008", name: "Veridian Dynamics",      industry: "Defense / Aerospace",  type: "partner",    website: "veridian.com",   country: "USA", employees: 15000, annualRevenue: 8500000000, owner: "Morgan Lee",  openOpps: 0, totalDeals: 0, totalRevenue: 0, healthScore: 76, tier: "enterprise", lastContact: "2026-03-10" },
];

const CONTACTS: Contact[] = [
  { id: "con-001", firstName: "Jennifer", lastName: "Walsh",      title: "Chief Technology Officer", account: "Acme Corporation",  email: "j.walsh@acme.com",        phone: "+91-11-555-0101", department: "IT",       seniority: "c_level",     owner: "Morgan Lee",   lastActivity: "Today",     openDeals: 1, doNotContact: false },
  { id: "con-002", firstName: "Marcus",   lastName: "Chen",       title: "VP Information Technology", account: "Globex Industries", email: "m.chen@globex.com",        phone: "+91-80-555-0202", department: "IT",       seniority: "vp",          owner: "Alex Rivera",  lastActivity: "Yesterday", openDeals: 1, doNotContact: false },
  { id: "con-003", firstName: "Albert",   lastName: "Wesker",     title: "Chief Information Security Officer", account: "Umbrella Corporation", email: "a.wesker@umbrellacorp.eu", phone: "+91-22-555-0303", mobile: "+91-98765-00303", department: "Security", seniority: "c_level", owner: "Dana Kim",     lastActivity: "Today",     openDeals: 1, doNotContact: false },
  { id: "con-004", firstName: "Bill",     lastName: "Lumbergh",   title: "Chief Executive Officer",   account: "Initech LLC",       email: "b.lumbergh@initech.com",  phone: "+91-44-555-0404", department: "Executive",seniority: "c_level",     owner: "Taylor Patel", lastActivity: "2026-03-15",openDeals: 0, doNotContact: false },
  { id: "con-005", firstName: "Nina",     lastName: "Sharp",      title: "Chief Human Resources Officer", account: "Massive Dynamic", email: "n.sharp@massivedynamic.com", phone: "+91-20-555-0505", department: "HR",    seniority: "c_level",     owner: "Morgan Lee",   lastActivity: "3 days ago",openDeals: 1, doNotContact: false },
  { id: "con-006", firstName: "Frank",    lastName: "Grimes",     title: "Chief Information Officer", account: "Soylent Corp",      email: "f.grimes@soylent.com",    phone: "+91-33-555-0606", department: "IT",       seniority: "c_level",     owner: "Alex Rivera",  lastActivity: "2 days ago",openDeals: 1, doNotContact: false },
  { id: "con-007", firstName: "Art",      lastName: "Vandelay",   title: "Chief Executive Officer",   account: "Vandelay Industries", email: "art@vandelay.com",      phone: "+91-11-555-0707", department: "Executive",seniority: "c_level",     owner: "Taylor Patel", lastActivity: "2026-03-20",openDeals: 0, doNotContact: false },
  { id: "con-008", firstName: "Patricia", lastName: "Chen",       title: "Director of IT Operations", account: "Acme Corporation",  email: "p.chen@acme.com",         phone: "+91-11-555-0108", department: "IT",       seniority: "director",    owner: "Morgan Lee",   lastActivity: "Yesterday", openDeals: 1, doNotContact: false },
];

const LEADS: Lead[] = [
  { id: "lead-001", number: "LEAD-2026-0412", firstName: "Sarah",  lastName: "Connor",    email: "s.connor@cyberdyne.io",    company: "Cyberdyne Systems",  title: "VP Engineering", phone: "+91-40-555-1001", source: "Website / Demo Request", status: "qualified",  score: 88, owner: "Taylor Patel", created: "2026-03-22", lastActivity: "Today",      campaign: "Q1 ITSM Campaign" },
  { id: "lead-002", number: "LEAD-2026-0411", firstName: "John",   lastName: "Connor",    email: "j.connor@resistance.org",  company: "The Resistance",     title: "CTO",             source: "LinkedIn Ad",            status: "contacted",  score: 62, owner: "Morgan Lee",   created: "2026-03-20", lastActivity: "Yesterday",  campaign: "SecOps LinkedIn" },
  { id: "lead-003", number: "LEAD-2026-0410", firstName: "Ellen",  lastName: "Ripley",    email: "e.ripley@weyland-yutani.com", company: "Weyland-Yutani",  title: "Director of Operations", source: "Partner Referral",  status: "new",        score: 45, owner: "Alex Rivera",  created: "2026-03-24", lastActivity: "Just now",   campaign: null },
  { id: "lead-004", number: "LEAD-2026-0409", firstName: "Rick",   lastName: "Deckard",   email: "r.deckard@tyrell.corp",    company: "Tyrell Corporation", title: "Head of Security", source: "Webinar Attendee",      status: "nurturing",  score: 71, owner: "Dana Kim",     created: "2026-03-15", lastActivity: "3 days ago", campaign: "SecOps Webinar March" },
  { id: "lead-005", number: "LEAD-2026-0408", firstName: "Elroy",  lastName: "Jetson",    email: "e.jetson@spacely.com",     company: "Spacely Sprockets", title: "CISO",             source: "Inbound / Email",       status: "converted",  score: 95, owner: "Alex Rivera",  created: "2026-03-10", lastActivity: "2026-03-18", campaign: null },
  { id: "lead-006", number: "LEAD-2026-0407", firstName: "George", lastName: "Costanza",  email: "g.costanza@vandelay.com",  company: "Vandelay Industries",title: "Latex Salesman",  source: "Event / Trade Show",    status: "dead",       score: 12, owner: "Taylor Patel", created: "2026-02-15", lastActivity: "2026-02-20", campaign: null, notes: "Wrong contact, not a decision maker." },
];

const ACTIVITIES: SalesActivity[] = [
  { id: "act-001", type: "meeting",    subject: "QBR — NexusOps Platform Roadmap Review",      account: "Acme Corporation",  contact: "Jennifer Walsh",   owner: "Morgan Lee",   deal: "OPP-2026-0088", dueDate: "2026-03-25 10:00", completed: false, duration: 60 },
  { id: "act-002", type: "call",       subject: "Follow-up call — Contract negotiation terms",  account: "Acme Corporation",  contact: "Jennifer Walsh",   owner: "Morgan Lee",   deal: "OPP-2026-0088", dueDate: "2026-03-24 14:00", completed: true, completedDate: "2026-03-24 14:15", outcome: "Agreed on 3yr term. Legal to review T&Cs by 03-27.", duration: 45 },
  { id: "act-003", type: "email",      subject: "Proposal delivery — Umbrella Corp GRC",        account: "Umbrella Corporation",contact: "Albert Wesker",   owner: "Dana Kim",     deal: "OPP-2026-0085", dueDate: "2026-03-24 09:00", completed: true, completedDate: "2026-03-24 09:30", outcome: "Proposal sent. Verbal agreement to proceed.", duration: 0 },
  { id: "act-004", type: "demo",       subject: "Technical deep-dive — SecOps Module Demo",     account: "Globex Industries", contact: "Marcus Chen",      owner: "Alex Rivera",  deal: "OPP-2026-0087", dueDate: "2026-03-26 15:00", completed: false, duration: 90 },
  { id: "act-005", type: "follow_up",  subject: "Check-in: Massive Dynamic decision timeline",  account: "Massive Dynamic",   contact: "Nina Sharp",       owner: "Morgan Lee",   deal: "OPP-2026-0084", dueDate: "2026-03-25 11:00", completed: false, duration: 20 },
  { id: "act-006", type: "call",       subject: "Discovery call — Soylent Corp ITSM needs",     account: "Soylent Corp",      contact: "Frank Grimes",     owner: "Alex Rivera",  deal: "OPP-2026-0083", dueDate: "2026-03-22 10:00", completed: true, completedDate: "2026-03-22 10:20", outcome: "Strong interest in full stack. Budget ~₹8Cr. Multi-vendor eval.", duration: 20 },
  { id: "act-007", type: "task",       subject: "Prepare competitive analysis vs ServiceNow for Umbrella", account: "Umbrella Corporation", contact: "Albert Wesker", owner: "Dana Kim", dueDate: "2026-03-25 17:00", completed: false },
  { id: "act-008", type: "meeting",    subject: "LEAD qualification call — Sarah Connor / Cyberdyne", account: "Cyberdyne Systems", contact: "Sarah Connor", owner: "Taylor Patel", dueDate: "2026-03-25 13:00", completed: false, duration: 30 },
];

const QUOTES: Quote[] = [
  {
    id: "qte-001", number: "QTE-2026-0041", name: "NexusOps Enterprise — Acme Corp Proposal v3",
    account: "Acme Corporation", deal: "OPP-2026-0088", owner: "Morgan Lee",
    status: "sent", validUntil: "2026-04-30", created: "2026-03-22",
    currency: "INR", paymentTerms: "Net 45 — annual upfront",
    lineItems: [
      { line: 1, product: "NexusOps Enterprise License (3yr)", description: "Full platform — ITSM, SecOps, GRC, HRSD, PPM modules. Up to 500 users.", qty: 1, unitPrice: 24485000, discount: 10, total: 22036500 },
      { line: 2, product: "Professional Services — Implementation", description: "80 hours scoped implementation and configuration", qty: 80, unitPrice: 18675, discount: 0, total: 1494000 },
      { line: 3, product: "Premium 24x7 Support (3yr)", description: "SLA-backed 24/7 support with dedicated CSM", qty: 3, unitPrice: 2656000, discount: 5, total: 7570800 },
      { line: 4, product: "Training — Admin & User (5 sessions)", description: "Instructor-led training: 3 admin + 2 user sessions", qty: 5, unitPrice: 124500, discount: 0, total: 622500 },
    ],
    subtotal: 31723800, discount: 183800, tax: 0, total: 31540000,
    notes: "Quote valid for 30 days. Pricing subject to final contract terms. Multi-year discount applied.",
  },
  {
    id: "qte-002", number: "QTE-2026-0040", name: "NexusOps GRC + SecOps — Umbrella Corp v1",
    account: "Umbrella Corporation", deal: "OPP-2026-0085", owner: "Dana Kim",
    status: "viewed", validUntil: "2026-04-15", created: "2026-03-24",
    currency: "INR", paymentTerms: "Net 30 — annual upfront",
    lineItems: [
      { line: 1, product: "NexusOps GRC Module (5yr Enterprise)", description: "Risk, Audit, Policy, Compliance modules. Unlimited users.", qty: 1, unitPrice: 18260000, discount: 15, total: 15521000 },
      { line: 2, product: "NexusOps SecOps Module (5yr Enterprise)", description: "Vulnerability, Incidents, Threat Intel, SIEM integration.", qty: 1, unitPrice: 16185000, discount: 15, total: 13757250 },
      { line: 3, product: "Implementation Services", description: "200 hours premium implementation", qty: 200, unitPrice: 20750, discount: 0, total: 4150000 },
      { line: 4, product: "Dedicated CSM + Support (5yr)", description: "Named CSM + 24x7 SLA-backed support", qty: 5, unitPrice: 1535500, discount: 0, total: 7677500 },
    ],
    subtotal: 41105750, discount: 20750, tax: 0, total: 41085000,
    notes: "Pricing reflects strategic partner program tier. Subject to InfoSec review sign-off.",
  },
];

const STAGE_CFG: Record<DealStage, { label: string; color: string; order: number; icon: string }> = {
  prospect:      { label: "Prospect",      color: "text-muted-foreground bg-muted",   order: 0, icon: "○" },
  qualified:     { label: "Qualified",     color: "text-blue-700 bg-blue-100",     order: 1, icon: "◑" },
  proposal:      { label: "Proposal",      color: "text-indigo-700 bg-indigo-100", order: 2, icon: "◑" },
  negotiation:   { label: "Negotiation",   color: "text-purple-700 bg-purple-100", order: 3, icon: "◕" },
  verbal_commit: { label: "Verbal Commit", color: "text-orange-700 bg-orange-100", order: 4, icon: "◕" },
  closed_won:    { label: "Closed Won",    color: "text-green-700 bg-green-100",   order: 5, icon: "●" },
  closed_lost:   { label: "Closed Lost",   color: "text-red-700 bg-red-100",       order: 5, icon: "✕" },
};

const LEAD_STATUS_CFG: Record<LeadStatus, string> = {
  new:       "text-muted-foreground bg-muted",
  contacted: "text-blue-700 bg-blue-100",
  qualified: "text-green-700 bg-green-100",
  nurturing: "text-purple-700 bg-purple-100",
  converted: "text-emerald-700 bg-emerald-100",
  dead:      "text-red-400 bg-red-50",
};

const ACTIVITY_TYPE_CFG: Record<ActivityType, { color: string; icon: string }> = {
  call:       { color: "text-blue-600 bg-blue-100",    icon: "📞" },
  email:      { color: "text-indigo-600 bg-indigo-100",icon: "📧" },
  meeting:    { color: "text-purple-600 bg-purple-100",icon: "🤝" },
  demo:       { color: "text-orange-600 bg-orange-100",icon: "🖥" },
  follow_up:  { color: "text-green-600 bg-green-100",  icon: "🔔" },
  task:       { color: "text-muted-foreground bg-muted",  icon: "✓" },
};

const QUOTE_STATUS_CFG: Record<string, string> = {
  draft:    "text-muted-foreground bg-muted",
  sent:     "text-blue-700 bg-blue-100",
  viewed:   "text-purple-700 bg-purple-100",
  accepted: "text-green-700 bg-green-100",
  declined: "text-red-700 bg-red-100",
  expired:  "text-muted-foreground/70 bg-muted/30",
};

const TIER_CFG: Record<string, string> = {
  enterprise:  "text-purple-700 bg-purple-100",
  mid_market:  "text-blue-700 bg-blue-100",
  smb:         "text-muted-foreground bg-muted",
};

const SENIORITY_CFG: Record<string, string> = {
  c_level:    "text-red-700 bg-red-100",
  vp:         "text-orange-700 bg-orange-100",
  director:   "text-yellow-700 bg-yellow-100",
  manager:    "text-blue-700 bg-blue-100",
  individual: "text-muted-foreground bg-muted",
};

const SCORE_COLOR = (s: number) => s >= 80 ? "text-green-700" : s >= 60 ? "text-yellow-600" : "text-red-600";

const PIPELINE_STAGES: DealStage[] = ["prospect","qualified","proposal","negotiation","verbal_commit"];

export default function CRMPage() {
  const { can } = useRBAC();
  const visibleTabs = CRM_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "dashboard");
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [editLeadForm, setEditLeadForm] = useState({ firstName: "", lastName: "", email: "", company: "", title: "", status: "new" as string });
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [newQuoteDesc, setNewQuoteDesc] = useState("");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  // ── tRPC data ──────────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: dealsData, refetch: refetchDeals } = trpc.crm.listDeals.useQuery({ limit: 200 });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: accountsData, refetch: refetchAccounts } = trpc.crm.listAccounts.useQuery({ limit: 200 });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: contactsData } = trpc.crm.listContacts.useQuery({ limit: 200 });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: leadsData, refetch: refetchLeads } = trpc.crm.listLeads.useQuery({ limit: 200 });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: activitiesData, refetch: refetchActivities } = trpc.crm.listActivities.useQuery({ limit: 200 });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: quotesData, refetch: refetchQuotes } = trpc.crm.listQuotes.useQuery({});

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
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const createActivity = trpc.crm.createActivity.useMutation({
    onSuccess: () => { toast.success("Activity logged"); refetchActivities(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const movePipeline = trpc.crm.movePipeline.useMutation({
    onSuccess: () => { toast.success("Deal stage updated"); refetchDeals(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const updateQuote = trpc.crm.updateQuote.useMutation({
    onSuccess: (q: any) => { toast.success(`Quote ${q?.quoteNumber ?? ""} updated`); refetchQuotes(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  if (!can("accounts", "read")) return <AccessDenied module="CRM & Sales" />;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const DEALS_LIVE = ((dealsData as any[]) ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ACCOUNTS_LIVE = ((accountsData as any[]) ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CONTACTS_LIVE = ((contactsData as any[]) ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LEADS_LIVE = ((leadsData as any[]) ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ACTIVITIES_LIVE = ((activitiesData as any[]) ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const QUOTES_LIVE = ((quotesData as any[]) ?? []) as any[];

  const activeDeals = DEALS_LIVE.filter((d: any) => !["closed_won","closed_lost"].includes(d.stage ?? ""));
  const wonDeals    = DEALS_LIVE.filter((d: any) => d.stage === "closed_won");
  const lostDeals   = DEALS_LIVE.filter((d: any) => d.stage === "closed_lost");
  const totalPipeline = activeDeals.reduce((s: number, d: any) => s + (Number(d.value) || d.amount || 0) * ((d.probability ?? 50) / 100), 0);
  const totalWon = wonDeals.reduce((s: number, d: any) => s + (Number(d.value) || d.amount || 0), 0);
  const closedCount = DEALS_LIVE.filter((d: any) => ["closed_won","closed_lost"].includes(d.stage ?? "")).length;
  const winRate = closedCount > 0 ? Math.round((wonDeals.length / closedCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">CRM & Sales</h1>
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
            <button onClick={() => setTab("opportunities")} className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
              <Plus className="w-3 h-3" /> New Opportunity
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-6 gap-2">
        {[
          { label: "Pipeline (Weighted)", value: `₹${(totalPipeline/1000).toFixed(0)}K`, color: "text-blue-700",   sub: `${activeDeals.length} open deals` },
          { label: "Total Pipeline",      value: `₹${(activeDeals.reduce((s,d)=>s+d.value,0)/1000).toFixed(0)}K`, color: "text-foreground/80", sub: "gross value" },
          { label: "Closed Won (MTD)",    value: `₹${(totalWon/1000).toFixed(0)}K`, color: "text-green-700", sub: `${wonDeals.length} deals` },
          { label: "Win Rate",            value: `${winRate}%`,  color: winRate >= 50 ? "text-green-700" : "text-orange-600", sub: "closed deals" },
          { label: "Open Leads",          value: LEADS_LIVE.filter(l=>!["converted","dead"].includes(l.status)).length, color: "text-indigo-700", sub: "active leads" },
          { label: "Overdue Activities",  value: ACTIVITIES_LIVE.filter((a: any) => !a.completed && new Date(a.dueDate ?? a.scheduledAt ?? "9999") < new Date()).length, color: "text-red-700", sub: "need action" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
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
                {PIPELINE_STAGES.map((stage) => {
                  const stageDeals = DEALS_LIVE.filter(d => d.stage === stage);
                  const stageValue = stageDeals.reduce((s, d) => s + d.value, 0);
                  const maxVal = Math.max(...PIPELINE_STAGES.map(s => DEALS_LIVE.filter(d=>d.stage===s).reduce((sum,d)=>sum+d.value,0)), 1);
                  const cfg = STAGE_CFG[stage];
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground w-28">{cfg.label}</span>
                      <div className="flex-1 h-5 bg-muted rounded overflow-hidden flex items-center">
                        <div className="h-full bg-primary/20 border-r-2 border-primary flex items-center px-2"
                          style={{ width: `${Math.max(5, (stageValue/maxVal)*100)}%` }}>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] w-16 text-right text-foreground/80">₹{(stageValue/1000).toFixed(0)}K</span>
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
                  const cfg = STAGE_CFG[deal.stage as DealStage] ?? { label: deal.stage ?? "—", color: "text-muted-foreground bg-muted" };
                  const daysToClose = deal.closeDate ? Math.round((new Date(deal.closeDate).getTime() - new Date().getTime()) / 86400000) : null;
                  return (
                    <div key={deal.id} className="flex items-start justify-between px-3 py-2.5 hover:bg-muted/30">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-[10px] text-primary">{deal.number}</span>
                          <span className={`status-badge ${cfg.color}`}>{cfg.label}</span>
                        </div>
                        <p className="text-[12px] font-medium text-foreground truncate max-w-56">{deal.account}</p>
                        <p className="text-[11px] text-muted-foreground/70">{deal.owner} · {deal.lastActivity}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-mono font-bold text-[12px] text-foreground">₹{(deal.value/1000).toFixed(0)}K</div>
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
                <button className="text-primary hover:underline text-[11px]">+ New</button>
              </div>
              <div className="divide-y divide-border">
                {ACTIVITIES_LIVE.filter((a: any) => !a.completed).slice(0, 4).map((a: any) => {
                  const cfg = ACTIVITY_TYPE_CFG[a.type] ?? { color: "bg-muted", label: a.type ?? "Activity" };
                  return (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/30">
                      <div className="flex items-start gap-2">
                        <span className={`status-badge flex-shrink-0 ${cfg.color}`}>{cfg.icon} {a.type}</span>
                        <div>
                          <p className="text-[12px] text-foreground font-medium truncate max-w-56">{a.subject}</p>
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
                {[
                  { rep: "Dana Kim",     won: 495000, deals: 1 },
                  { rep: "Morgan Lee",   won: 380000, deals: 1 },
                  { rep: "Taylor Patel", won: 68000,  deals: 1 },
                  { rep: "Alex Rivera",  won: 0,      deals: 0 },
                ].map((row, i) => (
                  <div key={row.rep} className="flex items-center gap-3">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-yellow-400 text-white" : "bg-muted text-muted-foreground"}`}>{i+1}</span>
                    <span className="text-[12px] text-foreground/80 flex-1">{row.rep}</span>
                    <span className="font-mono font-bold text-[12px] text-foreground">₹{(row.won/1000).toFixed(0)}K</span>
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
            <div className="flex overflow-x-auto p-4 gap-3 min-h-96">
              {(["prospect","qualified","proposal","negotiation","verbal_commit","closed_won"] as DealStage[]).map((stage) => {
                const stageDeals = DEALS_LIVE.filter(d => d.stage === stage);
                const stageVal = stageDeals.reduce((s,d) => s+d.value, 0);
                const cfg = STAGE_CFG[stage];
                return (
                  <div key={stage} className="flex-shrink-0 w-56 flex flex-col gap-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`status-badge ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-[11px] text-muted-foreground/70">₹{(stageVal/1000).toFixed(0)}K</span>
                    </div>
                    {stageDeals.map((deal) => (
                      <div key={deal.id} className={`border rounded p-3 hover:shadow-sm transition-shadow cursor-pointer bg-card border-border`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[10px] text-primary">{deal.number}</span>
                          <span className="text-[11px] text-muted-foreground/70">{deal.probability}%</span>
                        </div>
                        <p className="text-[12px] font-semibold text-foreground mb-0.5">{deal.account}</p>
                        <p className="text-[11px] text-muted-foreground truncate mb-1.5">{deal.name}</p>
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[12px] text-primary">₹{(deal.value/1000).toFixed(0)}K</span>
                          <span className="text-[10px] text-muted-foreground/70">Close: {deal.closeDate.slice(5)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1">
                          <span className="w-4 h-4 rounded-full bg-primary text-white text-[8px] flex items-center justify-center font-bold">
                            {(deal.owner ?? "").split(" ").map((n:string)=>n[0]).join("").slice(0,2)}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70 truncate">{deal.lastActivity}</span>
                        </div>
                      </div>
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
              </tr>
            </thead>
            <tbody>
              {ACCOUNTS_LIVE.map((a) => (
                <tr key={a.id}>
                  <td className="p-0"><div className={`priority-bar ${a.healthScore >= 80 ? "bg-green-500" : a.healthScore >= 60 ? "bg-yellow-500" : "bg-red-500"}`} /></td>
                  <td className="font-semibold text-primary hover:underline cursor-pointer">{a.name}</td>
                  <td><span className="status-badge text-muted-foreground bg-muted text-[10px]">{a.industry}</span></td>
                  <td><span className={`status-badge capitalize ${a.type === "customer" ? "text-green-700 bg-green-100" : a.type === "prospect" ? "text-blue-700 bg-blue-100" : "text-muted-foreground bg-muted"}`}>{a.type}</span></td>
                  <td><span className={`status-badge capitalize ${TIER_CFG[a.tier]}`}>{a.tier.replace("_"," ")}</span></td>
                  <td className="text-muted-foreground">{a.country}</td>
                  <td className="font-mono text-[11px] text-muted-foreground">{a.employees.toLocaleString()}</td>
                  <td className="font-mono text-[11px] text-muted-foreground">₹{(a.annualRevenue/10000000).toFixed(0)}Cr</td>
                  <td className="text-center"><span className={`font-bold ${a.openOpps > 0 ? "text-primary" : "text-slate-300"}`}>{a.openOpps}</span></td>
                  <td className="font-mono text-[11px] font-bold text-foreground">{a.totalRevenue > 0 ? `₹${(a.totalRevenue/1000).toFixed(0)}K` : "—"}</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-6 h-1.5 rounded-full ${a.healthScore >= 80 ? "bg-green-500" : a.healthScore >= 60 ? "bg-yellow-500" : "bg-red-500"}`} style={{width: `${a.healthScore * 0.4}px`}} />
                      <span className={`text-[11px] font-bold ${SCORE_COLOR(a.healthScore)}`}>{a.healthScore}</span>
                    </div>
                  </td>
                  <td className="text-muted-foreground">{a.owner}</td>
                  <td className="text-[11px] text-muted-foreground/70">{a.lastContact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* CONTACTS */}
        {tab === "contacts" && (
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
              </tr>
            </thead>
            <tbody>
              {CONTACTS_LIVE.map((c) => (
                <tr key={c.id} className={c.doNotContact ? "opacity-50" : ""}>
                  <td className="p-0"><div className={`priority-bar ${c.seniority === "c_level" ? "bg-red-500" : c.seniority === "vp" ? "bg-orange-500" : "bg-blue-400"}`} /></td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-bold flex-shrink-0">
                        {c.firstName[0]}{c.lastName[0]}
                      </span>
                      <span className="font-semibold text-primary hover:underline cursor-pointer">{c.firstName} {c.lastName}</span>
                      {c.doNotContact && <span className="status-badge text-red-600 bg-red-50 text-[9px]">DNC</span>}
                    </div>
                  </td>
                  <td className="text-muted-foreground">{c.title}</td>
                  <td><span className={`status-badge capitalize ${SENIORITY_CFG[c.seniority]}`}>{c.seniority.replace("_"," ")}</span></td>
                  <td className="text-primary hover:underline cursor-pointer">{c.account}</td>
                  <td className="text-muted-foreground text-[11px] font-mono">{c.email}</td>
                  <td className="text-muted-foreground text-[11px]">{c.phone}</td>
                  <td className="text-muted-foreground">{c.department}</td>
                  <td className="text-center"><span className={`font-bold ${c.openDeals > 0 ? "text-primary" : "text-slate-300"}`}>{c.openDeals}</span></td>
                  <td className="text-muted-foreground">{c.owner}</td>
                  <td className="text-[11px] text-muted-foreground/70">{c.lastActivity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* LEADS */}
        {tab === "leads" && (
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
                        onClick={() => { setEditingLead(l); setEditLeadForm({ firstName: l.firstName, lastName: l.lastName, email: l.email ?? "", company: l.company ?? "", title: l.title ?? "", status: l.status }); }}
                        className="text-[11px] text-primary hover:underline"
                      >Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ACTIVITIES */}
        {tab === "activities" && (
          <div>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
              <span className="text-[12px] font-semibold text-foreground/80">All Activities</span>
              <button onClick={() => createActivity.mutate({ type: "call", subject: "Activity logged from CRM", description: "" })} disabled={createActivity.isPending} className="ml-auto flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-50">
                <Plus className="w-3 h-3" /> Log Activity
              </button>
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
                  <th>Owner</th>
                  <th>Due / Completed</th>
                  <th>Outcome / Notes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVITIES_LIVE.map((a: any) => {
                  const cfg = ACTIVITY_TYPE_CFG[a.type] ?? { color: "bg-muted", label: a.type ?? "Activity" };
                  return (
                    <tr key={a.id} className={a.completed ? "opacity-60" : ""}>
                      <td className="p-0"><div className={`priority-bar ${a.completed ? "bg-green-500" : "bg-blue-400"}`} /></td>
                      <td><span className={`status-badge capitalize ${cfg.color}`}>{cfg.icon} {a.type.replace("_"," ")}</span></td>
                      <td className="font-medium text-foreground">{a.subject}</td>
                      <td className="text-primary hover:underline cursor-pointer">{a.account}</td>
                      <td className="text-muted-foreground">{a.contact}</td>
                      <td className="font-mono text-[11px] text-primary">{a.deal ?? "—"}</td>
                      <td className="text-muted-foreground">{a.owner}</td>
                      <td className="text-[11px] text-muted-foreground">{a.completedDate ?? a.dueDate}</td>
                      <td className="max-w-xs text-[11px] text-muted-foreground truncate">{a.outcome ?? "—"}</td>
                      <td>
                        <span className={`status-badge ${a.completed ? "text-green-700 bg-green-100" : "text-blue-700 bg-blue-100"}`}>
                          {a.completed ? "✓ Done" : "Pending"}
                        </span>
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
                      <div className="text-[18px] font-bold text-foreground">₹{q.total.toLocaleString("en-IN")}</div>
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
                          {(q.lineItems ?? []).map((li) => (
                            <tr key={li.line}>
                              <td className="text-center text-muted-foreground/70">{li.line}</td>
                              <td className="font-semibold text-foreground">{li.product}</td>
                              <td className="text-muted-foreground text-[11px]">{li.description}</td>
                              <td className="text-center font-mono">{li.qty}</td>
                              <td className="font-mono text-[11px]">₹{li.unitPrice.toLocaleString("en-IN")}</td>
                              <td className="text-center text-[11px]">{li.discount > 0 ? `${li.discount}%` : "—"}</td>
                              <td className="font-mono font-bold text-foreground">₹{li.total.toLocaleString("en-IN")}</td>
                            </tr>
                          ))}
                          <tr className="bg-card">
                            <td colSpan={5} />
                            <td className="text-right text-[11px] text-muted-foreground font-semibold">Subtotal:</td>
                            <td className="font-mono text-foreground/80">₹{q.subtotal.toLocaleString("en-IN")}</td>
                          </tr>
                          {q.discount > 0 && (
                            <tr className="bg-card">
                              <td colSpan={5} />
                              <td className="text-right text-[11px] text-green-600 font-semibold">Discount:</td>
                              <td className="font-mono text-green-600">-₹{q.discount.toLocaleString("en-IN")}</td>
                            </tr>
                          )}
                          <tr className="bg-card font-bold">
                            <td colSpan={5} />
                            <td className="text-right text-[12px] text-foreground font-bold">TOTAL:</td>
                            <td className="font-mono text-[14px] font-black text-foreground">₹{q.total.toLocaleString("en-IN")}</td>
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
                            if (newStatus && ["draft","sent","viewed","accepted","declined","expired"].includes(newStatus)) {
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
                {PIPELINE_STAGES.map(stage => {
                  const deals = DEALS_LIVE.filter(d => d.stage === stage);
                  const weighted = deals.reduce((s,d) => s + d.value*(d.probability/100), 0);
                  const cfg = STAGE_CFG[stage];
                  return (
                    <div key={stage} className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground w-28 flex-shrink-0">{cfg.label}</span>
                      <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{width: `${Math.min(100,(weighted/500000)*100)}%`}} />
                      </div>
                      <span className="font-mono text-foreground/80 w-16 text-right">₹{(weighted/1000).toFixed(0)}K</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Deals by Source</div>
              <div className="p-3 space-y-2">
                {["Inbound / Website","Inbound / Trial","Direct / Outbound","Partner Referral","LinkedIn Outbound","Upsell / Existing Customer","Event / Conference"].map((src) => {
                  const srcDeals = DEALS_LIVE.filter(d => d.source === src);
                  if (srcDeals.length === 0) return null;
                  const srcVal = srcDeals.reduce((s,d)=>s+d.value,0);
                  return (
                    <div key={src} className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground flex-1 truncate">{src}</span>
                      <span className="font-mono text-foreground/80">₹{(srcVal/1000).toFixed(0)}K</span>
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
                    const cfg = STAGE_CFG[d.stage as DealStage];
                    return (
                      <tr key={d.id} className={d.stage === "closed_lost" ? "opacity-50" : ""}>
                        <td className="p-0"><div className={`priority-bar ${d.stage === "closed_won" ? "bg-green-500" : d.stage === "closed_lost" ? "bg-red-500" : "bg-blue-400"}`} /></td>
                        <td className="font-mono text-[11px] text-primary">{d.number}</td>
                        <td className="font-medium text-foreground">{d.account}</td>
                        <td className="text-muted-foreground">{d.owner}</td>
                        <td><span className={`status-badge ${cfg.color}`}>{cfg.label}</span></td>
                        <td className="font-mono font-bold text-foreground">₹{d.value.toLocaleString("en-IN")}</td>
                        <td className="font-mono text-muted-foreground">{d.probability}%</td>
                        <td className="font-mono font-semibold text-primary">₹{(d.value*(d.probability/100)).toLocaleString("en-IN")}</td>
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
              <h2 className="text-sm font-semibold">Edit Lead: {editingLead.firstName} {editingLead.lastName}</h2>
              <button onClick={() => setEditingLead(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-3">
              {(["firstName","lastName","email","company","title"] as const).map((f) => (
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
                  {["new","contacted","qualified","disqualified"].map((s) => <option key={s} value={s}>{s}</option>)}
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
                    toast.success("Lead updated (demo data)");
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
              <h2 className="text-sm font-semibold">New Quote</h2>
              <button onClick={() => setShowNewQuote(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase mb-1">Description / Item</label>
                <input
                  value={newQuoteDesc}
                  onChange={(e) => setNewQuoteDesc(e.target.value)}
                  placeholder="e.g. NexusOps Enterprise License"
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
    </div>
  );
}
