import { ProcurementContent } from "@/components/workbench/procurement/page-content";
import { WorkbenchShell } from "@/components/workbench/shared/workbench-shell";
import { WorkbenchRBACGate } from "@/components/workbench/shared/workbench-rbac-gate";
import { WORKBENCHES } from "@coheronconnect/types";

export const dynamic = "force-dynamic";

const WB = WORKBENCHES.procurement;

export default function ProcurementWorkbenchPage() {
  return (
    <WorkbenchRBACGate workbenchKey="procurement">
      <WorkbenchShell
        workbenchKey="procurement"
        persona={WB.persona}
        accent={WB.accent}
        title={WB.title}
        subtitle={WB.subtitle}
      >
        <ProcurementContent />
      </WorkbenchShell>
    </WorkbenchRBACGate>
  );
}
