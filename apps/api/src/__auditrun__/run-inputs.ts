/** TEMPORARY audit harness — drives the input-requiring query procedures with
 *  REAL ids drawn from the seeded org. Not product code. */
import { appRouter } from "../routers/index";
import { getDb, organizations, users, eq, sql } from "@coheronconnect/db";
import { readFileSync, writeFileSync } from "node:fs";

const ORG = "10000000-0000-0000-0000-000000000001";

async function one(db: any, q: string): Promise<string | null> {
  try { const r: any = await db.execute(sql.raw(q)); const rows = Array.isArray(r) ? r : r.rows ?? []; return rows[0] ? String(Object.values(rows[0])[0]) : null; }
  catch { return null; }
}

async function main() {
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ORG));
  const [user] = await db.select().from(users).where(eq(users.id, "20000000-0000-0000-0000-000000000001"));
  const ctx: any = { db, mongoDb: null, databaseProvider: "postgres", user: { ...user, permissions: [] },
    org, orgId: ORG, requestId: "audit2", sessionId: "audit2", ipAddress: "127.0.0.1", userAgent: "audit", idempotencyKey: null, macToken: null };

  const ID: Record<string, string | null> = {
    ticket:   await one(db, `select id from tickets where org_id='${ORG}' limit 1`),
    asset:    await one(db, `select id from assets where org_id='${ORG}' limit 1`),
    employee: await one(db, `select id from employees where org_id='${ORG}' limit 1`),
    hrCase:   await one(db, `select id from hr_cases where org_id='${ORG}' limit 1`),
    pr:       await one(db, `select id from purchase_requests where org_id='${ORG}' limit 1`),
    po:       await one(db, `select id from purchase_orders where org_id='${ORG}' limit 1`),
    grn:      await one(db, `select id from goods_receipt_notes where org_id='${ORG}' limit 1`),
    wo:       await one(db, `select id from work_orders where org_id='${ORG}' limit 1`),
    change:   await one(db, `select id from change_requests where org_id='${ORG}' limit 1`),
    incident: await one(db, `select id from security_incidents where org_id='${ORG}' limit 1`),
    risk:     await one(db, `select id from risks where org_id='${ORG}' limit 1`),
    control:  await one(db, `select id from risk_controls where org_id='${ORG}' limit 1`),
    invoice:  await one(db, `select id from invoices where org_id='${ORG}' limit 1`),
    contract: await one(db, `select id from contracts where org_id='${ORG}' limit 1`),
    matter:   await one(db, `select id from legal_matters where org_id='${ORG}' limit 1`),
    deal:     await one(db, `select id from crm_deals where org_id='${ORG}' limit 1`),
    account:  await one(db, `select id from crm_accounts where org_id='${ORG}' limit 1`),
    lead:     await one(db, `select id from crm_leads where org_id='${ORG}' limit 1`),
    survey:   await one(db, `select id from surveys where org_id='${ORG}' limit 1`),
    project:  await one(db, `select id from projects where org_id='${ORG}' limit 1`),
    payslip:  await one(db, `select id from payslips where org_id='${ORG}' limit 1`),
    run:      await one(db, `select id from payroll_runs where org_id='${ORG}' limit 1`),
    objective:await one(db, `select id from okr_objectives where org_id='${ORG}' limit 1`),
    app:      await one(db, `select id from applications where org_id='${ORG}' limit 1`),
    cand:     await one(db, `select id from candidates where org_id='${ORG}' limit 1`),
    job:      await one(db, `select id from job_requisitions where org_id='${ORG}' limit 1`),
    filing:   await one(db, `select id from secretarial_filings where org_id='${ORG}' limit 1`),
    meeting:  await one(db, `select id from board_meetings where org_id='${ORG}' limit 1`),
    catItem:  await one(db, `select id from catalog_items where org_id='${ORG}' limit 1`),
    kb:       await one(db, `select id from kb_articles where org_id='${ORG}' limit 1`),
    team:     await one(db, `select id from teams where org_id='${ORG}' limit 1`),
    claim:    await one(db, `select id from expense_claims where org_id='${ORG}' limit 1`),
    vendor:   await one(db, `select id from vendors where org_id='${ORG}' limit 1`),
  };

  // Candidate inputs, tried in order. Broad on purpose — a procedure takes the first that validates.
  const anyId = (v: string | null) => v ?? "00000000-0000-4000-8000-000000000000";
  const CANDIDATES = (path: string): any[] => {
    const p = path.toLowerCase();
    const pick =
      p.includes("ticket") ? ID.ticket : p.includes("asset") || p.includes("cmdb") || p.includes("depreciation") ? ID.asset :
      p.includes("employee") ? ID.employee : p.includes("hr.cases") ? ID.hrCase :
      p.includes("purchaserequest") ? ID.pr : p.includes("purchaseorder") ? ID.po : p.includes("goodsreceipt") ? ID.grn :
      p.includes("workorder") ? ID.wo : p.includes("change") || p.includes("release") ? ID.change :
      p.includes("incident") || p.includes("security") ? ID.incident : p.includes("risk") ? ID.risk :
      p.includes("control") ? ID.control : p.includes("invoice") ? ID.invoice : p.includes("contract") ? ID.contract :
      p.includes("matter") || p.includes("legal") ? ID.matter : p.includes("deal") ? ID.deal :
      p.includes("account") ? ID.account : p.includes("lead") ? ID.lead : p.includes("survey") ? ID.survey :
      p.includes("project") ? ID.project : p.includes("payslip") ? ID.payslip : p.includes("payroll") ? ID.run :
      p.includes("okr") || p.includes("objective") ? ID.objective : p.includes("app") ? ID.app :
      p.includes("candidate") ? ID.cand : p.includes("job") ? ID.job : p.includes("filing") ? ID.filing :
      p.includes("meeting") ? ID.meeting : p.includes("catalog") ? ID.catItem : p.includes("article") || p.includes("kb") ? ID.kb :
      p.includes("team") ? ID.team : p.includes("claim") || p.includes("expense") ? ID.claim :
      p.includes("vendor") ? ID.vendor : ID.ticket;
    const id = anyId(pick);
    return [
      { id }, { id, orgId: ORG }, { employeeId: anyId(ID.employee) }, { ticketId: anyId(ID.ticket) },
      { assetId: anyId(ID.asset) }, { poId: anyId(ID.po) }, { runId: anyId(ID.run) },
      { payrollRunId: anyId(ID.run) }, { surveyId: anyId(ID.survey) }, { incidentId: anyId(ID.incident) },
      { controlId: anyId(ID.control) }, { riskId: anyId(ID.risk) }, { invoiceId: anyId(ID.invoice) },
      { contractId: anyId(ID.contract) }, { projectId: anyId(ID.project) }, { changeId: anyId(ID.change) },
      { month: 8, year: 2026 }, { year: 2026 }, { fiscalYear: 2026 },
      { employeeId: anyId(ID.employee), month: 8, year: 2026 },
      { gstin: "29AAACA1234B1ZQ" }, { period: "2026-08" }, { from: "2026-01-01", to: "2026-08-21" },
      { limit: 10, offset: 0 }, { query: "test" }, { search: "a" },
    ];
  };

  const caller = (appRouter as any).createCaller(ctx);
  const paths = readFileSync(process.env.LIST!, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  const out: any[] = [];
  for (const path of paths) {
    let fn: any = caller;
    for (const seg of path.split(".")) fn = fn?.[seg];
    if (typeof fn !== "function") { out.push({ path, status: "not-callable" }); continue; }
    let done = false;
    for (const input of CANDIDATES(path)) {
      try {
        const r = await fn(input);
        out.push({ path, status: "ok", input: JSON.stringify(input).slice(0, 90),
          result: JSON.parse(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? String(v) : v))) });
        done = true; break;
      } catch (e: any) {
        const m = String(e?.message ?? e);
        if (!/Required|Invalid input|expected|invalid_type|Unrecognized/i.test(m)) {
          out.push({ path, status: "error", input: JSON.stringify(input).slice(0, 90), error: m.slice(0, 220) });
          done = true; break;
        }
      }
    }
    if (!done) out.push({ path, status: "input-unresolved" });
  }
  writeFileSync(process.env.OUT!, JSON.stringify(out, null, 2));
  const c = (s: string) => out.filter((o) => o.status === s).length;
  console.log(`total=${out.length} ok=${c("ok")} error=${c("error")} unresolved=${c("input-unresolved")} notcallable=${c("not-callable")}`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
