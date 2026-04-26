import { RecruiterContent } from "@/components/workbench/recruiter/page-content";
import { WorkbenchShell } from "@/components/workbench/shared/workbench-shell";
import { WorkbenchRBACGate } from "@/components/workbench/shared/workbench-rbac-gate";
import { WORKBENCHES } from "@nexusops/types";

export const dynamic = "force-dynamic";

const WB = WORKBENCHES.recruiter;

export default function RecruiterWorkbenchPage() {
  return (
    <WorkbenchRBACGate workbenchKey="recruiter">
      <WorkbenchShell
        workbenchKey="recruiter"
        persona={WB.persona}
        accent={WB.accent}
        title={WB.title}
        subtitle={WB.subtitle}
      >
        <RecruiterContent />
      </WorkbenchShell>
    </WorkbenchRBACGate>
  );
}
