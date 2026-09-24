import { RouterProvider, useRouter } from './lib/router';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuditProvider } from './context/AuditContext';
import { WizardProvider } from './context/WizardContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { SetupWizardMonitor } from './pages/SetupWizardMonitor';
import { AuditLogPage } from './pages/AuditLogPage';
import { SystemHealthPage } from './pages/SystemHealthPage';
import {
  TenantsPage, UsersRolesPage, ItsmModulePage, AssetsModulePage, HrModulePage,
  ProcurementModulePage, BillingPage, WorkflowsPage, ComplianceGrcPage, SettingsPage,
  DashboardOverviewPage, GlobalUsersPage, FeatureFlagsPage, ImpersonationsPage,
} from './pages/StubPages';
import { DpdpPage } from './pages/DpdpPage';
import { GrcRisksPage } from './pages/GrcRisksPage';

const ROUTES: Record<string, () => JSX.Element> = {
  // Platform
  '/': DashboardOverviewPage,

  // Tenant Management
  '/tenants': TenantsPage,
  '/setup-wizard-monitor': SetupWizardMonitor,
  '/users/global': GlobalUsersPage,
  '/users': GlobalUsersPage,

  // Security & Compliance
  '/compliance-grc': ComplianceGrcPage,
  '/compliance/dpdp': DpdpPage,
  '/compliance/grc-risks': GrcRisksPage,

  // SaaS Monetization
  '/billing': BillingPage,
  '/modules/finance': BillingPage, // backward compatibility alias

  // Platform Operations
  '/users-roles': UsersRolesPage,
  '/feature-flags': FeatureFlagsPage,
  '/system-health': SystemHealthPage,

  // Audit & Support
  '/audit-log': AuditLogPage,
  '/impersonations': ImpersonationsPage,

  // System
  '/settings': SettingsPage,

  // Preserved customer module routes for safety
  '/modules/itsm': ItsmModulePage,
  '/modules/assets': AssetsModulePage,
  '/modules/hr': HrModulePage,
  '/modules/procurement': ProcurementModulePage,
  '/workflows': WorkflowsPage,
};

function AppRoutes() {
  const { path } = useRouter();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (path === '/login') {
    return (
      <Layout>
        <DashboardOverviewPage />
      </Layout>
    );
  }

  const Page = ROUTES[path];
  if (Page) {
    return (
      <Layout>
        <Page />
      </Layout>
    );
  }

  return (
    <Layout>
      <DashboardOverviewPage />
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <RouterProvider>
        <AuthProvider>
          <AuditProvider>
            <WizardProvider>
              <AppRoutes />
            </WizardProvider>
          </AuditProvider>
        </AuthProvider>
      </RouterProvider>
    </ThemeProvider>
  );
}
