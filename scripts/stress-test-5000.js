#!/usr/bin/env node
/**
 * NexusOps — 5000-Session Heavy-Write Stress Test (v2)
 *
 * Verified RBAC matrix (from live system probing):
 *   admin            — full write access to all 34 modules
 *   itil_agent       — reads (tickets, knowledge, catalog, search); vendors.create
 *   hr_manager       — reads (tickets, knowledge, catalog, reports); vendors.create
 *   finance_manager  — reads + surveys/contracts/vendors/apm writes
 *   requester        — reads (tickets, catalog, knowledge) + vendors.create
 *   security_analyst — operator_field role; reads + vendors.create
 *
 * Design:
 *   - Rolling concurrency pool (MAX_CONCURRENT live at any time)
 *   - Admin sessions do 11 writes across all major modules
 *   - Finance sessions do 4 writes + 11 reads
 *   - All other sessions do 1 write (vendors) + reads
 *   - RBAC probes confirm gates on admin-only routes
 *   - Atomic counters track entries created per module
 *   - Progress printed every PROGRESS_INTERVAL sessions
 *
 * Usage:
 *   node scripts/stress-test-5000.js
 *   SESSIONS=5000 MAX_CONCURRENT=500 node scripts/stress-test-5000.js
 */

"use strict";

const BASE              = (process.env.BASE_URL          ?? "http://localhost:3001") + "/trpc";
const SESSIONS          = parseInt(process.env.SESSIONS          ?? "5000",  10);
const MAX_CONCURRENT    = parseInt(process.env.MAX_CONCURRENT    ?? "500",   10);
const TIMEOUT_MS        = parseInt(process.env.TIMEOUT_MS        ?? "45000", 10);
const PROGRESS_INTERVAL = parseInt(process.env.PROGRESS_INTERVAL ?? "500",   10);

const PERSONAS = [
  { role: "admin",            email: process.env.ADMIN_EMAIL     ?? "admin@coheron.com",    password: "demo1234!" },
  { role: "itil_agent",       email: process.env.AGENT_EMAIL     ?? "agent1@coheron.com",   password: "demo1234!" },
  { role: "hr_manager",       email: process.env.HR_EMAIL        ?? "hr@coheron.com",        password: "demo1234!" },
  { role: "finance_manager",  email: process.env.FINANCE_EMAIL   ?? "finance@coheron.com",  password: "demo1234!" },
  { role: "requester",        email: process.env.REQUESTER_EMAIL ?? "employee@coheron.com", password: "demo1234!" },
  { role: "security_analyst", email: process.env.SEC_EMAIL       ?? "agent2@coheron.com",   password: "demo1234!" },
];

// ── HTTP ─────────────────────────────────────────────────────────────────────

function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`Timeout ${ms}ms`)), ms); }),
  ]).finally(() => clearTimeout(t));
}

