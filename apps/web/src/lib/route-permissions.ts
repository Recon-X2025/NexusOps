import type { Module, RbacAction } from "@coheronconnect/types";

/**
 * Route → RBAC module map for the layout-level page guard.
 *
 * This is the single place that decides which RBAC module gates each `/app/*`
 * route. It mirrors the module assignments in `sidebar-config.ts`, so a page is
 * reachable by URL exactly when its nav entry is visible — the guard and the
 * sidebar can never disagree.
 *
 * The guard (see `components/layout/route-guard.tsx`) gates on module *read*
 * (`canAccess`), which is the right granularity for page reachability: if you
 * cannot read a module you have no business on any of its pages. Finer-grained
 * gating (who can edit vs view) stays inside the page and, authoritatively, on
 * the API (`permissionProcedure`).
 *
 * IMPORTANT: when you add a new module route, add it here. Unmapped routes fall
 * through to *allow* — this guard is UI defense-in-depth layered on top of the
 * API, which is the authoritative authorization boundary; a missing entry must
 * never be able to lock a legitimate user out of a page the API would serve.
 */

/**
 * Routes every authenticated user may reach regardless of module permissions:
 * the landing pages, their own profile, notifications, and the read-only
 * self-service surfaces (payslip portal / employee service center).
 */
export const PUBLIC_APP_ROUTES: readonly string[] = [
  "/app/command",
  "/app/dashboard",
  "/app/profile",
  "/app/notifications",
  "/app/employee-portal",
  "/app/employee-center",
];

/**
 * Path-prefix → module rules. Matched on segment boundaries (an entry `/app/hr`
 * matches `/app/hr` and `/app/hr/anything`, but not `/app/hrfoo`). When several
 * rules match, the longest (most specific) prefix wins, so order here does not
 * matter — resolution sorts by length.
 */
const ROUTE_MODULE_RULES: ReadonlyArray<{ prefix: string; module: Module }> = [
  // ── IT Services ────────────────────────────────────────────────────────────
  { prefix: "/app/it-services", module: "incidents" },
  { prefix: "/app/tickets", module: "incidents" },
  { prefix: "/app/walk-up", module: "incidents" },
  { prefix: "/app/changes", module: "changes" },
  { prefix: "/app/problems", module: "problems" },
  { prefix: "/app/releases", module: "changes" },
  { prefix: "/app/work-orders", module: "work_orders" },
  { prefix: "/app/on-call", module: "work_orders" },
  { prefix: "/app/events", module: "events" },
  { prefix: "/app/cmdb", module: "cmdb" },
  { prefix: "/app/ham", module: "ham" },
  { prefix: "/app/sam", module: "sam" },
  { prefix: "/app/escalations", module: "escalations" },

  // ── Security & Compliance ──────────────────────────────────────────────────
  { prefix: "/app/security-compliance", module: "security" },
  { prefix: "/app/security", module: "security" },
  { prefix: "/app/grc", module: "grc" },
  { prefix: "/app/dpdp", module: "compliance" },
  { prefix: "/app/compliance", module: "compliance" },
  { prefix: "/app/approvals", module: "approvals" },
  { prefix: "/app/flows", module: "approvals" },
  { prefix: "/app/workflows", module: "approvals" },

  // ── People & Workplace ─────────────────────────────────────────────────────
  { prefix: "/app/people-workplace", module: "hr" },
  { prefix: "/app/people-analytics", module: "workforce_analytics" },
  { prefix: "/app/payroll", module: "payroll" },
  { prefix: "/app/recruitment", module: "recruitment" },
  { prefix: "/app/performance", module: "hr" },
  { prefix: "/app/attendance", module: "hr" },
  { prefix: "/app/holidays", module: "hr" },
  { prefix: "/app/okr", module: "hr" },
  { prefix: "/app/hr", module: "hr" },

  // ── Customer & Sales ───────────────────────────────────────────────────────
  { prefix: "/app/customer-sales", module: "accounts" },
  { prefix: "/app/csm", module: "csm" },
  { prefix: "/app/crm", module: "accounts" },
  { prefix: "/app/catalog", module: "catalog" },
  { prefix: "/app/surveys", module: "analytics" },

  // ── Finance & Procurement ──────────────────────────────────────────────────
  { prefix: "/app/finance-procurement", module: "financial" },
  // Longest prefix wins: the depreciation screen lives under Finance but every
  // `depreciation.*` procedure gates on `cmdb` (it is part of the asset module).
  // Guarding the route on `financial` would let a finance-only user reach a page
  // whose every query is denied.
  { prefix: "/app/finance/depreciation", module: "cmdb" },
  { prefix: "/app/finance", module: "financial" },
  { prefix: "/app/financial", module: "financial" },
  // `/app/accounting` was retired on 2026-08-17. It was a duplicate finance
  // console with no sidebar entry, reachable only by URL, whose P&L tab reported
  // an inception-to-date figure labelled "Net Profit". Its two unique screens
  // (GSTR Generation, Trial Balance) were promoted to /app/finance/accounting/*
  // first, so nothing was stranded by the removal.
  { prefix: "/app/procurement", module: "financial" },
  { prefix: "/app/expenses", module: "financial" },
  { prefix: "/app/vendors", module: "vendors" },
  { prefix: "/app/contracts", module: "contracts" },

  // ── Legal & Governance ─────────────────────────────────────────────────────
  { prefix: "/app/legal-governance", module: "contracts" },
  { prefix: "/app/legal", module: "legal" },
  { prefix: "/app/secretarial", module: "secretarial" },

  // ── Strategy ───────────────────────────────────────────────────────────────
  { prefix: "/app/strategy-projects", module: "projects" },
  { prefix: "/app/strategy", module: "projects" },
  { prefix: "/app/projects", module: "projects" },

  // ── Knowledge / DevOps ─────────────────────────────────────────────────────
  { prefix: "/app/knowledge", module: "knowledge" },
  { prefix: "/app/developer-ops", module: "cmdb" },
  { prefix: "/app/devops", module: "cmdb" },

  // ── Reporting / App inventory ──────────────────────────────────────────────
  { prefix: "/app/reports", module: "reports" },
  { prefix: "/app/apm", module: "reports" },

  // ── Virtual agent ──────────────────────────────────────────────────────────
  { prefix: "/app/virtual-agent", module: "virtual_agent" },
  { prefix: "/app/agent", module: "virtual_agent" },

  // ── Persona workbenches ────────────────────────────────────────────────────
  { prefix: "/app/workbench", module: "workbench" },

  // ── Settings / Admin / Setup ───────────────────────────────────────────────
  // More specific than /app/settings below, and SORTED_RULES is longest-prefix
  // first, so this wins. The page is settings-shaped but the data is approvals:
  // gating it on `settings` would lock out an approvals admin who has no
  // settings grant.
  { prefix: "/app/settings/approval-chains", module: "approvals" },
  { prefix: "/app/settings", module: "settings" },
  { prefix: "/app/admin", module: "admin" },
  { prefix: "/app/onboarding-wizard", module: "admin" },
];

