import { CompanySecretaryContent } from "@/components/workbench/company-secretary/page-content";
import { WorkbenchShell } from "@/components/workbench/shared/workbench-shell";
import { WorkbenchRBACGate } from "@/components/workbench/shared/workbench-rbac-gate";
import { WORKBENCHES } from "@nexusops/types";

export const dynamic = "force-dynamic";

const WB = WORKBENCHES["company-secretary"];

export default function CompanySecretaryWorkbenchPage() {
  return (
    <WorkbenchRBACGate workbenchKey="company-secretary">
      <WorkbenchShell
        workbenchKey="company-secretary"
        persona={WB.persona}
        accent={WB.accent}
        title={WB.title}
        subtitle={WB.subtitle}
      >
        <CompanySecretaryContent />
      </WorkbenchShell>
    </WorkbenchRBACGate>
  );
}
