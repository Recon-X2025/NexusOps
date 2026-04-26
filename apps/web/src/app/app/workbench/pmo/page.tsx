import { PmoContent } from "@/components/workbench/pmo/page-content";
import { WorkbenchShell } from "@/components/workbench/shared/workbench-shell";
import { WorkbenchRBACGate } from "@/components/workbench/shared/workbench-rbac-gate";
import { WORKBENCHES } from "@nexusops/types";

export const dynamic = "force-dynamic";

const WB = WORKBENCHES.pmo;

export default function PmoWorkbenchPage() {
  return (
    <WorkbenchRBACGate workbenchKey="pmo">
      <WorkbenchShell
        workbenchKey="pmo"
        persona={WB.persona}
        accent={WB.accent}
        title={WB.title}
        subtitle={WB.subtitle}
      >
        <PmoContent />
      </WorkbenchShell>
    </WorkbenchRBACGate>
  );
}
