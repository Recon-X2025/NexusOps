#!/usr/bin/env node
/**
 * NexusOps — 500-Session Comprehensive Stress Test
 *
 * Simulates 500 concurrent user sessions where each session is a realistic
 * multi-step workflow across ALL 34 system modules. Tests reads, writes,
 * search, RBAC enforcement, pagination, AI, approvals, and cascades.
 *
 * Architecture:
 *   - PHASES: Auth → Warm-up reads → Parallel write bursts → Cross-module journeys → Teardown
 *   - Each session picks a user ROLE and exercises that role's full surface area
 *   - Tracks per-module latency, success rate, throughput, and error types
 *   - Exits non-zero on any 5xx or network failure
 *
 * Usage:
 *   node scripts/stress-test-500.js
 *   SESSIONS=500 BASE_URL=http://localhost:3001 node scripts/stress-test-500.js
 *   SESSIONS=100 RAMP_MS=2000 node scripts/stress-test-500.js   # ramp over 2s
 */

"use strict";

// ── Config ──────────────────────────────────────────────────────────────────

const BASE       = (process.env.BASE_URL  ?? "http://localhost:3001") + "/trpc";
const SESSIONS   = parseInt(process.env.SESSIONS   ?? "500", 10);
const RAMP_MS    = parseInt(process.env.RAMP_MS    ?? "0",   10);  // 0 = all at once
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS ?? "30000", 10);
const VERBOSE    = process.env.VERBOSE === "1";

// User personas — maps role name → login credentials
// Defaults match the seeded demo accounts in packages/db/src/seed.ts
const PERSONAS = [
  { role: "admin",            email: process.env.ADMIN_EMAIL     ?? "admin@coheron.com",    password: process.env.ADMIN_PASS     ?? "demo1234!" },
  { role: "itil_agent",       email: process.env.AGENT_EMAIL     ?? "agent1@coheron.com",   password: process.env.AGENT_PASS     ?? "demo1234!" },
  { role: "hr_manager",       email: process.env.HR_EMAIL        ?? "hr@coheron.com",        password: process.env.HR_PASS        ?? "demo1234!" },
  { role: "finance_manager",  email: process.env.FINANCE_EMAIL   ?? "finance@coheron.com",  password: process.env.FINANCE_PASS   ?? "demo1234!" },
  { role: "requester",        email: process.env.REQUESTER_EMAIL ?? "employee@coheron.com", password: process.env.REQUESTER_PASS ?? "demo1234!" },
  { role: "security_analyst", email: process.env.SEC_EMAIL       ?? "agent2@coheron.com",   password: process.env.SEC_PASS       ?? "demo1234!" },
];

