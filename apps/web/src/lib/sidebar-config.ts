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
        // "Changes" removed — it repeated this item's own href (/app/changes).
        // Problems and Releases are distinct routes and stay.
        children: [
          { label: "Problems", href: "/app/problems" },
          { label: "Releases", href: "/app/releases" },
        ],
      },
      {
        label: "Field Service",
        href: "/app/work-orders",
        icon: "Wrench",
        module: "work_orders",      // was "incidents" — field technicians need work_orders.read
        // "Work Orders" removed — it repeated this item's own href (/app/work-orders).
        // Parts & Inventory and On-Call are distinct routes and stay.
        children: [
          { label: "Parts & Inventory", href: "/app/work-orders/parts" },
          { label: "On-Call", href: "/app/on-call" },
        ],
      },
      {
        label: "IT Operations",
        href: "/app/events",
        icon: "Activity",
        module: "events",
        // "Event Management" removed — it repeated this item's own href (/app/events).
        // CMDB is a distinct route and stays.
        children: [
          { label: "CMDB", href: "/app/cmdb" },
        ],
      },
      {
        label: "Asset Management",
        href: "/app/ham",
        icon: "HardDrive",
        module: "ham",
        // "Hardware Assets" removed — it repeated this item's own href (/app/ham).
        // Software Assets is a distinct route and stays.
        children: [
          { label: "Software Assets", href: "/app/sam" },
        ],
      },
    ],
  },
  // ── Security & Compliance — HIDDEN FROM NAVIGATION ────────────────────────
  // The whole group is commented out of SIDEBAR_GROUPS, not deleted. Every route
  // below still exists and still resolves; they are reachable by URL, by the
  // command palette (⌘K), and by in-page links from other screens. Restore by
  // uncommenting this block — nothing else has to change.
  //
  // Consequence to be aware of before restoring or leaving as-is:
  //   /app/approvals and /app/flows were reachable ONLY from this group's
  //   "Approvals & Workflow" item and its "Flow Designer" child. Hiding the group
  //   makes /app/flows URL-only (the command palette does not list it), and leaves
  //   /app/approvals reachable only via ⌘K.
  //
  // {
  //   id: "security_compliance",
  //   label: "Security & Compliance",
  //   icon: "ShieldCheck",
  //   defaultExpanded: false,
  //   modules: ["security", "grc", "approvals"],
  //   items: [
  //     { label: "Overview", href: "/app/security-compliance", icon: "LayoutDashboard", module: "security" },
  //     { label: "SecOps", href: "/app/workbench/secops", icon: "Shield", module: "workbench" },
  //     { label: "GRC", href: "/app/workbench/grc", icon: "Scale", module: "workbench", dividerAfter: true },
  //     {
  //       label: "Security Operations",
  //       href: "/app/security",
  //       icon: "Shield",
  //       badge: "security_incidents_open",
  //       module: "security",
  //     },
  //     { label: "Risk & Compliance", href: "/app/grc", icon: "Scale", module: "grc" },
  //     {
  //       label: "DPDP Privacy",
  //       href: "/app/dpdp",
  //       icon: "ShieldCheck",
  //       module: "compliance",
  //       // All three children removed: "Data Subject Requests" repeated this item's own
  //       // href, and the other two were ?tab= into the same host page. The three tabs on
  //       // /app/dpdp are the sub-navigation. Verified by running that /app/dpdp,
  //       // ?tab=consent and ?tab=breach each still land on their tab, so bookmarks hold.
  //     },
  //     {
  //       label: "Approvals & Workflow",
  //       href: "/app/approvals",
  //       icon: "CheckSquare",
  //       badge: "approvals_pending",
  //       module: "approvals",
  //       // "Approval Queue" removed — it repeated this item's own href (/app/approvals).
  //       // Flow Designer is a distinct route and stays.
  //       children: [
  //         { label: "Flow Designer", href: "/app/flows" },
  //       ],
  //     },
  //   ],
  // },
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
        // "HR Cases" (bare /app/hr — the parent's own href) and "Leave Requests"
        // (/app/hr?tab=leave) were removed: both only re-entered this item's own
        // host page. HR Cases and Leave Management are tabs ON /app/hr, which is
        // where the sub-navigation belongs. The ?tab= URLs still resolve for any
        // bookmark — /app/hr now honours the param (see app/hr/page.tsx).
        // Everything below is a DISTINCT route with its own component and its own
        // procedures, so it stays.
        children: [
          { label: "Employee Portal", href: "/app/employee-portal" },
          { label: "Employee Center", href: "/app/employee-center" },
          { label: "Attendance", href: "/app/attendance" },
          { label: "My Expense Claims", href: "/app/hr/expenses" },
          { label: "Holiday Calendar", href: "/app/holidays" },
          { label: "OKRs & Goals", href: "/app/okr" },
        ],
      },
      {
        label: "Payroll",
        href: "/app/payroll",
        icon: "Wallet",
        module: "payroll",
      },
      {
        label: "Recruitment",
        href: "/app/recruitment",
        icon: "UserPlus",
        module: "recruitment",
        // All six children were removed: every one of them re-entered this item's
        // own host page (bare /app/recruitment, or ?tab= on it). The six tabs on
        // /app/recruitment are the sub-navigation. Two of the removed labels also
        // disagreed with the tab they reached ("Job Requisitions" vs the tab
        // "Requisitions", "Candidate Pipeline" vs "Pipeline"); removing the entries
        // resolves the mismatch at source. The ?tab= URLs still resolve.
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
        // All four children were removed: every one was a ?tab= into this item's own
        // host page. The four tabs on /app/performance are the sub-navigation and
        // their labels already match what these entries said. The ?tab= URLs still
        // resolve. NOTE: the removed "Goals & OKRs" child is a DIFFERENT goal store
        // from the "OKRs & Goals" entry under HR Service Delivery (/app/okr) — see
        // the label-collision note in the round report; deliberately not renamed.
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
        // All three children were removed: bare /app/catalog duplicated this item's
        // own href, and the other two were ?tab= into the same host page. The tabs on
        // /app/catalog are the sub-navigation. The ?tab= URLs still resolve.
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
        // "Procurement" (bare /app/procurement) removed — it duplicated this item's
        // own href. Every remaining child is a distinct route.
        children: [
          { label: "Financial Management", href: "/app/financial" },
          { label: "Chart of Accounts", href: "/app/finance/accounting/coa" },
          { label: "Journal Entries", href: "/app/finance/accounting/journal" },
          { label: "General Ledger", href: "/app/finance/accounting/ledger" },
          { label: "Trial Balance", href: "/app/finance/accounting/trial-balance" },
          { label: "Balance Sheet", href: "/app/finance/accounting/balance-sheet" },
          { label: "Profit & Loss", href: "/app/finance/accounting/pnl" },
          { label: "GST Registrations", href: "/app/finance/accounting/gstin" },
          { label: "GSTR Generation", href: "/app/finance/accounting/gstr" },
          { label: "Bank Reconciliation", href: "/app/finance/accounting/reconciliation" },
          { label: "Depreciation", href: "/app/finance/depreciation" },
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
        // All five children removed: every one was a ?tab= into this item's own host
        // page. The six tabs on /app/secretarial are the sub-navigation, and all six
        // ?tab= URLs were verified by running to still land on their tab.
        // Three of the removed labels also disagreed with the tab they reached
        // ("Company Overview" vs the tab "Overview", "Board & Meetings" vs "Board &
        // Directors"), and "Share Capital & ESOP" named two separate tabs while
        // linking only to `share` — the page has distinct `share` and `esop` tabs, and
        // `esop` had no sidebar entry at all. Removing the entries resolves all of it
        // at source. ("Statutory Registers" was removed earlier — that tab was never
        // built; restore an entry only if the registers tab lands.)
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
      { label: "Retention", href: "/app/settings/retention", icon: "Archive", module: "settings" },
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
