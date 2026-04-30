import { SecOpsContent } from "@/components/workbench/secops/page-content";
import { WorkbenchShell } from "@/components/workbench/shared/workbench-shell";
import { WorkbenchRBACGate } from "@/components/workbench/shared/workbench-rbac-gate";
import { WORKBENCHES } from "@coheronconnect/types";

export const dynamic = "force-dynamic";

const WB = WORKBENCHES.secops;

export default function SecOpsWorkbenchPage() {
  return (
    <WorkbenchRBACGate workbenchKey="secops">
      <WorkbenchShell
        workbenchKey="secops"
        persona={WB.persona}
        accent={WB.accent}
        title={WB.title}
        subtitle={WB.subtitle}
      >
        <SecOpsContent />
      </WorkbenchShell>
    </WorkbenchRBACGate>
  );
}
