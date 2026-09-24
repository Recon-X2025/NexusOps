import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(__dirname, "../../../../.env") });
import jwt from "jsonwebtoken";
import { getDb, eq, desc, organizations, superAdminAuditLogs } from "@coheronconnect/db";

const API_BASE = "http://localhost:3001";
const TRPC_BASE = "http://localhost:3001/trpc";
const macSecret = process.env["MAC_JWT_SECRET"] || "mac-local-dev-secret-key";

function mintToken(operatorRole: string) {
  return jwt.sign(
    { email: `operator-${operatorRole}@coheron.tech`, role: "mac_operator", operatorRole },
    macSecret,
    { expiresIn: "1h" }
  );
}

const supportStaffToken = mintToken("support_staff");
const operationsStaffToken = mintToken("operations_staff");
const auditorToken = mintToken("auditor");
const superAdminToken = mintToken("super_admin");

async function runTests() {
  console.log("=== PHASE 6 SUBSCRIPTIONS & BILLING SECURITY SUITE ===");
  const db = getDb();

  // Find a test organization
  const [testOrg] = await db.select().from(organizations).limit(1);
  if (!testOrg) {
    throw new Error("No organization found in database for testing.");
  }
  const orgId = testOrg.id;
  const originalPlan = testOrg.plan;
  const originalSettings = (testOrg.settings ?? {}) as Record<string, unknown>;
  const originalStatus = (originalSettings.subscriptionStatus as string) ?? "active";
  console.log(`[SETUP] Using target Org ID: ${orgId} (${testOrg.name}), Plan: ${originalPlan}, Status: ${originalStatus}`);

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, label: string) {
    total++;
    if (condition) {
      console.log(`  [PASS] ${label}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${label}`);
    }
  }

  // TEST 1: support_staff GET /super-admin/finance/overview -> 403
  console.log("\n[1] Testing GET /super-admin/finance/overview RBAC...");
  const res1 = await fetch(`${API_BASE}/super-admin/finance/overview`, {
    headers: { Authorization: `Bearer ${supportStaffToken}` },
  });
  assert(res1.status === 403, `support_staff overview returns 403 Forbidden (got ${res1.status})`);

  // TEST 2: auditor GET /super-admin/finance/overview -> 200
  const res2 = await fetch(`${API_BASE}/super-admin/finance/overview`, {
    headers: { Authorization: `Bearer ${auditorToken}` },
  });
  const data2 = await res2.json() as any;
  assert(res2.status === 200 && data2.data?.subscriptions?.length > 0, `auditor overview returns 200 OK with subscriptions`);

  // TEST 3: operations_staff GET /super-admin/finance/overview -> 200
  const res3 = await fetch(`${API_BASE}/super-admin/finance/overview`, {
    headers: { Authorization: `Bearer ${operationsStaffToken}` },
  });
  assert(res3.status === 200, `operations_staff overview returns 200 OK`);

  // TEST 4: support_staff tRPC mac.getBillingInfo -> 403
  console.log("\n[2] Testing tRPC mac.getBillingInfo RBAC...");
  const res4 = await fetch(`${TRPC_BASE}/mac.getBillingInfo?input=${encodeURIComponent(JSON.stringify({ orgId }))}`, {
    headers: { Authorization: `Bearer ${supportStaffToken}` },
  });
  const data4 = await res4.json() as any;
  assert(res4.status === 403 || data4.error?.data?.code === "FORBIDDEN", `support_staff tRPC getBillingInfo returns 403 / FORBIDDEN`);

  // TEST 5: auditor PUT /super-admin/finance/subscriptions/:orgId -> 403
  console.log("\n[3] Testing PUT /super-admin/finance/subscriptions/:orgId RBAC...");
  const res5 = await fetch(`${API_BASE}/super-admin/finance/subscriptions/${orgId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${auditorToken}` },
    body: JSON.stringify({ plan: "enterprise", reason: "Attempted override by auditor" }),
  });
  assert(res5.status === 403, `auditor PUT subscription returns 403 Forbidden (got ${res5.status})`);

  // TEST 6: operations_staff PUT /super-admin/finance/subscriptions/:orgId -> 403
  const res6 = await fetch(`${API_BASE}/super-admin/finance/subscriptions/${orgId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${operationsStaffToken}` },
    body: JSON.stringify({ plan: "enterprise", reason: "Attempted override by operations" }),
  });
  assert(res6.status === 403, `operations_staff PUT subscription returns 403 Forbidden (got ${res6.status})`);

  // TEST 7: operations_staff tRPC mac.updateBillingInfo -> 403
  console.log("\n[4] Testing tRPC mac.updateBillingInfo RBAC...");
  const res7 = await fetch(`${TRPC_BASE}/mac.updateBillingInfo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${operationsStaffToken}` },
    body: JSON.stringify({ orgId, plan: "enterprise", reason: "Attempted override by operations" }),
  });
  const data7 = await res7.json() as any;
  assert(res7.status === 403 || data7.error?.data?.code === "FORBIDDEN", `operations_staff tRPC updateBillingInfo returns 403 / FORBIDDEN`);

  // TEST 8: super_admin short reason (<10 chars) -> 400
  console.log("\n[5] Testing Mandatory Reason Validation...");
  const res8 = await fetch(`${API_BASE}/super-admin/finance/subscriptions/${orgId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${superAdminToken}` },
    body: JSON.stringify({ plan: "starter", reason: "short" }),
  });
  assert(res8.status === 400, `super_admin short reason (<10 chars) returns 400 Validation Error (got ${res8.status})`);

  // TEST 9: super_admin valid reason (>= 10 chars) -> 200 + Audit Log check
  console.log("\n[6] Testing Valid Super Admin Override & Audit Trail...");
  const validReason = "Test override: contract upgraded via enterprise negotiation";
  const tempPlan = originalPlan === "enterprise" ? "professional" : "enterprise";

  const res9 = await fetch(`${API_BASE}/super-admin/finance/subscriptions/${orgId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${superAdminToken}` },
    body: JSON.stringify({ plan: tempPlan, reason: validReason }),
  });
  const data9 = await res9.json() as any;
  assert(res9.status === 200 && data9.ok === true, `super_admin valid override returns 200 OK`);

  // Verify Audit Log
  const [latestAudit] = await db
    .select()
    .from(superAdminAuditLogs)
    .where(eq(superAdminAuditLogs.orgId, orgId))
    .orderBy(desc(superAdminAuditLogs.createdAt))
    .limit(1);

  assert(
    latestAudit?.action === "OVERRIDE_SUBSCRIPTION" &&
    (latestAudit?.afterJson as any)?.reason === validReason &&
    (latestAudit?.afterJson as any)?.plan === tempPlan,
    `PostgreSQL audit log records action OVERRIDE_SUBSCRIPTION with before/after state and reason`
  );

  // RESTORE ORIGINAL STATE (CRITICAL)
  console.log("\n[7] Restoring test organization to original pristine state...");
  const restoreRes = await fetch(`${API_BASE}/super-admin/finance/subscriptions/${orgId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${superAdminToken}` },
    body: JSON.stringify({
      plan: originalPlan,
      subscriptionStatus: originalStatus,
      stripeCustomerId: (originalSettings.stripeCustomerId as string) || undefined,
      trialEndsAt: (originalSettings.trialEndsAt as string) || null,
      reason: "Restoring organization to original pristine state after verification test suite",
    }),
  });
  assert(restoreRes.status === 200, `Organization restored successfully to original plan '${originalPlan}'`);

  const [restoredOrg] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  assert(restoredOrg?.plan === originalPlan, `Verified live database has original plan '${originalPlan}'`);

  console.log(`\n=== RESULTS: ${passed}/${total} TESTS PASSED ===\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test Suite Fatal Error:", err);
  process.exit(1);
});
