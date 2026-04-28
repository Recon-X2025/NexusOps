"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense } from "react";
import {
  Zap, Bell, Search, Moon, Sun, HelpCircle, ChevronDown, Plus, Settings, Shield,
  CheckCheck, Info, AlertTriangle, CheckCircle, XCircle, ExternalLink,
  LogOut, User, KeyRound, Building2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useRBAC } from "@/lib/rbac-context";
import { MOCK_USERS, SYSTEM_ROLES_CATALOG } from "@/lib/rbac";
import { trpc } from "@/lib/trpc";

const BREADCRUMB_LABELS: Record<string, string> = {
  // Core
  app: "NexusOps",
  dashboard: "Dashboard",

  new: "New",
  edit: "Edit",
  settings: "Settings",
  admin: "Administration",
  profile: "My Profile",
  notifications: "Notifications",
  approvals: "Approvals",
  flows: "Flow Designer",
  workflows: "Workflows",
  invite: "Invite",
  login: "Sign In",
  signup: "Sign Up",
  "forgot-password": "Forgot Password",
  "reset-password": "Reset Password",
  // IT Services
  "it-services": "IT Services",
  tickets: "Service Desk",
  changes: "Change Management",
  problems: "Problem Management",
  releases: "Release Management",
  "work-orders": "Work Orders",
  parts: "Parts & Inventory",
  "on-call": "On-Call",
  events: "Event Management",
  cmdb: "CMDB",
  ham: "Hardware Assets",
  sam: "Software Assets",
  assets: "Assets",
  // Security & Compliance
  "security-compliance": "Security & Compliance",
  security: "Security Operations",
  grc: "Risk & Compliance",
  compliance: "Compliance",
  // People & Workplace
  "people-workplace": "People & Workplace",
  hr: "HR Service Delivery",
  "employee-portal": "Employee Portal",
  "employee-center": "Employee Service Center",
  recruitment: "Recruitment",
  "people-analytics": "People Analytics",
  facilities: "Facilities",
  attendance: "Attendance Management",
  holidays: "Holiday Calendar",
  okr: "OKRs & Goals",
  // Customer & Sales
  "customer-sales": "Customer & Sales",
  csm: "Customer Service",
  crm: "CRM & Sales",
  catalog: "Service Catalog",
  surveys: "Surveys",
  escalations: "Escalations",
  // Finance & Procurement
  "finance-procurement": "Finance & Procurement",
  procurement: "Procurement",
  financial: "Financial Management",
  vendors: "Vendors",
  contracts: "Contract Management",
  expenses: "Expense Management",
  accounting: "Accounting",
  // People extras
  performance: "Performance Management",
  // Legal & Governance
  "legal-governance": "Legal & Governance",
  legal: "Legal",
  secretarial: "Secretarial & CS",
  // Strategy Center
  strategy: "Strategy Center",
  "strategy-projects": "Strategy Center", // legacy slug; route redirects to /app/strategy
  projects: "Initiatives",
  reports: "Analytics & Reports",
  // Knowledge
  knowledge: "Knowledge Base",
  // Settings — App Inventory
  apm: "App Inventory",
  // Legacy — preserved for redirects / deep links if DEVOPS_ENABLED is on
  "developer-ops": "Developer & Ops",
  devops: "DevOps",
  // Settings
  integrations: "Integrations",
  webhooks: "Webhooks",
  "api-keys": "API Keys",
  runs: "Runs",
  // Setup & ESG
  esg: "ESG Reporting",
  "onboarding-wizard": "Setup Wizard",
  "custom-fields": "Custom Fields",
  // Virtual / AI
  "virtual-agent": "Virtual Agent",
};

/** Matches sidebar labels under Legal & Governance → Secretarial & CS */
const SECRETARIAL_SUBPAGE_LABELS: Record<string, string> = {
  overview: "Company Overview",
  board: "Board & Meetings",
  filings: "MCA / ROC Filings",
  share: "Share Capital & ESOP",
  esop: "ESOP",
  registers: "Statutory Registers",
  calendar: "Compliance Calendar",
};

function Breadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];

  segments.forEach((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = BREADCRUMB_LABELS[seg] ?? seg;
    crumbs.push({ label, href });
  });

  const lastSeg = segments[segments.length - 1];
  if (lastSeg === "secretarial") {
    const tab = searchParams.get("tab") ?? "overview";
    const subLabel: string =
      SECRETARIAL_SUBPAGE_LABELS[tab] ?? SECRETARIAL_SUBPAGE_LABELS["overview"] ?? "Secretarial";
    const qs = new URLSearchParams(searchParams.toString());
    if (!qs.has("tab")) qs.set("tab", tab);
    crumbs.push({ label: subLabel, href: `/app/secretarial?${qs.toString()}` });
  }

  const visible = crumbs.slice(1);

  return (
    <nav className="flex items-center gap-1 text-xs text-slate-600 dark:text-[hsl(var(--header-fg))] opacity-80">
      {visible.map((c, i) => (
        <span key={c.href} className="flex items-center gap-1">
          {i > 0 && <span className="opacity-40">/</span>}
          <span className={cn(i === visible.length - 1 ? "opacity-100 font-medium text-slate-800 dark:text-white" : "opacity-60")}>
            {c.label}
          </span>
        </span>
      ))}
    </nav>
  );
}

function getPrimaryRole(roles: string[]): string {
  const order = ["admin", "itil", "operator_field", "hr_manager", "finance_manager", "report_viewer"];
  return order.find((r) => roles.includes(r)) ?? roles[0] ?? "requester";
}

