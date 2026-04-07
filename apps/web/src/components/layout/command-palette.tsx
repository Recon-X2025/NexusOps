"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Activity,
  AppWindow,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  CheckSquare,
  FileSignature,
  FolderKanban,
  Footprints,
  Gavel,
  GitBranch,
  GitPullRequest,
  HardDrive,
  Headphones,
  Headset,
  LayoutDashboard,
  LayoutGrid,
  Monitor,
  Receipt,
  Scale,
  Search,
  Shield,
  ShoppingCart,
  SlidersHorizontal,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  group: string;
  href: string;
  icon: LucideIcon;
  keywords?: string[];
}

const COMMAND_ITEMS: CommandItem[] = [
  // Platform
  { id: "dashboard",   label: "Platform Dashboard",      group: "Platform",            href: "/app/dashboard",          icon: LayoutDashboard },
  { id: "admin",       label: "Administration",           group: "Platform",            href: "/app/admin",              icon: SlidersHorizontal },

  // IT Services
  { id: "tickets",     label: "Service Desk",             group: "IT Services",         href: "/app/tickets",            icon: Headset,        keywords: ["incidents", "requests", "itsm", "tickets"] },
  { id: "changes",     label: "Change Management",        group: "IT Services",         href: "/app/changes",            icon: GitBranch,      keywords: ["change", "cab"] },
  { id: "problems",    label: "Problem Management",       group: "IT Services",         href: "/app/problems",           icon: GitBranch,      keywords: ["problem", "rca"] },
  { id: "releases",    label: "Release Management",       group: "IT Services",         href: "/app/releases",           icon: GitBranch,      keywords: ["release", "deploy"] },
  { id: "work-orders", label: "Work Orders / Field Service", group: "IT Services",      href: "/app/work-orders",        icon: Wrench,         keywords: ["field", "maintenance", "work order"] },
  { id: "on-call",     label: "On-Call Scheduling",       group: "IT Services",         href: "/app/on-call",            icon: Activity,       keywords: ["on call", "pagerduty", "schedule"] },
  { id: "cmdb",        label: "CMDB",                     group: "IT Services",         href: "/app/cmdb",               icon: Monitor,        keywords: ["configuration", "cmdb", "ci"] },
  { id: "ham",         label: "Hardware Asset Management",group: "IT Services",         href: "/app/ham",                icon: HardDrive,      keywords: ["hardware", "assets", "devices"] },
  { id: "sam",         label: "Software Asset Management",group: "IT Services",         href: "/app/sam",                icon: HardDrive,      keywords: ["software", "licenses", "saas"] },
  { id: "events",      label: "Event Management",         group: "IT Services",         href: "/app/events",             icon: Activity,       keywords: ["events", "alerts", "itom"] },

  // Security & Compliance
  { id: "security",    label: "Security Operations",      group: "Security & Compliance", href: "/app/security",         icon: Shield,         keywords: ["security", "vulnerabilities", "soc"] },
  { id: "grc",         label: "Risk & Compliance (GRC)",  group: "Security & Compliance", href: "/app/grc",              icon: Scale,          keywords: ["risk", "compliance", "grc", "audit"] },
  { id: "approvals",   label: "Approval Queue",           group: "Security & Compliance", href: "/app/approvals",        icon: CheckSquare,    keywords: ["approvals", "pending"] },

  // People & Workplace
  { id: "hr",          label: "HR Service Delivery",      group: "People & Workplace",  href: "/app/hr",                 icon: UserCheck,      keywords: ["hr", "human resources", "cases"] },
  { id: "recruitment", label: "Recruitment & ATS",        group: "People & Workplace",  href: "/app/recruitment",        icon: Users,          keywords: ["hiring", "ats", "candidates", "jobs"] },
  { id: "performance", label: "Performance Management",   group: "People & Workplace",  href: "/app/performance",        icon: Target,         keywords: ["performance", "goals", "okr", "review", "360"] },
  { id: "people-analytics", label: "People Analytics",   group: "People & Workplace",  href: "/app/people-analytics",   icon: BarChart3,      keywords: ["workforce", "analytics", "headcount"] },
  { id: "facilities",  label: "Facilities & Real Estate", group: "People & Workplace",  href: "/app/facilities",         icon: Building2,      keywords: ["facilities", "rooms", "bookings"] },
  { id: "walk-up",     label: "Walk-Up Experience",       group: "People & Workplace",  href: "/app/walk-up",            icon: Footprints,     keywords: ["walk up", "kiosk"] },

  // Customer & Sales
  { id: "csm",         label: "Customer Service",         group: "Customer & Sales",    href: "/app/csm",                icon: Headphones,     keywords: ["customer", "support", "csm"] },
  { id: "crm",         label: "CRM & Sales Pipeline",     group: "Customer & Sales",    href: "/app/crm",                icon: TrendingUp,     keywords: ["crm", "sales", "pipeline", "deals"] },
  { id: "catalog",     label: "Service Catalog",          group: "Customer & Sales",    href: "/app/catalog",            icon: LayoutGrid,     keywords: ["catalog", "service requests"] },

  // Finance & Procurement
  { id: "procurement", label: "Procurement & Supply Chain", group: "Finance & Procurement", href: "/app/procurement",    icon: ShoppingCart,   keywords: ["procurement", "po", "purchasing"] },
  { id: "financial",   label: "Financial Management",     group: "Finance & Procurement", href: "/app/financial",        icon: ShoppingCart,   keywords: ["finance", "invoices", "ap", "ar"] },
  { id: "vendors",     label: "Vendor Management",        group: "Finance & Procurement", href: "/app/vendors",          icon: ShoppingCart,   keywords: ["vendors", "suppliers"] },
  { id: "contracts",   label: "Contract Management",      group: "Finance & Procurement", href: "/app/contracts",        icon: FileSignature,  keywords: ["contracts", "clm", "agreements"] },
  { id: "expenses",    label: "Expense Management",       group: "Finance & Procurement", href: "/app/expenses",         icon: Receipt,        keywords: ["expenses", "claims", "reimbursement", "travel"] },

  // Legal & Governance
  { id: "legal",       label: "Legal Service Delivery",   group: "Legal & Governance",  href: "/app/legal",              icon: Gavel,          keywords: ["legal", "documents", "counsel"] },
  { id: "secretarial", label: "Secretarial & Company Secretary", group: "Legal & Governance", href: "/app/secretarial",  icon: Briefcase,      keywords: ["company secretary", "mca", "roc", "board", "esop"] },

  // Strategy & Projects
  { id: "projects",    label: "Project Portfolio",        group: "Strategy & Projects", href: "/app/projects",           icon: FolderKanban,   keywords: ["projects", "ppm", "portfolio"] },
  { id: "apm",         label: "Application Portfolio",    group: "Strategy & Projects", href: "/app/apm",                icon: AppWindow,      keywords: ["applications", "portfolio", "apm"] },
  { id: "reports",     label: "Analytics & Reporting",    group: "Strategy & Projects", href: "/app/reports",            icon: BarChart3,      keywords: ["reports", "analytics", "kpis"] },

  // Developer & Ops
  { id: "devops",      label: "DevOps",                   group: "Developer & Ops",     href: "/app/devops",             icon: GitPullRequest, keywords: ["devops", "deployments", "pipelines"] },
  { id: "knowledge",   label: "Knowledge Management",     group: "Developer & Ops",     href: "/app/knowledge",          icon: BookOpen,       keywords: ["knowledge", "kb", "articles"] },
];

