#!/usr/bin/env node
/**
 * NexusOps — 10,000-Session Full-Coverage Stress Test (v4)
 *
 * What changed from v3:
 *
 *   UNIQUE SESSION TOKENS
 *     Every simulated user logs in individually and receives its own session
 *     token.  Requests within a session use only that token.  The shared-token
 *     pattern that previously put all same-role sessions into a single
 *     rate-limit / session-cache bucket has been removed entirely.
 *
 *   REALISTIC TRAFFIC DISTRIBUTION
 *     Initial concurrency ramps linearly from 0 → MAX_CONCURRENT over
 *     RAMP_UP_SECS seconds (default 20 s).  This avoids the thundering herd
 *     at t=0 where all 800 slots fired simultaneously.
 *
 *   INTER-STEP JITTER
 *     Each step within a session waits 0–STEP_JITTER_MS ms before executing
 *     (default 0–30 ms).  This simulates the think-time between real user
 *     actions and de-synchronises sessions that started at the same time.
 *
 *   FULL SESSION LIFECYCLE
 *     login → unique token → N operations → optional logout
 *     Login failures are tracked and reported separately.  A session that
 *     cannot authenticate is skipped without counting its steps as errors.
 *
 * Configuration (environment variables):
 *
 *   BASE_URL          API base (default: http://localhost:3001)
 *   SESSIONS          total sessions to run  (default: 10 000)
 *   MAX_CONCURRENT    concurrency ceiling     (default: 800)
 *   RAMP_UP_SECS      seconds to reach max concurrency (default: 20)
 *   STEP_JITTER_MS    max random delay between steps in ms (default: 30)
 *   TIMEOUT_MS        per-request timeout in ms (default: 45 000)
 *   LOGIN_TIMEOUT_MS  per-login timeout  in ms  (default: 15 000)
 *   LOGOUT_SESSIONS   "true" to logout after every session (default: false)
 *   PROGRESS_INTERVAL sessions between progress lines (default: 500)
 *
 * Usage:
 *   node scripts/stress-test-10000.js
 *   SESSIONS=5000 MAX_CONCURRENT=400 node scripts/stress-test-10000.js
 */

"use strict";

const BASE              = (process.env.BASE_URL          ?? "http://localhost:3001") + "/trpc";
const SESSIONS          = parseInt(process.env.SESSIONS          ?? "10000", 10);
const MAX_CONCURRENT    = parseInt(process.env.MAX_CONCURRENT    ?? "800",   10);
const RAMP_UP_SECS      = parseFloat(process.env.RAMP_UP_SECS    ?? "20");
const STEP_JITTER_MS    = parseInt(process.env.STEP_JITTER_MS    ?? "30",   10);
const TIMEOUT_MS        = parseInt(process.env.TIMEOUT_MS        ?? "45000", 10);
const LOGIN_TIMEOUT_MS  = parseInt(process.env.LOGIN_TIMEOUT_MS  ?? "15000", 10);
const LOGOUT_SESSIONS   = process.env.LOGOUT_SESSIONS === "true";
const PROGRESS_INTERVAL = parseInt(process.env.PROGRESS_INTERVAL ?? "1000", 10);

// ── Personas ──────────────────────────────────────────────────────────────────
//
// These are the real DB accounts used for authentication.  Each simulated
// session logs in with one of these credentials and receives its OWN unique
// server-side session token.  Multiple sessions can share the same credentials
// (like multiple browser tabs for one user) — the server creates a distinct
// session row and token for each login call.

const PERSONAS = [
  { role: "admin",            email: process.env.ADMIN_EMAIL     ?? "admin@coheron.com",    password: "demo1234!" },
  { role: "itil_agent",       email: process.env.AGENT_EMAIL     ?? "agent1@coheron.com",   password: "demo1234!" },
  { role: "hr_manager",       email: process.env.HR_EMAIL        ?? "hr@coheron.com",        password: "demo1234!" },
  { role: "finance_manager",  email: process.env.FINANCE_EMAIL   ?? "finance@coheron.com",  password: "demo1234!" },
  { role: "requester",        email: process.env.REQUESTER_EMAIL ?? "employee@coheron.com", password: "demo1234!" },
  { role: "security_analyst", email: process.env.SEC_EMAIL       ?? "agent2@coheron.com",   password: "demo1234!" },
];

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`Timeout ${ms}ms`)), ms); }),
  ]).finally(() => clearTimeout(t));
}

