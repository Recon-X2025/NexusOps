"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import {
  TicketIcon,
  ChevronRight,
  Save,
  X,
  AlertTriangle,
  Info,
  User,
  Tag,
  Clock,
  Shield,
  Layers,
  HelpCircle,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { generateUUID } from "@/lib/uuid";

const TICKET_TYPES = [
  { value: "incident",        label: "Incident",        desc: "Unplanned interruption or reduction in quality of service" },
  { value: "request",         label: "Service Request",  desc: "Request for information, access, or a standard change" },
  { value: "problem",         label: "Problem",          desc: "Root cause of one or more incidents" },
  { value: "change",          label: "Change Request",   desc: "Request to add, modify, or remove something" },
];

const IMPACT_OPTIONS = [
  { value: "1_enterprise",  label: "1 – Enterprise-wide impact" },
  { value: "2_multiple",    label: "2 – Multiple groups/departments" },
  { value: "3_department",  label: "3 – Single department" },
  { value: "4_individual",  label: "4 – Individual" },
];

const URGENCY_OPTIONS = [
  { value: "1_critical", label: "1 – Critical (cannot work)" },
  { value: "2_high",     label: "2 – High (significantly impaired)" },
  { value: "3_medium",   label: "3 – Medium (workaround available)" },
  { value: "4_low",      label: "4 – Low (minor inconvenience)" },
];

const PRIORITY_MATRIX: Record<string, Record<string, string>> = {
  "1_enterprise":  { "1_critical": "1 – Critical", "2_high": "1 – Critical", "3_medium": "2 – High",   "4_low": "3 – Moderate" },
  "2_multiple":    { "1_critical": "1 – Critical", "2_high": "2 – High",     "3_medium": "3 – Moderate","4_low": "3 – Moderate" },
  "3_department":  { "1_critical": "2 – High",     "2_high": "3 – Moderate", "3_medium": "3 – Moderate","4_low": "4 – Low" },
  "4_individual":  { "1_critical": "3 – Moderate", "2_high": "3 – Moderate", "3_medium": "4 – Low",    "4_low": "4 – Low" },
};

const CATEGORIES = [
  "Network",
  "Server / Infrastructure",
  "Application",
  "Database",
  "Security",
  "Email & Messaging",
  "Client Endpoints",
  "Storage",
  "Telephony",
  "Facilities",
  "HR Systems",
  "ERP / SAP",
  "Other",
];

const SUBCATEGORIES: Record<string, string[]> = {
  "Network":              ["LAN", "WAN", "WiFi", "VPN", "Firewall", "DNS", "Load Balancer"],
  "Server / Infrastructure": ["Physical Server", "Virtual Machine", "Container", "Hypervisor", "BIOS / Firmware"],
  "Application":          ["Web App", "Desktop App", "Mobile App", "API / Integration", "Performance"],
  "Database":             ["Query Performance", "Replication", "Backup", "Schema Change", "Access"],
  "Security":             ["Identity / Access", "Malware", "Phishing", "Vulnerability", "Compliance"],
  "Email & Messaging":    ["Exchange / M365", "Distribution List", "Spam", "Attachment", "Mobile Sync"],
  "Client Endpoints":     ["Windows", "macOS", "Linux", "Printer", "Peripheral", "BIOS"],
  "Storage":              ["NAS / NFS", "SAN", "Backup Failure", "Quota", "Replication"],
  "Other":                ["General", "Uncategorized"],
};

const CI_ITEMS = [
  "PROD-WEB-01", "PROD-WEB-02", "PROD-API-01", "PROD-DB-01", "PROD-DB-02",
  "SAN-AFF-01", "SW-CORE-01", "SW-CORE-02", "CRAC-05", "SRB-UPS-03", "FW-EDGE-01",
];

