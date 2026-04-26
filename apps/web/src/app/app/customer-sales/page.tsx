"use client";

export const dynamic = "force-dynamic";

import { HubCommandCenter } from "@/components/dashboard/hub-command-center-page";

export default function CustomerSalesHubPage() {
  return (
    <HubCommandCenter
      functionKey="customer"
      title="Customer & Sales"
      subtitle="Hub overview · CSM, CRM, service catalog, surveys"
      footerQuote="Customer signals lead revenue — read them before the quarter, not after."
    />
  );
}
