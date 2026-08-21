/** TEMPORARY audit harness — resolves every registered metric against one org
 *  and writes JSON to a file. Not part of the product. Delete after the run. */
import { getAllMetricDefinitions } from "@coheronconnect/metrics";
import { getDb } from "@coheronconnect/db";
import { writeFileSync } from "node:fs";

const ORG = "10000000-0000-0000-0000-000000000001";
const USER = "20000000-0000-0000-0000-000000000001";
// span_180d, month granularity — the product's default (executiveDefaultQuickRangeId).
const range = {
  start: new Date("2026-02-22T00:00:00+05:30"),
  end: new Date("2026-08-21T23:59:59+05:30"),
  granularity: "month" as const,
};

async function main() {
  const db = getDb();
  const ctx: any = { tenantId: ORG, userId: USER, range, services: { db } };
  const defs = getAllMetricDefinitions();
  const out: any[] = [];
  for (const d of defs) {
    try {
      const v = await d.resolve(ctx);
      out.push({
        id: d.id, label: d.label, unit: d.unit, target: d.target ?? null,
        current: v?.current ?? null, state: v?.state ?? null,
        seriesPoints: Array.isArray(v?.series) ? v.series.length : 0,
        categories: (v as any)?.categories ?? null,
        emptyReason: (v as any)?.reason ?? null,
      });
    } catch (e: any) {
      out.push({ id: d.id, label: d.label, error: String(e?.message ?? e) });
    }
  }
  writeFileSync(process.env.OUT!, JSON.stringify({ count: defs.length, metrics: out }, null, 2));
  process.exit(0);
}
main();