export default function NewTicketPage() {
  const router = useRouter();
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const canCreate = can("incidents", "write") || can("requests", "write");

  const { data: statuses } = trpc.tickets.statusCounts.useQuery(undefined, mergeTrpcQueryOpts("tickets.statusCounts", { enabled: canCreate }));

  const [form, setForm] = useState({
    type: "incident" as string,
    title: "",
    description: "",
    impact: "3_department",
    urgency: "3_medium",
    category: "",
    subcategory: "",
    cmdbCi: "",
    affectedUser: "",
    contactNumber: "",
    channel: "portal" as string,
    dueDate: "",
    tags: "",
    watchMe: false,
    notifyRequester: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // AI classification state
  type AiSuggestion = {
    category: string;
    priority: "low" | "medium" | "high" | "critical";
    confidence: number;
    reasoning: string;
  };
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
  const [aiDismissed, setAiDismissed] = useState(false);
  const [aiAutoApplied, setAiAutoApplied] = useState(false);
  const classifyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const classifyTicket = trpc.ai.classifyTicket.useMutation({
    onSuccess: (result) => {
      if (!result || result.confidence < 0.5) return;

      const suggestion = result as AiSuggestion;

      // Map AI category to the closest CATEGORIES entry
      const categoryMap: Record<string, string> = {
        hardware: "Client Endpoints",
        software: "Application",
        access: "Security",
        network: "Network",
        facilities: "Facilities",
        security: "Security",
        hr: "HR Systems",
        other: "Other",
      };
      const mappedCategory = categoryMap[suggestion.category] ?? "";

      if (suggestion.confidence >= 0.8) {
        if (mappedCategory) {
          setForm((f) => ({ ...f, category: f.category || mappedCategory }));
        }
        setAiSuggestion({ ...suggestion, category: mappedCategory || suggestion.category });
        setAiAutoApplied(true);
        setAiDismissed(false);
      } else {
        setAiSuggestion({ ...suggestion, category: mappedCategory || suggestion.category });
        setAiAutoApplied(false);
        setAiDismissed(false);
      }
    },
  });

  // Debounced classification trigger: fires 1s after the user stops typing.
  const triggerClassify = useCallback(
    (title: string, description: string) => {
      if (classifyDebounceRef.current) clearTimeout(classifyDebounceRef.current);
      if (title.trim().length < 5 || description.trim().length < 10) return;
      classifyDebounceRef.current = setTimeout(() => {
        setAiSuggestion(null);
        setAiDismissed(false);
        setAiAutoApplied(false);
        classifyTicket.mutate({ title, description });
      }, 1000);
    },
    [classifyTicket],
  );

  useEffect(() => {
    return () => { if (classifyDebounceRef.current) clearTimeout(classifyDebounceRef.current); };
  }, []);

  // Stable per-form-session idempotency key: generated once when the form
  // mounts and reused on every submit attempt.  This guarantees that even if
  // the user clicks "Submit" multiple times in quick succession (race between
  // clicks and React re-renders), the server will deduplicate to a single ticket.
  // A new key is generated only after a successful create (form resets).
  const idempotencyKeyRef = useRef<string>(generateUUID());

  const calculatedPriority =
    form.impact && form.urgency
      ? PRIORITY_MATRIX[form.impact]?.[form.urgency] ?? "—"
      : "—";

  // Map form select values ("1_enterprise", "3_medium", etc.) to the DB enum values
  const impactForApi: "high" | "medium" | "low" =
    form.impact === "1_enterprise" || form.impact === "2_multiple" ? "high"
    : form.impact === "4_individual" ? "low"
    : "medium";

  const urgencyForApi: "high" | "medium" | "low" =
    form.urgency === "1_critical" || form.urgency === "2_high" ? "high"
    : form.urgency === "4_low" ? "low"
    : "medium";

  const utils = trpc.useUtils();

  const createTicket = trpc.tickets.create.useMutation({
    onSuccess: (ticket) => {
      toast.success(`Ticket ${ticket?.number} created successfully`);
      idempotencyKeyRef.current = generateUUID(); // rotate key for next submission
      void utils.tickets.list.invalidate();
      router.push(`/app/tickets/${ticket?.id}`);
    },
    onError: (err) => {
      toast.error(`Failed to create ticket: ${err.message}`);
    },
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Short description is required";
    if (!form.description.trim()) e.description = "Description is required";
    if (!form.category) e.category = "Category is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    createTicket.mutate({
      type: form.type as any,
      title: form.title,
      description: form.description,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
      idempotencyKey: idempotencyKeyRef.current,
      impact: impactForApi,
      urgency: urgencyForApi,
      customFields: {
        impact: form.impact,
        urgency: form.urgency,
        calculatedPriority,
        category: form.category || undefined,
        subcategory: form.subcategory || undefined,
      },
    });
  };

  const set = (key: string, val: any) => {
    setForm((f) => ({ ...f, [key]: val }));
    if ((key === "title" || key === "description") ) {
      triggerClassify(
        key === "title" ? val : form.title,
        key === "description" ? val : form.description,
      );
    }
    if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  };

  if (!canCreate) return <AccessDenied module="Create Ticket" />;

  return (
    <div className="flex flex-col gap-3 max-w-5xl">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
        <Link href="/app/tickets" className="hover:text-primary">Incidents</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-muted-foreground font-medium">New Record</span>
      </nav>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3" data-testid="ticket-form">
        {/* Header */}
        <div className="flex items-center justify-between bg-card border border-border rounded px-4 py-3">
          <div className="flex items-center gap-2">
            <TicketIcon className="w-4 h-4 text-primary" />
            <h1 className="text-sm font-semibold text-foreground">New Ticket</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/app/tickets"
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-muted-foreground border border-border rounded hover:bg-muted/30"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </Link>
            <button
              type="submit"
              disabled={createTicket.isPending}
              data-testid="ticket-submit"
              className="flex items-center gap-1 px-4 py-1.5 bg-primary text-white text-[12px] font-medium rounded hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {createTicket.isPending ? "Submitting..." : "Submit Ticket"}
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          {/* Main form */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Type selection */}
            <div className="bg-card border border-border rounded p-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Ticket Type
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TICKET_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => set("type", t.value)}
                    className={`text-left p-3 rounded border transition-all
                      ${form.type === t.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-slate-300"
                      }`}
                  >
                    <div className="text-[12px] font-semibold text-foreground">{t.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Core fields */}
            <div className="bg-card border border-border rounded p-4 space-y-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Ticket Details
              </p>

              {/* AI classification banner */}
              {aiSuggestion && !aiDismissed && (
                <div
                  className={`flex items-start gap-2 rounded border px-3 py-2 text-[12px] ${
                    aiAutoApplied
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300"
                  }`}
                >
                  {aiAutoApplied ? (
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    {aiAutoApplied ? (
                      <span>
                        <span className="font-semibold">AI suggested</span>: {aiSuggestion.category} / {aiSuggestion.priority} — auto-applied
                      </span>
                    ) : (
                      <span>
                        <span className="font-semibold">AI suggests</span>: {aiSuggestion.category} / {aiSuggestion.priority}{" "}
                        <span className="opacity-70">({Math.round(aiSuggestion.confidence * 100)}% confidence)</span>
                      </span>
                    )}
                  </div>
                  {!aiAutoApplied && (
                    <button
                      type="button"
                      onClick={() => {
                        setForm((f) => ({ ...f, category: aiSuggestion.category }));
                        setAiAutoApplied(true);
                      }}
                      className="px-2 py-0.5 rounded border border-current text-[11px] font-medium hover:opacity-80 flex-shrink-0"
                    >
                      Accept
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAiDismissed(true)}
                    className="rounded p-0.5 hover:opacity-80 flex-shrink-0"
                    aria-label="Dismiss AI suggestion"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div>
                <label className="field-label block mb-1">
                  Short Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="Briefly describe the issue or request..."
                  data-testid="ticket-title"
                  className={`w-full px-3 py-2 text-[13px] border rounded outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground/70
                    ${errors.title ? "border-red-400 bg-red-50" : "border-border"}`}
                />
                {errors.title && (
                  <p className="text-[11px] text-red-500 mt-1">{errors.title}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="field-label block mb-1">
                  Description / Steps to reproduce <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  rows={6}
                  placeholder="Provide detailed information: what happened, when it started, impact on operations, steps already taken..."
                  data-testid="ticket-description"
                  className={`w-full px-3 py-2 text-[12px] border rounded outline-none focus:ring-1 focus:ring-primary/50 resize-y text-foreground placeholder:text-muted-foreground/70
                    ${errors.description ? "border-red-400 bg-red-50" : "border-border"}`}
                />
                {errors.description && (
                  <p className="text-[11px] text-red-500 mt-1">{errors.description}</p>
                )}
              </div>

              {/* Category + Subcategory */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label block mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => { set("category", e.target.value); set("subcategory", ""); }}
                    className={`w-full px-3 py-2 text-[12px] border rounded outline-none focus:ring-1 focus:ring-primary/50 bg-card text-foreground
                      ${errors.category ? "border-red-400" : "border-border"}`}
                  >
                    <option value="">Select category...</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {errors.category && (
                    <p className="text-[11px] text-red-500 mt-1">{errors.category}</p>
                  )}
                </div>
                <div>
                  <label className="field-label block mb-1">Subcategory</label>
                  <select
                    value={form.subcategory}
                    onChange={(e) => set("subcategory", e.target.value)}
                    disabled={!form.category}
                    className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50 bg-card text-foreground disabled:opacity-50"
                  >
                    <option value="">Select subcategory...</option>
                    {(SUBCATEGORIES[form.category] ?? []).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* CI */}
              <div>
                <label className="field-label block mb-1">
                  Configuration Item (CI)
                  <span className="text-muted-foreground/70 font-normal ml-1">— affected asset or service</span>
                </label>
                <select
                  value={form.cmdbCi}
                  onChange={(e) => set("cmdbCi", e.target.value)}
                  className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50 bg-card text-foreground"
                >
                  <option value="">Search CI / Asset...</option>
                  {CI_ITEMS.map((ci) => (
                    <option key={ci} value={ci}>{ci}</option>
                  ))}
                </select>
              </div>

              {/* Tags */}
              <div>
                <label className="field-label block mb-1">
                  Tags <span className="text-muted-foreground/70 font-normal">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => set("tags", e.target.value)}
                  placeholder="e.g. vpn, remote-work, urgent"
                  className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground/70"
                />
              </div>

              {/* Due date */}
              <div>
                <label className="field-label block mb-1">Due Date</label>
                <input
                  type="datetime-local"
                  value={form.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                  className="px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50 text-foreground/80"
                />
              </div>
            </div>

            {/* Affected User */}
            <div className="bg-card border border-border rounded p-4 space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Contact Information
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label block mb-1">Affected User / Requester</label>
                  <input
                    type="text"
                    value={form.affectedUser}
                    onChange={(e) => set("affectedUser", e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground/70"
                  />
                </div>
                <div>
                  <label className="field-label block mb-1">Contact / Phone</label>
                  <input
                    type="text"
                    value={form.contactNumber}
                    onChange={(e) => set("contactNumber", e.target.value)}
                    placeholder="+91 XXXXX XXXXX"
                    className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground/70"
                  />
                </div>
              </div>
              <div>
                <label className="field-label block mb-1">Contact Channel</label>
                <div className="flex items-center gap-3">
                  {["portal", "phone", "email", "walk-in", "chat"].map((ch) => (
                    <label key={ch} className="flex items-center gap-1 text-[12px] text-foreground/80 cursor-pointer">
                      <input
                        type="radio"
                        name="channel"
                        value={ch}
                        checked={form.channel === ch}
                        onChange={() => set("channel", ch)}
                        className="accent-primary"
                      />
                      <span className="capitalize">{ch}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-[12px] text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.notifyRequester}
                    onChange={(e) => set("notifyRequester", e.target.checked)}
                    className="accent-primary"
                  />
                  Notify requester via email
                </label>
                <label className="flex items-center gap-1.5 text-[12px] text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.watchMe}
                    onChange={(e) => set("watchMe", e.target.checked)}
                    className="accent-primary"
                  />
                  Add me as watcher
                </label>
              </div>
            </div>
          </div>

          {/* Right panel — Priority & Assignment */}
          <div className="w-64 flex-shrink-0 space-y-3">
            {/* Priority calculator */}
            <div className="bg-card border border-border rounded">
              <div className="px-3 py-2 border-b border-border bg-muted/30">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Priority Calculator
                </span>
              </div>
              <div className="px-3 py-3 space-y-3">
                <div>
                  <label className="field-label block mb-1">Impact</label>
                  <select
                    value={form.impact}
                    onChange={(e) => set("impact", e.target.value)}
                    className="w-full px-2 py-1.5 text-[12px] border border-border rounded outline-none bg-card text-foreground"
                  >
                    {IMPACT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label block mb-1">Urgency</label>
                  <select
                    value={form.urgency}
                    onChange={(e) => set("urgency", e.target.value)}
                    className="w-full px-2 py-1.5 text-[12px] border border-border rounded outline-none bg-card text-foreground"
                  >
                    {URGENCY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className="p-2 bg-muted/30 rounded border border-border text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                    Calculated Priority
                  </div>
                  <div
                    className={`text-[14px] font-bold ${
                      calculatedPriority.startsWith("1")
                        ? "text-red-700"
                        : calculatedPriority.startsWith("2")
                          ? "text-orange-600"
                          : calculatedPriority.startsWith("3")
                            ? "text-yellow-600"
                            : "text-green-600"
                    }`}
                  >
                    {calculatedPriority}
                  </div>
                </div>

                <div className="text-[10px] text-muted-foreground/70 leading-relaxed">
                  Priority is automatically determined from impact &times; urgency matrix per ITIL best practices.
                </div>
              </div>
            </div>

            {/* Assignment */}
            <div className="bg-card border border-border rounded">
              <div className="px-3 py-2 border-b border-border bg-muted/30">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <User className="w-3 h-3" /> Assignment
                </span>
              </div>
              <div className="px-3 py-3 space-y-3">
                <div>
                  <label className="field-label block mb-1">Assignment Group</label>
                  <select className="w-full px-2 py-1.5 text-[12px] border border-border rounded outline-none bg-card text-foreground">
                    <option value="">Auto-assign by category</option>
                    <option>Service Desk Tier 1</option>
                    <option>Network Operations</option>
                    <option>Server Infrastructure</option>
                    <option>Security Operations</option>
                    <option>Desktop Engineering</option>
                    <option>Database Administration</option>
                    <option>Application Support</option>
                  </select>
                </div>
                <div>
                  <label className="field-label block mb-1">Assigned To</label>
                  <select className="w-full px-2 py-1.5 text-[12px] border border-border rounded outline-none bg-card text-foreground">
                    <option value="">Leave unassigned</option>
                    <option>Alex Rivera</option>
                    <option>Jordan Chen</option>
                    <option>Sam Okafor</option>
                    <option>Taylor Patel</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SLA Info */}
            <div className="bg-card border border-border rounded">
              <div className="px-3 py-2 border-b border-border bg-muted/30">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3 h-3" /> SLA Preview
                </span>
              </div>
              <div className="px-3 py-3 space-y-1.5 text-[11px] text-muted-foreground">
                {[
                  { label: "Response Target", val: calculatedPriority.startsWith("1") ? "15 min" : calculatedPriority.startsWith("2") ? "1 hr" : "4 hrs" },
                  { label: "Resolve Target",  val: calculatedPriority.startsWith("1") ? "4 hrs"  : calculatedPriority.startsWith("2") ? "8 hrs" : "24 hrs" },
                  { label: "SLA Policy",      val: "Standard IT SLA" },
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="font-medium text-foreground/80">{r.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
