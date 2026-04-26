import { FieldServiceContent } from "@/components/workbench/field-service/page-content";
import { WorkbenchShell } from "@/components/workbench/shared/workbench-shell";
import { WorkbenchRBACGate } from "@/components/workbench/shared/workbench-rbac-gate";
import { WORKBENCHES } from "@nexusops/types";

export const dynamic = "force-dynamic";

const WB = WORKBENCHES["field-service"];

export default function FieldServiceWorkbenchPage() {
  return (
    <WorkbenchRBACGate workbenchKey="field-service">
      <WorkbenchShell
        workbenchKey="field-service"
        persona={WB.persona}
        accent={WB.accent}
        title={WB.title}
        subtitle={WB.subtitle}
      >
        <FieldServiceContent />
      </WorkbenchShell>
    </WorkbenchRBACGate>
  );
}