function RoleSwitcher() {
  const { currentUser, switchUser } = useRBAC();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded px-2 py-1 bg-purple-600/20 border border-purple-500/30 hover:bg-purple-600/30 transition text-[10px] text-purple-300"
        title="Switch role for demo"
      >
        <Shield className="w-3 h-3" />
        <span className="hidden md:inline font-mono">{getPrimaryRole(currentUser.roles)}</span>
        <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-popover border border-border rounded-lg shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[11px] font-semibold text-muted-foreground">RBAC Role Switcher</span>
            <span className="text-[10px] text-muted-foreground/60 ml-auto">Demo mode</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {MOCK_USERS.slice(0, 10).map((user) => (
              <button
                key={user.id}
                onClick={() => { switchUser(user.id); setOpen(false); }}
                className={`w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-muted/60 transition-colors ${currentUser.id === user.id ? "bg-purple-900/30 border-l-2 border-purple-500" : ""}`}
              >
                <div className="w-6 h-6 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                  {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <div className="text-[12px] text-foreground font-medium truncate">{user.name}</div>
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {user.roles.slice(0, 2).map((r) => (
                      <span key={r} className="text-[9px] px-1 py-0.5 bg-purple-900/50 text-purple-300 rounded font-mono">{r}</span>
                    ))}
                    {user.roles.length > 2 && <span className="text-[9px] text-muted-foreground/60">+{user.roles.length - 2}</span>}
                  </div>
                </div>
                {currentUser.id === user.id && <span className="ml-auto text-purple-400 text-[11px]">●</span>}
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-border">
            <Link href="/app/admin?tab=rbac" onClick={() => setOpen(false)} className="text-[11px] text-primary hover:underline">
              Manage Roles & Permissions →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  info: <Info className="h-3.5 w-3.5 text-blue-400" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
  success: <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />,
  error: <XCircle className="h-3.5 w-3.5 text-red-400" />,
};

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const utils = trpc.useUtils();
  const { isAuthenticated, mergeTrpcQueryOpts } = useRBAC();

  const { data: count = 0 } = trpc.notifications.unreadCount.useQuery(undefined, mergeTrpcQueryOpts("notifications.unreadCount", {
    enabled: isAuthenticated,
    refetchInterval: isAuthenticated ? 30_000 : false,
  }));

  const { data: notifData } = trpc.notifications.list.useQuery({ unreadOnly: false, limit: 20 }, mergeTrpcQueryOpts("notifications.list", { enabled: isAuthenticated && open },));
  const items = notifData?.items ?? [];

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleNotifClick(n: (typeof items)[number]) {
    if (!n.isRead) markRead.mutate({ id: n.id });
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  function timeAgo(ts: string | Date) {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded p-1.5 text-slate-500 hover:text-slate-800 dark:text-[hsl(var(--header-fg))] dark:opacity-60 dark:hover:opacity-100 hover:bg-slate-100 dark:hover:bg-white/10 transition"
        title="Notifications"
      >
        <Bell className="h-3.5 w-3.5" />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white ring-1 ring-[hsl(var(--header-bg))]">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-muted-foreground/80" />
              <span className="text-xs font-semibold text-foreground">Notifications</span>
              {count > 0 && (
                <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-1.5 py-0.5 font-mono">
                  {count} new
                </span>
              )}
            </div>
            {count > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/60">
                <Bell className="h-7 w-7 mb-2 opacity-30" />
                <p className="text-xs">No notifications yet</p>
              </div>
            ) : (
              items.map((n: typeof items[number]) => (
                <button
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors",
                    !n.isRead && "bg-primary/5",
                  )}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {TYPE_ICON[n.type ?? "info"]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-xs leading-snug", !n.isRead ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/50 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1">
                    {n.link && <ExternalLink className="h-3 w-3 text-muted-foreground/50" />}
                    {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border">
            <Link
              href="/app/notifications"
              onClick={() => setOpen(false)}
              className="text-[11px] text-primary hover:underline"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { currentUser, isAdmin, mergeTrpcQueryOpts } = useRBAC();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const utils = trpc.useUtils();

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      localStorage.removeItem("nexusops_session");
      document.cookie = "nexusops_session=; path=/; max-age=0; SameSite=Lax";
      // Global invalidate is intentional on logout: the authenticated user is changing,
      // so all cached data (tickets, approvals, etc.) is stale for the next session.
      utils.invalidate();
      router.push("/login");
    },
    onError: () => {
      // Navigate away regardless — clear client state even if API call failed
      localStorage.removeItem("nexusops_session");
      document.cookie = "nexusops_session=; path=/; max-age=0; SameSite=Lax";
      router.push("/login");
    },
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initials = currentUser.name
    .split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-white/10 transition"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[0.6rem] font-bold text-white">
          {initials}
        </div>
        <div className="hidden md:block text-left">
          <p className="text-xs font-medium text-slate-700 dark:text-[hsl(var(--header-fg))] leading-none">{currentUser.name}</p>
          <p className="text-[0.6rem] text-slate-500 dark:text-[hsl(var(--header-fg))] dark:opacity-50 leading-none mt-0.5 font-mono">{getPrimaryRole(currentUser.roles)}</p>
        </div>
        <ChevronDown className={cn("h-3 w-3 text-slate-400 dark:text-white/40 transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Identity header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/40">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{currentUser.name}</p>
              <p className="text-[11px] text-muted-foreground/80 truncate">{currentUser.email}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {currentUser.roles.slice(0, 3).map((r) => (
                  <span key={r} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono">
                    {r}
                  </span>
                ))}
                {currentUser.roles.length > 3 && (
                  <span className="text-[9px] text-muted-foreground/60">+{currentUser.roles.length - 3}</span>
                )}
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <Link
              href="/app/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <User className="h-3.5 w-3.5 text-muted-foreground/60" />
              My Profile
            </Link>
            <Link
              href="/app/profile?tab=security"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground/60" />
              Change Password
            </Link>
            <Link
              href="/app/profile?tab=notifications"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <Bell className="h-3.5 w-3.5 text-muted-foreground/60" />
              Notification Preferences
            </Link>
            {isAdmin() && (
              <Link
                href="/app/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
              >
                <Building2 className="h-3.5 w-3.5 text-muted-foreground/60" />
                Organisation Settings
              </Link>
            )}
          </div>

          {/* Sign out */}
          <div className="border-t border-border py-1">
            <button
              onClick={() => { setOpen(false); logout.mutate(); }}
              disabled={logout.isPending}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              {logout.isPending ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  useEffect(() => setThemeMounted(true), []);
  const { currentUser, can, isAdmin, isAuthenticated, mergeTrpcQueryOpts } = useRBAC();
  const router = useRouter();

  const canCreateTicket = can("incidents", "write") || can("requests", "write");
  const showAdminLink = isAdmin();

  // Global search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);





  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // @ts-ignore - search router created in parallel
  const searchResults = trpc.search.global.useQuery({ query: debouncedQuery, limit: 20 }, mergeTrpcQueryOpts("search.global", { enabled: isAuthenticated && debouncedQuery.length > 1 },));

  const results: Array<{ id: string; type: string; title: string; description?: string; href: string }> =
    searchResults.data ?? [];

  const groupedResults = results.reduce<Record<string, typeof results>>((acc, item) => {
    const key = item.type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const flatResults = Object.values(groupedResults).flat();

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setFocusedIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setSearchOpen(false);
      setFocusedIndex(-1);
    } else if (e.key === "Enter") {
      if (focusedIndex >= 0 && flatResults[focusedIndex]) {
        router.push(flatResults[focusedIndex].href);
        setSearchOpen(false);
        setSearchQuery("");
        setFocusedIndex(-1);
      }
    }
  }

  const showDropdown = searchOpen && debouncedQuery.length > 1 && (results.length > 0);

  return (
    <header
      className="flex h-11 items-center justify-between px-4 border-b bg-white/80 dark:bg-[hsl(var(--header-bg))] backdrop-blur-xl border-slate-200/60 dark:border-[hsl(var(--header-border))] shadow-sm"
    >
      {/* Left: Logo + Org name + Breadcrumb */}
      <div className="flex items-center gap-4">
        <Link href="/app/dashboard" className="flex items-center gap-2 flex-shrink-0">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold text-slate-800 dark:text-[hsl(var(--header-fg))]">NexusOps</span>
            {currentUser.orgName && (
              <span className="text-[0.6rem] text-slate-500 dark:text-[hsl(var(--header-fg))] dark:opacity-50 truncate max-w-[120px]">
                {currentUser.orgName}
              </span>
            )}
          </div>
        </Link>
        <div className="h-4 w-px bg-slate-200 dark:bg-white/10 hidden md:block" />
        <Suspense fallback={null}>
          <Breadcrumbs />
        </Suspense>
      </div>

      {/* Center: Global search */}
      <div className="flex-1 max-w-md mx-4 hidden md:block relative" ref={searchContainerRef}>
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-3.5 w-3.5 text-slate-400 dark:text-white/40 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => { if (results.length > 0) setSearchOpen(true); }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search records…"
            className="w-full rounded border border-slate-200 bg-slate-50 pl-8 pr-12 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 hover:bg-slate-100 focus:bg-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:placeholder:text-white/40 dark:hover:bg-white/10 dark:focus:bg-white/10 dark:focus:border-white/20 dark:focus:ring-0"
          />
          <kbd className="absolute right-3 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[0.6rem] font-mono text-slate-400 pointer-events-none dark:border-white/15 dark:bg-transparent dark:text-white/30">
            ⌘K
          </kbd>
        </div>

        {showDropdown && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-80 overflow-auto">


            {searchResults.isLoading ? (
                <div className="px-4 py-3 text-xs text-slate-500">Searching…</div>
              ) : (
                <div className="py-1">
                  {Object.entries(groupedResults).map(([type, items]) => {
                    const firstItem = items[0];
                    const groupStart = firstItem ? flatResults.indexOf(firstItem) : 0;
                    return (
                      <div key={type}>
                        <div className="text-[10px] text-slate-500 uppercase px-3 py-1 tracking-wider">
                          {type.replace(/_/g, " ")}
                        </div>
                        {items.map((item, idx) => {
                          const globalIdx = groupStart + idx;
                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                router.push(item.href);
                                setSearchOpen(false);
                                setSearchQuery("");
                                setFocusedIndex(-1);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2 rounded text-xs flex flex-col gap-0.5 transition-colors",
                                focusedIndex === globalIdx ? "bg-primary/20" : "hover:bg-white/5",
                              )}
                            >
                              <span className="font-medium text-slate-200">{item.title}</span>
                              {item.description && (
                                <span className="text-slate-500 truncate">{item.description}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>
        )}
      </div>

      {/* Right: Actions + Profile */}
      <div className="flex items-center gap-1">
        {/* Create quick action — only for users who can raise tickets */}
        {canCreateTicket && (
          <Link
            href="/app/tickets/new"
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Create
          </Link>
        )}

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="rounded p-1.5 text-slate-500 hover:text-slate-800 dark:text-[hsl(var(--header-fg))] dark:opacity-60 dark:hover:opacity-100 hover:bg-slate-100 dark:hover:bg-white/10 transition"
          title="Toggle theme"
        >
          {!themeMounted ? (
            <Moon className="h-3.5 w-3.5 opacity-50" />
          ) : resolvedTheme === "dark" ? (
            <Sun className="h-3.5 w-3.5" />
          ) : (
            <Moon className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Help */}
        <button className="rounded p-1.5 text-slate-500 hover:text-slate-800 dark:text-[hsl(var(--header-fg))] dark:opacity-60 dark:hover:opacity-100 hover:bg-slate-100 dark:hover:bg-white/10 transition">
          <HelpCircle className="h-3.5 w-3.5" />
        </button>

        {/* Notifications */}
        <NotificationBell />

        {/* RBAC demo switcher — opt-in only (avoid mock users in customer-facing builds). */}
        {process.env.NEXT_PUBLIC_ENABLE_DEMO_ROLE_SWITCHER === "true" && <RoleSwitcher />}

        {/* Admin console — admins only */}
        {showAdminLink && (
          <Link href="/app/admin" className="rounded p-1.5 text-slate-500 hover:text-slate-800 dark:text-[hsl(var(--header-fg))] dark:opacity-60 dark:hover:opacity-100 hover:bg-slate-100 dark:hover:bg-white/10 transition" title="Admin Console">
            <Settings className="h-3.5 w-3.5" />
          </Link>
        )}

        {/* Divider */}
        <div className="h-5 w-px bg-slate-200 dark:bg-white/10 mx-1" />

        {/* User profile dropdown */}
        <UserMenu />
      </div>
    </header>
  );
}
