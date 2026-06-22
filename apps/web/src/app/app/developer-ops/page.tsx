"use client";

export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { HubCommandCenter } from "@/components/dashboard/hub-command-center-page";
import { DEVOPS_ENABLED } from "@/lib/feature-flags";

export default function DeveloperOpsHubPage() {
  if (!DEVOPS_ENABLED) notFound();
  return (
    <HubCommandCenter
      functionKey="devops"
      title="Developer & Ops"
      subtitle="Hub overview · deploy reliability, throughput, knowledge base"
      footerQuote="Engineering throughput compounds — keep deploy success and lead time honest."
    />
  );
}
