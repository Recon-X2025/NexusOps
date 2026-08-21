/** TEMPORARY audit harness — resolves every registry metric, every workbench
 *  panel, and every aggregating query procedure against one org. Not product code. */
import { appRouter } from "../routers/index";
import { getAllMetricDefinitions } from "@coheronconnect/metrics";
import {
  buildServiceDeskPayload, buildChangeReleasePayload, buildFieldServicePayload,
  buildSecOpsPayload, buildGrcPayload, buildHrOpsPayload, buildRecruiterPayload,
  buildCsmPayload, buildFinanceOpsPayload, buildProcurementPayload,
  buildCompanySecretaryPayload, buildPmoPayload,
} from "../services/workbench-payloads/index";
import { getDb, organizations, users, eq } from "@coheronconnect/db";
import { writeFileSync } from "node:fs";

const ORG = "10000000-0000-0000-0000-000000000001";
const range = { start: new Date("2026-02-22T00:00:00+05:30"), end: new Date("2026-08-21T23:59:59+05:30"), granularity: "month" as const };

function walk(router: any, prefix = ""): Array<{ path: string; def: any }> {
  const out: Array<{ path: string; def: any }> = [];
  const rec = router?._def?.procedures ?? router?._def?.record ?? {};
  for (const [k, v] of Object.entries<any>(rec)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v?._def?.procedures || v?._def?.record) out.push(...walk(v, p));
    else out.push({ path: p, def: v });
  }
  return out;
}

async function main() {
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ORG));
  const [user] = await db.select().from(users).where(eq(users.id, "20000000-0000-0000-0000-000000000001"));
  const ctx: any = {
    db, mongoDb: null, databaseProvider: "postgres",
    user: { ...user, permissions: [] }, org, orgId: ORG,
    requestId: "audit", sessionId: "audit", ipAddress: "127.0.0.1",
    userAgent: "audit", idempotencyKey: null, macToken: null,
  };

  const out: any = { metrics: [], panels: [], procedures: [] };

  // ── 1. registry metrics ──
  for (const d of getAllMetricDefinitions()) {
    try {
      const v = await d.resolve({ tenantId: ORG, userId: user.id, range, services: { db } } as any);
      out.metrics.push({ id: d.id, current: v?.current ?? null, state: v?.state ?? null,
        series: Array.isArray(v?.series) ? v.series.length : 0,
        categories: (v as any)?.categories ?? null, reason: (v as any)?.reason ?? null });
    } catch (e: any) { out.metrics.push({ id: d.id, error: String(e?.message ?? e) }); }
  }

  // ── 2. workbench panels ──
  const BUILDERS: Array<[string, any]> = [
    ["service-desk", buildServiceDeskPayload], ["field-service", buildFieldServicePayload],
    ["finance-ops", buildFinanceOpsPayload], ["procurement", buildProcurementPayload],
    ["hr-ops", buildHrOpsPayload], ["recruiter", buildRecruiterPayload],
    ["csm", buildCsmPayload], ["secops", buildSecOpsPayload], ["grc", buildGrcPayload],
    ["change-release", buildChangeReleasePayload], ["pmo", buildPmoPayload],
    ["company-secretary", buildCompanySecretaryPayload],
  ];
  for (const [s, build] of BUILDERS) {
    try {
      const p: any = await build({ db, orgId: ORG, userId: user.id });
      for (const [k, v] of Object.entries<any>(p ?? {})) {
        if (v && typeof v === "object" && "state" in v) {
          const dd = (v as any).data;
          out.panels.push({ panel: `${s}.${k}`, state: (v as any).state,
            count: Array.isArray(dd) ? dd.length : (dd && typeof dd === "object" ? Object.keys(dd).length : null),
            sample: Array.isArray(dd) ? dd.slice(0, 8) : dd, reason: (v as any).reason ?? null });
        }
      }
    } catch (e: any) { out.panels.push({ panel: `${s}.*`, error: String(e?.message ?? e).slice(0,180) }); }
  }

  // ── 3. every query procedure ──
  const caller = (appRouter as any).createCaller(ctx);
  const procs = walk(appRouter);
  for (const { path, def } of procs) {
    const type = def?._def?.type ?? (def?._def?.query ? "query" : def?._def?.mutation ? "mutation" : "?");
    if (type !== "query") continue;
    let fn: any = caller;
    for (const seg of path.split(".")) fn = fn?.[seg];
    if (typeof fn !== "function") { out.procedures.push({ path, skipped: "not callable" }); continue; }
    const attempts: any[] = [undefined, {}, { year: 2026 }, { limit: 10 }, { period: "month" }];
    let done = false;
    for (const input of attempts) {
      try {
        const r = await fn(input);
        out.procedures.push({ path, input: input === undefined ? "(none)" : JSON.stringify(input),
          result: JSON.parse(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? String(v) : v))) });
        done = true; break;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (!/Required|Invalid|expected|invalid_type|undefined/i.test(msg)) {
          out.procedures.push({ path, error: msg.slice(0, 200) }); done = true; break;
        }
      }
    }
    if (!done) out.procedures.push({ path, error: "needs input (all probes rejected)" });
  }

  writeFileSync(process.env.OUT!, JSON.stringify(out, null, 2));
  console.log(`metrics=${out.metrics.length} panels=${out.panels.length} procedures=${out.procedures.length}`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
