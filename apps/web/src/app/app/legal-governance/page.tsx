"use client";

export const dynamic = "force-dynamic";

import { HubCommandCenter } from "@/components/dashboard/hub-command-center-page";

export default function LegalGovernanceHubPage() {
  return (
    <HubCommandCenter
      functionKey="legal"
      title="Legal & Governance"
      subtitle="Hub overview · matters, contracts, secretarial, compliance calendar"
      footerQuote="Legal hygiene is invisible until it isn't — surface the lagging signals early."
    />
  );
}
