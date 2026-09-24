import {
  Users, Ticket, Boxes, Package, Workflow,
  LayoutDashboard,
} from 'lucide-react';
import { StubPageWithIcon } from '../components/StubPage';

export { TenantsPage } from './TenantsPage';
export { UsersRolesPage } from './UsersRolesPage';
export { ComplianceGrcPage } from './ComplianceGrcPage';
export { FinanceModulePage as BillingPage, FinanceModulePage } from './FinanceModulePage';
export { ImpersonationsPage } from './ImpersonationsPage';


// ── Phase 1 Operational Stubs ──

export function DashboardOverviewPage() {
  return (
    <StubPageWithIcon
      title="Platform Dashboard"
      subtitle="Executive single-pane-of-glass overview across tenants, revenue, compliance, and infrastructure"
      icon={<LayoutDashboard className="h-7 w-7" />}
      message="Fleet telemetry, MRR/ARR metrics, critical statutory alerts, and real-time infrastructure indicators will be orchestrated here."
    />
  );
}

export { GlobalUsersPage } from './GlobalUsersPage';

export { DpdpPage } from './DpdpPage';
export { GrcRisksPage } from './GrcRisksPage';

export { FeatureFlagsPage } from './FeatureFlagsPage';


export { SettingsPage } from './SettingsPage';

// ── Legacy Customer Module Stubs (Preserved for Safety, Removed from Sidebar) ──

export function ItsmModulePage() {
  return <StubPageWithIcon title="ITSM" subtitle="IT Service Management module overview" icon={<Ticket className="h-7 w-7" />} message="Tickets, SLAs, and incident queues across tenants will be surfaced here." />;
}
export function AssetsModulePage() {
  return <StubPageWithIcon title="Assets" subtitle="Asset management module overview" icon={<Boxes className="h-7 w-7" />} message="Asset registers, depreciation runs, and audits will live here." />;
}
export function HrModulePage() {
  return <StubPageWithIcon title="HR" subtitle="Human Resources module overview" icon={<Users className="h-7 w-7" />} message="Employee records, payroll cycles, and leave policies will appear here." />;
}
export function ProcurementModulePage() {
  return <StubPageWithIcon title="Procurement" subtitle="Procurement module overview" icon={<Package className="h-7 w-7" />} message="Purchase orders, vendor management, and approvals will live here." />;
}
export function WorkflowsPage() {
  return <StubPageWithIcon title="Workflows" subtitle="Temporal / BullMQ workflow orchestration" icon={<Workflow className="h-7 w-7" />} message="Active workflow runs, retries, and dead-letter queues will appear here." />;
}

