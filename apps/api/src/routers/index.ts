import { router } from "../lib/trpc";
import { authRouter } from "./auth";
import { adminRouter } from "./admin";
import { ticketsRouter } from "./tickets";
import { assetsRouter } from "./assets";
import { workflowsRouter } from "./workflows";
import { hrRouter } from "./hr";
import { procurementRouter } from "./procurement";
import { dashboardRouter } from "./dashboard";
import { workOrdersRouter } from "./work-orders";
import { changesRouter } from "./changes";
import { securityRouter } from "./security";
import { grcRouter } from "./grc";
import { financialRouter } from "./financial";
import { contractsRouter } from "./contracts";
import { projectsRouter } from "./projects";
import { crmRouter } from "./crm";
import { legalRouter } from "./legal";
import { devopsRouter } from "./devops";
import { surveysRouter } from "./surveys";
import { knowledgeRouter } from "./knowledge";
import { notificationsRouter } from "./notifications";
import { catalogRouter } from "./catalog";
import { csmRouter } from "./csm";
import { apmRouter } from "./apm";
import { oncallRouter } from "./oncall";
import { eventsRouter } from "./events";
import { facilitiesRouter } from "./facilities";
import { walkupRouter } from "./walkup";
import { vendorsRouter } from "./vendors";
import { approvalsRouter } from "./approvals";
import { reportsRouter } from "./reports";
import { searchRouter } from "./search";
import { aiRouter } from "./ai";
import { recruitmentRouter } from "./recruitment";
import { secretarialRouter } from "./secretarial";
import { workforceRouter } from "./workforce";
import { indiaComplianceRouter } from "./india-compliance";
import { inventoryRouter } from "./inventory";
import { assignmentRulesRouter } from "./assignment-rules";
import { integrationsRouter } from "./integrations";
import { macRouter } from "./mac";
import { expensesRouter } from "./expenses";
import { performanceRouter } from "./performance";

export const appRouter = router({
  mac: macRouter,
  auth: authRouter,
  admin: adminRouter,
  tickets: ticketsRouter,
  assets: assetsRouter,
  workflows: workflowsRouter,
  hr: hrRouter,
  procurement: procurementRouter,
  dashboard: dashboardRouter,
  workOrders: workOrdersRouter,
  // Phase 2 routers
  changes: changesRouter,
  security: securityRouter,
  grc: grcRouter,
  financial: financialRouter,
  contracts: contractsRouter,
  projects: projectsRouter,
  crm: crmRouter,
  legal: legalRouter,
  devops: devopsRouter,
  surveys: surveysRouter,
  knowledge: knowledgeRouter,
  notifications: notificationsRouter,
  catalog: catalogRouter,
  // Phase 3 routers
  csm: csmRouter,
  apm: apmRouter,
  oncall: oncallRouter,
  events: eventsRouter,
  facilities: facilitiesRouter,
  walkup: walkupRouter,
  vendors: vendorsRouter,
  approvals: approvalsRouter,
  reports: reportsRouter,
  search: searchRouter,
  ai: aiRouter,
  // India compliance routers
  indiaCompliance: indiaComplianceRouter,
  assignmentRules: assignmentRulesRouter,
  inventory: inventoryRouter,
  // Phase 3 True Modules
  recruitment: recruitmentRouter,
  secretarial: secretarialRouter,
  workforce: workforceRouter,
  integrations: integrationsRouter,
  // Phase 4 Modules
  expenses: expensesRouter,
  performance: performanceRouter,
});

export type AppRouter = typeof appRouter;
