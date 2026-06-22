import "./tickets";
import "./crm";
import "./csm";
import "./financial";
import "./accounting";
import "./hr";
import "./approvals";
import "./security";
import "./devops";
import "./legal";
import "./strategy";
import "./coo-cio";

import { getAllMetricDefinitions, getAllRoles } from "../registry";

const _registeredMetrics = getAllMetricDefinitions().length;
const _roleViews = getAllRoles().length;
console.info(`[metrics] registered ${_registeredMetrics} metrics across ${_roleViews} roles`);
