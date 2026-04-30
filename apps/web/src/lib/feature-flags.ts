/**
 * Client-side feature flags.
 *
 * Read at module load time from `NEXT_PUBLIC_*` env vars so they're inlined
 * into the bundle. Default is OFF for any flag not explicitly enabled, so
 * shipping new code is opt-in until product+ops have signed off.
 */

function envFlag(key: string): boolean {
  return process.env[key] === "true";
}

/**
 * Task board / sprint / story-point UI.
 *
 * CoheronConnect positions Strategy Center as an executive PPM surface, not a
 * Linear/Jira competitor. The agile board, sprint field, and story points
 * exist in the schema and tRPC layer but are hidden from the UI by default.
 * Customers who want them can flip the flag; the default product surface
 * focuses on initiatives, portfolio shape, milestones, and dependencies.
 */
export const TASK_BOARD_ENABLED: boolean = envFlag("NEXT_PUBLIC_ENABLE_TASK_BOARD");

/**
 * DevOps / CI-CD / pipelines / DORA telemetry surface.
 *
 * The default CoheronConnect surface stops at the change-management boundary —
 * pipeline / deployment telemetry belongs in GitHub / GitLab / Jenkins /
 * Azure DevOps, and tenants in our segment do not buy a separate dashboard
 * for it. The router and schema remain available; the UI is hidden until
 * a tenant explicitly opts in.
 */
export const DEVOPS_ENABLED: boolean = envFlag("NEXT_PUBLIC_ENABLE_DEVOPS");

/**
 * Application Portfolio Management — full enterprise-architecture surface
 * (lifecycle, tech-debt, cloud-readiness, capability map).
 *
 * The default surface ships a lightweight "App Inventory" only — name,
 * owner, vendor, annual cost, renewal — which is what mid-market tenants
 * actually need. The deeper EA tabs are useful at >1k-employee scale and
 * are gated behind this flag.
 */
export const APM_ENABLED: boolean = envFlag("NEXT_PUBLIC_ENABLE_APM");
