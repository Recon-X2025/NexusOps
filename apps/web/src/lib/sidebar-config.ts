import type { Module, SystemRole } from "@coheronconnect/types";
import { DEVOPS_ENABLED, APM_ENABLED } from "@/lib/feature-flags";

export type SidebarChild = { label: string; href: string };

export type SidebarBadgeKey =
  | "incidents_open"
  | "security_incidents_open"
  | "approvals_pending";

export type SidebarItem = {
  label: string;
  href: string;
  icon: string;
  badge?: SidebarBadgeKey;
  requiresRole?: SystemRole;
  /** RBAC module — item is hidden when the user cannot read this module */
  module?: Module;
  children?: SidebarChild[];
  /**
   * Render a thin visual divider after this item in the rendered sidebar.
   * Used to separate persona workbenches (entry points) from raw module
   * routes inside a hub group.
   */
  dividerAfter?: boolean;
};

export type SidebarGroup = {
  id: string;
  label: string;
  icon: string;
  defaultExpanded: boolean;
  /** All items in this group are hidden when the user cannot access any of these modules */
  modules?: Module[];
  items: SidebarItem[];
};

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: "home",
    label: "Platform",
    icon: "LayoutDashboard",
    defaultExpanded: true,
    items: [
      { label: "Command Center", href: "/app/command", icon: "LayoutDashboard", module: "command_center" },
      // Analytics & Reporting deliberately does NOT live at the Platform
      // level. Each hub's Overview surfaces an "Analytics & Reporting"
      // tab scoped to that hub, and (follow-up) workbenches expose their
      // own reports views — that's where operators actually need it.
      {
        label: "Administration",
        href: "/app/admin",
        icon: "SlidersHorizontal",
        requiresRole: "admin",
        module: "admin",
      },
    ],
  },
  {
    id: "it_services",
    label: "IT Services",
    icon: "Monitor",
    defaultExpanded: true,
    modules: ["incidents", "changes", "problems", "work_orders", "cmdb", "ham", "sam"],
    items: [
      { label: "Overview", href: "/app/it-services", icon: "LayoutDashboard", module: "incidents" },
      { label: "Service Desk", href: "/app/workbench/service-desk", icon: "Headset", module: "workbench" },
      { label: "Change & Release", href: "/app/workbench/change-release", icon: "GitBranch", module: "workbench" },
      { label: "Field Service", href: "/app/workbench/field-service", icon: "Wrench", module: "workbench", dividerAfter: true },
      {
        label: "Service Requests",
        href: "/app/tickets",
        icon: "Headset",
        badge: "incidents_open",
        module: "incidents",
      },
      {
        label: "Major incidents",
        href: "/app/it-services/major-incidents",
        icon: "Flame",
        module: "incidents",
      },
      {
        label: "Change & Problem",
        href: "/app/changes",
        icon: "GitBranch",
        module: "changes",
        children: [
          { label: "Changes", href: "/app/changes" },
          { label: "Problems", href: "/app/problems" },
          { label: "Releases", href: "/app/releases" },
        ],
      },
      {
        label: "Field Service",
        href: "/app/work-orders",
        icon: "Wrench",
        module: "work_orders",      // was "incidents" — field technicians need work_orders.read
        children: [
          { label: "Work Orders", href: "/app/work-orders" },
          { label: "Parts & Inventory", href: "/app/work-orders/parts" },
          { label: "On-Call", href: "/app/on-call" },
        ],
      },
      {
        label: "IT Operations",
        href: "/app/events",
        icon: "Activity",
        module: "events",
        children: [
          { label: "Event Management", href: "/app/events" },
          { label: "CMDB", href: "/app/cmdb" },
        ],
      },
      {
        label: "Asset Management",
        href: "/app/ham",
        icon: "HardDrive",
        module: "ham",
        children: [
          { label: "Hardware Assets", href: "/app/ham" },
          { label: "Software Assets", href: "/app/sam" },
        ],
      },
    ],
  },
  {
    id: "security_compliance",
    label: "Security & Compliance",
    icon: "ShieldCheck",
    defaultExpanded: false,
    modules: ["security", "grc", "approvals"],
    items: [
      { label: "Overview", href: "/app/security-compliance", icon: "LayoutDashboard", module: "security" },
      { label: "SecOps", href: "/app/workbench/secops", icon: "Shield", module: "workbench" },
      { label: "GRC", href: "/app/workbench/grc", icon: "Scale", module: "workbench", dividerAfter: true },
      {
        label: "Security Operations",
        href: "/app/security",
        icon: "Shield",
        badge: "security_incidents_open",
        module: "security",
      },
      { label: "Risk & Compliance", href: "/app/grc", icon: "Scale", module: "grc" },
      { label: "ESG Reporting", href: "/app/esg", icon: "Leaf", module: "grc" },
      {
        label: "Approvals & Workflow",
        href: "/app/approvals",
        icon: "CheckSquare",
        badge: "approvals_pending",
        module: "approvals",
        children: [
          { label: "Approval Queue", href: "/app/approvals" },
          { label: "Flow Designer", href: "/app/flows" },
        ],
      },
    ],
  },
  {
    id: "people_workplace",
    label: "People & Workplace",
    icon: "Users",
    defaultExpanded: false,
    modules: ["hr", "onboarding", "recruitment", "workforce_analytics"],
    items: [
      { label: "Overview", href: "/app/people-workplace", icon: "LayoutDashboard", module: "hr" },
      { label: "HR Ops", href: "/app/workbench/hr-ops", icon: "UserCheck", module: "workbench" },
      { label: "Recruiter", href: "/app/workbench/recruiter", icon: "UserPlus", module: "workbench", dividerAfter: true },
      {
        label: "HR Service Delivery",
        href: "/app/hr",
        icon: "UserCheck",
        module: "hr",
        children: [
          { label: "HR Cases", href: "/app/hr" },
          { label: "Employee Portal", href: "/app/employee-portal" },
          { label: "Employee Center", href: "/app/employee-center" },
          { label: "Leave Requests", href: "/app/hr?tab=leave" },
          { label: "Attendance", href: "/app/attendance" },
          { label: "My Expense Claims", href: "/app/hr/expenses" },
          { label: "Holiday Calendar", href: "/app/holidays" },
          { label: "OKRs & Goals", href: "/app/okr" },
        ],
      },
      {
        label: "Recruitment",
        href: "/app/recruitment",
        icon: "UserPlus",
        module: "recruitment",
        children: [
          { label: "Dashboard", href: "/app/recruitment" },
          { label: "Job Requisitions", href: "/app/recruitment?tab=requisitions" },
          { label: "Candidate Pipeline", href: "/app/recruitment?tab=pipeline" },
          { label: "Candidates", href: "/app/recruitment?tab=candidates" },
          { label: "Interviews", href: "/app/recruitment?tab=interviews" },
          { label: "Offers", href: "/app/recruitment?tab=offers" },
        ],
      },
      {
        label: "People & Workforce Analytics",
        href: "/app/people-analytics",
        icon: "BarChart3",
        module: "workforce_analytics",
      },
      {
        label: "Performance Management",
        href: "/app/performance",
        icon: "Target",
        module: "hr",
        children: [
          { label: "Review Cycles", href: "/app/performance?tab=cycles" },
          { label: "My Reviews", href: "/app/performance?tab=my-reviews" },
          { label: "Goals & OKRs", href: "/app/performance?tab=goals" },
          { label: "Team Overview", href: "/app/performance?tab=team" },
        ],
      },
      {
        label: "Facilities & Real Estate",
        href: "/app/facilities",
        icon: "Building2",
        module: "work_orders",
      },
    ],
  },
  {
    id: "customer_sales",
    label: "Customer & Sales",
    icon: "Handshake",
    defaultExpanded: false,
    modules: ["csm", "accounts", "catalog"],
    items: [
      { label: "Overview", href: "/app/customer-sales", icon: "LayoutDashboard", module: "accounts" },
      { label: "CSM", href: "/app/workbench/csm", icon: "Headphones", module: "workbench", dividerAfter: true },
      { label: "Customer Service", href: "/app/csm", icon: "Headphones", module: "csm" },
      { label: "CRM & Sales", href: "/app/crm", icon: "TrendingUp", module: "accounts" },
      {
        label: "Service Catalog",
        href: "/app/catalog",
        icon: "LayoutGrid",
        module: "catalog",
        children: [
          { label: "Browse Catalog", href: "/app/catalog" },
          { label: "My Requests", href: "/app/catalog?tab=my-requests" },
          { label: "Catalog Admin", href: "/app/catalog?tab=admin" },
        ],
      },
      { label: "Surveys", href: "/app/surveys", icon: "ClipboardList", module: "analytics" }, // was reports.read; surveys router uses analytics module
    ],
  },
  {
    id: "finance_procurement",
    label: "Finance & Procurement",
    icon: "Banknote",
    defaultExpanded: false,
    modules: ["financial", "contracts"],
    items: [
      { label: "Overview", href: "/app/finance-procurement", icon: "LayoutDashboard", module: "financial" },
      { label: "AP / AR", href: "/app/workbench/finance-ops", icon: "Banknote", module: "workbench" },
      { label: "Procurement", href: "/app/workbench/procurement", icon: "ShoppingCart", module: "workbench", dividerAfter: true },
      {
        label: "Supply Chain & Finance",
        href: "/app/procurement",
        icon: "ShoppingCart",
        module: "financial",
        children: [
          { label: "Procurement", href: "/app/procurement" },
          { label: "Financial Management", href: "/app/financial" },
          { label: "Chart of Accounts", href: "/app/finance/accounting/coa" },
          { label: "Journal Entries", href: "/app/finance/accounting/journal" },
          { label: "General Ledger", href: "/app/finance/accounting/ledger" },
          { label: "Vendors", href: "/app/vendors" },
        ],
      },
      {
        label: "Contract Management",
        href: "/app/contracts",
        icon: "FileSignature",
        module: "contracts",
      },
      {
        label: "Expenses & Reimbursements",
        href: "/app/finance/expenses",
        icon: "Receipt",
        module: "financial",
      },
    ],
  },
  {
    id: "legal_governance",
    label: "Legal & Governance",
    icon: "Scale",
    defaultExpanded: false,
    modules: ["legal", "contracts", "secretarial"],
    items: [
      { label: "Overview", href: "/app/legal-governance", icon: "LayoutDashboard", module: "contracts" },
      { label: "Company Secretary", href: "/app/workbench/company-secretary", icon: "Briefcase", module: "workbench", dividerAfter: true },
      { label: "Legal Service Delivery", href: "/app/legal", icon: "Gavel", module: "legal" },
      {
        label: "Secretarial & CS",
        href: "/app/secretarial",
        icon: "Briefcase",
        module: "secretarial",               // was "policy" — now correctly gated
        children: [
          { label: "Company Overview", href: "/app/secretarial?tab=overview" },
          { label: "Board & Meetings", href: "/app/secretarial?tab=board" },
          { label: "MCA / ROC Filings", href: "/app/secretarial?tab=filings" },
          { label: "Share Capital & ESOP", href: "/app/secretarial?tab=share" },
          { label: "Statutory Registers", href: "/app/secretarial?tab=registers" },
          { label: "Compliance Calendar", href: "/app/secretarial?tab=calendar" },
        ],
      },
    ],
  },
  {
    // Strategy Center: executive/PMO surface for initiatives, portfolio
    // shape, OKRs, and the application landscape. The day-to-day task
    // board (Linear/Jira space) intentionally lives behind a feature
    // flag — this nav surface stays oversight-focused.
    id: "strategy_center",
    label: "Strategy Center",
    icon: "Target",
    defaultExpanded: false,
    modules: ["projects", "analytics"],
    items: [
      { label: "Strategy Center", href: "/app/strategy", icon: "LayoutDashboard", module: "projects" },
      { label: "PMO", href: "/app/workbench/pmo", icon: "Target", module: "workbench", dividerAfter: true },
      { label: "Initiatives", href: "/app/projects", icon: "FolderKanban", module: "projects" },
    ],
  },
  {
    id: "knowledge_hub",
    label: "Knowledge",
    icon: "BookOpen",
    defaultExpanded: false,
    modules: ["knowledge"],
    items: [
      { label: "Knowledge Base", href: "/app/knowledge", icon: "BookOpen", module: "knowledge" },
      ...(DEVOPS_ENABLED
        ? [{ label: "DevOps", href: "/app/devops", icon: "GitPullRequest" as const, module: "cmdb" as const }]
        : []),
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: "Settings",
    defaultExpanded: false,
    modules: ["settings"],
    items: [
      { label: "Integrations", href: "/app/settings/integrations", icon: "Plug", module: "settings" },
      { label: "Omnichannel", href: "/app/settings/omnichannel", icon: "MessagesSquare", module: "settings" },
      { label: "Webhooks", href: "/app/settings/webhooks", icon: "Globe", module: "settings" },
      { label: "API Keys", href: "/app/settings/api-keys", icon: "KeyRound", module: "settings" },
      { label: "App Inventory", href: "/app/apm", icon: "AppWindow", module: "reports" },
    ],
  },
  {
    id: "setup",
    label: "Setup & Onboarding",
    icon: "Sparkles",
    defaultExpanded: false,
    modules: ["admin"],
    items: [
      { label: "Setup Wizard", href: "/app/onboarding-wizard", icon: "Zap", module: "admin" },
    ],
  },
];
