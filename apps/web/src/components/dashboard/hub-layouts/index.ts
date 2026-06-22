/**
 * Hub layout registry.
 *
 * Maps each `FunctionKey` to the bespoke primary visual + accent for
 * its hub Overview. `HubCommandCenter` consumes this to render the
 * module-appropriate chart instead of one shared grid.
 *
 * Adding a new hub: register a primary visual component here. Falls
 * back to a generic config when no entry matches (defensive — shouldn't
 * happen for live `FunctionKey`s).
 */

import type { ComponentType } from "react";
import { ITServicesPrimary } from "./it-services";
import { SecurityPrimary } from "./security";
import { PeoplePrimary } from "./people";
import { CustomerPrimary } from "./customer";
import { FinancePrimary } from "./finance";
import { LegalPrimary } from "./legal";
import { StrategyPrimary } from "./strategy";
import { DevopsPrimary } from "./devops";
import type { FunctionKey, HubLayoutConfig, HubPrimaryProps } from "./types";

const HUB_LAYOUTS: Partial<Record<FunctionKey, HubLayoutConfig>> = {
  it_services: { accent: "border-t-blue-600", Primary: ITServicesPrimary, showTrendDeck: true },
  security: { accent: "border-t-rose-600", Primary: SecurityPrimary, showTrendDeck: true },
  people: { accent: "border-t-emerald-600", Primary: PeoplePrimary, showTrendDeck: true },
  customer: { accent: "border-t-amber-600", Primary: CustomerPrimary, showTrendDeck: true },
  finance: { accent: "border-t-slate-700", Primary: FinancePrimary, showTrendDeck: true },
  legal: { accent: "border-t-violet-600", Primary: LegalPrimary, showTrendDeck: false },
  strategy: { accent: "border-t-blue-700", Primary: StrategyPrimary, showTrendDeck: true },
  devops: { accent: "border-t-cyan-600", Primary: DevopsPrimary, showTrendDeck: false },
};

export function getHubLayout(fn: FunctionKey): HubLayoutConfig {
  return HUB_LAYOUTS[fn] ?? FALLBACK_LAYOUT;
}

const Fallback: ComponentType<HubPrimaryProps> = () => null;
const FALLBACK_LAYOUT: HubLayoutConfig = { accent: "border-t-slate-500", Primary: Fallback, showTrendDeck: true };

export type { HubLayoutConfig };