// Longest-prefix-first, so the most specific rule wins deterministically.
const SORTED_RULES = [...ROUTE_MODULE_RULES].sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Resolve the RBAC module that gates a given `/app/*` pathname.
 *
 * Returns `null` when the route is public (always allowed) or unmapped (falls
 * through to allow — see the file header). A non-null module means the guard
 * should require `canAccess(module)` before rendering the page.
 */
export function resolveRouteModule(pathname: string): Module | null {
  // Normalise: strip any trailing slash except the root "/app".
  const path =
    pathname.length > 4 && pathname.endsWith("/")
      ? pathname.replace(/\/+$/, "")
      : pathname;

  // The app root (landing/redirect target) is always allowed — exact match only,
  // never as a prefix (else it would allow every /app/* route).
  if (path === "/app") return null;

  if (PUBLIC_APP_ROUTES.some((r) => matchesPrefix(path, r))) return null;

  for (const rule of SORTED_RULES) {
    if (matchesPrefix(path, rule.prefix)) return rule.module;
  }
  return null;
}

/**
 * Alternative read-access grants for routes whose page/data serve more than one
 * RBAC domain. A route mapped to module X (above) is normally page-gated on
 * `canAccess(X)`; if the user fails that, the guard additionally admits them
 * when they hold ANY alternative grant listed here for that route.
 *
 * `/app/payroll`: a Finance/CFO approver holds `financial.write` (the authority
 * the payroll approval action requires) but not `payroll.read`. Without this,
 * the approver is locked out of the only surface that hosts the approve control
 * — a page/action gate mismatch. This grants them page READ access only; every
 * write/compute/lock/generate path, and the approve action's own per-step gate
 * and segregation-of-duties check, remain unchanged and authoritative on the API.
 */
const ROUTE_READ_ALTERNATIVES: ReadonlyArray<{
  prefix: string;
  module: Module;
  action: RbacAction;
}> = [{ prefix: "/app/payroll", module: "financial", action: "write" }];

/**
 * Resolve any alternative `(module, action)` grants that also confer read
 * access to `pathname`'s page. Empty when the route has no alternatives.
 */
export function resolveRouteReadAlternatives(
  pathname: string,
): ReadonlyArray<{ module: Module; action: RbacAction }> {
  const path =
    pathname.length > 4 && pathname.endsWith("/")
      ? pathname.replace(/\/+$/, "")
      : pathname;
  return ROUTE_READ_ALTERNATIVES.filter((r) => matchesPrefix(path, r.prefix)).map(
    ({ module, action }) => ({ module, action }),
  );
}
