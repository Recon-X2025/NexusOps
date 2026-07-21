/**
 * OKR rollup helpers (G12).
 * ─────────────────────────
 * An objective's `overallProgress` is its OWN progress: the average attainment
 * of its own key results. Its `rollupProgress` is the alignment rollup: the
 * average of its own progress and every descendant's own progress.
 *
 * Previously the rollup was computed only on read (in `okr.cascade`), so a
 * parent objective never actually reflected how its aligned children were
 * tracking — the persisted value was stale/zero. These helpers make the rollup
 * a real, persisted column: after any key-result change we recompute the
 * affected objective's own progress and then re-persist `rollupProgress` for
 * every objective in the org, so a leaf change propagates up the whole
 * alignment forest in one pass.
 *
 * We recompute the org's whole forest (not just the changed node's ancestor
 * chain) because it's a single indexed scan over one org's objectives — far
 * simpler and race-free than walking `parentObjectiveId` upward with N queries,
 * and it self-heals any drift.
 */
import { okrKeyResults, okrObjectives, eq, and, type DbOrTx } from "@coheronconnect/db";

type ObjectiveRow = typeof okrObjectives.$inferSelect;

/**
 * Recompute a single objective's own `overallProgress` from its key results.
 * Returns the freshly-persisted value (0 when the objective has no KRs).
 */
export async function recomputeObjectiveOwnProgress(
  db: DbOrTx,
  orgId: string,
  objectiveId: string,
): Promise<number> {
  const krs = await db
    .select({ currentValue: okrKeyResults.currentValue, targetValue: okrKeyResults.targetValue })
    .from(okrKeyResults)
    .where(and(eq(okrKeyResults.objectiveId, objectiveId), eq(okrKeyResults.orgId, orgId)));

  const pcts = krs.map(
    (k) => (Number(k.currentValue) / Math.max(Number(k.targetValue), 1)) * 100,
  );
  const own = pcts.length
    ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length)
    : 0;

  await db
    .update(okrObjectives)
    .set({ overallProgress: own, updatedAt: new Date() })
    .where(and(eq(okrObjectives.id, objectiveId), eq(okrObjectives.orgId, orgId)));

  return own;
}

/**
 * Pure rollup computation: given a flat list of objectives (each with its own
 * `overallProgress` and `parentObjectiveId`), returns a map of
 * `objectiveId → rollupProgress` where a node's rollup is the average of its
 * own progress and every descendant's own progress.
 *
 * Cycle-safe: a node is only ever visited once per traversal (visited-set), so
 * a corrupt parent cycle can't infinite-loop.
 */
export function computeForestRollup(
  objectives: Array<Pick<ObjectiveRow, "id" | "parentObjectiveId" | "overallProgress">>,
): Map<string, number> {
  const byId = new Map(objectives.map((o) => [o.id, o]));
  const children = new Map<string, string[]>();
  for (const o of objectives) {
    const parentId = o.parentObjectiveId;
    if (parentId && byId.has(parentId)) {
      (children.get(parentId) ?? children.set(parentId, []).get(parentId)!).push(o.id);
    }
  }

  const rollup = new Map<string, number>();

  // Gather every descendant's own progress (plus this node's own), guarding
  // against cycles with a per-traversal visited set.
  const gatherOwn = (id: string, seen: Set<string>): number[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    const node = byId.get(id)!;
    const acc = [node.overallProgress];
    for (const childId of children.get(id) ?? []) acc.push(...gatherOwn(childId, seen));
    return acc;
  };

  for (const o of objectives) {
    const owns = gatherOwn(o.id, new Set<string>());
    rollup.set(o.id, Math.round(owns.reduce((s, p) => s + p, 0) / owns.length));
  }

  return rollup;
}

/**
 * Recompute and persist `rollupProgress` for every objective in the org.
 * Called after an objective's own progress changes (KR update) or the
 * alignment tree changes (re-parent). Returns the number of rows updated.
 */
export async function persistOrgRollup(db: DbOrTx, orgId: string): Promise<number> {
  const objectives = await db
    .select({
      id: okrObjectives.id,
      parentObjectiveId: okrObjectives.parentObjectiveId,
      overallProgress: okrObjectives.overallProgress,
      rollupProgress: okrObjectives.rollupProgress,
    })
    .from(okrObjectives)
    .where(eq(okrObjectives.orgId, orgId));

  const rollup = computeForestRollup(objectives);

  let updated = 0;
  for (const o of objectives) {
    const next = rollup.get(o.id) ?? o.overallProgress;
    if (next !== o.rollupProgress) {
      await db
        .update(okrObjectives)
        .set({ rollupProgress: next, updatedAt: new Date() })
        .where(and(eq(okrObjectives.id, o.id), eq(okrObjectives.orgId, orgId)));
      updated++;
    }
  }
  return updated;
}

/**
 * Full recompute after a key-result change: refresh the changed objective's own
 * progress, then re-persist the whole org's rollup so ancestors reflect it.
 */
export async function recomputeAfterKeyResultChange(
  db: DbOrTx,
  orgId: string,
  objectiveId: string,
): Promise<void> {
  await recomputeObjectiveOwnProgress(db, orgId, objectiveId);
  await persistOrgRollup(db, orgId);
}
