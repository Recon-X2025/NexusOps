"use client";

export const dynamic = "force-dynamic";

import { HubCommandCenter } from "@/components/dashboard/hub-command-center-page";

export default function StrategyProjectsHubPage() {
  return (
    <HubCommandCenter
      functionKey="strategy"
      title="Strategy & Projects"
      subtitle="Hub overview · OKRs, portfolio, application landscape, vendor SLAs"
      footerQuote="Strategy without execution telemetry is theatre — read the throughput, not the slides."
    />
  );
}