const QUICK_ACTIONS: Array<{ label: string; href: string; hint: string }> = [
  { label: "New Incident",         href: "/app/tickets/new?type=incident", hint: "Create" },
  { label: "New Service Request",  href: "/app/tickets/new?type=request",  hint: "Create" },
  { label: "Pending Approvals",    href: "/app/approvals",                 hint: "Quick"  },
  { label: "My Open Tickets",      href: "/app/tickets?assignee=me",       hint: "Quick"  },
  { label: "SLA Breaches",         href: "/app/tickets?sla=breached",      hint: "Quick"  },
];

const GROUP_HEADING_CLASS =
  "px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none";

const ITEM_CLASS = cn(
  "flex items-center gap-3 px-3 py-2 text-sm cursor-pointer transition-colors rounded-sm mx-1",
  "aria-selected:bg-accent aria-selected:text-accent-foreground",
  "hover:bg-accent/50",
);

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const navigate = useCallback(
    (href: string) => {
      onOpenChange(false);
      setSearch("");
      router.push(href);
    },
    [onOpenChange, router],
  );

  // Reset search when closed
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const groupedItems = COMMAND_ITEMS.reduce<Record<string, CommandItem[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Global command palette"
      overlayClassName="fixed inset-0 bg-black/50 z-[99]"
      contentClassName="fixed left-1/2 top-[15vh] z-[100] -translate-x-1/2 w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[60vh] focus:outline-none"
    >
      {/* Search input */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Search modules, navigate, create…"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5"
          >
            Clear
          </button>
        )}
      </div>

      {/* Results */}
      <Command.List className="flex-1 overflow-y-auto scrollbar-thin py-1">
        <Command.Empty className="py-10 text-center text-sm text-muted-foreground">
          No results for &ldquo;{search}&rdquo;
        </Command.Empty>

        {/* Quick actions — only shown when not searching */}
        {!search.trim() && (
          <Command.Group heading="Quick Actions">
            <p className={GROUP_HEADING_CLASS}>Quick Actions</p>
            {QUICK_ACTIONS.map((item) => (
              <Command.Item
                key={item.href}
                value={item.label}
                onSelect={() => navigate(item.href)}
                className={ITEM_CLASS}
              >
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0",
                    item.hint === "Create"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.hint}
                </span>
                <span>{item.label}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {/* Module groups */}
        {Object.entries(groupedItems).map(([group, items]) => (
          <Command.Group key={group} heading={group}>
            <p className={GROUP_HEADING_CLASS}>{group}</p>
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <Command.Item
                  key={item.id}
                  value={`${item.label} ${item.group} ${item.keywords?.join(" ") ?? ""}`}
                  onSelect={() => navigate(item.href)}
                  className={ITEM_CLASS}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">{item.label}</span>
                  {search.trim() && (
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">{group}</span>
                  )}
                </Command.Item>
              );
            })}
          </Command.Group>
        ))}
      </Command.List>

      {/* Footer */}
      <div className="flex items-center gap-3 px-3 py-2 border-t border-border bg-muted/30">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-xs">↑↓</kbd>
          navigate
        </span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-xs">↵</kbd>
          open
        </span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-xs">Esc</kbd>
          close
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/50">NexusOps</span>
      </div>
    </Command.Dialog>
  );
}

/** Hook: open the command palette with Cmd+K / Ctrl+K */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return { open, setOpen };
}


