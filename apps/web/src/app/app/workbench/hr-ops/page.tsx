import { HrOpsContent } from "@/components/workbench/hr-ops/page-content";
import { WorkbenchShell } from "@/components/workbench/shared/workbench-shell";
import { WorkbenchRBACGate } from "@/components/workbench/shared/workbench-rbac-gate";
import { WORKBENCHES } from "@coheronconnect/types";

export const dynamic = "force-dynamic";

const WB = WORKBENCHES["hr-ops"];

export default function HrOpsWorkbenchPage() {
  return (
    <WorkbenchRBACGate workbenchKey="hr-ops">
      <WorkbenchShell
        workbenchKey="hr-ops"
        persona={WB.persona}
        accent={WB.accent}
        title={WB.title}
        subtitle={WB.subtitle}
      >
        <HrOpsContent />
      </WorkbenchShell>
    </WorkbenchRBACGate>
  );
}
