"use client";

export const dynamic = "force-dynamic";

import { HubCommandCenter } from "@/components/dashboard/hub-command-center-page";

export default function FinanceProcurementHubPage() {
  return (
    <HubCommandCenter
      functionKey="finance"
      title="Finance & Procurement"
      subtitle="Hub overview · cash, AR/AP, procurement, contracts, expense"
      footerQuote="Finance posture is the truth-teller — every other function answers to it eventually."
    />
  );
}
