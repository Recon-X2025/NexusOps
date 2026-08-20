/**
 * Deal stage history — ONE writer, called from BOTH transition sites.
 *
 * `crm.deals.movePipeline` (canonical) and `crm.movePipeline` (the deprecated
 * flat twin) are copy-pasted bodies that both write `crm_deals.stage`. A history
 * write added to only one of them would silently miss every move made through
 * the other — and the two would then drift, which is this module's recurring
 * defect. So the rule lives here and both sites call it, exactly as
 * `assertDealCloseTransition` already does for the close guards.
 *
 * Deal CREATION is deliberately NOT recorded. An opening stage is not a
 * transition: there is no stage it came from, `fromStage` would have to be
 * invented, and `crm_deals.createdAt` already records when the deal appeared.
 * `deals.update` / `crm.updateDeal` do not accept a stage, and
 * `approveDealWon` writes only the approval columns — so `movePipeline` and its
 * twin are the complete set of transition sites.
 */
import { crmDealStageHistory, type DbOrTx } from "@coheronconnect/db";
import type { crmDeals } from "@coheronconnect/db";

type DealStage = (typeof crmDeals.$inferSelect)["stage"];

export interface RecordDealStageChangeArgs {
  orgId: string;
  dealId: string;
  fromStage: DealStage;
  toStage: DealStage;
  /** Nullable by FK policy — the history outlives the person who made it. */
  changedBy?: string | null;
}

/**
 * Append one transition.
 *
 * A move to the stage the deal is ALREADY in writes nothing: `movePipeline`
 * accepts it (it is not an error to re-assert the current stage), but a row
 * whose `fromStage` equals its `toStage` is not a transition, and letting those
 * in would inflate every count and corrupt time-in-stage the moment anything
 * reads this table. Returns whether a row was written so callers can assert it.
 *
 * @param tx  transaction handle — the caller owns the transaction so the
 *            history commits together with the stage change it describes. A
 *            deal must never move without its transition being recorded, and a
 *            transition must never be recorded for a move that rolled back.
 */
export async function recordDealStageChange(
  tx: DbOrTx,
  args: RecordDealStageChangeArgs,
): Promise<boolean> {
  if (args.fromStage === args.toStage) return false;

  await tx.insert(crmDealStageHistory).values({
    orgId: args.orgId,
    dealId: args.dealId,
    fromStage: args.fromStage,
    toStage: args.toStage,
    changedBy: args.changedBy ?? null,
  });
  return true;
}