function post(path, body, token) {
  return fetch(`${BASE}/${path}`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function get(path, input, token) {
  const qs = input && Object.keys(input).length
    ? `?input=${encodeURIComponent(JSON.stringify(input))}` : "";
  return fetch(`${BASE}/${path}${qs}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

// ── Data generators ───────────────────────────────────────────────────────────

const WORDS        = ["server","network","database","vpn","laptop","printer","outage","patch","deploy","backup","firewall","certificate","cluster","gateway","api","storage","kubernetes","docker","pipeline","compliance"];
const LOREM_POOL   = [
  "Network disruption reported in primary datacenter zone.",
  "User access escalation required for critical workload.",
  "Database migration pending — schema drift detected.",
  "System health check triggered by automated monitoring.",
  "Configuration drift detected on production hosts.",
  "Capacity planning review initiated for Q2 budget cycle.",
  "Compliance audit initiated by regulatory team.",
  "Service degradation detected on customer-facing API.",
  "Security policy update required for PCI DSS compliance.",
  "Automated workflow triggered by change advisory board.",
  "Certificate expiry approaching on load balancer cluster.",
  "Patch management cycle initiated for CVE remediation.",
  "Backup verification failed on secondary node — investigation underway.",
  "Resource contention detected on shared Kubernetes namespace.",
  "SLA breach threshold approaching on priority-1 incident.",
];
const PRIORITIES       = ["low","medium","high","critical"];
const TICKET_TYPES     = ["incident","request","problem","service_request"];
const CHG_TYPES        = ["normal","standard","emergency"];
const CHG_RISKS        = ["low","medium","high","critical"];
const RISK_CATS        = ["operational","financial","technology","compliance","strategic","reputational","legal"];
const SEC_SEVS         = ["low","medium","high","critical"];
const SEC_TYPES        = ["malware","phishing","unauthorized_access","data_breach","insider_threat","ddos","ransomware","supply_chain"];
const CONTRACT_TYPES   = ["nda","msa","sow","vendor","sla_support","maintenance","license","partnership"];
const APM_LIFE         = ["evaluating","sustaining","harvesting","retiring"];
const APM_CLOUD        = ["cloud_native","lift_shift","not_assessed","cloud_ready"];
const APM_CATS         = ["internal","saas","paas","iaas","legacy","finance","hr","operations","security"];
const SURVEY_TYPES     = ["csat","nps","employee_pulse","post_incident","vendor_review","onboarding","exit"];
const LEGAL_MATTER_TYPES = ["litigation","employment","ip","regulatory","ma","data_privacy","corporate","commercial"];
const LEGAL_INV_TYPES  = ["ethics","harassment","fraud","data_breach","whistleblower","discrimination"];
const WO_CATS          = ["maintenance","repair","installation","inspection","cleaning","electrical","plumbing","hvac","networking","security"];
const WO_LOCS          = ["HQ-Floor1","HQ-Floor2","Datacenter-A","Branch-NYC","Branch-LAX","Remote","Warehouse"];
const DEVOPS_ENVS      = ["dev","qa","staging","uat","production"];
const DEVOPS_TRIG      = ["push","schedule","manual","pr","release"];
const DEVOPS_APPS      = ["nexusops-web","nexusops-api","nexusops-worker","auth-service","notification-service","reporting-service","integration-gateway"];
const BRANCHES         = ["main","develop","feature/stress-test","release/2.4","hotfix/critical-fix","feature/new-module"];
const DEPTS            = ["IT","Finance","HR","Operations","Marketing","Legal","Security","Engineering","Sales","Procurement"];
const CSM_PRIS         = ["low","medium","high","critical"];
const KB_CATS          = ["how-to","troubleshooting","policy","announcement","faq","runbook","best-practice","architecture"];
const VENDOR_TYPES     = ["software","hardware","services","cloud","consulting","manufacturing","logistics","professional_services"];

let _li = 0;
const lorem  = ()      => LOREM_POOL[_li++ % LOREM_POOL.length];
const rword  = ()      => WORDS[Math.floor(Math.random() * WORDS.length)];
const rfrom  = (a)     => a[Math.floor(Math.random() * a.length)];
const rint   = (lo,hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const uid    = ()      => Math.random().toString(36).slice(2, 10);
const ts     = (d)     => new Date(Date.now() + d * 86400000).toISOString();
const money  = (lo,hi) => String(rint(lo, hi));
const yr     = ()      => new Date().getFullYear();

// ── Global write counters ─────────────────────────────────────────────────────

const CREATED = {
  "tickets":              0,
  "changes":              0,
  "projects":             0,
  "knowledge":            0,
  "grc.risks":            0,
  "security.incidents":   0,
  "crm.deals":            0,
  "surveys":              0,
  "apm.applications":     0,
  "contracts":            0,
  "vendors":              0,
  "legal.matters":        0,
  "legal.investigations": 0,
  "work-orders":          0,
  "csm.cases":            0,
  "procurement.prs":      0,
  "devops.pipelines":     0,
  "devops.deployments":   0,
  "financial.budgets":    0,
  "financial.chargebacks":0,
};

// Login outcome counters (tracked separately from step results)
const LOGIN_STATS = { ok: 0, fail: 0, totalMs: 0 };

// ── Running step counters ─────────────────────────────────────────────────────
//
// Updated incrementally as each session completes (in runPool's .then callback).
// This lets the progress block compute live metrics — 2xx/4xx/5xx rates and avg
// latency — without re-scanning the full allResults array on every checkpoint.

const RUNNING = {
  ok:         0,   // 2xx response count
  xx4:        0,   // 4xx response count
  xx5:        0,   // 5xx response count
  net:        0,   // network errors (status 0, connection-level failures)
  totalDurMs: 0,   // sum of all step durations (numerator for avg latency)
  stepCount:  0,   // denominator for avg latency
};

// ── Step executor ─────────────────────────────────────────────────────────────

async function step(label, module, type, fn, token, idx) {
  const t0 = Date.now();
  let status = 0, error = null, trpcCode = null;
  try {
    const res  = await withTimeout(fn(token, idx), TIMEOUT_MS);
    status     = res.status;
    const json = await res.json().catch(() => null);
    trpcCode   = json?.error?.data?.code ?? null;
    if (status >= 500) error = json?.error?.message ?? "Server error";
    else if (status >= 400) error = trpcCode ?? `HTTP ${status}`;
  } catch (e) {
    status = 0; error = e.message;
  }
  return { label, module, type, status, trpcCode, durationMs: Date.now() - t0, error };
}

// ── Session plans (unchanged — accept token + session index) ──────────────────
//
// Each plan function receives the session's OWN token (freshly minted by the
// login step in runSession).  Nothing else about the plans changes.

function planAdmin(t, i) {
  const tag = `10k-s${i}`;
  const suf = `${i}-${uid()}`;
  return [
    () => step("auth.me",                    "auth",               "read",  t => get("auth.me",{},t), t, i),
    () => step("dashboard.getMetrics",        "dashboard",          "read",  t => get("dashboard.getMetrics",{},t), t, i),
    () => step("notifications.list",          "notifications",      "read",  t => get("notifications.list",{limit:10},t), t, i),
    () => step("notifications.markAllRead",   "notifications",      "write", t => post("notifications.markAllRead",{},t), t, i),
    () => step("tickets.create",              "tickets",            "write", t => post("tickets.create",{
      title:`[10K]INC-${suf}`, description:lorem(),
      type:rfrom(TICKET_TYPES), priority:rfrom(PRIORITIES), tags:[tag,"stress-10k"],
    },t), t, i),
    () => step("changes.create",              "changes",            "write", t => post("changes.create",{
      title:`[10K]CHG-${suf}`, description:lorem(),
      type:rfrom(CHG_TYPES), risk:rfrom(CHG_RISKS),
    },t), t, i),
    () => step("projects.create",             "projects",           "write", t => post("projects.create",{
      name:`[10K]PRJ-${suf}`, description:lorem(),
    },t), t, i),
    () => step("knowledge.create",            "knowledge",          "write", t => post("knowledge.create",{
      title:`[10K]KB-${suf}`, content:lorem(),
      category:rfrom(KB_CATS), tags:[tag],
    },t), t, i),
    () => step("grc.createRisk",              "grc.risks",          "write", t => post("grc.createRisk",{
      title:`[10K]RISK-${suf}`, description:lorem(),
      category:rfrom(RISK_CATS), likelihood:rint(1,5), impact:rint(1,5),
    },t), t, i),
    () => step("security.createIncident",     "security.incidents", "write", t => post("security.createIncident",{
      title:`[10K]SEC-${suf}`, description:lorem(),
      severity:rfrom(SEC_SEVS), type:rfrom(SEC_TYPES),
    },t), t, i),
    () => step("crm.createDeal",              "crm.deals",          "write", t => post("crm.createDeal",{
      title:`[10K]DEAL-${suf}`,
      value:money(5000,9999999), probability:rint(5,95),
      expectedClose:ts(rint(14,365)),
    },t), t, i),
    () => step("surveys.create",              "surveys",            "write", t => post("surveys.create",{
      title:`[10K]SURVEY-${suf}`, type:rfrom(SURVEY_TYPES),
      questions:[{id:`q1-${i}`,type:"rating",question:"Rate your experience",required:true},
                 {id:`q2-${i}`,type:rfrom(["text","yes_no","nps"]),question:"Additional comments?",required:false}],
    },t), t, i),
    () => step("apm.applications.create",     "apm.applications",   "write", t => post("apm.applications.create",{
      name:`[10K]APP-${suf}`, description:lorem(),
      lifecycle:rfrom(APM_LIFE), cloudReadiness:rfrom(APM_CLOUD), category:rfrom(APM_CATS),
    },t), t, i),
    () => step("contracts.create",            "contracts",          "write", t => post("contracts.create",{
      title:`[10K]CONTRACT-${suf}`, counterparty:`Vendor-${uid()}`,
      type:rfrom(CONTRACT_TYPES), value:money(10000,99999999),
      startDate:ts(rint(-60,0)), endDate:ts(rint(90,1095)),
    },t), t, i),
    () => step("vendors.create",              "vendors",            "write", t => post("vendors.create",{
      name:`[10K]Vendor-ADM-${suf}`, type:rfrom(VENDOR_TYPES),
      status:"active", contactEmail:`admin${i}@stress10k.test`,
    },t), t, i),
    () => step("legal.createMatter",          "legal.matters",      "write", t => post("legal.createMatter",{
      title:`[10K]MATTER-${suf}`, description:lorem(),
      type:rfrom(LEGAL_MATTER_TYPES), confidential:Math.random()>0.7,
      estimatedCost:money(5000,500000), jurisdiction:rfrom(["US","UK","EU","APAC","Global"]),
    },t), t, i),
    () => step("legal.createInvestigation",   "legal.investigations","write", t => post("legal.createInvestigation",{
      title:`[10K]INV-${suf}`, description:lorem(),
      type:rfrom(LEGAL_INV_TYPES), anonymousReport:Math.random()>0.8,
    },t), t, i),
    () => step("work-orders.create",          "work-orders",        "write", t => post("workOrders.create",{
      shortDescription:`[10K]WO-${suf}`, description:lorem(),
      category:rfrom(WO_CATS), location:rfrom(WO_LOCS),
    },t), t, i),
    () => step("csm.cases.create",            "csm.cases",          "write", t => post("csm.cases.create",{
      title:`[10K]CASE-${suf}`, description:lorem(), priority:rfrom(CSM_PRIS),
    },t), t, i),
    () => step("procurement.purchaseRequests.create","procurement.prs","write", t => post("procurement.purchaseRequests.create",{
      title:`[10K]PR-${suf}`, justification:lorem(),
      priority:rfrom(PRIORITIES), department:rfrom(DEPTS),
      items:[
        {description:`${rfrom(WORDS)} license renewal`, quantity:rint(1,50), unitPrice:rint(100,10000)},
        {description:`${rfrom(WORDS)} hardware unit`,   quantity:rint(1,10), unitPrice:rint(500,50000)},
      ],
    },t), t, i),
    () => step("devops.createPipelineRun",    "devops.pipelines",   "write", t => post("devops.createPipelineRun",{
      pipelineName:rfrom(DEVOPS_APPS), trigger:rfrom(DEVOPS_TRIG),
      branch:rfrom(BRANCHES), commitSha:uid(), status:"running",
    },t), t, i),
    () => step("devops.createDeployment",     "devops.deployments", "write", t => post("devops.createDeployment",{
      appName:rfrom(DEVOPS_APPS), environment:rfrom(DEVOPS_ENVS),
      version:`v${rint(1,5)}.${rint(0,20)}.${rint(0,99)}`,
    },t), t, i),
    () => step("financial.createBudgetLine",  "financial.budgets",  "write", t => post("financial.createBudgetLine",{
      category:rfrom(["Software","Hardware","Services","Consulting","Cloud","Training","Travel","Marketing","R&D"]),
      department:rfrom(DEPTS), fiscalYear:yr(), budgeted:money(50000,9999999),
    },t), t, i),
    () => step("financial.createChargeback",  "financial.chargebacks","write", t => post("financial.createChargeback",{
      department:rfrom(DEPTS),
      service:rfrom(["SaaS License","Cloud Compute","Network","Storage","Support","Consulting","Infra"]),
      amount:money(1000,999999), periodMonth:rint(1,12), periodYear:yr(),
      allocationMethod:rfrom(["headcount","usage","flat","revenue_share"]),
    },t), t, i),
    // ── Reads ──
    () => step("tickets.list",                "tickets",            "read",  t => get("tickets.list",{limit:20},t), t, i),
    () => step("tickets.list.filtered",       "tickets",            "read",  t => get("tickets.list",{limit:10,type:rfrom(TICKET_TYPES)},t), t, i),
    () => step("tickets.statusCounts",        "tickets",            "read",  t => get("tickets.statusCounts",{},t), t, i),
    () => step("changes.list",                "changes",            "read",  t => get("changes.list",{limit:20},t), t, i),
    () => step("search.global",               "search",             "read",  t => get("search.global",{query:rword(),limit:10},t), t, i),
    () => step("admin.users.list",            "admin",              "read",  t => get("admin.users.list",{limit:20},t), t, i),
    () => step("grc.listRisks",               "grc",                "read",  t => get("grc.listRisks",{limit:20},t), t, i),
    () => step("grc.listVendorRisks",         "grc",                "read",  t => get("grc.listVendorRisks",{},t), t, i),
    () => step("security.listIncidents",      "security",           "read",  t => get("security.listIncidents",{limit:20},t), t, i),
    () => step("crm.listAccounts",            "crm",                "read",  t => get("crm.listAccounts",{limit:20},t), t, i),
    () => step("crm.listDeals",               "crm",                "read",  t => get("crm.listDeals",{limit:20},t), t, i),
    () => step("reports.executiveOverview",   "reports",            "read",  t => get("reports.executiveOverview",{},t), t, i),
    () => step("reports.slaDashboard",        "reports",            "read",  t => get("reports.slaDashboard",{},t), t, i),
    () => step("approvals.myPending",         "approvals",          "read",  t => get("approvals.myPending",{},t), t, i),
    () => step("approvals.all",               "approvals",          "read",  t => get("approvals.all",{limit:20},t), t, i),
    () => step("events.list",                 "events",             "read",  t => get("events.list",{limit:20},t), t, i),
    () => step("events.dashboard",            "events",             "read",  t => get("events.dashboard",{},t), t, i),
    () => step("oncall.schedules.list",       "oncall",             "read",  t => get("oncall.schedules.list",{limit:20},t), t, i),
    () => step("oncall.activeRotation",       "oncall",             "read",  t => get("oncall.activeRotation",{},t), t, i),
    () => step("oncall.escalations.list",     "oncall",             "read",  t => get("oncall.escalations.list",{},t), t, i),
    () => step("devops.listPipelines",        "devops",             "read",  t => get("devops.listPipelines",{limit:20},t), t, i),
    () => step("devops.listDeployments",      "devops",             "read",  t => get("devops.listDeployments",{limit:20},t), t, i),
    () => step("devops.doraMetrics",          "devops",             "read",  t => get("devops.doraMetrics",{},t), t, i),
    () => step("workOrders.list",             "work-orders",        "read",  t => get("workOrders.list",{limit:20},t), t, i),
    () => step("workOrders.metrics",          "work-orders",        "read",  t => get("workOrders.metrics",{},t), t, i),
    () => step("financial.listBudget",        "financial",          "read",  t => get("financial.listBudget",{limit:20},t), t, i),
    () => step("financial.listInvoices",      "financial",          "read",  t => get("financial.listInvoices",{limit:20},t), t, i),
    () => step("financial.apAging",           "financial",          "read",  t => get("financial.apAging",{},t), t, i),
    () => step("financial.listChargebacks",   "financial",          "read",  t => get("financial.listChargebacks",{limit:20},t), t, i),
    () => step("procurement.purchaseRequests.list","procurement",   "read",  t => get("procurement.purchaseRequests.list",{limit:20},t), t, i),
    () => step("procurement.purchaseOrders.list","procurement",     "read",  t => get("procurement.purchaseOrders.list",{limit:20},t), t, i),
    () => step("csm.cases.list",              "csm",                "read",  t => get("csm.cases.list",{limit:20},t), t, i),
    () => step("csm.accounts.list",           "csm",                "read",  t => get("csm.accounts.list",{limit:20},t), t, i),
    () => step("csm.dashboard",               "csm",                "read",  t => get("csm.dashboard",{},t), t, i),
    () => step("legal.listMatters",           "legal",              "read",  t => get("legal.listMatters",{limit:20},t), t, i),
    () => step("legal.listInvestigations",    "legal",              "read",  t => get("legal.listInvestigations",{limit:20},t), t, i),
    () => step("assets.list",                 "assets",             "read",  t => get("assets.list",{limit:20},t), t, i),
    () => step("assets.listTypes",            "assets",             "read",  t => get("assets.listTypes",{},t), t, i),
    () => step("assets.cmdb.list",            "assets",             "read",  t => get("assets.cmdb.list",{},t), t, i),
    () => step("assets.licenses.list",        "assets",             "read",  t => get("assets.licenses.list",{limit:20},t), t, i),
    () => step("assets.ham.list",             "assets",             "read",  t => get("assets.ham.list",{limit:20},t), t, i),
    () => step("facilities.buildings.list",   "facilities",         "read",  t => get("facilities.buildings.list",{limit:20},t), t, i),
    () => step("facilities.bookings.list",    "facilities",         "read",  t => get("facilities.bookings.list",{limit:20},t), t, i),
    () => step("facilities.moveRequests.list","facilities",         "read",  t => get("facilities.moveRequests.list",{limit:20},t), t, i),
    () => step("hr.employees.list",           "hr",                 "read",  t => get("hr.employees.list",{limit:20},t), t, i),
    () => step("hr.cases.list",               "hr",                 "read",  t => get("hr.cases.list",{limit:20},t), t, i),
    () => step("hr.leave.list",               "hr",                 "read",  t => get("hr.leave.list",{limit:20},t), t, i),
    () => step("contracts.list",              "contracts",          "read",  t => get("contracts.list",{limit:20},t), t, i),
    () => step("vendors.list",                "vendors",            "read",  t => get("vendors.list",{limit:20},t), t, i),
    () => step("catalog.listItems",           "catalog",            "read",  t => get("catalog.listItems",{limit:20},t), t, i),
    () => step("knowledge.list",              "knowledge",          "read",  t => get("knowledge.list",{limit:20},t), t, i),
    () => step("surveys.list",                "surveys",            "read",  t => get("surveys.list",{limit:20},t), t, i),
    () => step("apm.applications.list",       "apm",                "read",  t => get("apm.applications.list",{limit:20},t), t, i),
    () => step("projects.list",               "projects",           "read",  t => get("projects.list",{limit:20},t), t, i),
    () => step("reports.backlogTrend",        "reports",            "read",  t => get("reports.backlogTrend",{},t), t, i),
  ];
}

function planItilAgent(t, i) {
  const suf = `${i}-${uid()}`;
  return [
    () => step("auth.me",                    "auth",         "read",  t => get("auth.me",{},t), t, i),
    () => step("notifications.list",          "notifications","read",  t => get("notifications.list",{limit:10},t), t, i),
    () => step("vendors.create",              "vendors",      "write", t => post("vendors.create",{
      name:`[10K]Vendor-ITIL-${suf}`, type:rfrom(["software","hardware","services","consulting"]),
      status:"active", contactEmail:`itil${i}@stress10k.test`,
    },t), t, i),
    () => step("tickets.create",              "tickets",      "write", t => post("tickets.create",{
      title:`[10K]TKT-ITIL-${suf}`, description:lorem(),
      type:rfrom(["incident","request"]), priority:rfrom(PRIORITIES),
    },t), t, i),
    () => step("workOrders.create",           "work-orders",  "write", t => post("workOrders.create",{
      shortDescription:`[10K]WO-ITIL-${suf}`, description:lorem(),
      category:rfrom(WO_CATS), location:rfrom(WO_LOCS),
    },t), t, i),
    () => step("tickets.list",                "tickets",      "read",  t => get("tickets.list",{limit:20},t), t, i),
    () => step("tickets.statusCounts",        "tickets",      "read",  t => get("tickets.statusCounts",{},t), t, i),
    () => step("tickets.list.incidents",      "tickets",      "read",  t => get("tickets.list",{limit:10,type:"incident"},t), t, i),
    () => step("knowledge.list",              "knowledge",    "read",  t => get("knowledge.list",{limit:20},t), t, i),
    () => step("catalog.listItems",           "catalog",      "read",  t => get("catalog.listItems",{limit:20},t), t, i),
    () => step("workOrders.list",             "work-orders",  "read",  t => get("workOrders.list",{limit:20},t), t, i),
    () => step("search.global",               "search",       "read",  t => get("search.global",{query:rword(),limit:10},t), t, i),
    () => step("approvals.myPending",         "approvals",    "read",  t => get("approvals.myPending",{},t), t, i),
    () => step("changes.list",                "changes",      "read",  t => get("changes.list",{limit:20},t), t, i),
    () => step("events.list",                 "events",       "read",  t => get("events.list",{limit:10},t), t, i),
    () => step("notifications.markAllRead",   "notifications","write", t => post("notifications.markAllRead",{},t), t, i),
  ];
}

function planHrManager(t, i) {
  const suf = `${i}-${uid()}`;
  return [
    () => step("auth.me",                    "auth",         "read",  t => get("auth.me",{},t), t, i),
    () => step("notifications.list",          "notifications","read",  t => get("notifications.list",{limit:10},t), t, i),
    () => step("vendors.create",              "vendors",      "write", t => post("vendors.create",{
      name:`[10K]Vendor-HR-${suf}`, type:rfrom(["services","consulting","professional_services"]),
      status:"active", contactEmail:`hr${i}@stress10k.test`,
    },t), t, i),
    () => step("surveys.create",              "surveys",      "write", t => post("surveys.create",{
      title:`[10K]SURVEY-HR-${suf}`, type:rfrom(["employee_pulse","onboarding","exit","csat"]),
      questions:[{id:`q1-${i}`,type:"rating",question:"Overall satisfaction?",required:true}],
    },t), t, i),
    () => step("tickets.list",                "tickets",      "read",  t => get("tickets.list",{limit:20},t), t, i),
    () => step("tickets.list.requests",       "tickets",      "read",  t => get("tickets.list",{limit:10,type:"request"},t), t, i),
    () => step("knowledge.list",              "knowledge",    "read",  t => get("knowledge.list",{limit:20},t), t, i),
    () => step("catalog.listItems",           "catalog",      "read",  t => get("catalog.listItems",{limit:20},t), t, i),
    () => step("search.global",               "search",       "read",  t => get("search.global",{query:rfrom(["onboarding","policy","leave","benefits","hr"]),limit:10},t), t, i),
    () => step("hr.employees.list",           "hr",           "read",  t => get("hr.employees.list",{limit:20},t), t, i),
    () => step("hr.cases.list",               "hr",           "read",  t => get("hr.cases.list",{limit:20},t), t, i),
    () => step("hr.leave.list",               "hr",           "read",  t => get("hr.leave.list",{limit:20},t), t, i),
    () => step("reports.slaDashboard",        "reports",      "read",  t => get("reports.slaDashboard",{},t), t, i),
    () => step("reports.executiveOverview",   "reports",      "read",  t => get("reports.executiveOverview",{},t), t, i),
    () => step("dashboard.getMetrics",        "dashboard",    "read",  t => get("dashboard.getMetrics",{},t), t, i),
    () => step("approvals.myPending",         "approvals",    "read",  t => get("approvals.myPending",{},t), t, i),
    () => step("notifications.markAllRead",   "notifications","write", t => post("notifications.markAllRead",{},t), t, i),
  ];
}

function planFinanceManager(t, i) {
  const suf = `${i}-${uid()}`;
  return [
    () => step("auth.me",                    "auth",             "read",  t => get("auth.me",{},t), t, i),
    () => step("notifications.list",          "notifications",    "read",  t => get("notifications.list",{limit:10},t), t, i),
    () => step("surveys.create",              "surveys",          "write", t => post("surveys.create",{
      title:`[10K]SURVEY-FIN-${suf}`, type:rfrom(["csat","vendor_review","nps","employee_pulse"]),
      questions:[{id:`q1-${i}`,type:rfrom(["rating","nps","yes_no"]),question:"How would you rate this?",required:true}],
    },t), t, i),
    () => step("contracts.create",            "contracts",        "write", t => post("contracts.create",{
      title:`[10K]CONTRACT-FIN-${suf}`, counterparty:`FinVendor-${uid()}`,
      type:rfrom(CONTRACT_TYPES), value:money(25000,4999999),
      startDate:ts(rint(-30,0)), endDate:ts(rint(90,730)),
    },t), t, i),
    () => step("vendors.create",              "vendors",          "write", t => post("vendors.create",{
      name:`[10K]Vendor-FIN-${suf}`, type:rfrom(VENDOR_TYPES),
      status:"active", contactEmail:`fin${i}@stress10k.test`,
    },t), t, i),
    () => step("apm.applications.create",     "apm.applications", "write", t => post("apm.applications.create",{
      name:`[10K]APP-FIN-${suf}`, lifecycle:rfrom(APM_LIFE),
      cloudReadiness:rfrom(APM_CLOUD), category:rfrom(["finance","saas","paas"]),
    },t), t, i),
    () => step("financial.createBudgetLine",  "financial.budgets","write", t => post("financial.createBudgetLine",{
      category:rfrom(["Software","Cloud","Services","Hardware","Consulting"]),
      department:rfrom(DEPTS), fiscalYear:yr(), budgeted:money(100000,9999999),
    },t), t, i),
    () => step("financial.createChargeback",  "financial.chargebacks","write", t => post("financial.createChargeback",{
      department:rfrom(DEPTS),
      service:rfrom(["SaaS License","Cloud Compute","Storage","Consulting"]),
      amount:money(5000,499999), periodMonth:rint(1,12), periodYear:yr(),
      allocationMethod:rfrom(["headcount","usage","flat"]),
    },t), t, i),
    () => step("procurement.purchaseRequests.create","procurement.prs","write", t => post("procurement.purchaseRequests.create",{
      title:`[10K]PR-FIN-${suf}`, justification:lorem(),
      priority:rfrom(PRIORITIES), department:"Finance",
      items:[{description:"Financial software license",quantity:rint(1,20),unitPrice:rint(1000,25000)}],
    },t), t, i),
    () => step("tickets.list",                "tickets",          "read",  t => get("tickets.list",{limit:20},t), t, i),
    () => step("knowledge.list",              "knowledge",        "read",  t => get("knowledge.list",{limit:20},t), t, i),
    () => step("catalog.listItems",           "catalog",          "read",  t => get("catalog.listItems",{limit:20},t), t, i),
    () => step("search.global",               "search",           "read",  t => get("search.global",{query:rfrom(["invoice","contract","budget","vendor","finance"]),limit:10},t), t, i),
    () => step("contracts.list",              "contracts",        "read",  t => get("contracts.list",{limit:20},t), t, i),
    () => step("vendors.list",                "vendors",          "read",  t => get("vendors.list",{limit:20},t), t, i),
    () => step("financial.listInvoices",      "financial",        "read",  t => get("financial.listInvoices",{limit:20},t), t, i),
    () => step("financial.listBudget",        "financial",        "read",  t => get("financial.listBudget",{limit:20},t), t, i),
    () => step("financial.listChargebacks",   "financial",        "read",  t => get("financial.listChargebacks",{limit:20},t), t, i),
    () => step("financial.apAging",           "financial",        "read",  t => get("financial.apAging",{},t), t, i),
    () => step("procurement.purchaseRequests.list","procurement", "read",  t => get("procurement.purchaseRequests.list",{limit:20},t), t, i),
    () => step("approvals.myPending",         "approvals",        "read",  t => get("approvals.myPending",{},t), t, i),
    () => step("reports.slaDashboard",        "reports",          "read",  t => get("reports.slaDashboard",{},t), t, i),
    () => step("dashboard.getMetrics",        "dashboard",        "read",  t => get("dashboard.getMetrics",{},t), t, i),
    () => step("notifications.markAllRead",   "notifications",    "write", t => post("notifications.markAllRead",{},t), t, i),
  ];
}

function planRequester(t, i) {
  const suf = `${i}-${uid()}`;
  return [
    () => step("auth.me",                    "auth",         "read",  t => get("auth.me",{},t), t, i),
    () => step("notifications.list",          "notifications","read",  t => get("notifications.list",{limit:10},t), t, i),
    () => step("vendors.create",              "vendors",      "write", t => post("vendors.create",{
      name:`[10K]Vendor-REQ-${suf}`, type:rfrom(["services","software","consulting"]),
      status:"active", contactEmail:`req${i}@stress10k.test`,
    },t), t, i),
    () => step("rbac.probe→admin.users.list", "rbac",         "rbac",  t => get("admin.users.list",{limit:5},t), t, i),
    () => step("rbac.probe→security.list",    "rbac",         "rbac",  t => get("security.listIncidents",{limit:5},t), t, i),
    () => step("tickets.list",                "tickets",      "read",  t => get("tickets.list",{limit:20},t), t, i),
    () => step("tickets.statusCounts",        "tickets",      "read",  t => get("tickets.statusCounts",{},t), t, i),
    () => step("catalog.listItems",           "catalog",      "read",  t => get("catalog.listItems",{limit:20},t), t, i),
    () => step("knowledge.list",              "knowledge",    "read",  t => get("knowledge.list",{limit:20},t), t, i),
    () => step("search.global",               "search",       "read",  t => get("search.global",{query:rword(),limit:10},t), t, i),
    () => step("approvals.myPending",         "approvals",    "read",  t => get("approvals.myPending",{},t), t, i),
    () => step("notifications.markAllRead",   "notifications","write", t => post("notifications.markAllRead",{},t), t, i),
  ];
}

function planSecurityAnalyst(t, i) {
  const suf = `${i}-${uid()}`;
  return [
    () => step("auth.me",                    "auth",         "read",  t => get("auth.me",{},t), t, i),
    () => step("notifications.list",          "notifications","read",  t => get("notifications.list",{limit:10},t), t, i),
    () => step("vendors.create",              "vendors",      "write", t => post("vendors.create",{
      name:`[10K]Vendor-OPS-${suf}`, type:rfrom(["hardware","services","cloud"]),
      status:"active", contactEmail:`ops${i}@stress10k.test`,
    },t), t, i),
    () => step("rbac.probe→grc.listRisks",    "rbac",         "rbac",  t => get("grc.listRisks",{limit:5},t), t, i),
    () => step("tickets.list",                "tickets",      "read",  t => get("tickets.list",{limit:20},t), t, i),
    () => step("tickets.statusCounts",        "tickets",      "read",  t => get("tickets.statusCounts",{},t), t, i),
    () => step("tickets.list.incidents",      "tickets",      "read",  t => get("tickets.list",{limit:10,type:"incident"},t), t, i),
    () => step("knowledge.list",              "knowledge",    "read",  t => get("knowledge.list",{limit:20},t), t, i),
    () => step("catalog.listItems",           "catalog",      "read",  t => get("catalog.listItems",{limit:20},t), t, i),
    () => step("search.global",               "search",       "read",  t => get("search.global",{query:rfrom(["incident","alert","security","outage","threat"]),limit:10},t), t, i),
    () => step("events.list",                 "events",       "read",  t => get("events.list",{limit:10},t), t, i),
    () => step("approvals.myPending",         "approvals",    "read",  t => get("approvals.myPending",{},t), t, i),
    () => step("notifications.markAllRead",   "notifications","write", t => post("notifications.markAllRead",{},t), t, i),
  ];
}

const PLANS = {
  admin:            planAdmin,
  itil_agent:       planItilAgent,
  hr_manager:       planHrManager,
  finance_manager:  planFinanceManager,
  requester:        planRequester,
  security_analyst: planSecurityAnalyst,
};

// ── Session runner ────────────────────────────────────────────────────────────
//
// Each simulated session owns its full lifecycle:
//
//   1. Login  — call auth.login, receive a UNIQUE session token.
//               If login fails the session is aborted and recorded as a login
//               failure (not counted against step success rate).
//   2. Steps  — execute the persona's operation plan with the private token.
//               A random jitter of 0–STEP_JITTER_MS ms between each step
//               simulates user think-time and de-synchronises concurrent
//               sessions that started at similar times.
//   3. Logout — optionally call auth.logout to clean up the server-side session
//               (controlled by LOGOUT_SESSIONS env var; default false).

async function runSession(idx, persona) {
  const results = [];

  // ── 1. Login ────────────────────────────────────────────────────────────────
  const loginStart = Date.now();
  let token = null;
  let loginStatus = 0;
  let loginError  = null;

  try {
    const res  = await withTimeout(
      post("auth.login", { email: persona.email, password: persona.password }, null),
      LOGIN_TIMEOUT_MS,
    );
    loginStatus  = res.status;
    const json   = await res.json().catch(() => ({}));
    token        = json?.result?.data?.sessionId ?? null;
    if (!token)  loginError = json?.error?.message ?? `HTTP ${loginStatus} — no token`;
  } catch (e) {
    loginError = e.message;
  }

  const loginMs = Date.now() - loginStart;

  if (token) {
    LOGIN_STATS.ok++;
  } else {
    LOGIN_STATS.fail++;
    LOGIN_STATS.totalMs += loginMs;
    // Return a single entry so the session is visible in the error list
    return [{
      label: "auth.login", module: "auth", type: "auth",
      status: loginStatus || 0, durationMs: loginMs,
      error: loginError, role: persona.role,
    }];
  }
  LOGIN_STATS.totalMs += loginMs;

  // ── 2. Steps ─────────────────────────────────────────────────────────────────
  for (const stepFn of PLANS[persona.role](token, idx)) {
    // Jitter: random think-time between user actions
    if (STEP_JITTER_MS > 0) await sleep(Math.random() * STEP_JITTER_MS);

    const r = await stepFn();

    // RBAC probes — gate responses (403/404/401) are the expected outcome
    if (r.label.startsWith("rbac.")) {
      const gated =
        r.status === 403 || r.status === 404 || r.status === 401 ||
        ["FORBIDDEN","UNAUTHORIZED","NOT_FOUND"].includes(r.trpcCode);
      r.status = gated ? 200 : 500;
      if (!gated) r.error = `RBAC probe expected gate, got ${r.status}/${r.trpcCode}`;
    }

    if (r.type === "write" && r.status >= 200 && r.status < 300 && CREATED[r.module] !== undefined) {
      CREATED[r.module]++;
    }

    r.role = persona.role;
    results.push(r);
  }

  // ── 3. Logout (optional) ────────────────────────────────────────────────────
  if (LOGOUT_SESSIONS) {
    await post("auth.logout", {}, token).catch(() => { /* non-fatal */ });
  }

  return results;
}

// ── Concurrency pool with linear ramp-up ─────────────────────────────────────
//
// v3 launched all MAX_CONCURRENT slots simultaneously at t=0, creating a burst.
// v4 spreads the initial MAX_CONCURRENT slots across RAMP_UP_SECS seconds:
//
//   Slot 0   → starts immediately     (delay = 0)
//   Slot k   → starts after k * (RAMP_UP_SECS * 1000 / MAX_CONCURRENT) ms
//   Slot ≥ N → natural pool replenishment (no artificial delay)
//
// After the ramp, slot replenishment (starting the next session when the
// previous one completes) naturally maintains the concurrency ceiling and
// paces throughput to match server capacity.

async function runPool(sessions, available) {
  // ms between consecutive slot launches during ramp-up (0 = no ramp)
  const rampDelayPerSlot = RAMP_UP_SECS > 0
    ? Math.round((RAMP_UP_SECS * 1000) / MAX_CONCURRENT)
    : 0;

  const allResults = [];
  let completed = 0, progressAt = PROGRESS_INTERVAL;
  const wallStart = Date.now();

  return new Promise((resolve) => {
    let nextIdx = 0;

    // isInitial: true for the first MAX_CONCURRENT slots (ramp-up applies),
    //            false for replenishment slots (start immediately).
    async function startSession(sessionIdx, isInitial) {
      const persona = available[sessionIdx % available.length];

      // Ramp-up delay: slot k waits k × rampDelayPerSlot ms before logging in
      if (isInitial && rampDelayPerSlot > 0) {
        await sleep(sessionIdx * rampDelayPerSlot);
      }

      runSession(sessionIdx, persona)
        .then(res => {
          allResults.push(...res);
          // Update running counters so the progress block has live metrics
          // without re-scanning the full allResults array.
          for (const r of res) {
            if (r.type === "auth") continue; // login steps tracked in LOGIN_STATS
            RUNNING.totalDurMs += r.durationMs;
            RUNNING.stepCount++;
            if      (r.status >= 200 && r.status < 300) RUNNING.ok++;
            else if (r.status >= 400 && r.status < 500) RUNNING.xx4++;
            else if (r.status >= 500)                   RUNNING.xx5++;
            else                                        RUNNING.net++;
          }
        })
        .catch(err => allResults.push({
          label: "session.error", module: "runtime", type: "read",
          status: 0, durationMs: 0, error: err.message, role: persona.role,
        }))
        .finally(() => {
          completed++;

          if (completed >= progressAt) {
            const elapsedS     = (Date.now() - wallStart) / 1000;
            const totalSteps   = RUNNING.ok + RUNNING.xx4 + RUNNING.xx5 + RUNNING.net;
            const totalWritten = Object.values(CREATED).reduce((a, b) => a + b, 0);
            const avgLatMs     = RUNNING.stepCount > 0
              ? Math.round(RUNNING.totalDurMs / RUNNING.stepCount) : 0;
            const throughput   = elapsedS > 0 ? Math.round(totalSteps / elapsedS) : 0;
            const loginTotal   = LOGIN_STATS.ok + LOGIN_STATS.fail;
            const loginRate    = loginTotal > 0
              ? Math.round(LOGIN_STATS.ok / loginTotal * 100) : 100;
            const pctDone      = Math.round(completed / sessions * 100);

            // ── Per-bucket percentages ──────────────────────────────────────
            const p2xx = totalSteps > 0 ? (RUNNING.ok  / totalSteps * 100).toFixed(1) : "0.0";
            const p4xx = totalSteps > 0 ? (RUNNING.xx4 / totalSteps * 100).toFixed(1) : "0.0";
            const p5xx = totalSteps > 0 ? (RUNNING.xx5 / totalSteps * 100).toFixed(1) : "0.0";
            const pnet = totalSteps > 0 ? (RUNNING.net / totalSteps * 100).toFixed(1) : "0.0";

            // ── Format header ───────────────────────────────────────────────
            const hdr = `@${completed.toLocaleString()} / ${sessions.toLocaleString()}` +
              ` (${pctDone}%)  ·  ${elapsedS.toFixed(1)}s  ·  ${throughput} req/s`;
            const dashes = "─".repeat(Math.max(2, 74 - hdr.length));

            process.stdout.write([
              `  ── ${hdr} ${dashes}`,
              `    2xx: ${String(RUNNING.ok ).padStart(8)}  (${p2xx.padStart(5)}%)` +
              `  │  4xx: ${String(RUNNING.xx4).padStart(7)}  (${p4xx.padStart(5)}%)` +
              `  │  5xx: ${String(RUNNING.xx5).padStart(6)}  (${p5xx.padStart(5)}%)` +
              `  │  net: ${String(RUNNING.net).padStart(5)}  (${pnet.padStart(5)}%)`,
              `    Records: ${String(totalWritten).padStart(7)}` +
              `   Avg latency: ${String(avgLatMs).padStart(5)} ms` +
              `   Logins: ${LOGIN_STATS.ok}/${loginTotal} (${loginRate}%)`,
              "",
            ].join("\n"));

            progressAt += PROGRESS_INTERVAL;
          }

          if (completed === sessions) {
            resolve(allResults);
            return;
          }

          // Replenish: start the next session with no artificial delay
          if (nextIdx < sessions) {
            startSession(nextIdx++, false);
          }
        });
    }

    // Launch initial slots (each with its own ramp delay computed inside)
    const initialSlots = Math.min(MAX_CONCURRENT, sessions);
    for (let k = 0; k < initialSlots; k++) {
      startSession(nextIdx++, true);
    }
  });
}

// ── Report builder ────────────────────────────────────────────────────────────

const pct  = (n, t) => t === 0 ? "0%" : `${Math.round(n / t * 100)}%`;
const pad  = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

function buildReport(allResults, wallMs) {
  const byModule = {}, byLabel = {}, byRole = {};
  const sg = { ok: 0, "4xx": 0, "5xx": 0, network: 0 };
  const durs = [], errs = [];

  for (const r of allResults) {
    // Login steps are tracked via LOGIN_STATS; skip from module/label breakdown
    if (r.type === "auth") continue;

    if (!byModule[r.module]) byModule[r.module] = { ok:0, fail:0, reads:0, writes:0, durs:[], errors:[] };
    if (!byLabel[r.label])   byLabel[r.label]   = { ok:0, fail:0, total:0, durs:[], type: r.type };
    if (!byRole[r.role])     byRole[r.role]      = { sessions:0, ok:0, fail:0 };

    const m = byModule[r.module], l = byLabel[r.label], ro = byRole[r.role];
    l.total++; l.durs.push(r.durationMs); m.durs.push(r.durationMs); durs.push(r.durationMs);
    if (r.type === "write") m.writes++; else m.reads++;

    const ok = r.status >= 200 && r.status < 300;
    if (ok)                                      { l.ok++; m.ok++; ro.ok++; sg.ok++; }
    else if (r.status >= 400 && r.status < 500)  { l.fail++; m.fail++; ro.fail++; sg["4xx"]++; }
    else if (r.status >= 500)                    { l.fail++; m.fail++; ro.fail++; sg["5xx"]++; }
    else                                         { l.fail++; m.fail++; ro.fail++; sg.network++; }
    if (r.error) errs.push(r);
    if (r.status >= 400) m.errors.push(r.error);
  }

  // Count sessions per role (each session contributed at least one auth step)
  for (const r of allResults.filter(x => x.type === "auth")) {
    if (!byRole[r.role]) byRole[r.role] = { sessions: 0, ok: 0, fail: 0 };
    byRole[r.role].sessions++;
  }

  const sd  = [...durs].sort((a, b) => a - b);
  const p   = (f) => sd[Math.floor(sd.length * f)] ?? 0;
  const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;

  // ── Error categorisation ──────────────────────────────────────────────────
  // Each bucket is mutually exclusive and covers a distinct failure mode.
  const cv  = errs.filter(r => r.error?.includes("duplicate key"));
  const ie  = errs.filter(r => r.status >= 500 && !r.error?.includes("duplicate key"));
  const ne  = errs.filter(r => r.status === 0 && !(r.error ?? "").includes("Timeout"));
  const toe = errs.filter(r => r.status === 0 && (r.error ?? "").includes("Timeout"));
  const ae  = errs.filter(r =>
    (r.status === 401 || r.trpcCode === "UNAUTHORIZED") && !r.label.startsWith("rbac."));
  // 4xx that are NOT auth failures and NOT intentional RBAC probe results
  const fxx = errs.filter(r =>
    r.status >= 400 && r.status < 500 && r.status !== 401 &&
    r.trpcCode !== "UNAUTHORIZED" && !r.label.startsWith("rbac."));

  return {
    byModule, byLabel, byRole, sg, durs: sd, avg, total: allResults.length, wallMs,
    errs, p50: p(.50), p75: p(.75), p90: p(.90), p95: p(.95), p99: p(.99),
    constraintViolations: cv, infraErrors: ie, networkErrors: ne,
    timeouts: toe, authFailures: ae, otherClientErrors: fxx,
  };
}

function printReport(R, sessions) {
  const L = "═".repeat(84), D = "─".repeat(84);
  const totalCreated = Object.values(CREATED).reduce((a, b) => a + b, 0);
  const loginTotal   = LOGIN_STATS.ok + LOGIN_STATS.fail;
  const loginAvgMs   = loginTotal > 0 ? Math.round(LOGIN_STATS.totalMs / loginTotal) : 0;

  console.log("\n" + L);
  console.log("  NexusOps — 10,000-Session Full-Coverage Stress Test v4 Results");
  console.log(L);
  console.log(`  Sessions        : ${sessions}  (pool=${MAX_CONCURRENT}  ramp=${RAMP_UP_SECS}s  jitter=${STEP_JITTER_MS}ms)`);
  console.log(`  Total requests  : ${R.total}`);
  console.log(`  Wall time       : ${(R.wallMs / 1000).toFixed(2)}s`);
  console.log(`  Throughput      : ${((R.total / R.wallMs) * 1000).toFixed(1)} req/s`);
  console.log(`  Avg ops/session : ${(R.total / sessions).toFixed(1)}`);
  console.log(D);
  console.log("  Session Lifecycle");
  console.log(`    Logins attempted : ${rpad(loginTotal, 7)}`);
  console.log(`    Logins succeeded : ${rpad(LOGIN_STATS.ok, 7)}  (${pct(LOGIN_STATS.ok, loginTotal)})`);
  console.log(`    Logins failed    : ${rpad(LOGIN_STATS.fail, 7)}  (${pct(LOGIN_STATS.fail, loginTotal)})`);
  console.log(`    Avg login latency: ${rpad(loginAvgMs, 7)} ms`);
  if (LOGOUT_SESSIONS) console.log(`    Logout           : enabled (LOGOUT_SESSIONS=true)`);
  console.log(D);
  console.log("  Latency  (excludes login)");
  console.log(`    avg:${rpad(R.avg, 6)}ms  p50:${rpad(R.p50, 6)}ms  p75:${rpad(R.p75, 6)}ms`);
  console.log(`    p90:${rpad(R.p90, 6)}ms  p95:${rpad(R.p95, 6)}ms  p99:${rpad(R.p99, 6)}ms`);
  console.log(D);
  console.log("  Status Breakdown  (excludes login steps)");
  console.log(`    2xx : ${rpad(R.sg.ok, 8)}  (${pct(R.sg.ok, R.total)})`);
  console.log(`    4xx : ${rpad(R.sg["4xx"], 8)}  (${pct(R.sg["4xx"], R.total)})`);
  console.log(`    5xx : ${rpad(R.sg["5xx"], 8)}  (${pct(R.sg["5xx"], R.total)})`);
  console.log(`    net : ${rpad(R.sg.network, 8)}  (${pct(R.sg.network, R.total)})`);
  console.log(D);
  console.log("  Records Created by Module");
  for (const [mod, n] of Object.entries(CREATED).sort((a, b) => b[1] - a[1]))
    if (n > 0) console.log(`    ${pad(mod, 30)} ${rpad(n, 7)} records`);
  console.log(`  ${"─".repeat(40)}`);
  console.log(`    ${"TOTAL".padEnd(30)} ${rpad(totalCreated, 7)} records`);
  console.log(D);
  console.log("  Module Performance Summary");
  console.log(`  ${"Module".padEnd(28)} ${"Reqs".padStart(7)} ${"OK%".padStart(6)} ${"p95ms".padStart(7)} ${"Writes".padStart(8)} ${"Reads".padStart(7)}`);
  const modulesSorted = Object.entries(R.byModule).sort((a, b) => (b[1].ok + b[1].fail) - (a[1].ok + a[1].fail));
  for (const [name, m] of modulesSorted) {
    const reqs = m.ok + m.fail;
    const icon = m.fail === 0 ? "✓" : m.ok / reqs > 0.8 ? "△" : "✗";
    const ms   = [...m.durs].sort((a, b) => a - b);
    const mp95 = ms[Math.floor(ms.length * .95)] ?? 0;
    console.log(`  ${icon} ${pad(name, 26)} ${rpad(reqs, 7)} ${rpad(pct(m.ok, reqs), 6)} ${rpad(mp95, 7)}ms ${rpad(m.writes, 8)} ${rpad(m.reads, 7)}`);
  }
  console.log(D);
  console.log("  Role Distribution");
  console.log(`  ${"Role".padEnd(22)} ${"Sessions".padStart(10)} ${"OK%".padStart(8)}`);
  for (const [role, r] of Object.entries(R.byRole)) {
    const total = r.ok + r.fail;
    console.log(`    ${pad(role, 20)} ${rpad(r.sessions, 8)} sessions   ${pct(r.ok, total)} OK`);
  }
  console.log(D);
  console.log(D);
  console.log("  Error Breakdown");
  console.log(`  ${"Category".padEnd(40)} ${"Count".padStart(8)}  ${"% of total".padStart(12)}  Notes`);
  console.log(`  ${"─".repeat(82)}`);

  // Helper: print one error-category row
  function errRow(label, arr, note) {
    const icon = arr.length === 0 ? "✓" : "⚠";
    console.log(`  ${icon} ${label.padEnd(38)} ${rpad(arr.length, 8)}  ${rpad(pct(arr.length, R.total), 12)}  ${note}`);
  }
  errRow("Constraint violations (dup key)", R.constraintViolations, "write conflict under concurrency");
  errRow("Server errors (5xx)",             R.infraErrors,          "non-constraint server-side failures");
  errRow("Auth failures (401)",             R.authFailures,         "invalid / expired session token");
  errRow("Other 4xx client errors",         R.otherClientErrors,    "bad request / validation failure");
  errRow("Timeouts",                        R.timeouts,             `request exceeded ${TIMEOUT_MS} ms`);
  errRow("Network errors (dropped)",        R.networkErrors,        "connection-level failure");
  errRow("Login failures",                  Array(LOGIN_STATS.fail).fill(null), "sessions that could not authenticate");

  // Show the top distinct error messages for any non-zero bucket
  const allNonZero = [
    ...R.constraintViolations, ...R.infraErrors, ...R.authFailures,
    ...R.otherClientErrors, ...R.timeouts, ...R.networkErrors,
  ];
  if (allNonZero.length > 0) {
    console.log(`\n  Top distinct error messages:`);
    const seen = new Map();
    for (const f of allNonZero) {
      const key = `[${f.role}] ${f.label}`;
      if (!seen.has(key)) {
        seen.set(key, (f.error ?? "").slice(0, 90));
        if (seen.size >= 8) break;
      }
    }
    for (const [key, msg] of seen) console.log(`    ${key} → ${msg}`);
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log("\n" + L);
  console.log("  FINAL SUMMARY");
  console.log(L);
  const sr        = (R.sg.ok / R.total * 100).toFixed(1);
  const bugs      = new Set(R.constraintViolations.map(r => r.label)).size;
  const anyErrors = R.networkErrors.length > 0 || R.infraErrors.length > 0 || LOGIN_STATS.fail > 0;
  const pass      = !anyErrors;

  console.log(`  Total requests   : ${R.total.toLocaleString()}`);
  console.log(`  Success rate     : ${sr}%  (2xx: ${R.sg.ok.toLocaleString()} / ${R.total.toLocaleString()} requests)`);
  console.log(`  Error breakdown  : ` +
    `4xx: ${R.sg["4xx"].toLocaleString()}` +
    `  │  5xx: ${R.sg["5xx"].toLocaleString()}` +
    `  │  net: ${R.sg.network.toLocaleString()}` +
    `  │  timeouts: ${R.timeouts.length.toLocaleString()}`);
  console.log(`  Records created  : ${totalCreated.toLocaleString()}`);
  console.log(`  Wall time        : ${(R.wallMs / 1000).toFixed(2)} s` +
    `  │  Throughput: ${((R.total / R.wallMs) * 1000).toFixed(0)} req/s` +
    `  │  Avg latency: ${R.avg} ms`);
  console.log(D);

  const verdict = !pass
    ? "✗  FAILED"
    : bugs > 0
      ? `⚡ PASSED with ${bugs} concurrency bug(s)`
      : "✓  PASSED — all checks green";
  console.log(`\n  ${verdict}\n`);
  console.log(L + "\n");

  return { pass, R, bugs, totalCreated };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n" + "═".repeat(84));
  console.log("  NexusOps 10,000-Session Full-Coverage Stress Test v4");
  console.log("═".repeat(84));
  console.log(`  Target      : ${BASE}`);
  console.log(`  Sessions    : ${SESSIONS}  |  pool=${MAX_CONCURRENT}  |  timeout=${TIMEOUT_MS}ms`);
  console.log(`  Ramp-up     : ${RAMP_UP_SECS}s  |  step-jitter=${STEP_JITTER_MS}ms  |  unique-tokens=YES`);
  console.log(`  Logout      : ${LOGOUT_SESSIONS ? "YES (LOGOUT_SESSIONS=true)" : "no"}`);
  console.log(`  Modules     : 34 routers covered  |  Target records: 1,000+`);
  console.log("═".repeat(84));

  // ── API connectivity check ──────────────────────────────────────────────────
  // Verify the server is reachable before spending time on 10K logins.
  // We check /health (no auth required) so this doesn't create a session.
  try {
    const healthUrl = BASE.replace("/trpc", "") + "/health";
    const p = await withTimeout(fetch(healthUrl), 5000);
    if (!p.ok) throw new Error(`HTTP ${p.status}`);
    console.log("  API reachable ✓");
  } catch (e) {
    console.error(`\n  ✗ API unreachable at ${BASE}: ${e.message}\n`);
    process.exit(1);
  }

  // ── Verify credentials before the full run ──────────────────────────────────
  // Log in once per persona to confirm credentials work.  These tokens are
  // DISCARDED — the real test sessions each perform their own login.
  console.log(`\n  Verifying ${PERSONAS.length} persona credentials...`);
  const available = [];
  for (const p of PERSONAS) {
    try {
      const res  = await withTimeout(
        post("auth.login", { email: p.email, password: p.password }, null),
        LOGIN_TIMEOUT_MS,
      );
      const json = await res.json().catch(() => ({}));
      const tok  = json?.result?.data?.sessionId ?? null;
      if (tok) {
        available.push(p);
        console.log(`    ✓  ${pad(p.role, 18)} ${p.email}`);
        // Discard this pre-flight token — each test session gets its own.
        if (LOGOUT_SESSIONS) post("auth.logout", {}, tok).catch(() => {});
      } else {
        console.warn(`    ✗  ${p.role} — login returned no token  (${json?.error?.message ?? "unknown"})`);
      }
    } catch (e) {
      console.warn(`    ✗  ${p.role} — ${e.message}`);
    }
  }

  if (!available.length) {
    console.error("\n  All persona credentials failed — aborting\n");
    process.exit(1);
  }
  console.log(`\n  ${available.length}/${PERSONAS.length} personas verified`);
  console.log(`  Each of the ${SESSIONS} test sessions will log in independently`);
  console.log(`  and receive its own unique session token.\n`);

  // ── Run ────────────────────────────────────────────────────────────────────
  console.log(`  Starting ${SESSIONS} sessions (pool=${MAX_CONCURRENT}, ramp=${RAMP_UP_SECS}s)...`);
  console.log(`  Progress reports every ${PROGRESS_INTERVAL} sessions\n`);

  const wallStart  = Date.now();
  const allResults = await runPool(SESSIONS, available);
  const wallMs     = Date.now() - wallStart;

  console.log(`\n  All sessions complete in ${(wallMs / 1000).toFixed(2)}s`);

  const R = buildReport(allResults, wallMs);
  printReport(R, SESSIONS);

  // ── JSON summary (machine-readable for report generation) ─────────────────
  const totalCreated = Object.values(CREATED).reduce((a, b) => a + b, 0);
  const summary = {
    version:        "v4",
    date:           new Date().toISOString(),
    sessions:       SESSIONS,
    maxConcurrent:  MAX_CONCURRENT,
    rampUpSecs:     RAMP_UP_SECS,
    stepJitterMs:   STEP_JITTER_MS,
    uniqueTokens:   true,
    logoutEnabled:  LOGOUT_SESSIONS,
    totalRequests:  R.total,
    wallMs,
    throughput:     Math.round(R.total / wallMs * 1000),
    avg:  R.avg,  p50: R.p50,  p75: R.p75,
    p90:  R.p90,  p95: R.p95,  p99: R.p99,
    loginStats: {
      attempted: LOGIN_STATS.ok + LOGIN_STATS.fail,
      succeeded: LOGIN_STATS.ok,
      failed:    LOGIN_STATS.fail,
      avgMs:     Math.round(LOGIN_STATS.totalMs / Math.max(1, LOGIN_STATS.ok + LOGIN_STATS.fail)),
    },
    statusBreakdown:     R.sg,
    recordsCreated:      { ...CREATED, _total: totalCreated },
    constraintViolations: R.constraintViolations.length,
    infraErrors:          R.infraErrors.length,
    networkErrors:        R.networkErrors.length,
    timeouts:             R.timeouts.length,
    authFailures:         R.authFailures.length,
    otherClientErrors:    R.otherClientErrors.length,
    byModule: Object.fromEntries(Object.entries(R.byModule).map(([k, v]) => {
      const ms = [...v.durs].sort((a, b) => a - b);
      return [k, { ok: v.ok, fail: v.fail, reads: v.reads, writes: v.writes,
        p95: ms[Math.floor(ms.length * .95)] ?? 0 }];
    })),
    byRole: R.byRole,
  };
  process.stdout.write("\n__SUMMARY_JSON__\n" + JSON.stringify(summary) + "\n__END_SUMMARY_JSON__\n");
  process.exitCode = (R.networkErrors.length === 0 && R.infraErrors.length === 0 && LOGIN_STATS.fail === 0) ? 0 : 1;
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
