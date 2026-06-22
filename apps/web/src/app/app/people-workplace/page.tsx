"use client";

export const dynamic = "force-dynamic";

import { HubCommandCenter } from "@/components/dashboard/hub-command-center-page";

export default function PeopleWorkplaceHubPage() {
  return (
    <HubCommandCenter
      functionKey="people"
      title="People & Workplace"
      subtitle="Hub overview · workforce health, recruitment, performance, facilities"
      footerQuote="When the people signals connect, retention and productivity move together."
    />
  );
}