function post(path, body, token) {
  return fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
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

async function loginPersona(p) {
  const res = await withTimeout(post("auth.login", { email: p.email, password: p.password }), 10000);
  const json = await res.json().catch(() => ({}));
  return json?.result?.data?.sessionId ?? null;
}

// ── Util ─────────────────────────────────────────────────────────────────────

const WORDS = ["server","network","database","vpn","laptop","printer","outage","patch","deploy","backup","firewall","certificate","cluster","gateway","api"];
const LOREM = ["Network disruption reported.","User access required.","Database migration pending.","System health check.","Automated workflow triggered.","Configuration drift detected.","Capacity planning review.","Compliance audit initiated."];
let _li = 0;
const lorem = ()  => LOREM[_li++ % LOREM.length];
const rword = ()  => WORDS[Math.floor(Math.random() * WORDS.length)];
const rfrom = (a) => a[Math.floor(Math.random() * a.length)];
const rint  = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const uid   = ()  => Math.random().toString(36).slice(2, 9);
const ts    = (d) => new Date(Date.now() + d * 86400000).toISOString();

// ── Global write counters ─────────────────────────────────────────────────────

const CREATED = {
  tickets: 0, changes: 0, projects: 0, knowledge: 0,
  "grc.risks": 0, "security.incidents": 0, "crm.deals": 0,
  contracts: 0, vendors: 0, surveys: 0, "apm.applications": 0,
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

// ── Session plans (RBAC-verified) ────────────────────────────────────────────

function planAdmin(t, i) {
  return [
    () => step("auth.me",                  "auth",             "read",  t => get("auth.me", {}, t), t, i),
    () => step("dashboard.getMetrics",      "dashboard",        "read",  t => get("dashboard.getMetrics", {}, t), t, i),
    () => step("notifications.list",        "notifications",    "read",  t => get("notifications.list", {limit:10}, t), t, i),
    // ── 11 writes ──
    () => step("tickets.create",            "tickets",          "write", t => post("tickets.create", {
      title:`[5K]INC-${i}-${uid()}`, description:lorem(), type:rfrom(["incident","request","problem"]), tags:["stress-5k"],
    }, t), t, i),
    () => step("changes.create",            "changes",          "write", t => post("changes.create", {
      title:`[5K]CHG-${i}-${uid()}`, description:lorem(), type:rfrom(["normal","standard","emergency"]), risk:rfrom(["low","medium","high"]),
    }, t), t, i),
    () => step("projects.create",           "projects",         "write", t => post("projects.create", {
      name:`[5K]PRJ-${i}-${uid()}`, description:lorem(),
    }, t), t, i),
    () => step("knowledge.create",          "knowledge",        "write", t => post("knowledge.create", {
      title:`[5K]KB-${i}-${uid()}`, content:lorem(), tags:["stress-5k"],
    }, t), t, i),
    () => step("grc.createRisk",            "grc.risks",        "write", t => post("grc.createRisk", {
      title:`[5K]RISK-${i}-${uid()}`, category:rfrom(["operational","financial","technology","compliance","strategic"]),
      likelihood:rint(1,5), impact:rint(1,5), description:lorem(),
    }, t), t, i),
    () => step("security.createIncident",   "security.incidents","write",t => post("security.createIncident", {
      title:`[5K]SEC-${i}-${uid()}`, severity:rfrom(["low","medium","high","critical"]),
      type:rfrom(["malware","phishing","unauthorized_access","data_breach"]),
    }, t), t, i),
    () => step("crm.createDeal",            "crm.deals",        "write", t => post("crm.createDeal", {
      title:`[5K]DEAL-${i}-${uid()}`, value:String(rint(10000,9999999)), probability:rint(10,90),
      expectedClose:ts(rint(30,180)),
    }, t), t, i),
    () => step("surveys.create",            "surveys",          "write", t => post("surveys.create", {
      title:`[5K]SURVEY-${i}-${uid()}`, type:rfrom(["csat","nps","employee_pulse","post_incident"]),
      questions:[{id:`q${i}`,type:"rating",question:"Rate your experience",required:true}],
    }, t), t, i),
    () => step("apm.applications.create",   "apm.applications", "write", t => post("apm.applications.create", {
      name:`[5K]APP-${i}-${uid()}`, lifecycle:rfrom(["evaluating","sustaining","harvesting"]),
      cloudReadiness:rfrom(["cloud_native","lift_shift","not_assessed"]), category:rfrom(["internal","saas","paas"]),
    }, t), t, i),
    () => step("contracts.create",          "contracts",        "write", t => post("contracts.create", {
      title:`[5K]CONTRACT-${i}-${uid()}`, counterparty:`Vendor-${uid()}`,
      type:rfrom(["nda","msa","sow","vendor","sla_support"]),
      value:String(rint(100000,99999999)), startDate:ts(-30), endDate:ts(rint(180,730)),
    }, t), t, i),
    () => step("vendors.create",            "vendors",          "write", t => post("vendors.create", {
      name:`[5K]Vendor-ADM-${i}-${uid()}`, type:rfrom(["software","hardware","services","cloud","consulting"]),
      status:"active", contactEmail:`admin${i}@stress5k.test`,
    }, t), t, i),
    // ── reads ──
    () => step("tickets.list",              "tickets",          "read",  t => get("tickets.list", {limit:20}, t), t, i),
    () => step("tickets.statusCounts",      "tickets",          "read",  t => get("tickets.statusCounts", {}, t), t, i),
    () => step("search.global",             "search",           "read",  t => get("search.global", {query:rword(),limit:10}, t), t, i),
    () => step("admin.users.list",          "admin",            "read",  t => get("admin.users.list", {limit:20}, t), t, i),
    () => step("grc.listRisks",             "grc",              "read",  t => get("grc.listRisks", {limit:20}, t), t, i),
    () => step("security.listIncidents",    "security",         "read",  t => get("security.listIncidents", {limit:20}, t), t, i),
    () => step("crm.listAccounts",          "crm",              "read",  t => get("crm.listAccounts", {limit:20}, t), t, i),
    () => step("reports.executiveOverview", "reports",          "read",  t => get("reports.executiveOverview", {}, t), t, i),
    () => step("approvals.myPending",       "approvals",        "read",  t => get("approvals.myPending", {}, t), t, i),
  ];
}

function planItilAgent(t, i) {
  return [
    () => step("auth.me",                  "auth",             "read",  t => get("auth.me", {}, t), t, i),
    () => step("notifications.list",        "notifications",    "read",  t => get("notifications.list", {limit:10}, t), t, i),
    () => step("vendors.create",            "vendors",          "write", t => post("vendors.create", {
      name:`[5K]Vendor-ITIL-${i}-${uid()}`, type:rfrom(["software","hardware","services"]),
      status:"active", contactEmail:`itil${i}@stress5k.test`,
    }, t), t, i),
    () => step("tickets.list",              "tickets",          "read",  t => get("tickets.list", {limit:20}, t), t, i),
    () => step("tickets.statusCounts",      "tickets",          "read",  t => get("tickets.statusCounts", {}, t), t, i),
    () => step("tickets.list.filtered",     "tickets",          "read",  t => get("tickets.list", {limit:10,type:"incident"}, t), t, i),
    () => step("knowledge.list",            "knowledge",        "read",  t => get("knowledge.list", {limit:20}, t), t, i),
    () => step("catalog.listItems",         "catalog",          "read",  t => get("catalog.listItems", {limit:20}, t), t, i),
    () => step("search.global",             "search",           "read",  t => get("search.global", {query:rword(),limit:10}, t), t, i),
    () => step("approvals.myPending",       "approvals",        "read",  t => get("approvals.myPending", {}, t), t, i),
    () => step("notifications.markAllRead", "notifications",    "read",  t => post("notifications.markAllRead", {}, t), t, i),
  ];
}

function planHrManager(t, i) {
  return [
    () => step("auth.me",                  "auth",             "read",  t => get("auth.me", {}, t), t, i),
    () => step("notifications.list",        "notifications",    "read",  t => get("notifications.list", {limit:10}, t), t, i),
    () => step("vendors.create",            "vendors",          "write", t => post("vendors.create", {
      name:`[5K]Vendor-HR-${i}-${uid()}`, type:rfrom(["services","consulting"]),
      status:"active", contactEmail:`hr${i}@stress5k.test`,
    }, t), t, i),
    () => step("tickets.list",              "tickets",          "read",  t => get("tickets.list", {limit:20}, t), t, i),
    () => step("tickets.list.type-req",     "tickets",          "read",  t => get("tickets.list", {limit:10,type:"request"}, t), t, i),
    () => step("knowledge.list",            "knowledge",        "read",  t => get("knowledge.list", {limit:20}, t), t, i),
    () => step("catalog.listItems",         "catalog",          "read",  t => get("catalog.listItems", {limit:20}, t), t, i),
    () => step("search.global",             "search",           "read",  t => get("search.global", {query:rfrom(["onboarding","policy","leave","benefits"]),limit:10}, t), t, i),
    () => step("reports.slaDashboard",      "reports",          "read",  t => get("reports.slaDashboard", {}, t), t, i),
    () => step("reports.executiveOverview", "reports",          "read",  t => get("reports.executiveOverview", {}, t), t, i),
    () => step("dashboard.getMetrics",      "dashboard",        "read",  t => get("dashboard.getMetrics", {}, t), t, i),
    () => step("approvals.myPending",       "approvals",        "read",  t => get("approvals.myPending", {}, t), t, i),
  ];
}

function planFinanceManager(t, i) {
  return [
    () => step("auth.me",                   "auth",             "read",  t => get("auth.me", {}, t), t, i),
    () => step("notifications.list",         "notifications",    "read",  t => get("notifications.list", {limit:10}, t), t, i),
    // 4 verified writes
    () => step("surveys.create",             "surveys",          "write", t => post("surveys.create", {
      title:`[5K]SURVEY-FIN-${i}-${uid()}`, type:rfrom(["csat","vendor_review","nps"]),
      questions:[{id:`q${i}`,type:rfrom(["rating","nps","yes_no"]),question:"How would you rate this?",required:true}],
    }, t), t, i),
    () => step("contracts.create",           "contracts",        "write", t => post("contracts.create", {
      title:`[5K]CONTRACT-FIN-${i}-${uid()}`, counterparty:`FinVendor-${uid()}`,
      type:rfrom(["nda","msa","sow","vendor"]), value:String(rint(50000,4999999)),
      startDate:ts(-15), endDate:ts(rint(90,365)),
    }, t), t, i),
    () => step("vendors.create",             "vendors",          "write", t => post("vendors.create", {
      name:`[5K]Vendor-FIN-${i}-${uid()}`, type:rfrom(["software","hardware","services","cloud"]),
      status:"active", contactEmail:`fin${i}@stress5k.test`,
    }, t), t, i),
    () => step("apm.applications.create",    "apm.applications", "write", t => post("apm.applications.create", {
      name:`[5K]APP-FIN-${i}-${uid()}`, lifecycle:rfrom(["sustaining","harvesting","evaluating"]),
      cloudReadiness:"not_assessed", category:"finance",
    }, t), t, i),
    // reads
    () => step("tickets.list",               "tickets",          "read",  t => get("tickets.list", {limit:20}, t), t, i),
    () => step("knowledge.list",             "knowledge",        "read",  t => get("knowledge.list", {limit:20}, t), t, i),
    () => step("catalog.listItems",          "catalog",          "read",  t => get("catalog.listItems", {limit:20}, t), t, i),
    () => step("search.global",              "search",           "read",  t => get("search.global", {query:rfrom(["invoice","contract","budget","vendor"]),limit:10}, t), t, i),
    () => step("contracts.list",             "contracts",        "read",  t => get("contracts.list", {limit:20}, t), t, i),
    () => step("vendors.list",               "vendors",          "read",  t => get("vendors.list", {limit:20}, t), t, i),
    () => step("financial.listInvoices",     "financial",        "read",  t => get("financial.listInvoices", {limit:20}, t), t, i),
    () => step("procurement.list",           "procurement",      "read",  t => get("procurement.purchaseRequests.list", {limit:20}, t), t, i),
    () => step("approvals.myPending",        "approvals",        "read",  t => get("approvals.myPending", {}, t), t, i),
    () => step("reports.slaDashboard",       "reports",          "read",  t => get("reports.slaDashboard", {}, t), t, i),
    () => step("dashboard.getMetrics",       "dashboard",        "read",  t => get("dashboard.getMetrics", {}, t), t, i),
  ];
}

function planRequester(t, i) {
  return [
    () => step("auth.me",                  "auth",             "read",  t => get("auth.me", {}, t), t, i),
    () => step("notifications.list",        "notifications",    "read",  t => get("notifications.list", {limit:10}, t), t, i),
    () => step("vendors.create",            "vendors",          "write", t => post("vendors.create", {
      name:`[5K]Vendor-REQ-${i}-${uid()}`, type:rfrom(["services","software"]),
      status:"active", contactEmail:`req${i}@stress5k.test`,
    }, t), t, i),
    // RBAC probe — admin-only route must be blocked
    () => step("rbac.probe→admin.users.list","rbac",            "rbac",  t => get("admin.users.list", {limit:5}, t), t, i),
    () => step("tickets.list",              "tickets",          "read",  t => get("tickets.list", {limit:20}, t), t, i),
    () => step("tickets.statusCounts",      "tickets",          "read",  t => get("tickets.statusCounts", {}, t), t, i),
    () => step("catalog.listItems",         "catalog",          "read",  t => get("catalog.listItems", {limit:20}, t), t, i),
    () => step("knowledge.list",            "knowledge",        "read",  t => get("knowledge.list", {limit:20}, t), t, i),
    () => step("search.global",             "search",           "read",  t => get("search.global", {query:rword(),limit:10}, t), t, i),
    () => step("approvals.myPending",       "approvals",        "read",  t => get("approvals.myPending", {}, t), t, i),
    () => step("notifications.markAllRead", "notifications",    "read",  t => post("notifications.markAllRead", {}, t), t, i),
  ];
}

function planSecurityAnalyst(t, i) {
  // agent2 has operator_field matrixRole — read surface same as requester + vendors write
  return [
    () => step("auth.me",                  "auth",             "read",  t => get("auth.me", {}, t), t, i),
    () => step("notifications.list",        "notifications",    "read",  t => get("notifications.list", {limit:10}, t), t, i),
    () => step("vendors.create",            "vendors",          "write", t => post("vendors.create", {
      name:`[5K]Vendor-OPS-${i}-${uid()}`, type:rfrom(["hardware","services"]),
      status:"active", contactEmail:`ops${i}@stress5k.test`,
    }, t), t, i),
    () => step("tickets.list",              "tickets",          "read",  t => get("tickets.list", {limit:20}, t), t, i),
    () => step("tickets.statusCounts",      "tickets",          "read",  t => get("tickets.statusCounts", {}, t), t, i),
    () => step("tickets.list.incidents",    "tickets",          "read",  t => get("tickets.list", {limit:10,type:"incident"}, t), t, i),
    () => step("knowledge.list",            "knowledge",        "read",  t => get("knowledge.list", {limit:20}, t), t, i),
    () => step("catalog.listItems",         "catalog",          "read",  t => get("catalog.listItems", {limit:20}, t), t, i),
    () => step("search.global",             "search",           "read",  t => get("search.global", {query:rfrom(["incident","alert","security","outage"]),limit:10}, t), t, i),
    () => step("approvals.myPending",       "approvals",        "read",  t => get("approvals.myPending", {}, t), t, i),
    () => step("notifications.markAllRead", "notifications",    "read",  t => post("notifications.markAllRead", {}, t), t, i),
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

// ── Session runner ─────────────────────────────────────────────────────────────

async function runSession(idx, persona, token) {
  const results = [];
  results.push({ label:"auth.login", module:"auth", type:"read", status:200, durationMs:0, error:null });

  for (const stepFn of PLANS[persona.role](token, idx)) {
    const r = await stepFn();

    // RBAC probes: FORBIDDEN / NOT_FOUND / UNAUTHORIZED all count as correct
    if (r.label.startsWith("rbac.")) {
      const gated = r.status===403 || r.status===404 || r.status===401 ||
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
  return results;
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

async function runPool(sessions, available, tokens) {
  const allResults = [];
  let completed = 0, progressAt = PROGRESS_INTERVAL;
  const wallStart = Date.now();

  return new Promise((resolve) => {
    let nextIdx = 0, active = 0;

    function startNext() {
      if (nextIdx >= sessions) return;
      const i = nextIdx++;
      const persona = available[i % available.length];
      active++;

      runSession(i, persona, tokens[persona.role])
        .then(res => allResults.push(...res))
        .catch(err => allResults.push({label:"session.error",module:"runtime",type:"read",status:0,durationMs:0,error:err.message,role:persona.role}))
        .finally(() => {
          active--;
          completed++;
          if (completed >= progressAt) {
            process.stdout.write(`  → ${completed}/${sessions} sessions  (${((Date.now()-wallStart)/1000).toFixed(1)}s)\n`);
            progressAt += PROGRESS_INTERVAL;
          }
          if (completed === sessions) return resolve(allResults);
          startNext();
        });
    }

    for (let k = 0; k < Math.min(MAX_CONCURRENT, sessions); k++) startNext();
  });
}

// ── Reporting ─────────────────────────────────────────────────────────────────

const pct  = (n,t)  => t===0 ? "0%" : `${Math.round(n/t*100)}%`;
const pad  = (s,n)  => String(s).padEnd(n);
const rpad = (s,n)  => String(s).padStart(n);

function buildReport(allResults, wallMs) {
  const byModule = {}, byLabel = {}, byRole = {};
  const sg = {ok:0,"4xx":0,"5xx":0,network:0};
  const durs = [], errs = [];

  for (const r of allResults) {
    if (!byModule[r.module]) byModule[r.module] = {ok:0,fail:0,reads:0,writes:0,durs:[]};
    if (!byLabel[r.label])   byLabel[r.label]   = {ok:0,fail:0,total:0,durs:[],type:r.type};
    if (!byRole[r.role])     byRole[r.role]      = {sessions:0,ok:0,fail:0};

    const m = byModule[r.module], l = byLabel[r.label];
    l.total++; l.durs.push(r.durationMs); m.durs.push(r.durationMs); durs.push(r.durationMs);
    if (r.type==="write") m.writes++; else m.reads++;

    const ok = r.status>=200 && r.status<300;
    if (ok)                                  { l.ok++; m.ok++; sg.ok++; }
    else if (r.status>=400 && r.status<500)  { l.fail++; m.fail++; sg["4xx"]++; }
    else if (r.status>=500)                  { l.fail++; m.fail++; sg["5xx"]++; }
    else                                     { l.fail++; m.fail++; sg.network++; }
    if (r.error) errs.push(r);
  }

  for (const r of allResults.filter(x=>x.label==="auth.login")) {
    if (!byRole[r.role]) byRole[r.role]={sessions:0,ok:0,fail:0};
    byRole[r.role].sessions++;
  }

  const sd = [...durs].sort((a,b)=>a-b);
  const p  = (f) => sd[Math.floor(sd.length*f)]??0;
  const avg = durs.length ? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length) : 0;
  const cv  = errs.filter(r=>r.error?.includes("duplicate key"));
  const ie  = errs.filter(r=>r.status>=500 && !r.error?.includes("duplicate key"));
  const ne  = errs.filter(r=>r.status===0);

  return { byModule, byLabel, byRole, sg, durs:sd, avg, total:allResults.length, wallMs, errs,
    p50:p(.50), p75:p(.75), p90:p(.90), p95:p(.95), p99:p(.99),
    constraintViolations:cv, infraErrors:ie, networkErrors:ne };
}

function printReport(R, sessions) {
  const L = "═".repeat(78), D = "─".repeat(78);
  console.log("\n"+L);
  console.log("  NexusOps — 5000-Session Heavy-Write Stress Test Results");
  console.log(L);
  console.log(`  Sessions        : ${sessions}  (pool=${MAX_CONCURRENT})`);
  console.log(`  Total requests  : ${R.total}`);
  console.log(`  Wall time       : ${(R.wallMs/1000).toFixed(2)}s`);
  console.log(`  Throughput      : ${((R.total/R.wallMs)*1000).toFixed(1)} req/s`);
  console.log(`  Avg ops/session : ${(R.total/sessions).toFixed(1)}`);
  console.log(D);
  console.log("  Latency");
  console.log(`    avg:${rpad(R.avg,6)}ms  p50:${rpad(R.p50,6)}ms  p75:${rpad(R.p75,6)}ms`);
  console.log(`    p90:${rpad(R.p90,6)}ms  p95:${rpad(R.p95,6)}ms  p99:${rpad(R.p99,6)}ms`);
  console.log(D);
  console.log("  Status Breakdown");
  console.log(`    2xx : ${rpad(R.sg.ok,7)}  (${pct(R.sg.ok,R.total)})`);
  console.log(`    4xx : ${rpad(R.sg["4xx"],7)}  (${pct(R.sg["4xx"],R.total)})`);
  console.log(`    5xx : ${rpad(R.sg["5xx"],7)}  (${pct(R.sg["5xx"],R.total)})`);
  console.log(`    net : ${rpad(R.sg.network,7)}  (${pct(R.sg.network,R.total)})`);
  console.log(D);
  console.log("  Entries Created");
  for (const [mod, n] of Object.entries(CREATED).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]))
    console.log(`    ${pad(mod,28)} ${rpad(n,7)}`);
  console.log("  Total entries   :", Object.values(CREATED).reduce((a,b)=>a+b,0));
  console.log(D);
  console.log("  Module Summary");
  console.log(`  ${"Module".padEnd(24)} ${"Reqs".padStart(7)} ${"OK%".padStart(6)} ${"p95ms".padStart(7)} ${"Writes".padStart(7)}`);
  for (const [name,m] of Object.entries(R.byModule).sort((a,b)=>(b[1].ok+b[1].fail)-(a[1].ok+a[1].fail))) {
    const reqs = m.ok+m.fail;
    const icon = m.fail===0 ? "✓" : m.ok/reqs>0.8 ? "△" : "✗";
    const ms   = [...m.durs].sort((a,b)=>a-b);
    const mp95 = ms[Math.floor(ms.length*.95)]??0;
    console.log(`  ${icon} ${pad(name,22)} ${rpad(reqs,7)} ${rpad(pct(m.ok,reqs),6)} ${rpad(mp95,7)}ms ${rpad(m.writes,7)}`);
  }
  console.log(D);
  console.log("  Role Breakdown");
  for (const [role,r] of Object.entries(R.byRole))
    console.log(`    ${pad(role,18)} ${rpad(r.sessions,5)} sessions`);
  console.log(D);
  if (R.constraintViolations.length>0) {
    console.log("  ⚡ CONCURRENCY BUGS FOUND:");
    for (const [label,r] of new Map(R.constraintViolations.map(r=>[r.label,r]))) {
      const cnt = R.constraintViolations.filter(x=>x.label===label).length;
      console.log(`     [${r.role}] ${label} — ${cnt} failures`);
      console.log(`       Constraint: ${r.error}`);
    }
  }
  if (R.infraErrors.length>0) {
    console.log(`  ⚠  ${R.infraErrors.length} infra errors (non-constraint 5xx)`);
    const seen = new Set();
    for (const f of R.infraErrors.slice(0,5)) {
      const k=f.label+f.error?.slice(0,40);
      if (!seen.has(k)) { seen.add(k); console.log(`     [${f.role}] ${f.label}: ${f.error?.slice(0,80)}`); }
    }
  }
  console.log(L);
  const sr   = (R.sg.ok/R.total*100).toFixed(1);
  const bugs = new Set(R.constraintViolations.map(r=>r.label)).size;
  const pass = R.networkErrors.length===0 && R.infraErrors.length===0;
  const v    = !pass ? "✗  FAILED" : bugs>0 ? `⚡ PASSED — ${bugs} concurrency bug(s)` : "✓  PASSED";
  console.log(`\n  ${v}  |  ${sr}% success  |  ${R.total} reqs  |  ${sessions} sessions\n`);
  return { pass, R, bugs };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n"+"═".repeat(78));
  console.log("  NexusOps 5000-Session Heavy-Write Stress Test v2");
  console.log("═".repeat(78));
  console.log(`  Target : ${BASE}  |  sessions=${SESSIONS}  pool=${MAX_CONCURRENT}  timeout=${TIMEOUT_MS}ms`);

  try {
    const p = await withTimeout(get("auth.me",{},null),5000);
    if (p.status>=500) throw new Error(`HTTP ${p.status}`);
    console.log("  API ✓");
  } catch(e) { console.error(`\n  ✗ API unreachable: ${e.message}\n`); process.exit(1); }

  console.log(`\n  Authenticating ${PERSONAS.length} personas...`);
  const tokens = {};
  for (const p of PERSONAS) {
    try {
      const tok = await withTimeout(loginPersona(p), 10000);
      if (tok) { tokens[p.role]=tok; console.log(`    ✓  ${pad(p.role,18)} ${p.email}`); }
      else       console.warn(`    ✗  ${p.role} — no token`);
    } catch(e) { console.warn(`    ✗  ${p.role} — ${e.message}`); }
  }
  const available = PERSONAS.filter(p=>tokens[p.role]);
  if (!available.length) { console.error("\n  All logins failed\n"); process.exit(1); }
  console.log(`  ${available.length}/${PERSONAS.length} ready\n`);
  console.log(`  Launching ${SESSIONS} sessions (pool=${MAX_CONCURRENT})...\n`);

  const wallStart = Date.now();
  const allResults = await runPool(SESSIONS, available, tokens);
  const wallMs = Date.now() - wallStart;
  console.log(`\n  Complete in ${(wallMs/1000).toFixed(2)}s`);

  const R = buildReport(allResults, wallMs);
  const { pass, bugs } = printReport(R, SESSIONS);
  process.exitCode = pass ? 0 : 1;
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
