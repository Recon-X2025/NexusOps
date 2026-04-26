/**
 * SMB-scale analytics demo seed (~400 headcount) for coheron-demo.
 * Run after `pnpm --filter @nexusops/db db:seed` (and optionally `db:seed:modules`).
 *
 * Idempotent: safe to re-run; fills headcount gaps and skips blocks that already
 * have marker rows unless SMB_SEED_FORCE=1.
 *
 * Env:
 *   SMB_HEADCOUNT        — target employees (default 400)
 *   SMB_SEED_FORCE       — if "1", re-insert module blocks even when markers exist (headcount still capped)
 *   SMB_HISTORY_YEARS    — backfill depth for dated records (default 3 calendar years of span)
 */
import bcrypt from "bcryptjs";
import { getDb } from "./client";
import {
  organizations,
  users,
  employees,
  leaveRequests,
  attendanceRecords,
  expenseClaims,
  payrollRuns,
  payslips,
  ticketCategories,
  ticketPriorities,
  ticketStatuses,
  tickets,
  assets,
  assetTypes,
  ciItems,
  workOrders,
  changeRequests,
  problems,
  securityIncidents,
  vulnerabilities,
  risks,
  pipelineRuns,
  deployments,
  crmAccounts,
  crmContacts,
  crmDeals,
  crmLeads,
  crmActivities,
  projects,
  projectTasks,
  budgetLines,
  contracts,
  legalMatters,
  kbArticles,
  purchaseRequests,
  surveys,
  surveyResponses,
  applications,
  reviewCycles,
  performanceReviews,
  okrObjectives,
  okrKeyResults,
  hrCases,
  eq,
  and,
  count,
  inArray,
  like,
  isNotNull,
} from "./schema";

const DEMO_ORG_SLUG = "coheron-demo";
const MARKER = "smb-analytics-v1";
const NOW = new Date();

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

const SMB_HISTORY_YEARS = envInt("SMB_HISTORY_YEARS", 3);

function cnt(rows: { c: unknown }[]): number {
  return Number(rows[0]?.c ?? 0);
}

/** Deterministic PRNG for reproducible “realistic” jitter. */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dDays = (days: number) => new Date(NOW.getTime() + days * 86400000);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86400000);
const minutesAgo = (mins: number) => new Date(NOW.getTime() - mins * 60_000);

function historyStartDate(): Date {
  return daysAgo(Math.ceil(SMB_HISTORY_YEARS * 365.25));
}

/** Uniform random instant in [start, end]. */
function dateUniform(rng: () => number, start: Date, end: Date): Date {
  const a = start.getTime();
  const b = end.getTime();
  return new Date(a + rng() * (b - a));
}

/** Bias toward recent times (for ticket-like volumes). */
function dateRecentBiased(rng: () => number, start: Date, end: Date, bias = 0.82): Date {
  const u = Math.pow(rng(), bias);
  return new Date(start.getTime() + u * (end.getTime() - start.getTime()));
}

function dueFromCreated(created: Date, mins: number | null | undefined) {
  return mins != null && mins > 0 ? new Date(created.getTime() + mins * 60_000) : null;
}

const FIRST_NAMES = [
  "Aisha", "Ben", "Carla", "Diego", "Elena", "Felix", "Grace", "Hassan", "Ivy", "Jon",
  "Kim", "Leo", "Maya", "Noah", "Olga", "Priya", "Quinn", "Ravi", "Sara", "Tom",
  "Uma", "Vik", "Wendy", "Xavier", "Yuki", "Zara", "Amir", "Beth", "Chen", "Dana",
];
const LAST_NAMES = [
  "Abbott", "Bakshi", "Cho", "Diaz", "Ellis", "Frost", "Garcia", "Hughes", "Iyer", "Jensen",
  "Khan", "Lopez", "Martin", "Nguyen", "Okafor", "Patel", "Quinn", "Reid", "Singh", "Taylor",
  "Uzun", "Verma", "Walker", "Xu", "Young", "Zhou", "Adams", "Brooks", "Clark", "Davis",
];

const DEPT_WEIGHTS: { dept: string; n: number; titles: string[] }[] = [
  { dept: "Engineering", n: 118, titles: ["Software Engineer", "Senior Engineer", "Staff Engineer", "Engineering Manager", "QA Engineer", "DevOps Engineer"] },
  { dept: "Product", n: 34, titles: ["Product Manager", "Senior PM", "Product Designer", "UX Researcher"] },
  { dept: "Sales", n: 48, titles: ["Account Executive", "SDR", "Sales Manager", "Solutions Engineer"] },
  { dept: "Customer Success", n: 42, titles: ["CSM", "Senior CSM", "Onboarding Specialist", "Support Lead"] },
  { dept: "Marketing", n: 28, titles: ["Demand Gen Manager", "Content Marketer", "Marketing Ops", "Brand Manager"] },
  { dept: "Operations", n: 32, titles: ["BizOps Analyst", "Revenue Ops", "Program Manager", "Chief of Staff"] },
  { dept: "Finance", n: 24, titles: ["Financial Analyst", "Accountant", "FP&A Manager", "Controller"] },
  { dept: "Human Resources", n: 10, titles: ["HRBP", "Recruiter", "People Ops", "HR Generalist"] },
  { dept: "IT", n: 20, titles: ["IT Support Specialist", "Systems Admin", "IT Manager", "M365 Admin"] },
  { dept: "Legal", n: 6, titles: ["Corporate Counsel", "Paralegal", "Legal Ops"] },
  { dept: "Executive", n: 6, titles: ["Chief of Staff", "CEO Chief of Staff", "Strategy Lead"] },
  { dept: "Facilities", n: 8, titles: ["Workplace Coordinator", "Facilities Manager"] },
  { dept: "Data", n: 24, titles: ["Data Analyst", "Analytics Engineer", "BI Developer"] },
];

