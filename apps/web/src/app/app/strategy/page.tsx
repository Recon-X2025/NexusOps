"use client";

export const dynamic = "force-dynamic";

import { HubCommandCenter } from "@/components/dashboard/hub-command-center-page";

export default function StrategyCenterHubPage() {
  return (
    <HubCommandCenter
      functionKey="strategy"
      title="Strategy Center"
      subtitle="Hub overview · OKRs, portfolio shape, application landscape, vendor SLAs"
      footerQuote="Strategy without execution telemetry is theatre — read the throughput, not the slides."
    />
  );
}
