import { ServiceDeskContent } from "@/components/workbench/service-desk/page-content";
import { WorkbenchShell } from "@/components/workbench/shared/workbench-shell";
import { WorkbenchRBACGate } from "@/components/workbench/shared/workbench-rbac-gate";
import { WORKBENCHES } from "@nexusops/types";

export const dynamic = "force-dynamic";

const WB = WORKBENCHES["service-desk"];

export default function ServiceDeskWorkbenchPage() {
  return (
    <WorkbenchRBACGate workbenchKey="service-desk">
      <WorkbenchShell
        workbenchKey="service-desk"
        persona={WB.persona}
        accent={WB.accent}
        title={WB.title}
        subtitle={WB.subtitle}
      >
        <ServiceDeskContent />
      </WorkbenchShell>
    </WorkbenchRBACGate>
  );
}
