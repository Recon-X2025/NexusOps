"use client";

export const dynamic = "force-dynamic";

import { HubCommandCenter } from "@/components/dashboard/hub-command-center-page";

export default function ITServicesHubPage() {
  return (
    <HubCommandCenter
      functionKey="it_services"
      title="IT Services"
      subtitle="Hub overview · ITSM control tower scoped to incidents, changes, work orders, assets"
      footerQuote="When ITSM metrics connect incidents, changes, and assets, service reliability becomes measurable."
    />
  );
}
