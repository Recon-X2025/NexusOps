"use client";

export const dynamic = "force-dynamic";

import { HubCommandCenter } from "@/components/dashboard/hub-command-center-page";

export default function DeveloperOpsHubPage() {
  return (
    <HubCommandCenter
      functionKey="devops"
      title="Developer & Ops"
      subtitle="Hub overview · deploy reliability, throughput, knowledge base"
      footerQuote="Engineering throughput compounds — keep deploy success and lead time honest."
    />
  );
}