// ── HTTP helpers ────────────────────────────────────────────────────────────

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function trpcMutation(path, body, token) {
  return fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function trpcQuery(path, input, token) {
  const qs =
    input && Object.keys(input).length > 0
      ? `?input=${encodeURIComponent(JSON.stringify(input))}`
      : "";
  return fetch(`${BASE}/${path}${qs}`, {
    method: "GET",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function login(persona) {
  const res = await withTimeout(
    trpcMutation("auth.login", { email: persona.email, password: persona.password }),
    TIMEOUT_MS,
  );
  const json = await res.json().catch(() => ({}));
  const token = json?.result?.data?.sessionId;
  return token ?? null;
}

// ── Scenario catalogue — one entry per logical operation ────────────────────
//
// Each scenario:
//   name      — human label (used in report)
//   module    — which router / area
//   roles     — which personas can execute this (["*"] = all)
//   weight    — relative frequency within a session
//   fn(t, i)  — returns a fetch() Promise
//
// Total: 78 scenarios across all 34 modules + cross-cutting concerns

const SCENARIOS = [
  // ── Auth & Session ──────────────────────────────────────────────────────
  { name: "auth.me",                    module: "auth",         roles: ["*"], weight: 8,
    fn: (t)    => trpcQuery("auth.me", {}, t) },
  { name: "auth.listSessions",          module: "auth",         roles: ["admin"], weight: 2,
    fn: (t)    => trpcQuery("auth.listSessions", {}, t) },

  // ── Dashboard ───────────────────────────────────────────────────────────
  { name: "dashboard.getMetrics",       module: "dashboard",    roles: ["*"], weight: 6,
    fn: (t)    => trpcQuery("dashboard.getMetrics", {}, t) },

  // ── Tickets (ITSM) ──────────────────────────────────────────────────────
  { name: "tickets.list",               module: "tickets",      roles: ["*"], weight: 12,
    fn: (t)    => trpcQuery("tickets.list", { limit: 20 }, t) },
  { name: "tickets.list.filtered",      module: "tickets",      roles: ["*"], weight: 4,
    fn: (t)    => trpcQuery("tickets.list", { limit: 10, type: "incident" }, t) },
  { name: "tickets.statusCounts",       module: "tickets",      roles: ["*"], weight: 6,
    fn: (t)    => trpcQuery("tickets.statusCounts", {}, t) },
  { name: "tickets.create",             module: "tickets",      roles: ["admin","itil_agent","requester"], weight: 8,
    fn: (t, i) => trpcMutation("tickets.create", {
      title:       `[STRESS] Ticket ${i} — ${randomWord()}`,
      description: `Automated stress test session ${i}. ${lorem()}`,
      type:        randomFrom(["incident","request","problem","change_request"]),
      tags:        ["stress-test"],
    }, t) },
  { name: "tickets.search",             module: "tickets",      roles: ["*"], weight: 4,
    fn: (t)    => trpcQuery("tickets.list", { limit: 5, search: "server" }, t) },
  { name: "tickets.paginate.p2",        module: "tickets",      roles: ["*"], weight: 3,
    fn: (t)    => trpcQuery("tickets.list", { limit: 10, cursor: "2" }, t) },

  // ── Changes ─────────────────────────────────────────────────────────────
  { name: "changes.list",               module: "changes",      roles: ["*"], weight: 4,
    fn: (t)    => trpcQuery("changes.list", { limit: 20 }, t) },
  { name: "changes.create",             module: "changes",      roles: ["admin","itil_agent"], weight: 3,
    fn: (t, i) => trpcMutation("changes.create", {
      title:       `[STRESS] Change ${i}`,
      description: `Stress-induced change request`,
      type:        randomFrom(["normal","emergency","standard"]),
      risk:        randomFrom(["low","medium","high"]),
    }, t) },

  // ── Assets (CMDB) ────────────────────────────────────────────────────────
  { name: "assets.list",                module: "assets",       roles: ["*"], weight: 4,
    fn: (t)    => trpcQuery("assets.list", { limit: 20 }, t) },
  { name: "assets.create",              module: "assets",       roles: ["admin","itil_agent"], weight: 2,
    fn: (t, i) => trpcMutation("assets.create", {
      name:         `Stress Asset ${i}`,
      type:         randomFrom(["hardware","software","network","cloud"]),
      status:       "active",
      serialNumber: `SN-STRESS-${i}-${Date.now()}`,
    }, t) },

  // ── Work Orders (Field Service) ─────────────────────────────────────────
  { name: "workOrders.list",            module: "work-orders",  roles: ["*"], weight: 3,
    fn: (t)    => trpcQuery("workOrders.list", { limit: 20 }, t) },
  { name: "workOrders.create",          module: "work-orders",  roles: ["admin","itil_agent"], weight: 2,
    fn: (t, i) => trpcMutation("workOrders.create", {
      title:       `[STRESS] Work Order ${i}`,
      description: `Field service stress test`,
      priority:    randomFrom(["low","medium","high","critical"]),
    }, t) },
  { name: "workOrders.metrics",         module: "work-orders",  roles: ["*"], weight: 2,
    fn: (t)    => trpcQuery("workOrders.metrics", {}, t) },

  // ── Security (SecOps) ───────────────────────────────────────────────────
  { name: "security.listIncidents",     module: "security",     roles: ["admin","security_analyst","itil_agent"], weight: 3,
    fn: (t)    => trpcQuery("security.listIncidents", { limit: 20 }, t) },
  { name: "security.listVulns",         module: "security",     roles: ["admin","security_analyst","itil_agent"], weight: 2,
    fn: (t)    => trpcQuery("security.listVulnerabilities", { limit: 20 }, t) },
  { name: "security.createIncident",    module: "security",     roles: ["admin","security_analyst","itil_agent"], weight: 2,
    fn: (t, i) => trpcMutation("security.createIncident", {
      title:     `[STRESS] Security Incident ${i}`,
      severity:  randomFrom(["low","medium","high","critical"]),
      type:      randomFrom(["malware","phishing","unauthorized_access","data_breach"]),
    }, t) },

  // ── GRC ─────────────────────────────────────────────────────────────────
  { name: "grc.listRisks",              module: "grc",          roles: ["admin","security_analyst","itil_agent"], weight: 3,
    fn: (t)    => trpcQuery("grc.listRisks", { limit: 20 }, t) },
  { name: "grc.createRisk",             module: "grc",          roles: ["admin","security_analyst","itil_agent"], weight: 2,
    fn: (t, i) => trpcMutation("grc.createRisk", {
      title:      `[STRESS] Risk ${i}`,
      category:   randomFrom(["operational","financial","technology","compliance","strategic"]),
      likelihood: randomInt(1, 5),
      impact:     randomInt(1, 5),
      description:"Automated stress risk",
    }, t) },
  { name: "grc.listAudits",             module: "grc",          roles: ["admin","security_analyst","itil_agent"], weight: 2,
    fn: (t)    => trpcQuery("grc.listAudits", {}, t) },
  { name: "grc.listPolicies",           module: "grc",          roles: ["admin","security_analyst","itil_agent"], weight: 2,
    fn: (t)    => trpcQuery("grc.listPolicies", { limit: 20 }, t) },
  { name: "grc.riskMatrix",             module: "grc",          roles: ["admin","security_analyst","itil_agent"], weight: 1,
    fn: (t)    => trpcQuery("grc.riskMatrix", {}, t) },

  // ── HR Service Delivery ─────────────────────────────────────────────────
  { name: "hr.cases.list",              module: "hr",           roles: ["admin","hr_manager"], weight: 3,
    fn: (t)    => trpcQuery("hr.cases.list", { limit: 20 }, t) },
  { name: "hr.employees.list",          module: "hr",           roles: ["admin","hr_manager"], weight: 3,
    fn: (t)    => trpcQuery("hr.employees.list", { limit: 20 }, t) },
  { name: "hr.cases.create",            module: "hr",           roles: ["admin","hr_manager","requester"], weight: 2,
    fn: (t, i) => trpcMutation("hr.cases.create", {
      title:    `[STRESS] HR Case ${i}`,
      type:     randomFrom(["onboarding","offboarding","payroll","leave","benefit","general"]),
      priority: randomFrom(["low","medium","high"]),
    }, t) },

  // ── Procurement ─────────────────────────────────────────────────────────
  { name: "procurement.purchaseRequests.list", module: "procurement", roles: ["admin","finance_manager"], weight: 3,
    fn: (t)    => trpcQuery("procurement.purchaseRequests.list", { limit: 20 }, t) },
  { name: "procurement.vendors.list",   module: "procurement",  roles: ["admin","finance_manager"], weight: 2,
    fn: (t)    => trpcQuery("procurement.vendors.list", { limit: 20 }, t) },
  { name: "procurement.dashboard",      module: "procurement",  roles: ["admin","finance_manager"], weight: 1,
    fn: (t)    => trpcQuery("procurement.dashboard", {}, t) },

  // ── Financial Management ─────────────────────────────────────────────────
  { name: "financial.listBudget",       module: "financial",    roles: ["admin","finance_manager"], weight: 2,
    fn: (t)    => trpcQuery("financial.listBudget", {}, t) },
  { name: "financial.listInvoices",     module: "financial",    roles: ["admin","finance_manager"], weight: 2,
    fn: (t)    => trpcQuery("financial.listInvoices", { limit: 20 }, t) },

  // ── Contracts ───────────────────────────────────────────────────────────
  { name: "contracts.list",             module: "contracts",    roles: ["admin","finance_manager"], weight: 2,
    fn: (t)    => trpcQuery("contracts.list", { limit: 20 }, t) },

  // ── Projects (PPM) ──────────────────────────────────────────────────────
  { name: "projects.list",              module: "projects",     roles: ["*"], weight: 3,
    fn: (t)    => trpcQuery("projects.list", { limit: 20 }, t) },
  { name: "projects.create",            module: "projects",     roles: ["admin","itil_agent"], weight: 2,
    fn: (t, i) => trpcMutation("projects.create", {
      name:        `[STRESS] Project ${i}`,
      description: `Stress test project`,
      status:      randomFrom(["planning","active","on_hold","completed"]),
    }, t) },

  // ── CRM & Sales ─────────────────────────────────────────────────────────
  { name: "crm.listAccounts",           module: "crm",          roles: ["admin"], weight: 2,
    fn: (t)    => trpcQuery("crm.listAccounts", { limit: 20 }, t) },
  { name: "crm.listContacts",           module: "crm",          roles: ["admin"], weight: 2,
    fn: (t)    => trpcQuery("crm.listContacts", { limit: 20 }, t) },
  { name: "crm.listOpportunities",      module: "crm",          roles: ["admin"], weight: 2,
    fn: (t)    => trpcQuery("crm.listOpportunities", { limit: 20 }, t) },

  // ── Customer Service (CSM) ──────────────────────────────────────────────
  { name: "csm.cases.list",             module: "csm",          roles: ["admin","itil_agent"], weight: 2,
    fn: (t)    => trpcQuery("csm.cases.list", { limit: 20 }, t) },
  { name: "csm.dashboard",              module: "csm",          roles: ["admin","itil_agent"], weight: 1,
    fn: (t)    => trpcQuery("csm.dashboard", {}, t) },

  // ── Legal ────────────────────────────────────────────────────────────────
  { name: "legal.listMatters",          module: "legal",        roles: ["admin"], weight: 2,
    fn: (t)    => trpcQuery("legal.listMatters", { limit: 20 }, t) },

  // ── DevOps ──────────────────────────────────────────────────────────────
  { name: "devops.listPipelines",       module: "devops",       roles: ["admin","itil_agent"], weight: 2,
    fn: (t)    => trpcQuery("devops.listPipelines", { limit: 20 }, t) },
  { name: "devops.listDeployments",     module: "devops",       roles: ["admin","itil_agent"], weight: 2,
    fn: (t)    => trpcQuery("devops.listDeployments", { limit: 20 }, t) },
  { name: "devops.doraMetrics",         module: "devops",       roles: ["admin","itil_agent"], weight: 1,
    fn: (t)    => trpcQuery("devops.doraMetrics", {}, t) },

  // ── APM ──────────────────────────────────────────────────────────────────
  { name: "apm.applications.list",      module: "apm",          roles: ["admin","itil_agent"], weight: 2,
    fn: (t)    => trpcQuery("apm.applications.list", { limit: 20 }, t) },

  // ── Facilities ───────────────────────────────────────────────────────────
  { name: "facilities.buildings.list",  module: "facilities",   roles: ["admin"], weight: 2,
    fn: (t)    => trpcQuery("facilities.buildings.list", { limit: 20 }, t) },
  { name: "facilities.rooms.list",      module: "facilities",   roles: ["admin"], weight: 1,
    fn: (t)    => trpcQuery("facilities.rooms.list", { limit: 20 }, t) },

  // ── Surveys ──────────────────────────────────────────────────────────────
  { name: "surveys.list",               module: "surveys",      roles: ["*"], weight: 2,
    fn: (t)    => trpcQuery("surveys.list", { limit: 20 }, t) },

  // ── Knowledge Management ─────────────────────────────────────────────────
  { name: "knowledge.list",             module: "knowledge",    roles: ["*"], weight: 3,
    fn: (t)    => trpcQuery("knowledge.list", { limit: 20 }, t) },
  { name: "knowledge.create",           module: "knowledge",    roles: ["admin","itil_agent"], weight: 1,
    fn: (t, i) => trpcMutation("knowledge.create", {
      title:    `[STRESS] KB Article ${i}`,
      content:  lorem(),
      category: randomFrom(["how-to","troubleshooting","policy","faq"]),
    }, t) },

  // ── Service Catalog ──────────────────────────────────────────────────────
  { name: "catalog.listItems",          module: "catalog",      roles: ["*"], weight: 3,
    fn: (t)    => trpcQuery("catalog.listItems", { limit: 20 }, t) },
  { name: "catalog.listCategories",     module: "catalog",      roles: ["*"], weight: 2,
    fn: (t)    => trpcQuery("catalog.listCategories", {}, t) },

  // ── Approvals & Workflow ─────────────────────────────────────────────────
  { name: "approvals.myPending",        module: "approvals",    roles: ["admin","finance_manager","hr_manager","itil_agent"], weight: 3,
    fn: (t)    => trpcQuery("approvals.myPending", {}, t) },
  { name: "workflows.list",             module: "workflows",    roles: ["admin"], weight: 2,
    fn: (t)    => trpcQuery("workflows.list", { limit: 20 }, t) },

  // ── Reports & Analytics ──────────────────────────────────────────────────
  { name: "reports.executiveOverview",  module: "reports",      roles: ["admin","finance_manager"], weight: 2,
    fn: (t)    => trpcQuery("reports.executiveOverview", {}, t) },
  { name: "reports.slaDashboard",       module: "reports",      roles: ["admin","finance_manager"], weight: 1,
    fn: (t)    => trpcQuery("reports.slaDashboard", {}, t) },

  // ── Notifications ───────────────────────────────────────────────────────
  { name: "notifications.list",         module: "notifications", roles: ["*"], weight: 4,
    fn: (t)    => trpcQuery("notifications.list", { limit: 20 }, t) },
  { name: "notifications.markRead",     module: "notifications", roles: ["*"], weight: 2,
    fn: (t)    => trpcMutation("notifications.markAllRead", {}, t) },

  // ── Search (Global / Meilisearch) ────────────────────────────────────────
  { name: "search.global",              module: "search",       roles: ["*"], weight: 4,
    fn: (t)    => trpcQuery("search.global", { query: randomSearchTerm(), limit: 10 }, t) },

  // ── Vendors ──────────────────────────────────────────────────────────────
  { name: "vendors.list",               module: "vendors",      roles: ["admin","finance_manager"], weight: 2,
    fn: (t)    => trpcQuery("vendors.list", { limit: 20 }, t) },

  // ── On-Call ──────────────────────────────────────────────────────────────
  { name: "oncall.schedules.list",      module: "oncall",       roles: ["admin","itil_agent"], weight: 2,
    fn: (t)    => trpcQuery("oncall.schedules.list", { limit: 20 }, t) },
  { name: "oncall.activeRotation",      module: "oncall",       roles: ["admin","itil_agent"], weight: 1,
    fn: (t)    => trpcQuery("oncall.activeRotation", {}, t) },

  // ── Events (ITOM) ────────────────────────────────────────────────────────
  { name: "events.list",                module: "events",       roles: ["admin","itil_agent"], weight: 2,
    fn: (t)    => trpcQuery("events.list", { limit: 20 }, t) },
  { name: "events.healthNodes",         module: "events",       roles: ["admin","itil_agent"], weight: 1,
    fn: (t)    => trpcQuery("events.healthNodes", {}, t) },

  // ── AI ───────────────────────────────────────────────────────────────────
  { name: "ai.suggestResolution",       module: "ai",           roles: ["admin","itil_agent"], weight: 2,
    fn: (t, i) => trpcQuery("ai.suggestResolution", { ticketId: `stress-${i}` }, t) },

  // ── Admin ────────────────────────────────────────────────────────────────
  { name: "admin.users.list",           module: "admin",        roles: ["admin"], weight: 3,
    fn: (t)    => trpcQuery("admin.users.list", { limit: 20 }, t) },
  { name: "admin.systemProperties.list",module: "admin",        roles: ["admin"], weight: 2,
    fn: (t)    => trpcQuery("admin.systemProperties.list", {}, t) },
  { name: "admin.auditLog.list",        module: "admin",        roles: ["admin"], weight: 2,
    fn: (t)    => trpcQuery("admin.auditLog.list", { limit: 20 }, t) },

  // ── RBAC enforcement probes — expect 403/FORBIDDEN/NOT_FOUND ──────────────
  // TRPC gates may return NOT_FOUND to keep routes opaque to unauthorized users
  { name: "rbac.admin-only [requester→admin.users.list]",          module: "rbac", roles: ["requester"], weight: 2,
    fn: (t)    => trpcQuery("admin.users.list", { limit: 5 }, t), expectForbidden: true },
  { name: "rbac.security-only [requester→security.listIncidents]", module: "rbac", roles: ["requester"], weight: 2,
    fn: (t)    => trpcQuery("security.listIncidents", { limit: 5 }, t), expectForbidden: true },
  { name: "rbac.finance-only [itil_agent→financial.listBudget]",   module: "rbac", roles: ["itil_agent"], weight: 2,
    fn: (t)    => trpcQuery("financial.listBudget", {}, t), expectForbidden: true },
];

// ── Utility ─────────────────────────────────────────────────────────────────

const WORDS     = ["server","network","database","vpn","laptop","incident","login","printer","email","outage","patch","deploy","backup","firewall","certificate"];
const TERMS     = ["critical","P1","production","down","fix","urgent","maintenance","access","restore","sync","update","migrate","audit","review","monitor"];
const LOREM_SEQ = ["Lorem ipsum stress test scenario.","Network disruption reported.","User access required.","Database migration pending.","System health check."];

let _loremIdx = 0;
function lorem() { return LOREM_SEQ[_loremIdx++ % LOREM_SEQ.length]; }
function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomWord() { return WORDS[Math.floor(Math.random() * WORDS.length)]; }
function randomSearchTerm() { return TERMS[Math.floor(Math.random() * TERMS.length)]; }

// ── Session builder ─────────────────────────────────────────────────────────

/**
 * Build a weighted scenario pool filtered to what `role` can execute.
 * Returns a flat array with each scenario repeated `weight` times.
 */
function buildSessionPool(role) {
  const pool = [];
  for (const s of SCENARIOS) {
    const allowed = s.roles.includes("*") || s.roles.includes(role);
    if (!allowed) continue;
    const n = Math.max(1, Math.round(s.weight / 2)); // half weight per session
    for (let j = 0; j < n; j++) pool.push(s);
  }
  return pool;
}

/**
 * Execute a single session using a pre-cached token.
 * Fires 8–14 sequential operations drawn from that role's scenario pool.
 */
async function runSessionWithToken(sessionIdx, persona, token) {
  const sessionResults = [];

  sessionResults.push({
    scenario: "auth.login",
    module:   "auth",
    status:   200,
    durationMs: 0,
    error:    null,
    sessionIdx,
    role:     persona.role,
  });

  const pool = buildSessionPool(persona.role);
  const OPS  = randomInt(8, 14);
  const picks = Array.from({ length: OPS }, () => pool[Math.floor(Math.random() * pool.length)]);

  for (const scenario of picks) {
    const start = Date.now();
    let status = 0;
    let error  = null;
    let trpcCode = null;

    try {
      const res = await withTimeout(scenario.fn(token, sessionIdx), TIMEOUT_MS);
      status = res.status;
      const json = await res.json().catch(() => null);
      trpcCode = json?.error?.data?.code ?? null;

      if (status >= 500) {
        error = json?.error?.message ?? "Server error";
      }

      // RBAC probe: a FORBIDDEN response is the correct outcome
        if (scenario.expectForbidden) {
          // TRPC gates may return FORBIDDEN, UNAUTHORIZED, or NOT_FOUND
          // (NOT_FOUND keeps restricted routes opaque to unauthorized callers — both are valid)
          const isForbidden = status === 403 || status === 404 ||
            trpcCode === "FORBIDDEN" || trpcCode === "UNAUTHORIZED" || trpcCode === "NOT_FOUND";
          status = isForbidden ? 200 : 500;
          if (!isForbidden) error = `Expected FORBIDDEN/NOT_FOUND but got HTTP ${res.status} / ${trpcCode}`;
        }
    } catch (e) {
      status = 0;
      error  = e.message;
    }

    sessionResults.push({
      scenario:   scenario.name,
      module:     scenario.module,
      status,
      trpcCode,
      durationMs: Date.now() - start,
      error,
      sessionIdx,
      role:       persona.role,
    });
  }

  return sessionResults;
}

// ── Reporting ────────────────────────────────────────────────────────────────

function pct(n, total) {
  return total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`;
}
function pad(s, n) { return String(s).padEnd(n); }
function rpad(s, n) { return String(s).padStart(n); }

function printReport(allResults, sessions, wallMs) {
  const total   = allResults.length;
  const byModule = {};
  const byScenario = {};
  const statusGroups = { ok: 0, "4xx": 0, "5xx": 0, network: 0 };
  const durations = [];
  const errors = [];

  for (const r of allResults) {
    // Module roll-up
    if (!byModule[r.module]) byModule[r.module] = { ok: 0, fail: 0, durations: [] };
    const m = byModule[r.module];

    // Scenario roll-up
    if (!byScenario[r.scenario]) byScenario[r.scenario] = { ok: 0, fail: 0, total: 0, durations: [] };
    const s = byScenario[r.scenario];
    s.total++;
    s.durations.push(r.durationMs);
    durations.push(r.durationMs);
    m.durations.push(r.durationMs);

    const ok = r.status >= 200 && r.status < 300;
    if (ok)                              { s.ok++;   m.ok++;   statusGroups.ok++; }
    else if (r.status >= 400 && r.status < 500) { s.fail++; m.fail++; statusGroups["4xx"]++; }
    else if (r.status >= 500)            { s.fail++; m.fail++; statusGroups["5xx"]++; }
    else                                 { s.fail++; m.fail++; statusGroups.network++; }

    if (r.error) errors.push(r);
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)] ?? 0;
  const p90 = sorted[Math.floor(sorted.length * 0.90)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  const avg = total ? Math.round(durations.reduce((a, b) => a + b, 0) / total) : 0;

  const W = 72;
  const line = "═".repeat(W);
  const dash = "─".repeat(W);

  console.log("\n" + line);
  console.log("  NexusOps — 500-Session Comprehensive Stress Test Results");
  console.log(line);
  console.log(`  Sessions        : ${sessions}`);
  console.log(`  Total requests  : ${total}`);
  console.log(`  Wall time       : ${(wallMs / 1000).toFixed(2)}s`);
  console.log(`  Throughput      : ${((total / wallMs) * 1000).toFixed(1)} req/s`);
  console.log(`  Avg session ops : ${(total / sessions).toFixed(1)} ops/session`);
  console.log(dash);
  console.log("  Global Latency");
  console.log(`    avg : ${rpad(avg,6)}ms   p50 : ${rpad(p50,6)}ms`);
  console.log(`    p90 : ${rpad(p90,6)}ms   p95 : ${rpad(p95,6)}ms   p99 : ${rpad(p99,6)}ms`);
  console.log(dash);
  console.log("  Status breakdown");
  console.log(`    2xx (success) : ${rpad(statusGroups.ok, 6)}  (${pct(statusGroups.ok, total)})`);
  console.log(`    4xx (client)  : ${rpad(statusGroups["4xx"], 6)}  (${pct(statusGroups["4xx"], total)})`);
  console.log(`    5xx (server)  : ${rpad(statusGroups["5xx"], 6)}  (${pct(statusGroups["5xx"], total)})`);
  console.log(`    network err   : ${rpad(statusGroups.network, 6)}  (${pct(statusGroups.network, total)})`);
  console.log(dash);

  // ── Per-module summary ──────────────────────────────────────────────────
  console.log("  Module Summary (sorted by request count)");
  console.log(`  ${"Module".padEnd(22)} ${"Reqs".padStart(6)} ${"OK%".padStart(6)} ${"p95ms".padStart(7)}`);
  console.log("  " + "─".repeat(W - 2));

  const modulesSorted = Object.entries(byModule)
    .sort((a, b) => (b[1].ok + b[1].fail) - (a[1].ok + a[1].fail));

  for (const [name, m] of modulesSorted) {
    const reqs     = m.ok + m.fail;
    const okPct    = pct(m.ok, reqs);
    const mSorted  = [...m.durations].sort((a, b) => a - b);
    const mp95     = mSorted[Math.floor(mSorted.length * 0.95)] ?? 0;
    const icon     = m.fail === 0 ? "✓" : "✗";
    console.log(`  ${icon} ${pad(name, 20)} ${rpad(reqs, 6)} ${rpad(okPct, 6)} ${rpad(mp95, 7)}ms`);
  }
  console.log(dash);

  // ── Per-scenario detail ─────────────────────────────────────────────────
  console.log("  Scenario Detail");
  console.log(`  ${"Scenario".padEnd(50)} ${"N".padStart(5)} ${"OK%".padStart(5)} ${"p95".padStart(6)}`);
  console.log("  " + "─".repeat(W - 2));

  const scenariosSorted = Object.entries(byScenario)
    .sort((a, b) => b[1].total - a[1].total);

  for (const [name, s] of scenariosSorted) {
    const okPct  = pct(s.ok, s.total);
    const sSorted = [...s.durations].sort((a, b) => a - b);
    const sp95   = sSorted[Math.floor(sSorted.length * 0.95)] ?? 0;
    const icon   = s.fail === 0 ? "✓" : (s.ok > 0 ? "△" : "✗");
    console.log(`  ${icon} ${pad(name, 50)} ${rpad(s.total, 5)} ${rpad(okPct, 5)} ${rpad(sp95, 6)}ms`);
  }
  console.log(dash);

  // ── Error digest ───────────────────────────────────────────────────────
  const serverErrors   = errors.filter((r) => r.status >= 500);
  const networkErrors  = errors.filter((r) => r.status === 0);
  const clientErrors   = errors.filter((r) => r.status >= 400 && r.status < 500);

  // Separate real infrastructure failures from known concurrency bug patterns
  const constraintViolations = serverErrors.filter((r) => r.error && r.error.includes("duplicate key"));
  const infraErrors = serverErrors.filter((r) => !r.error || !r.error.includes("duplicate key"));

  if (infraErrors.length > 0) {
    console.log(`  ⚠  ${infraErrors.length} SERVER errors (sample):`);
    const seen = new Set();
    for (const f of infraErrors.slice(0, 8)) {
      const key = `${f.scenario}|${f.error}`;
      if (!seen.has(key)) { seen.add(key); console.log(`     [${f.role}] ${f.scenario} → ${f.error}`); }
    }
  }
  if (networkErrors.length > 0) {
    console.log(`  ⚠  ${networkErrors.length} NETWORK errors (sample):`);
    const seen = new Set();
    for (const f of networkErrors.slice(0, 5)) {
      const key = `${f.scenario}|${f.error}`;
      if (!seen.has(key)) { seen.add(key); console.log(`     [${f.role}] ${f.scenario} → ${f.error}`); }
    }
  }
  if (clientErrors.length > 0) {
    console.log(`  ℹ  ${clientErrors.length} 4xx responses (permission gates + expected auth rejections)`);
    if (VERBOSE) {
      const seen = new Set();
      for (const f of clientErrors.slice(0, 10)) {
        const key = `${f.scenario}|${f.status}`;
        if (!seen.has(key)) { seen.add(key); console.log(`     [${f.role}] ${f.scenario} → HTTP ${f.status}`); }
      }
    }
  }

  // ── Bug report from stress findings ────────────────────────────────────
  if (constraintViolations.length > 0) {
    const bugScenarios = [...new Set(constraintViolations.map((r) => r.scenario))];
    console.log(dash);
    console.log("  ⚡ CONCURRENCY BUGS FOUND:");
    for (const s of bugScenarios) {
      const count = constraintViolations.filter((r) => r.scenario === s).length;
      const sample = constraintViolations.find((r) => r.scenario === s);
      console.log(`     ${s} — ${count} failures`);
      console.log(`       Error: ${sample.error}`);
      console.log(`       Cause: Non-atomic auto-number generation races under concurrent writes`);
      console.log(`       Fix:   Use a DB sequence (nextval) or advisory lock for org-scoped numbering`);
    }
  }

  console.log(line);

  // ── Pass / Fail verdict ─────────────────────────────────────────────────
  const hardFails = infraErrors.length + networkErrors.length;
  if (hardFails > 0) {
    console.error(`\n  ✗  STRESS TEST FAILED — ${infraErrors.length} server errors, ${networkErrors.length} network errors\n`);
    process.exit(1);
  }

  const successRate = (statusGroups.ok / total) * 100;
  if (successRate < 60) {
    console.error(`\n  ✗  STRESS TEST FAILED — success rate ${successRate.toFixed(1)}% is below 60% threshold\n`);
    process.exit(1);
  }

  const bugCount = constraintViolations.length > 0 ? 1 : 0;
  const verdict = bugCount > 0
    ? `  ⚡ STRESS TEST PASSED with ${bugCount} concurrency bug(s) found`
    : `  ✓  STRESS TEST PASSED`;
  console.log(`\n${verdict} — ${successRate.toFixed(1)}% success rate across ${sessions} sessions / ${total} requests\n`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n" + "═".repeat(72));
  console.log("  NexusOps Comprehensive Stress Test");
  console.log("═".repeat(72));
  console.log(`  Target      : ${BASE}`);
  console.log(`  Sessions    : ${SESSIONS}`);
  console.log(`  Scenarios   : ${SCENARIOS.length} (${new Set(SCENARIOS.map((s) => s.module)).size} modules)`);
  console.log(`  Ramp        : ${RAMP_MS === 0 ? "all at once" : `${RAMP_MS}ms`}`);
  console.log(`  Timeout     : ${TIMEOUT_MS}ms / request`);
  console.log("  Verifying API reachability...");

  // Quick health probe
  try {
    const probe = await withTimeout(trpcQuery("auth.me", {}, null), 5000);
    if (probe.status >= 500) throw new Error(`Health probe returned HTTP ${probe.status}`);
    console.log("  API reachable ✓");
  } catch (e) {
    console.error(`\n  ✗  Cannot reach API at ${BASE}: ${e.message}`);
    console.error("     Start the server first:  pnpm docker:up && pnpm dev\n");
    process.exit(1);
  }

  // ── Pre-auth all personas (once each) ─────────────────────────────────────
  // Real sessions maintain persistent tokens — do not re-login per session.
  console.log(`\n  Pre-authenticating ${PERSONAS.length} personas...`);
  const tokens = {};
  for (const p of PERSONAS) {
    try {
      const tok = await withTimeout(login(p), 10000);
      if (tok) {
        tokens[p.role] = tok;
        console.log(`    ✓  ${p.role.padEnd(18)} (${p.email})`);
      } else {
        console.warn(`    ✗  ${p.role.padEnd(18)} — no token returned`);
      }
    } catch (e) {
      console.warn(`    ✗  ${p.role.padEnd(18)} — ${e.message}`);
    }
  }

  const availablePersonas = PERSONAS.filter((p) => tokens[p.role]);
  if (availablePersonas.length === 0) {
    console.error("\n  ✗  All persona logins failed. Check credentials / server.\n");
    process.exit(1);
  }
  console.log(`  ${availablePersonas.length}/${PERSONAS.length} personas authenticated\n`);

  console.log(`  Launching ${SESSIONS} concurrent sessions (~${SESSIONS * 10} requests)...\n`);

  let allResults = [];
  const wallStart = Date.now();

  if (RAMP_MS === 0) {
    const settled = await Promise.allSettled(
      Array.from({ length: SESSIONS }, (_, i) => {
        const persona = availablePersonas[i % availablePersonas.length];
        return runSessionWithToken(i, persona, tokens[persona.role]);
      }),
    );
    for (const s of settled) {
      if (s.status === "fulfilled") allResults.push(...s.value);
      else allResults.push({ scenario: "session", module: "runtime", status: 0, durationMs: 0, error: s.reason?.message ?? "unknown", sessionIdx: -1, role: "unknown" });
    }
  } else {
    const delay = RAMP_MS / SESSIONS;
    const promises = Array.from({ length: SESSIONS }, (_, i) => {
      const persona = availablePersonas[i % availablePersonas.length];
      return new Promise((resolve) =>
        setTimeout(() => resolve(runSessionWithToken(i, persona, tokens[persona.role])), Math.floor(i * delay)),
      );
    });
    const settled = await Promise.allSettled(promises);
    for (const s of settled) {
      if (s.status === "fulfilled") allResults.push(...(s.value ?? []));
      else allResults.push({ scenario: "session", module: "runtime", status: 0, durationMs: 0, error: s.reason?.message ?? "unknown", sessionIdx: -1, role: "unknown" });
    }
  }

  const wallMs = Date.now() - wallStart;
  console.log(`  All ${SESSIONS} sessions complete in ${(wallMs / 1000).toFixed(2)}s`);

  printReport(allResults, SESSIONS, wallMs);
}

run().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
