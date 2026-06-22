import { FinanceOpsContent } from "@/components/workbench/finance-ops/page-content";
import { WorkbenchShell } from "@/components/workbench/shared/workbench-shell";
import { WorkbenchRBACGate } from "@/components/workbench/shared/workbench-rbac-gate";
import { WORKBENCHES } from "@coheronconnect/types";

export const dynamic = "force-dynamic";

const WB = WORKBENCHES["finance-ops"];

export default function FinanceOpsWorkbenchPage() {
  return (
    <WorkbenchRBACGate workbenchKey="finance-ops">
      <WorkbenchShell
        workbenchKey="finance-ops"
        persona={WB.persona}
        accent={WB.accent}
        title={WB.title}
        subtitle={WB.subtitle}
      >
        <FinanceOpsContent />
      </WorkbenchShell>
    </WorkbenchRBACGate>
  );
}