function flattenDepartments(): { dept: string; title: string }[] {
  const out: { dept: string; title: string }[] = [];
  const rng = mulberry32(424242);
  for (const row of DEPT_WEIGHTS) {
    for (let i = 0; i < row.n; i++) {
      const title = row.titles[Math.floor(rng() * row.titles.length)]!;
      out.push({ dept: row.dept, title });
    }
  }
  // Fisher–Yates shuffle for realistic dept interleaving
  const rngShuffle = mulberry32(777);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rngShuffle() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const LOCATIONS: { city: string; state: string; metro: boolean; loc: string }[] = [
  { city: "Austin", state: "TX", metro: true, loc: "US — Austin" },
  { city: "Chicago", state: "IL", metro: true, loc: "US — Chicago" },
  { city: "Remote", state: "", metro: false, loc: "Remote — US" },
  { city: "Bengaluru", state: "KA", metro: true, loc: "India — Bengaluru" },
  { city: "Mumbai", state: "MH", metro: true, loc: "India — Mumbai" },
];

type EmpStatus = "active" | "probation" | "on_leave" | "resigned" | "terminated";
type EmpType = "full_time" | "part_time" | "contractor" | "intern";

function pickEmploymentMix(rng: () => number): { status: EmpStatus; type: EmpType; endDate?: Date } {
  const r = rng();
  if (r < 0.88) {
    const t = rng();
    const type: EmpType =
      t < 0.9 ? "full_time" : t < 0.95 ? "contractor" : t < 0.98 ? "part_time" : "intern";
    const s = rng();
    const status: EmpStatus = s < 0.93 ? "active" : s < 0.97 ? "probation" : "on_leave";
    return { status, type };
  }
  if (r < 0.96) {
    const span = Math.min(720, Math.floor(SMB_HISTORY_YEARS * 240));
    return { status: "resigned", type: "full_time", endDate: dDays(-Math.floor(rng() * span) - 14) };
  }
  const spanT = Math.min(1400, Math.floor(SMB_HISTORY_YEARS * 420));
  return { status: "terminated", type: "full_time", endDate: dDays(-Math.floor(rng() * spanT) - 30) };
}

async function seedSmbAnalytics() {
  const db = getDb();
  const headcount = envInt("SMB_HEADCOUNT", 400);
  const force = process.env.SMB_SEED_FORCE === "1";
  const rng = mulberry32(20260425);
  const histStart = historyStartDate();

  console.log(
    `🌱 SMB analytics seed (${MARKER}) — target headcount ${String(headcount)}, ~${String(SMB_HISTORY_YEARS)}y history depth\n`,
  );

  const [org] = await db.select().from(organizations).where(eq(organizations.slug, DEMO_ORG_SLUG));
  if (!org) {
    console.error("❌ Org coheron-demo not found. Run db:seed first.");
    process.exit(1);
  }

  const allUsers = await db.select().from(users).where(eq(users.orgId, org.id));
  const admin = allUsers.find((u) => u.role === "owner") ?? allUsers[0]!;
  const agentPool = allUsers.filter((u) => u.role === "member").slice(0, 8);
  const assignee = (i: number) => agentPool[i % Math.max(1, agentPool.length)] ?? admin;

  const ticketSt = await db.select().from(ticketStatuses).where(eq(ticketStatuses.orgId, org.id));
  const ticketCat = await db.select().from(ticketCategories).where(eq(ticketCategories.orgId, org.id));
  const ticketPrio = await db.select().from(ticketPriorities).where(eq(ticketPriorities.orgId, org.id));
  if (ticketSt.length === 0 || ticketCat.length === 0 || ticketPrio.length === 0) {
    console.error("❌ Ticket config missing. Run full db:seed on a DB with ticket categories/statuses/priorities.");
    process.exit(1);
  }
  const st = Object.fromEntries(ticketSt.map((s) => [s.name, s]));
  const openS = st["Open"]!;
  const progS = st["In Progress"]!;
  const pendS = st["Pending"]!;
  const resS = st["Resolved"]!;
  const cloS = st["Closed"]!;
  const catByName = Object.fromEntries(ticketCat.map((c) => [c.name, c]));
  const prioByName = Object.fromEntries(ticketPrio.map((p) => [p.name, p]));
  const critP = prioByName["Critical"]!;
  const highP = prioByName["High"]!;
  const medP = prioByName["Medium"]!;
  const lowP = prioByName["Low"]!;

  const passwordHash = await bcrypt.hash("demo1234!", 12);

  // ── Headcount: users + employees ───────────────────────────────────────────
  const empCountRows = await db.select({ c: count() }).from(employees).where(eq(employees.orgId, org.id));
  let employeeTotal = cnt(empCountRows);
  console.log(`   Current employees: ${String(employeeTotal)}`);

  if (employeeTotal < headcount || force) {
    const deptPlan = flattenDepartments().slice(0, headcount);
    const existingWithEmp = new Set(
      (await db.select({ userId: employees.userId }).from(employees).where(eq(employees.orgId, org.id))).map(
        (r) => r.userId,
      ),
    );

    const sortedUsers = [...allUsers].sort((a, b) => {
      const rank = (r: string) => (r === "owner" ? 0 : r === "admin" ? 1 : r === "member" ? 2 : 3);
      const d = rank(a.role) - rank(b.role);
      if (d !== 0) return d;
      return a.email.localeCompare(b.email);
    });

    let seqEmployee = employeeTotal;
    const synthRows = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.orgId, org.id), like(users.email, "smb.worker.%@coheron-demo.local")));
    let nextSynth = 1;
    for (const row of synthRows) {
      const m = /^smb\.worker\.(\d+)@/.exec(row.email);
      if (m) nextSynth = Math.max(nextSynth, parseInt(m[1]!, 10) + 1);
    }

    const newEmployees: (typeof employees.$inferInsert)[] = [];

    for (const u of sortedUsers) {
      if (employeeTotal >= headcount) break;
      if (existingWithEmp.has(u.id)) continue;
      const plan = deptPlan[seqEmployee] ?? { dept: "Operations", title: "Team Member" };
      const loc = LOCATIONS[seqEmployee % LOCATIONS.length]!;
      const mix = pickEmploymentMix(rng);
      seqEmployee += 1;
      employeeTotal += 1;
      existingWithEmp.add(u.id);
      newEmployees.push({
        orgId: org.id,
        userId: u.id,
        employeeId: `EMP-SMB-${String(seqEmployee).padStart(5, "0")}`,
        department: plan.dept,
        title: plan.title,
        jobGrade: mix.type === "intern" ? "L1" : mix.type === "contractor" ? "C1" : ["L2", "L3", "L4"][seqEmployee % 3],
        employmentType: mix.type,
        location: loc.loc,
        city: loc.city,
        state: loc.state || null,
        isMetroCity: loc.metro,
        startDate: (() => {
          const hireT = seqEmployee / Math.max(1, headcount - 1);
          const endH = NOW.getTime() - 45 * 86400000;
          return new Date(histStart.getTime() + hireT * (endH - histStart.getTime()) + (rng() - 0.5) * 34 * 86400000);
        })(),
        status: mix.status,
        endDate: mix.endDate,
      });
    }

    while (employeeTotal < headcount) {
      const plan = deptPlan[seqEmployee] ?? { dept: "Operations", title: "Team Member" };
      const loc = LOCATIONS[seqEmployee % LOCATIONS.length]!;
      const mix = pickEmploymentMix(rng);
      const email = `smb.worker.${String(nextSynth).padStart(6, "0")}@coheron-demo.local`;
      const fn = FIRST_NAMES[nextSynth % FIRST_NAMES.length]!;
      const ln = LAST_NAMES[Math.floor(nextSynth / FIRST_NAMES.length) % LAST_NAMES.length]!;
      nextSynth += 1;
      const [u] = await db
        .insert(users)
        .values({
          orgId: org.id,
          email,
          name: `${fn} ${ln}`,
          passwordHash,
          role: "member",
          matrixRole: null,
          status: "active",
        })
        .returning();
      if (!u) continue;
      seqEmployee += 1;
      employeeTotal += 1;
      newEmployees.push({
        orgId: org.id,
        userId: u.id,
        employeeId: `EMP-SMB-${String(seqEmployee).padStart(5, "0")}`,
        department: plan.dept,
        title: plan.title,
        jobGrade: mix.type === "intern" ? "L1" : mix.type === "contractor" ? "C1" : ["L2", "L3", "L4"][seqEmployee % 3],
        employmentType: mix.type,
        location: loc.loc,
        city: loc.city,
        state: loc.state || null,
        isMetroCity: loc.metro,
        startDate: (() => {
          const hireT = seqEmployee / Math.max(1, headcount - 1);
          const endH = NOW.getTime() - 45 * 86400000;
          return new Date(histStart.getTime() + hireT * (endH - histStart.getTime()) + (rng() - 0.5) * 34 * 86400000);
        })(),
        status: mix.status,
        endDate: mix.endDate,
      });
    }

    for (let i = 0; i < newEmployees.length; i += 80) {
      await db.insert(employees).values(newEmployees.slice(i, i + 80)!);
    }
    console.log(`✅ Employees upserted to ~${String(employeeTotal)} (synthetic users as needed)`);
  } else {
    console.log("ℹ️  Headcount already at target; skipping user/employee creation.");
  }

  const allEmps = await db.select().from(employees).where(eq(employees.orgId, org.id));
  const empByUser = new Map(allEmps.map((e) => [e.userId, e]));
  const activeEmps = allEmps.filter((e) => e.status === "active" || e.status === "probation");

  // ── Manager spine (analytics: span of control) ─────────────────────────────
  const byDept = new Map<string, typeof allEmps>();
  for (const e of allEmps) {
    const d = e.department ?? "General";
    if (!byDept.has(d)) byDept.set(d, []);
    byDept.get(d)!.push(e);
  }
  const managerUpdates: { id: string; managerId: string | null }[] = [];
  for (const [, list] of byDept) {
    const head = list[0];
    if (!head) continue;
    for (let i = 1; i < list.length; i++) {
      const e = list[i]!;
      if (e.id === head.id) continue;
      managerUpdates.push({ id: e.id, managerId: head.id });
    }
  }
  for (const u of managerUpdates.slice(0, 350)) {
    await db.update(employees).set({ managerId: u.managerId }).where(eq(employees.id, u.id));
  }
  console.log("✅ Manager hierarchy linked (dept heads)");

  const markerTickets = cnt(
    await db
      .select({ c: count() })
      .from(tickets)
      .where(and(eq(tickets.orgId, org.id), isNotNull(tickets.idempotencyKey), like(tickets.idempotencyKey, `${MARKER}-tkt-%`))),
  );

  if (markerTickets === 0 || force) {
    if (markerTickets > 0 && force) {
      await db.delete(tickets).where(and(eq(tickets.orgId, org.id), like(tickets.idempotencyKey, `${MARKER}-tkt-%`)));
    }
    const ticketRows: (typeof tickets.$inferInsert)[] = [];
    const ticketTemplates: { title: string; cat: string; type: "incident" | "request" | "problem" }[] = [
      { title: "Laptop fan noise and thermal throttling during video calls", cat: "IT Support", type: "incident" },
      { title: "Request: Adobe Creative Cloud license for marketing campaign", cat: "IT Support", type: "request" },
      { title: "Payroll correction — missed overtime on last cycle", cat: "HR", type: "incident" },
      { title: "Badge access not working for west wing after 6pm", cat: "Facilities", type: "incident" },
      { title: "Corporate card statement reconciliation — missing receipts", cat: "Finance", type: "request" },
      { title: "Suspicious login alert from new geography for finance shared mailbox", cat: "Security", type: "incident" },
      { title: "VPN split tunnel breaking internal CRM latency", cat: "IT Support", type: "problem" },
      { title: "New hire equipment bundle — dock + monitor", cat: "IT Support", type: "request" },
      { title: "Customer portal 502 errors during peak — needs RCA", cat: "IT Support", type: "incident" },
      { title: "Travel policy exception for customer onsite workshop", cat: "Finance", type: "request" },
    ];
    const ticketSpanDays = Math.ceil(SMB_HISTORY_YEARS * 365.25);
    for (let i = 0; i < 2800; i++) {
      const tpl = ticketTemplates[i % ticketTemplates.length]!;
      const cat = catByName[tpl.cat] ?? ticketCat[0]!;
      const prioRoll = rng();
      const prio = prioRoll < 0.07 ? critP : prioRoll < 0.28 ? highP : prioRoll < 0.72 ? medP : lowP;
      const stRoll = rng();
      const status =
        stRoll < 0.14 ? openS : stRoll < 0.38 ? progS : stRoll < 0.52 ? pendS : stRoll < 0.78 ? resS : cloS;
      const ageDays = Math.min(
        ticketSpanDays,
        Math.floor(Math.pow(rng(), 0.78) * ticketSpanDays * (1 + 0.12 * Math.sin((i % 52) / 52)),
      ));
      const createdAt = daysAgo(ageDays);
      const slaResponseDueAt = dueFromCreated(createdAt, prio.slaResponseMinutes) ?? undefined;
      const slaResolveDueAt = dueFromCreated(createdAt, prio.slaResolveMinutes) ?? undefined;
      const era = ageDays / Math.max(1, ticketSpanDays);
      let breached =
        !!slaResolveDueAt && slaResolveDueAt.getTime() < NOW.getTime() && status.id !== resS.id && status.id !== cloS.id;
      if (
        !breached &&
        status.id !== resS.id &&
        status.id !== cloS.id &&
        ageDays > 45 &&
        rng() < 0.04 + era * 0.14
      ) {
        breached = true;
      }
      const u = allUsers[i % allUsers.length]!;
      const assign = rng() < 0.72 ? assignee(i) : undefined;
      const resolveLagHrs = Math.floor(rng() * Math.min(72, ageDays * 2)) + 4;
      const resolvedAt =
        status.id === resS.id || status.id === cloS.id
          ? new Date(createdAt.getTime() + resolveLagHrs * 3600000)
          : undefined;
      const closedAt =
        status.id === cloS.id && resolvedAt
          ? new Date(resolvedAt.getTime() + Math.floor(rng() * 36) * 3600000)
          : undefined;
      ticketRows.push({
        orgId: org.id,
        number: `SMB-INC-${String(i + 1).padStart(5, "0")}`,
        title: `${tpl.title} (#${String(i + 1)})`,
        description: `Synthetic SMB workload ticket for analytics dashboards. Category trend: ${tpl.cat}.`,
        categoryId: cat.id,
        priorityId: prio.id,
        statusId: status.id,
        type: tpl.type,
        requesterId: u.id,
        assigneeId: assign?.id,
        impact: rng() < 0.12 ? "high" : rng() < 0.35 ? "medium" : "low",
        urgency: rng() < 0.15 ? "high" : "medium",
        createdAt,
        updatedAt: createdAt,
        slaResponseDueAt,
        slaResolveDueAt,
        slaBreached: breached,
        resolvedAt,
        closedAt,
        reopenCount: rng() < 0.04 ? 1 : 0,
        idempotencyKey: `${MARKER}-tkt-${String(i + 1).padStart(5, "0")}`,
      });
    }
    for (let i = 0; i < ticketRows.length; i += 100) {
      await db.insert(tickets).values(ticketRows.slice(i, i + 100)!);
    }
    console.log(`✅ Tickets: ${String(ticketRows.length)} (marker ${MARKER})`);
  } else {
    console.log(`ℹ️  SMB tickets already present (${String(markerTickets)}), skipping`);
  }

  // ── Assets ─────────────────────────────────────────────────────────────────
  const astTypes = await db.select().from(assetTypes).where(eq(assetTypes.orgId, org.id));
  const laptopType = astTypes.find((t) => t.name === "Laptop") ?? astTypes[0];
  const serverType = astTypes.find((t) => t.name === "Server") ?? astTypes[0];
  const netType = astTypes.find((t) => t.name === "Network") ?? astTypes[0];
  if (laptopType) {
    const existingAst = cnt(
      await db.select({ c: count() }).from(assets).where(and(eq(assets.orgId, org.id), like(assets.assetTag, "AST-SMB-%"))),
    );
    if (existingAst === 0 || force) {
      if (force && existingAst > 0) {
        await db.delete(assets).where(and(eq(assets.orgId, org.id), like(assets.assetTag, "AST-SMB-%")));
      }
      const rows: (typeof assets.$inferInsert)[] = [];
      for (let i = 0; i < 220; i++) {
        const owner = activeEmps[i % activeEmps.length];
        const typeId =
          i < 165 ? laptopType.id : i < 200 ? serverType?.id ?? laptopType.id : netType?.id ?? laptopType.id;
        const st = rng() < 0.82 ? "deployed" : rng() < 0.92 ? "maintenance" : "in_stock";
        rows.push({
          orgId: org.id,
          assetTag: `AST-SMB-${String(i + 1).padStart(4, "0")}`,
          name:
            i < 165
              ? `Laptop ${i % 2 === 0 ? "MacBook Pro" : "ThinkPad X1"} — ${owner?.employeeId ?? "pool"}`
              : i < 200
                ? `Server node smb-srv-${String(i)}`
                : `Network appliance smb-sw-${String(i)}`,
          typeId,
          status: st,
          ownerId: st === "deployed" && owner ? owner.userId : null,
          purchaseDate: dateUniform(rng, histStart, dDays(-14)),
          purchaseCost: i < 165 ? (rng() < 0.5 ? "1899.00" : "2199.00") : "8900.00",
          vendor: i < 165 ? (rng() < 0.5 ? "Apple" : "Lenovo") : "Dell EMC",
        });
      }
      for (let i = 0; i < rows.length; i += 50) {
        await db.insert(assets).values(rows.slice(i, i + 50)!);
      }
      console.log(`✅ Assets: ${String(rows.length)} (AST-SMB-*)`);
    }
  }

  // ── CMDB CI items ──────────────────────────────────────────────────────────
  const ciMarker = cnt(
    await db.select({ c: count() }).from(ciItems).where(and(eq(ciItems.orgId, org.id), like(ciItems.externalKey, `${MARKER}-ci-%`))),
  );
  if (ciMarker === 0 || force) {
    if (force && ciMarker > 0) {
      await db.delete(ciItems).where(and(eq(ciItems.orgId, org.id), like(ciItems.externalKey, `${MARKER}-ci-%`)));
    }
    const ciRows: (typeof ciItems.$inferInsert)[] = [];
    for (let i = 0; i < 48; i++) {
      const isApp = i % 3 === 0;
      ciRows.push({
        orgId: org.id,
        name: isApp ? `svc-smb-${String(i)}` : `vm-smb-${String(i)}`,
        externalKey: `${MARKER}-ci-${String(i + 1).padStart(3, "0")}`,
        ciType: isApp ? "application" : i % 3 === 1 ? "database" : "server",
        status: rng() < 0.88 ? "operational" : rng() < 0.96 ? "degraded" : "down",
        environment: ["production", "staging", "dev"][i % 3],
        attributes: { region: i % 2 === 0 ? "us-central" : "in-west", tier: "business_critical" },
      });
    }
    await db.insert(ciItems).values(ciRows);
    console.log(`✅ CMDB CI items: ${String(ciRows.length)}`);
  }

  // ── Work orders ────────────────────────────────────────────────────────────
  const woMarker = cnt(
    await db.select({ c: count() }).from(workOrders).where(and(eq(workOrders.orgId, org.id), like(workOrders.number, "WO-SMB-%"))),
  );
  if (woMarker === 0 || force) {
    if (force && woMarker > 0) {
      await db.delete(workOrders).where(and(eq(workOrders.orgId, org.id), like(workOrders.number, "WO-SMB-%")));
    }
    const woRows: (typeof workOrders.$inferInsert)[] = [];
    const woTitles = [
      "Replace failed UPS battery string — IDF-3",
      "Quarterly HVAC inspection — floor 4",
      "Install access reader at loading dock",
      "Network rack cable management remediation",
      "Generator load test and telemetry calibration",
    ];
    for (let i = 0; i < 95; i++) {
      const st = rng();
      const state =
        st < 0.18
          ? "open"
          : st < 0.35
            ? "work_in_progress"
            : st < 0.55
              ? "complete"
              : st < 0.78
                ? "closed"
                : "on_hold";
      woRows.push({
        orgId: org.id,
        number: `WO-SMB-${String(i + 1).padStart(4, "0")}`,
        shortDescription: woTitles[i % woTitles.length]!,
        description: "Synthetic SMB facilities / IT field workload for SLA and backlog analytics.",
        state: state as "open" | "work_in_progress" | "complete" | "closed" | "on_hold",
        type: (["corrective", "preventive", "inspection"] as const)[i % 3],
        priority: (["2_high", "3_moderate", "4_low"] as const)[i % 3],
        assignedToId: assignee(i).id,
        requestedById: admin.id,
        location: ["HQ Austin", "Chicago DC", "Remote edge site"][i % 3],
        scheduledStartDate: dDays(-i % 40),
        actualStartDate: state !== "open" ? dDays(-(i % 30)) : undefined,
        actualEndDate: state === "closed" || state === "complete" ? dDays(-(i % 12)) : undefined,
        estimatedHours: 2 + (i % 6),
        actualHours: state === "closed" || state === "complete" ? 2 + (i % 5) : undefined,
        slaBreached: rng() < 0.07,
      });
    }
    await db.insert(workOrders).values(woRows);
    console.log(`✅ Work orders: ${String(woRows.length)}`);
  }

  // ── Leave + attendance + expenses ─────────────────────────────────────────
  const leaveMarker = cnt(
    await db.select({ c: count() }).from(leaveRequests).where(and(eq(leaveRequests.orgId, org.id), like(leaveRequests.reason, `${MARKER}%`))),
  );
  if (leaveMarker === 0 || force) {
    if (force && leaveMarker > 0) {
      await db.delete(leaveRequests).where(and(eq(leaveRequests.orgId, org.id), like(leaveRequests.reason, `${MARKER}%`)));
    }
    const lr: (typeof leaveRequests.$inferInsert)[] = [];
    const leaveTypes = ["vacation", "sick", "parental", "other"] as const;
    const leaveStat = ["approved", "pending", "rejected"] as const;
    for (let i = 0; i < 920; i++) {
      const e = activeEmps[i % activeEmps.length];
      if (!e) break;
      const days = 1 + (i % 5);
      const start = dateUniform(rng, histStart, dDays(-3));
      const end = new Date(start.getTime() + (days - 1) * 86400000);
      lr.push({
        orgId: org.id,
        employeeId: e.id,
        type: leaveTypes[i % leaveTypes.length]!,
        startDate: start,
        endDate: end,
        days: String(days),
        status: leaveStat[i % leaveStat.length]!,
        reason: `${MARKER} synthetic leave sample ${String(i)}`,
        approvedById: leaveStat[i % leaveStat.length] === "approved" ? admin.id : undefined,
        approvedAt:
          leaveStat[i % leaveStat.length] === "approved"
            ? new Date(start.getTime() - Math.floor(rng() * 8) * 86400000)
            : undefined,
      });
    }
    for (let i = 0; i < lr.length; i += 80) {
      await db.insert(leaveRequests).values(lr.slice(i, i + 80)!);
    }
    console.log(`✅ Leave requests: ${String(lr.length)}`);
  }

  const attMarker = cnt(
    await db
      .select({ c: count() })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.orgId, org.id), like(attendanceRecords.notes, `${MARKER}%`))),
  );
  if (attMarker === 0 || force) {
    if (force && attMarker > 0) {
      await db.delete(attendanceRecords).where(and(eq(attendanceRecords.orgId, org.id), like(attendanceRecords.notes, `${MARKER}%`)));
    }
    const ar: (typeof attendanceRecords.$inferInsert)[] = [];
    const attSamples = 110;
    const empStride = Math.max(1, Math.floor(activeEmps.length / 165));
    for (let s = 0; s < attSamples; s++) {
      let date = dateUniform(rng, histStart, dDays(-2));
      if (date.getDay() === 0 || date.getDay() === 6) {
        date = new Date(date.getTime() + 2 * 86400000);
      }
      for (let ei = 0; ei < activeEmps.length; ei += empStride) {
        const e = activeEmps[ei]!;
        const roll = rng();
        const status =
          roll < 0.9 ? "present" : roll < 0.94 ? "late" : roll < 0.97 ? "half_day" : "on_leave";
        const shiftType = (["flexible", "remote", "morning"] as const)[ei % 3];
        const checkIn = new Date(date);
        checkIn.setHours(8 + (status === "late" ? 1 : 0), status === "late" ? 22 : 5, 0, 0);
        const checkOut = new Date(date);
        checkOut.setHours(17, 12, 0, 0);
        ar.push({
          orgId: org.id,
          employeeId: e.id,
          date,
          status,
          shiftType,
          checkIn: status === "on_leave" ? undefined : checkIn,
          checkOut: status === "on_leave" ? undefined : checkOut,
          hoursWorked: status === "on_leave" ? "0" : status === "half_day" ? "4.25" : "8.25",
          lateMinutes: status === "late" ? 18 + (ei % 20) : 0,
          overtimeMinutes: rng() < 0.08 ? 30 + (ei % 40) : 0,
          notes: `${MARKER} attendance`,
        });
      }
    }
    for (let i = 0; i < ar.length; i += 200) {
      await db.insert(attendanceRecords).values(ar.slice(i, i + 200)!);
    }
    console.log(`✅ Attendance records: ${String(ar.length)}`);
  }

  const expMarker = cnt(
    await db.select({ c: count() }).from(expenseClaims).where(and(eq(expenseClaims.orgId, org.id), like(expenseClaims.number, "EXP-SMB-%"))),
  );
  if (expMarker === 0 || force) {
    if (force && expMarker > 0) {
      await db.delete(expenseClaims).where(and(eq(expenseClaims.orgId, org.id), like(expenseClaims.number, "EXP-SMB-%")));
    }
    const ex: (typeof expenseClaims.$inferInsert)[] = [];
    const cats = ["travel", "meals", "transport", "software", "office_supplies", "client_entertainment"] as const;
    const stats = ["approved", "submitted", "reimbursed", "under_review", "rejected"] as const;
    for (let i = 0; i < 780; i++) {
      const e = activeEmps[i % activeEmps.length];
      if (!e) break;
      const amount = (1200 + (i * 37) % 18000).toFixed(2);
      const expDt = dateUniform(rng, histStart, dDays(-1));
      const st = stats[i % stats.length]!;
      ex.push({
        orgId: org.id,
        employeeId: e.id,
        number: `EXP-SMB-${String(i + 1).padStart(5, "0")}`,
        title: `T&E — ${cats[i % cats.length]!} (${String(i)})`,
        category: cats[i % cats.length]!,
        amount,
        currency: i % 5 === 0 ? "USD" : "INR",
        expenseDate: expDt,
        status: st,
        approvedById: st === "approved" || st === "reimbursed" ? admin.id : undefined,
        approvedAt:
          st === "approved" || st === "reimbursed"
            ? new Date(expDt.getTime() + Math.floor(rng() * 10 + 2) * 86400000)
            : undefined,
        reimbursedAt:
          st === "reimbursed"
            ? new Date(expDt.getTime() + Math.floor(rng() * 28 + 12) * 86400000)
            : undefined,
      });
    }
    for (let i = 0; i < ex.length; i += 50) {
      await db.insert(expenseClaims).values(ex.slice(i, i + 50)!);
    }
    console.log(`✅ Expense claims: ${String(ex.length)}`);
  }

  // ── Payroll + payslips (one paid month) ────────────────────────────────────
  let payRun = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.orgId, org.id), eq(payrollRuns.month, 3), eq(payrollRuns.year, 2026)))
    .then((r) => r[0]);
  if (!payRun) {
    const [inserted] = await db
      .insert(payrollRuns)
      .values({
        orgId: org.id,
        month: 3,
        year: 2026,
        status: "paid",
        pipelineStatus: "COMPLETED",
        totalGross: "0",
        totalDeductions: "0",
        totalNet: "0",
        paidAt: dDays(-12),
        approvedAt: dDays(-14),
        approvedByHrId: admin.id,
        approvedByFinanceId: admin.id,
        workflowMetadata: { errors: [], approvals: [] },
      })
      .onConflictDoNothing()
      .returning();
    payRun = inserted ?? payRun;
  }
  if (!payRun) {
    [payRun] = await db
      .select()
      .from(payrollRuns)
      .where(and(eq(payrollRuns.orgId, org.id), eq(payrollRuns.month, 3), eq(payrollRuns.year, 2026)));
  }
  if (payRun) {
    const slipMarker = cnt(
      await db.select({ c: count() }).from(payslips).where(and(eq(payslips.orgId, org.id), eq(payslips.payrollRunId, payRun.id))),
    );
    if (slipMarker < activeEmps.length * 0.5 || force) {
      if (force && slipMarker > 0) {
        await db.delete(payslips).where(eq(payslips.payrollRunId, payRun.id));
      }
      const slips: (typeof payslips.$inferInsert)[] = [];
      for (let i = 0; i < activeEmps.length; i++) {
        const e = activeEmps[i]!;
        const basic = 28000 + (i % 95) * 900;
        const hra = Math.round(basic * 0.45);
        const gross = basic + hra + 12000;
        const tds = Math.round(gross * 0.08);
        const net = gross - tds - 2400 - 200;
        slips.push({
          orgId: org.id,
          employeeId: e.id,
          payrollRunId: payRun.id,
          month: 3,
          year: 2026,
          basic: String(basic),
          hra: String(hra),
          specialAllowance: "8000",
          lta: "0",
          medicalAllowance: "1250",
          conveyanceAllowance: "1600",
          bonus: "0",
          grossEarnings: String(gross),
          pfEmployee: "1800",
          pfEmployer: "1800",
          professionalTax: "200",
          lwf: "20",
          tds: String(tds),
          totalDeductions: String(tds + 2400 + 200),
          netPay: String(net),
          ytdGross: String(gross * 3),
          ytdTds: String(tds * 3),
        });
      }
      for (let i = 0; i < slips.length; i += 100) {
        await db.insert(payslips).values(slips.slice(i, i + 100)!).onConflictDoNothing();
      }
      console.log(`✅ Payslips: ${String(slips.length)} (Mar 2026 run)`);
    }
  }

  // ── DevOps time series ─────────────────────────────────────────────────────
  const pipeMarker = cnt(
    await db
      .select({ c: count() })
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.orgId, org.id), like(pipelineRuns.commitSha, `${MARKER}-%`))),
  );
  if (pipeMarker === 0 || force) {
    if (force && pipeMarker > 0) {
      const ids = await db
        .select({ id: pipelineRuns.id })
        .from(pipelineRuns)
        .where(and(eq(pipelineRuns.orgId, org.id), like(pipelineRuns.commitSha, `${MARKER}-%`)));
      const idList = ids.map((x) => x.id);
      if (idList.length) {
        await db.delete(deployments).where(inArray(deployments.pipelineRunId, idList));
        await db.delete(pipelineRuns).where(inArray(pipelineRuns.id, idList));
      }
    }
    const pipes: (typeof pipelineRuns.$inferInsert)[] = [];
    const names = ["monolith-api", "web-spa", "billing-worker", "data-pipeline"];
    for (let i = 0; i < 720; i++) {
      const started = dateRecentBiased(rng, histStart, dDays(-1), 0.75);
      const progress = (started.getTime() - histStart.getTime()) / Math.max(1, NOW.getTime() - histStart.getTime());
      const ok = rng() < 0.58 + progress * 0.34;
      const dur = 120 + (i % 400);
      pipes.push({
        orgId: org.id,
        pipelineName: names[i % names.length]!,
        trigger: i % 4 === 0 ? "schedule" : "push",
        branch: i % 5 === 0 ? "main" : `feature/smb-${String(i % 20)}`,
        commitSha: `${MARKER}-${(100000 + i).toString(16)}`,
        status: ok ? "success" : rng() < 0.5 ? "failed" : "cancelled",
        durationSeconds: dur,
        startedAt: started,
        completedAt: new Date(started.getTime() + dur * 1000),
        stages: [
          { name: "build", status: ok ? "passed" : "failed", durationSeconds: Math.floor(dur * 0.35), steps: [] },
          { name: "test", status: ok ? "passed" : "failed", durationSeconds: Math.floor(dur * 0.4), steps: [] },
          { name: "deploy", status: ok ? "passed" : "skipped", durationSeconds: Math.floor(dur * 0.25), steps: [] },
        ],
      });
    }
    const inserted = await db.insert(pipelineRuns).values(pipes).returning();
    const deps: (typeof deployments.$inferInsert)[] = [];
    for (let i = 0; i < inserted.length; i++) {
      const p = inserted[i]!;
      if (p.status !== "success") continue;
      if (i % 3 !== 0) continue;
      deps.push({
        orgId: org.id,
        pipelineRunId: p.id,
        appName: p.pipelineName ?? "app",
        environment: (["staging", "production"] as const)[i % 2],
        version: `2026.4.${String(i % 30)}`,
        status: "success",
        deployedById: admin.id,
        durationSeconds: 90 + (i % 120),
        startedAt: p.completedAt ?? NOW,
        completedAt: p.completedAt ?? NOW,
      });
    }
    if (deps.length) await db.insert(deployments).values(deps);
    console.log(`✅ Pipeline runs: ${String(pipes.length)}, deployments: ${String(deps.length)}`);
  }

  // ── CRM depth ──────────────────────────────────────────────────────────────
  const crmMarker = cnt(
    await db.select({ c: count() }).from(crmAccounts).where(and(eq(crmAccounts.orgId, org.id), like(crmAccounts.name, `${MARKER} %`))),
  );
  if (crmMarker === 0 || force) {
    if (force && crmMarker > 0) {
      const accIds = (
        await db.select({ id: crmAccounts.id }).from(crmAccounts).where(and(eq(crmAccounts.orgId, org.id), like(crmAccounts.name, `${MARKER} %`)))
      ).map((a) => a.id);
      if (accIds.length) {
        await db.delete(crmActivities).where(and(eq(crmActivities.orgId, org.id), inArray(crmActivities.accountId, accIds)));
        await db.delete(crmDeals).where(and(eq(crmDeals.orgId, org.id), inArray(crmDeals.accountId, accIds)));
        await db.delete(crmContacts).where(and(eq(crmContacts.orgId, org.id), inArray(crmContacts.accountId, accIds)));
        await db.delete(crmAccounts).where(inArray(crmAccounts.id, accIds));
      }
    }
    const industries = ["Manufacturing", "Healthcare", "Retail", "Logistics", "SaaS", "FinTech", "Education"];
    const tiers = ["smb", "mid_market", "enterprise"] as const;
    const accounts: (typeof crmAccounts.$inferInsert)[] = [];
    for (let i = 0; i < 58; i++) {
      const accCreated = dateRecentBiased(rng, histStart, dDays(-90), 0.55);
      accounts.push({
        orgId: org.id,
        name: `${MARKER} Prospect ${String.fromCharCode(65 + (i % 26))}-${String(i + 1).padStart(3, "0")}`,
        industry: industries[i % industries.length]!,
        tier: tiers[i % tiers.length]!,
        healthScore: 40 + (i * 17) % 55,
        annualRevenue: String(800000 + (i * 333333) % 12_000_000),
        ownerId: assignee(i).id,
        createdAt: accCreated,
        updatedAt: accCreated,
      });
    }
    const accRows = await db.insert(crmAccounts).values(accounts).returning();
    const contacts: (typeof crmContacts.$inferInsert)[] = [];
    for (let i = 0; i < accRows.length * 3; i++) {
      const acc = accRows[i % accRows.length]!;
      const accT = acc.createdAt ? acc.createdAt.getTime() : histStart.getTime();
      const cAt = new Date(accT + Math.floor(rng() * 55 + 1) * 86400000);
      contacts.push({
        orgId: org.id,
        accountId: acc.id,
        firstName: FIRST_NAMES[i % FIRST_NAMES.length]!,
        lastName: LAST_NAMES[(i * 3) % LAST_NAMES.length]!,
        email: `contact.smb.${String(i)}@${acc.name!.toLowerCase().replace(/[^a-z0-9]+/g, "")}.test`,
        title: ["VP Ops", "IT Director", "CFO", "Procurement"][i % 4],
        seniority: (["director", "manager", "c_level", "vp"] as const)[i % 4],
        createdAt: cAt,
        updatedAt: cAt,
      });
    }
    await db.insert(crmContacts).values(contacts);
    const stages = ["prospect", "qualification", "proposal", "negotiation", "verbal_commit", "closed_won", "closed_lost"] as const;
    const deals: (typeof crmDeals.$inferInsert)[] = [];
    for (let i = 0; i < 300; i++) {
      const acc = accRows[i % accRows.length]!;
      const minC = acc.createdAt ? acc.createdAt.getTime() : histStart.getTime();
      const createdAt = dateUniform(rng, new Date(minC), dDays(-7));
      const cohort = (NOW.getTime() - createdAt.getTime()) / Math.max(1, NOW.getTime() - histStart.getTime());
      let stage: (typeof stages)[number];
      if (cohort > 0.55 && rng() < 0.5) {
        stage = rng() < 0.62 ? "closed_won" : "closed_lost";
      } else if (cohort > 0.25) {
        const mid = ["qualification", "proposal", "negotiation", "verbal_commit"] as const;
        stage = mid[i % mid.length]!;
      } else {
        const early = ["prospect", "qualification", "proposal", "negotiation"] as const;
        stage = early[i % early.length]!;
      }
      const val = Math.round(22_000 + cohort * 340_000 + ((i * 9131) % 220_000));
      const prob = stage === "closed_won" ? 100 : stage === "closed_lost" ? 0 : 18 + (i * 11) % 72;
      const isClosed = stage === "closed_won" || stage === "closed_lost";
      let closedAt: Date | undefined;
      if (isClosed) {
        const openFor = 21 + Math.floor(rng() * 240);
        closedAt = new Date(createdAt.getTime() + openFor * 86400000);
        if (closedAt > NOW) closedAt = daysAgo(Math.floor(rng() * 120 + 5));
      }
      deals.push({
        orgId: org.id,
        title: `Expansion — ${acc.name} (${String(i)})`,
        accountId: acc.id,
        stage,
        value: String(val),
        probability: prob,
        weightedValue: String(Math.round((val * prob) / 100)),
        expectedClose: isClosed ? undefined : new Date(NOW.getTime() + (28 + (i % 95)) * 86400000),
        ownerId: assignee(i).id,
        closedAt,
        lostReason: stage === "closed_lost" ? "Budget freeze / timing" : undefined,
        createdAt,
        updatedAt: closedAt ?? createdAt,
      });
    }
    await db.insert(crmDeals).values(deals);
    const sources = ["website", "referral", "event", "cold_outreach", "partner"] as const;
    const leadStat = ["new", "contacted", "qualified", "converted", "disqualified"] as const;
    const leads: (typeof crmLeads.$inferInsert)[] = [];
    for (let i = 0; i < 420; i++) {
      const lc = dateRecentBiased(rng, histStart, dDays(-3), 0.72);
      leads.push({
        orgId: org.id,
        firstName: FIRST_NAMES[(i + 3) % FIRST_NAMES.length]!,
        lastName: LAST_NAMES[(i + 7) % LAST_NAMES.length]!,
        email: `lead.smb.${String(i)}@inbound.test`,
        company: `Inbound Co ${String(i % 40)}`,
        source: sources[i % sources.length]!,
        score: 30 + (i * 11) % 70,
        status: leadStat[i % leadStat.length]!,
        ownerId: assignee(i).id,
        createdAt: lc,
        updatedAt: lc,
      });
    }
    await db.insert(crmLeads).values(leads);
    const acts: (typeof crmActivities.$inferInsert)[] = [];
    for (let i = 0; i < 520; i++) {
      const acc = accRows[i % accRows.length]!;
      acts.push({
        orgId: org.id,
        type: (["call", "email", "meeting", "demo"] as const)[i % 4],
        subject: `Touchpoint ${String(i)} — ${acc.name}`,
        accountId: acc.id,
        ownerId: assignee(i).id,
        completedAt: dateUniform(rng, histStart, dDays(-1)),
      });
    }
    await db.insert(crmActivities).values(acts);
    console.log(`✅ CRM bulk: ${String(accRows.length)} accounts, ${String(contacts.length)} contacts, ${String(deals.length)} deals`);
  }

  // ── ITSM / risk / security extras ──────────────────────────────────────────
  const chgExtra = cnt(
    await db.select({ c: count() }).from(changeRequests).where(and(eq(changeRequests.orgId, org.id), like(changeRequests.number, "SMB-CHG-%"))),
  );
  if (chgExtra === 0 || force) {
    if (force && chgExtra > 0) {
      await db.delete(changeRequests).where(and(eq(changeRequests.orgId, org.id), like(changeRequests.number, "SMB-CHG-%")));
    }
    const rows: (typeof changeRequests.$inferInsert)[] = [];
    for (let i = 0; i < 22; i++) {
      const st = (["draft", "submitted", "cab_review", "approved", "scheduled", "completed"] as const)[i % 6];
      rows.push({
        orgId: org.id,
        number: `SMB-CHG-${String(i + 1).padStart(4, "0")}`,
        title: `Standard change batch — platform patch wave ${String(i + 1)}`,
        type: i % 7 === 0 ? "emergency" : "normal",
        risk: (["low", "medium", "high"] as const)[i % 3],
        status: st,
        requesterId: admin.id,
        assigneeId: assignee(i).id,
        scheduledStart: dDays(i % 30),
        scheduledEnd: dDays(i % 30 + 1),
        rollbackPlan: "Redeploy last green artifact + toggle feature flag off",
      });
    }
    await db.insert(changeRequests).values(rows);
    console.log(`✅ Change requests (SMB): ${String(rows.length)}`);
  }

  const prbExtra = cnt(
    await db.select({ c: count() }).from(problems).where(and(eq(problems.orgId, org.id), like(problems.number, "SMB-PRB-%"))),
  );
  if (prbExtra === 0 || force) {
    if (force && prbExtra > 0) {
      await db.delete(problems).where(and(eq(problems.orgId, org.id), like(problems.number, "SMB-PRB-%")));
    }
    const rows: (typeof problems.$inferInsert)[] = [];
    for (let i = 0; i < 18; i++) {
      rows.push({
        orgId: org.id,
        number: `SMB-PRB-${String(i + 1).padStart(4, "0")}`,
        title: `Recurring latency in checkout API shard ${String(i % 4)}`,
        status: (["investigation", "root_cause_identified", "known_error"] as const)[i % 3],
        priority: (["medium", "high", "critical"] as const)[i % 3],
        assigneeId: assignee(i).id,
        rootCause: i % 3 === 1 ? "Connection pool mis-sized vs traffic burst" : undefined,
        workaround: i % 3 === 2 ? "Scale pool + enable backoff" : undefined,
      });
    }
    await db.insert(problems).values(rows);
    console.log(`✅ Problems (SMB): ${String(rows.length)}`);
  }

  const secExtra = cnt(
    await db.select({ c: count() }).from(securityIncidents).where(and(eq(securityIncidents.orgId, org.id), like(securityIncidents.number, "SMB-SEC-%"))),
  );
  if (secExtra === 0 || force) {
    if (force && secExtra > 0) {
      await db.delete(securityIncidents).where(and(eq(securityIncidents.orgId, org.id), like(securityIncidents.number, "SMB-SEC-%")));
    }
    const rows: (typeof securityIncidents.$inferInsert)[] = [];
    for (let i = 0; i < 26; i++) {
      rows.push({
        orgId: org.id,
        number: `SMB-SEC-${String(i + 1).padStart(4, "0")}`,
        title: `Endpoint alert cluster ${String(i)} — possible policy drift`,
        severity: (["low", "medium", "high", "critical"] as const)[i % 4],
        status: (["triage", "containment", "eradication", "recovery", "closed"] as const)[i % 5],
        assigneeId: assignee(i).id,
        reporterId: admin.id,
        attackVector: ["Email", "Web", "USB", "API"][i % 4],
      });
    }
    await db.insert(securityIncidents).values(rows);
    console.log(`✅ Security incidents (SMB): ${String(rows.length)}`);
  }

  const vulnExtra = cnt(
    await db.select({ c: count() }).from(vulnerabilities).where(and(eq(vulnerabilities.orgId, org.id), like(vulnerabilities.title, `${MARKER}%`))),
  );
  if (vulnExtra === 0 || force) {
    if (force && vulnExtra > 0) {
      await db.delete(vulnerabilities).where(and(eq(vulnerabilities.orgId, org.id), like(vulnerabilities.title, `${MARKER}%`)));
    }
    const rows: (typeof vulnerabilities.$inferInsert)[] = [];
    for (let i = 0; i < 32; i++) {
      rows.push({
        orgId: org.id,
        title: `${MARKER} Container image CVE backlog item ${String(i + 1)}`,
        severity: (["low", "medium", "high", "critical"] as const)[i % 4],
        cvssScore: String(3 + (i % 7) + (i % 2) * 0.1),
        status: (["open", "in_progress", "remediated"] as const)[i % 3],
        assigneeId: assignee(i).id,
        scannerSource: "trivy",
        discoveredAt: dDays(-(i % 90)),
      });
    }
    await db.insert(vulnerabilities).values(rows);
    console.log(`✅ Vulnerabilities (SMB): ${String(rows.length)}`);
  }

  const riskExtra = cnt(
    await db.select({ c: count() }).from(risks).where(and(eq(risks.orgId, org.id), like(risks.number, "SMB-RK-%"))),
  );
  if (riskExtra === 0 || force) {
    if (force && riskExtra > 0) {
      await db.delete(risks).where(and(eq(risks.orgId, org.id), like(risks.number, "SMB-RK-%")));
    }
    const rows: (typeof risks.$inferInsert)[] = [];
    for (let i = 0; i < 24; i++) {
      const L = 2 + (i % 3);
      const I = 3 + (i % 3);
      rows.push({
        orgId: org.id,
        number: `SMB-RK-${String(i + 1).padStart(4, "0")}`,
        title: `Operational resilience gap — scenario family ${String(i % 6)}`,
        category: (["technology", "operational", "compliance", "strategic"] as const)[i % 4],
        likelihood: L,
        impact: I,
        riskScore: L * I,
        status: (["identified", "assessed", "mitigating", "accepted"] as const)[i % 4],
        treatment: (["mitigate", "accept", "transfer"] as const)[i % 3],
        ownerId: assignee(i).id,
      });
    }
    await db.insert(risks).values(rows);
    console.log(`✅ GRC risks (SMB): ${String(rows.length)}`);
  }

  // ── Projects + HR cases + procurement + legal + budget + KB + APM ─────────
  const prjExtra = cnt(
    await db.select({ c: count() }).from(projects).where(and(eq(projects.orgId, org.id), like(projects.number, "SMB-PRJ-%"))),
  );
  if (prjExtra === 0 || force) {
    if (force && prjExtra > 0) {
      const pids = (
        await db.select({ id: projects.id }).from(projects).where(and(eq(projects.orgId, org.id), like(projects.number, "SMB-PRJ-%")))
      ).map((p) => p.id);
      if (pids.length) {
        await db.delete(projectTasks).where(inArray(projectTasks.projectId, pids));
        await db.delete(projects).where(inArray(projects.id, pids));
      }
    }
    const prows = await db
      .insert(projects)
      .values(
        Array.from({ length: 14 }, (_, i) => ({
          orgId: org.id,
          number: `SMB-PRJ-${String(i + 1).padStart(4, "0")}`,
          name: `Initiative — customer reliability program wave ${String(i + 1)}`,
          status: (["planning", "active", "on_hold"] as const)[i % 3],
          health: (["green", "amber", "red"] as const)[i % 3],
          budgetTotal: String(120000 + i * 45000),
          budgetSpent: String(20000 + i * 12000),
          startDate: dDays(-(i % 60)),
          endDate: dDays(120 + i * 10),
          ownerId: assignee(i).id,
          department: ["IT", "Product", "Operations"][i % 3]!,
        })),
      )
      .returning();
    const tasks: (typeof projectTasks.$inferInsert)[] = [];
    for (let p = 0; p < prows.length; p++) {
      const pr = prows[p]!;
      for (let t = 0; t < 5; t++) {
        tasks.push({
          projectId: pr.id,
          title: `Milestone stream ${String(t)} — delivery checkpoint`,
          status: (["backlog", "todo", "in_progress", "done"] as const)[(p + t) % 4],
          priority: (["medium", "high"] as const)[t % 2],
          assigneeId: assignee(p + t).id,
        });
      }
    }
    await db.insert(projectTasks).values(tasks);
    console.log(`✅ Projects (SMB): ${String(prows.length)} with ${String(tasks.length)} tasks`);
  }

  const hrCaseExtra = cnt(
    await db.select({ c: count() }).from(hrCases).where(and(eq(hrCases.orgId, org.id), like(hrCases.notes, `${MARKER}%`))),
  );
  if (hrCaseExtra === 0 || force) {
    if (force && hrCaseExtra > 0) {
      await db.delete(hrCases).where(and(eq(hrCases.orgId, org.id), like(hrCases.notes, `${MARKER}%`)));
    }
    const types = ["onboarding", "offboarding", "leave", "policy", "benefits", "workplace"] as const;
    const hc: (typeof hrCases.$inferInsert)[] = [];
    for (let i = 0; i < 55; i++) {
      const e = activeEmps[i % activeEmps.length];
      if (!e) break;
      hc.push({
        orgId: org.id,
        caseType: types[i % types.length]!,
        employeeId: e.id,
        assigneeId: admin.id,
        priority: (["low", "medium", "high"] as const)[i % 3],
        notes: `${MARKER} HR case ${String(i)} — lifecycle / policy workflow sample`,
      });
    }
    await db.insert(hrCases).values(hc);
    console.log(`✅ HR cases: ${String(hc.length)}`);
  }

  const prExtra = cnt(
    await db.select({ c: count() }).from(purchaseRequests).where(and(eq(purchaseRequests.orgId, org.id), like(purchaseRequests.number, "SMB-PR-%"))),
  );
  if (prExtra === 0 || force) {
    if (force && prExtra > 0) {
      await db.delete(purchaseRequests).where(and(eq(purchaseRequests.orgId, org.id), like(purchaseRequests.number, "SMB-PR-%")));
    }
    const prs: (typeof purchaseRequests.$inferInsert)[] = [];
    for (let i = 0; i < 38; i++) {
      prs.push({
        orgId: org.id,
        number: `SMB-PR-${String(i + 1).padStart(4, "0")}`,
        title: `CapEx / SaaS renewal batch — line item ${String(i + 1)}`,
        requesterId: assignee(i).id,
        totalAmount: String(4000 + (i * 9023) % 220000),
        status: (["draft", "pending", "approved", "rejected"] as const)[i % 4],
        priority: (["low", "medium", "high"] as const)[i % 3],
        department: ["IT", "Marketing", "Operations", "HR"][i % 4]!,
      });
    }
    await db.insert(purchaseRequests).values(prs);
    console.log(`✅ Purchase requests (SMB): ${String(prs.length)}`);
  }

  const legExtra = cnt(
    await db.select({ c: count() }).from(legalMatters).where(and(eq(legalMatters.orgId, org.id), like(legalMatters.matterNumber, "SMB-MAT-%"))),
  );
  if (legExtra === 0 || force) {
    if (force && legExtra > 0) {
      await db.delete(legalMatters).where(and(eq(legalMatters.orgId, org.id), like(legalMatters.matterNumber, "SMB-MAT-%")));
    }
    const lm: (typeof legalMatters.$inferInsert)[] = [];
    for (let i = 0; i < 20; i++) {
      lm.push({
        orgId: org.id,
        matterNumber: `SMB-MAT-${String(i + 1).padStart(4, "0")}`,
        title: `Vendor MSAs review — tranche ${String(i + 1)}`,
        type: (["commercial", "data_privacy", "employment", "ip"] as const)[i % 4],
        status: (["intake", "active", "closed"] as const)[i % 3],
        assignedTo: admin.id,
        confidential: i % 4 === 0,
        estimatedCost: String(5000 + (i * 3333) % 80000),
      });
    }
    await db.insert(legalMatters).values(lm);
    console.log(`✅ Legal matters (SMB): ${String(lm.length)}`);
  }

  const budMarker = cnt(
    await db
      .select({ c: count() })
      .from(budgetLines)
      .where(and(eq(budgetLines.orgId, org.id), eq(budgetLines.fiscalYear, 2026), like(budgetLines.notes, `${MARKER}%`))),
  );
  if (budMarker === 0 || force) {
    if (force && budMarker > 0) {
      await db
        .delete(budgetLines)
        .where(and(eq(budgetLines.orgId, org.id), eq(budgetLines.fiscalYear, 2026), like(budgetLines.notes, `${MARKER}%`)));
    }
    await db.insert(budgetLines).values([
      { orgId: org.id, category: "Payroll & benefits", department: "HR", fiscalYear: 2026, budgeted: "18500000", committed: "17200000", actual: "16850000", forecast: "18100000", notes: `${MARKER} fy2026` },
      { orgId: org.id, category: "Cloud infrastructure", department: "IT", fiscalYear: 2026, budgeted: "2100000", committed: "1580000", actual: "1510000", forecast: "1950000", notes: `${MARKER} fy2026` },
      { orgId: org.id, category: "Sales & marketing programs", department: "Marketing", fiscalYear: 2026, budgeted: "4200000", committed: "2650000", actual: "2380000", forecast: "3900000", notes: `${MARKER} fy2026` },
      { orgId: org.id, category: "Professional services", department: "Finance", fiscalYear: 2026, budgeted: "650000", committed: "410000", actual: "385000", forecast: "600000", notes: `${MARKER} fy2026` },
      { orgId: org.id, category: "Travel & entertainment", department: "Sales", fiscalYear: 2026, budgeted: "890000", committed: "620000", actual: "598000", forecast: "820000", notes: `${MARKER} fy2026` },
      { orgId: org.id, category: "Software subscriptions", department: "IT", fiscalYear: 2026, budgeted: "1400000", committed: "1280000", actual: "1195000", forecast: "1350000", notes: `${MARKER} fy2026` },
      { orgId: org.id, category: "Training & certification", department: "Operations", fiscalYear: 2026, budgeted: "320000", committed: "180000", actual: "165000", forecast: "290000", notes: `${MARKER} fy2026` },
      { orgId: org.id, category: "Facilities & rent", department: "Facilities", fiscalYear: 2026, budgeted: "3600000", committed: "3550000", actual: "3520000", forecast: "3580000", notes: `${MARKER} fy2026` },
    ]);
    console.log("✅ Budget lines FY2026: 8");
  }

  const kbExtra = cnt(
    await db.select({ c: count() }).from(kbArticles).where(and(eq(kbArticles.orgId, org.id), like(kbArticles.title, `${MARKER}%`))),
  );
  if (kbExtra === 0 || force) {
    if (force && kbExtra > 0) {
      await db.delete(kbArticles).where(and(eq(kbArticles.orgId, org.id), like(kbArticles.title, `${MARKER}%`)));
    }
    await db.insert(kbArticles).values(
      Array.from({ length: 16 }, (_, i) => ({
        orgId: org.id,
        title: `${MARKER} Runbook: service degradation play ${String(i + 1)}`,
        content: `Structured remediation steps, communication templates, and escalation matrix for SMB operations. Section ${String(i + 1)} includes dependency maps and verification checks.`,
        categoryId: null,
        status: "published" as const,
        authorId: assignee(i).id,
        viewCount: 40 + i * 37,
        helpfulCount: 5 + i * 3,
      })),
    );
    console.log("✅ KB articles (SMB): 16");
  }

  const apmExtra = cnt(
    await db.select({ c: count() }).from(applications).where(and(eq(applications.orgId, org.id), like(applications.name, `${MARKER}%`))),
  );
  if (apmExtra === 0 || force) {
    if (force && apmExtra > 0) {
      await db.delete(applications).where(and(eq(applications.orgId, org.id), like(applications.name, `${MARKER}%`)));
    }
    await db.insert(applications).values(
      Array.from({ length: 10 }, (_, i) => ({
        orgId: org.id,
        name: `${MARKER} Business app ${String(i + 1)} — portfolio tile`,
        category: ["CRM", "ERP", "HRIS", "Data", "Support"][i % 5]!,
        lifecycle: (["investing", "sustaining", "harvesting", "retiring"] as const)[i % 4],
        healthScore: 35 + (i * 19) % 60,
        annualCost: String(20000 + (i * 17000) % 400000),
        usersCount: 30 + (i * 37) % 380,
        cloudReadiness: (["cloud_native", "lift_shift", "rearchitect"] as const)[i % 3],
        techDebtScore: 10 + (i * 13) % 85,
        ownerId: assignee(i).id,
        vendor: ["Internal", "SAP", "Workday", "Snowflake", "Zendesk"][i % 5]!,
      })),
    );
    console.log("✅ APM applications (SMB): 10");
  }

  // ── Performance + OKRs ─────────────────────────────────────────────────────
  const cycleExtra = cnt(
    await db.select({ c: count() }).from(reviewCycles).where(and(eq(reviewCycles.orgId, org.id), like(reviewCycles.name, `${MARKER}%`))),
  );
  if (cycleExtra === 0 || force) {
    if (force && cycleExtra > 0) {
      const cids = (
        await db.select({ id: reviewCycles.id }).from(reviewCycles).where(and(eq(reviewCycles.orgId, org.id), like(reviewCycles.name, `${MARKER}%`)))
      ).map((c) => c.id);
      if (cids.length) {
        await db.delete(performanceReviews).where(inArray(performanceReviews.cycleId, cids));
        await db.delete(reviewCycles).where(inArray(reviewCycles.id, cids));
      }
    }
    const [cycle] = await db
      .insert(reviewCycles)
      .values({
        orgId: org.id,
        name: `${MARKER} FY26 mid-year cycle`,
        type: "mid_year",
        status: "active",
        startDate: dDays(-60),
        endDate: dDays(45),
        createdById: admin.id,
      })
      .returning();
    if (cycle) {
      const reviews: (typeof performanceReviews.$inferInsert)[] = [];
      for (let i = 0; i < 80; i++) {
        const u = allUsers[i % allUsers.length]!;
        reviews.push({
          orgId: org.id,
          cycleId: cycle.id,
          revieweeId: u.id,
          reviewerId: assignee(i).id,
          reviewerRole: "manager",
          status: (["draft", "self_review", "manager_review", "completed"] as const)[i % 4],
          overallRating: (["3", "4", "5", "2"] as const)[i % 4],
          selfRating: (["3", "4", "4", "3"] as const)[i % 4],
          goalsAchieved: 2 + (i % 4),
          goalsTotal: 4,
          completedAt: i % 4 === 3 ? dDays(-(i % 20)) : undefined,
        });
      }
      await db.insert(performanceReviews).values(reviews);
      console.log(`✅ Performance reviews: ${String(reviews.length)}`);
    }
  }

  const okrExtra = cnt(
    await db.select({ c: count() }).from(okrObjectives).where(and(eq(okrObjectives.orgId, org.id), like(okrObjectives.title, `${MARKER}%`))),
  );
  if (okrExtra === 0 || force) {
    if (force && okrExtra > 0) {
      const oids = (
        await db.select({ id: okrObjectives.id }).from(okrObjectives).where(and(eq(okrObjectives.orgId, org.id), like(okrObjectives.title, `${MARKER}%`)))
      ).map((o) => o.id);
      if (oids.length) {
        await db.delete(okrKeyResults).where(inArray(okrKeyResults.objectiveId, oids));
        await db.delete(okrObjectives).where(inArray(okrObjectives.id, oids));
      }
    }
    const objs = await db
      .insert(okrObjectives)
      .values(
        Array.from({ length: 28 }, (_, i) => ({
          orgId: org.id,
          ownerId: allUsers[i % allUsers.length]!.id,
          title: `${MARKER} Improve revenue efficiency pillar ${String(i + 1)}`,
          cycle: (["q1", "q2"] as const)[i % 2],
          year: 2026,
          status: "active" as const,
          overallProgress: 15 + (i * 13) % 70,
        })),
      )
      .returning();
    const krs: (typeof okrKeyResults.$inferInsert)[] = [];
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i]!;
      for (let k = 0; k < 3; k++) {
        krs.push({
          objectiveId: o.id,
          orgId: org.id,
          title: `KR ${String(k + 1)} — measurable outcome`,
          targetValue: "100",
          currentValue: String(20 + ((i + k) * 17) % 85),
          unit: "%",
          status: (["on_track", "at_risk", "behind"] as const)[(i + k) % 3],
          dueDate: dDays(30 + k * 20),
        });
      }
    }
    await db.insert(okrKeyResults).values(krs);
    console.log(`✅ OKRs: ${String(objs.length)} objectives, ${String(krs.length)} key results`);
  }

  // ── Survey + responses (workforce sentiment) ──────────────────────────────
  let survey = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.orgId, org.id), eq(surveys.title, `${MARKER} Workforce pulse`)))
    .then((r) => r[0]);
  if (!survey) {
    const [s] = await db
      .insert(surveys)
      .values({
        orgId: org.id,
        title: `${MARKER} Workforce pulse`,
        type: "employee_pulse",
        status: "active",
        createdById: admin.id,
        questions: [
          { id: "q1", type: "rating", question: "How satisfied are you with clarity of goals?", required: true },
          { id: "q2", type: "nps", question: "How likely are you to recommend this org as a place to work?", required: true },
          { id: "q3", type: "yes_no", question: "Do you have the tools to do your job effectively?", required: true },
        ],
      })
      .returning();
    survey = s;
  }
  if (survey) {
    const respCount = cnt(
      await db.select({ c: count() }).from(surveyResponses).where(eq(surveyResponses.surveyId, survey.id)),
    );
    if (respCount < 120 || force) {
      if (force && respCount > 0) {
        await db.delete(surveyResponses).where(eq(surveyResponses.surveyId, survey.id));
      }
      const responses: (typeof surveyResponses.$inferInsert)[] = [];
      for (let i = 0; i < 180; i++) {
        const u = allUsers[i % allUsers.length]!;
        const nps = Math.round(rng() * 4) + (rng() < 0.22 ? 6 : 3); // skew slightly positive
        const sat = 2 + Math.round(rng() * 3);
        responses.push({
          surveyId: survey.id,
          respondentId: u.id,
          answers: { q1: String(sat), q2: String(Math.min(10, Math.max(0, nps))), q3: rng() < 0.78 ? "yes" : "no" },
          score: String((sat + nps) / 2),
          comments:
            rng() < 0.12
              ? "Leadership communication improved; still need faster IT turnaround."
              : undefined,
          submittedAt: dateUniform(rng, histStart, dDays(-1)),
        });
      }
      await db.insert(surveyResponses).values(responses);
      console.log(`✅ Survey responses: ${String(responses.length)}`);
    }
  }

  let csatSurvey = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.orgId, org.id), eq(surveys.title, `${MARKER} Post-ticket CSAT`)))
    .then((r) => r[0]);
  if (!csatSurvey) {
    const [s] = await db
      .insert(surveys)
      .values({
        orgId: org.id,
        title: `${MARKER} Post-ticket CSAT`,
        type: "csat",
        status: "active",
        createdById: admin.id,
        questions: [{ id: "q1", type: "rating", question: "How satisfied are you with the resolution?", required: true }],
      })
      .returning();
    csatSurvey = s;
  }
  if (csatSurvey) {
    const csatRespN = cnt(await db.select({ c: count() }).from(surveyResponses).where(eq(surveyResponses.surveyId, csatSurvey.id)));
    if (csatRespN < 480 || force) {
      if (force && csatRespN > 0) {
        await db.delete(surveyResponses).where(eq(surveyResponses.surveyId, csatSurvey.id));
      }
      const csatRows: (typeof surveyResponses.$inferInsert)[] = [];
      for (let i = 0; i < 520; i++) {
        const u = allUsers[i % allUsers.length]!;
        const submittedAt = dateUniform(rng, histStart, dDays(-1));
        const cohort = (submittedAt.getTime() - histStart.getTime()) / Math.max(1, NOW.getTime() - histStart.getTime());
        const base = 2.9 + cohort * 1.35 + (rng() < 0.08 ? 0.35 : 0);
        const sat = Math.min(5, Math.max(1, Math.round(base * 10) / 10));
        csatRows.push({
          surveyId: csatSurvey.id,
          respondentId: u.id,
          answers: { q1: String(sat) },
          score: String(sat),
          comments:
            cohort > 0.65 && rng() < 0.14
              ? "Recent tickets feel faster; still rough edges on comms."
              : undefined,
          submittedAt,
        });
      }
      for (let i = 0; i < csatRows.length; i += 100) {
        await db.insert(surveyResponses).values(csatRows.slice(i, i + 100)!);
      }
      console.log(`✅ CSAT survey responses: ${String(csatRows.length)}`);
    }
  }

  console.log("\n🎉 SMB analytics seed complete.");
  console.log("   Login: admin@coheron.com / demo1234!");
  process.exit(0);
}

seedSmbAnalytics().catch((err: unknown) => {
  console.error("❌ SMB seed failed:", err instanceof Error ? err.message : err);
  console.error(err);
  process.exit(1);
});
