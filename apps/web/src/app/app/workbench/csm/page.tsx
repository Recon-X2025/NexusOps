import { CsmContent } from "@/components/workbench/csm/page-content";
import { WorkbenchShell } from "@/components/workbench/shared/workbench-shell";
import { WorkbenchRBACGate } from "@/components/workbench/shared/workbench-rbac-gate";
import { WORKBENCHES } from "@coheronconnect/types";

export const dynamic = "force-dynamic";

const WB = WORKBENCHES.csm;

export default function CsmWorkbenchPage() {
  return (
    <WorkbenchRBACGate workbenchKey="csm">
      <WorkbenchShell
        workbenchKey="csm"
        persona={WB.persona}
        accent={WB.accent}
        title={WB.title}
        subtitle={WB.subtitle}
      >
        <CsmContent />
      </WorkbenchShell>
    </WorkbenchRBACGate>
  );
}
