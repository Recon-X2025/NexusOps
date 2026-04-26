import { GrcContent } from "@/components/workbench/grc/page-content";
import { WorkbenchShell } from "@/components/workbench/shared/workbench-shell";
import { WorkbenchRBACGate } from "@/components/workbench/shared/workbench-rbac-gate";
import { WORKBENCHES } from "@nexusops/types";

export const dynamic = "force-dynamic";

const WB = WORKBENCHES.grc;

export default function GrcWorkbenchPage() {
  return (
    <WorkbenchRBACGate workbenchKey="grc">
      <WorkbenchShell
        workbenchKey="grc"
        persona={WB.persona}
        accent={WB.accent}
        title={WB.title}
        subtitle={WB.subtitle}
      >
        <GrcContent />
      </WorkbenchShell>
    </WorkbenchRBACGate>
  );
}
