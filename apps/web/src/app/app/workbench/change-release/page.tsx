import { ChangeReleaseContent } from "@/components/workbench/change-release/page-content";
import { WorkbenchShell } from "@/components/workbench/shared/workbench-shell";
import { WorkbenchRBACGate } from "@/components/workbench/shared/workbench-rbac-gate";
import { WORKBENCHES } from "@nexusops/types";

export const dynamic = "force-dynamic";

const WB = WORKBENCHES["change-release"];

export default function ChangeReleaseWorkbenchPage() {
  return (
    <WorkbenchRBACGate workbenchKey="change-release">
      <WorkbenchShell
        workbenchKey="change-release"
        persona={WB.persona}
        accent={WB.accent}
        title={WB.title}
        subtitle={WB.subtitle}
      >
        <ChangeReleaseContent />
      </WorkbenchShell>
    </WorkbenchRBACGate>
  );
}
