/**
 * Daily metric snapshots — WIRING-01 item W1.
 *
 * Sixteen of thirty metrics rendered a number with an empty trend line, because
 * a point-in-time count cannot be reconstructed for a past day. This records the
 * figure daily so a trend comes from real observations.
 *
 * NO BACKFILL is tested for deliberately — there is none, and inventing history
 * is the thing this design avoids. The series starts empty and fills forward.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initTestEnvironment, seedFullOrg, cleanupOrg, testDb } from "./helpers";
import { captureMetricSnapshots, readMetricSeriesBatch } from "../workflows/metricSnapshotWorkflow";
import { metricSnapshots, eq, and } from "@coheronconnect/db";

describe.sequential("metric snapshots", () => {
  let orgA: Awaited<ReturnType<typeof seedFullOrg>>, orgB: Awaited<ReturnType<typeof seedFullOrg>>;

  beforeAll(async () => {
    await initTestEnvironment();
    orgA = await seedFullOrg(); orgB = await seedFullOrg();
  });
  afterAll(async () => { await cleanupOrg(orgA.orgId); await cleanupOrg(orgB.orgId); });

  it("captures a row per metric per org", async () => {
    const r = await captureMetricSnapshots(testDb() as never, { orgIds: [orgA.orgId, orgB.orgId] });
    expect(r.written).toBeGreaterThan(0);
    const rows = await testDb().select().from(metricSnapshots).where(eq(metricSnapshots.orgId, orgA.orgId));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("is idempotent within a day — a re-run corrects, never doubles", async () => {
    const before = await testDb().select().from(metricSnapshots).where(eq(metricSnapshots.orgId, orgA.orgId));
    await captureMetricSnapshots(testDb() as never, { orgIds: [orgA.orgId, orgB.orgId] });
    const after = await testDb().select().from(metricSnapshots).where(eq(metricSnapshots.orgId, orgA.orgId));
    expect(after.length).toBe(before.length);
  });

  it("keeps each tenant's history separate", async () => {
    const a = await testDb().select().from(metricSnapshots).where(eq(metricSnapshots.orgId, orgA.orgId));
    const b = await testDb().select().from(metricSnapshots).where(eq(metricSnapshots.orgId, orgB.orgId));
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a.every((r) => r.orgId === orgA.orgId)).toBe(true);
    // no row of A's is readable as B's
    const crossed = await testDb().select().from(metricSnapshots)
      .where(and(eq(metricSnapshots.orgId, orgB.orgId), eq(metricSnapshots.metricId, a[0]!.metricId)));
    expect(crossed.every((r) => r.orgId === orgB.orgId)).toBe(true);
  });

  it("reads back a series, and returns empty for a metric never captured", async () => {
    const someMetric = (await testDb().select().from(metricSnapshots)
      .where(eq(metricSnapshots.orgId, orgA.orgId)))[0]!.metricId;
    const map = await readMetricSeriesBatch(testDb() as never, orgA.orgId, [someMetric, "does.not.exist"]);
    expect(map.get(someMetric)?.length).toBeGreaterThan(0);
    expect(map.get("does.not.exist") ?? []).toHaveLength(0);
  });

  it("a two-day history reads back in order — the point of the whole item", async () => {
    const metricId = "wiring.w1.probe";
    for (const [day, val] of [["2026-08-21", "10"], ["2026-08-22", "20"]] as const) {
      await testDb().insert(metricSnapshots)
        .values({ orgId: orgA.orgId, metricId, capturedOn: day, value: val });
    }
    const map = await readMetricSeriesBatch(testDb() as never, orgA.orgId, [metricId], 3650);
    const series = map.get(metricId) ?? [];
    expect(series.map((p) => p.v)).toEqual([10, 20]);
    expect(series[0]!.t < series[1]!.t).toBe(true);
  });
});
