import type { Module, SystemRole } from "@nexusops/types";

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
      { label: "Platform Dashboard", href: "/app/dashboard", icon: "LayoutDashboard" },
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
      {
        label: "Service Desk",
        href: "/app/tickets",
        icon: "Headset",
        badge: "incidents_open",
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
        module: "cmdb",
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
          { label: "Expense Claims", href: "/app/expenses" },
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
          { label: "Review Cycles",  href: "/app/performance?tab=cycles" },
          { label: "My Reviews",     href: "/app/performance?tab=my-reviews" },
          { label: "Goals & OKRs",   href: "/app/performance?tab=goals" },
          { label: "Team Overview",  href: "/app/performance?tab=team" },
        ],
      },
      {
        label: "Facilities & Real Estate",
        href: "/app/facilities",
        icon: "Building2",
        module: "work_orders",
      },
      { label: "Walk-Up Experience", href: "/app/walk-up", icon: "Footprints", module: "incidents" },
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
      {
        label: "Supply Chain & Finance",
        href: "/app/procurement",
        icon: "ShoppingCart",
        module: "financial",
        children: [
          { label: "Procurement", href: "/app/procurement" },
          { label: "Financial Management", href: "/app/financial" },
          { label: "Accounting (COA / Journal / GSTR)", href: "/app/accounting" },
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
        label: "Expense Management",
        href: "/app/expenses",
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
    modules: ["contracts", "secretarial"],   // was ["contracts","policy"] — secretarial is now its own module
    items: [
      { label: "Overview", href: "/app/legal-governance", icon: "LayoutDashboard", module: "contracts" },
      { label: "Legal Service Delivery", href: "/app/legal", icon: "Gavel", module: "contracts" },
      {
        label: "Secretarial & CS",
        href: "/app/secretarial",
        icon: "Briefcase",
        module: "secretarial",               // was "policy" — now correctly gated
        children: [
          { label: "Company Overview",     href: "/app/secretarial?tab=overview" },
          { label: "Board & Meetings",     href: "/app/secretarial?tab=board" },
          { label: "MCA / ROC Filings",    href: "/app/secretarial?tab=filings" },
          { label: "Share Capital & ESOP", href: "/app/secretarial?tab=share" },
          { label: "Statutory Registers",  href: "/app/secretarial?tab=registers" },
          { label: "Compliance Calendar",  href: "/app/secretarial?tab=calendar" },
        ],
      },
    ],
  },
  {
    id: "strategy_projects",
    label: "Strategy & Projects",
    icon: "Target",
    defaultExpanded: false,
    modules: ["projects", "analytics"],   // was ["reports","analytics"] — projects is a separate module
    items: [
      { label: "Overview", href: "/app/strategy-projects", icon: "LayoutDashboard", module: "projects" },
      { label: "Project Portfolio", href: "/app/projects", icon: "FolderKanban", module: "projects" },
      { label: "Application Portfolio", href: "/app/apm", icon: "AppWindow", module: "reports" },
      { label: "Analytics & Reporting", href: "/app/reports", icon: "BarChart3", module: "analytics" },
    ],
  },
  {
    id: "developer_ops",
    label: "Developer & Ops",
    icon: "Code",
    defaultExpanded: false,
    modules: ["knowledge"],
    items: [
      { label: "Overview", href: "/app/developer-ops", icon: "LayoutDashboard", module: "knowledge" },
      { label: "DevOps", href: "/app/devops", icon: "GitPullRequest", module: "cmdb" },
      { label: "Knowledge Management", href: "/app/knowledge", icon: "BookOpen", module: "knowledge" },
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
      { label: "Webhooks",     href: "/app/settings/webhooks",     icon: "Globe", module: "settings" },
      { label: "API Keys",     href: "/app/settings/api-keys",     icon: "KeyRound", module: "settings" },
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
