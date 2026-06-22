/**
 * Hub layout registry types.
 *
 * Each module Overview gets its own bespoke primary visual that fits the
 * domain (ticket flow for IT, alert funnel for Security, hiring funnel
 * for People, etc.). The shared support panels (KPI strip, bullets,
 * flow, risks, narrative) stay common because they read directly off
 * the same hub payload.
 *
 * `HubCommandCenter` (`apps/web/src/components/dashboard/hub-command-center-page.tsx`)
 * looks up the active hub's `FunctionKey` in `HUB_LAYOUTS` and renders
 * the registered `Primary` component instead of one global grid.
 */

import type { ComponentType } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

export type HubPayload = inferRouterOutputs<AppRouter>["commandCenter"]["getHubView"];
export type FunctionKey = HubPayload["heatmap"][number]["function"];
export type Granularity = "day" | "week" | "month";

export interface HubPrimaryProps {
  payload: HubPayload;
  granularity: Granularity;
}

export interface HubLayoutConfig {
  /** Human-friendly accent label shown above the primary card. */
  accent: string;
  /** Module-specific primary visual. */
  Primary: ComponentType<HubPrimaryProps>;
  /**
   * Whether to render the canonical Trend Deck below the primary. Some
   * modules (DevOps, Finance) already saturate the trend story in their
   * primary; others benefit from the deck.
   */
  showTrendDeck?: boolean;
}
