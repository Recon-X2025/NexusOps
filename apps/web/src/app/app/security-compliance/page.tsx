"use client";

export const dynamic = "force-dynamic";

import { HubCommandCenter } from "@/components/dashboard/hub-command-center-page";

export default function SecurityComplianceHubPage() {
  return (
    <HubCommandCenter
      functionKey="security"
      title="Security & Compliance"
      subtitle="Hub overview · posture across SecOps, GRC, ESG, approvals"
      footerQuote="Risk that isn't measured isn't managed — quantify, then act."
    />
  );
}
