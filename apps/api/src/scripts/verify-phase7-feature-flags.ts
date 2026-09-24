import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(__dirname, "../../../../.env") });
import jwt from "jsonwebtoken";
import { getDb, eq, desc, organizations, superAdminAuditLogs } from "@coheronconnect/db";

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

async function trpcCall(procedure: string, type: "query" | "mutation", input?: unknown, token?: string) {
  const url = type === "query" && input !== undefined
    ? `${TRPC_BASE}/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`
    : `${TRPC_BASE}/${procedure}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: type === "mutation" ? "POST" : "GET",
    headers,
    body: type === "mutation" ? JSON.stringify(input ?? {}) : undefined,
  });

  const status = res.status;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status, data };
}

async function runTests() {
  console.log("=== PHASE 7 FEATURE FLAGS CONTROL MATRIX SECURITY SUITE ===");
  const db = getDb();

  // Find a test organization
  const [testOrg] = await db.select().from(organizations).limit(1);
  if (!testOrg) {
    throw new Error("No organization found in database for testing.");
  }
  const orgId = testOrg.id;
  const originalSettings = (testOrg.settings ?? {}) as Record<string, unknown>;
  const originalFlags = { ...((originalSettings.featureFlags ?? {}) as Record<string, boolean>) };
  console.log(`[SETUP] Target Org: ${testOrg.name} (${orgId}), Initial Overrides:`, originalFlags);

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

  // TEST 1: support_staff view feature flags -> 200 OK (tenantsView allowed)
  console.log("\n[1] Testing View Permissions (tenantsView)...");
  const res1 = await trpcCall("mac.getFeatureFlags", "query", { orgId }, supportStaffToken);
  assert(res1.status === 200 && res1.data?.result?.data, `support_staff view feature flags returns 200 OK`);

  // TEST 2: auditor view detailed feature flags -> 200 OK with matrix items
  const res2 = await trpcCall("mac.getFeatureFlags", "query", { orgId, detailed: true }, auditorToken);
  assert(
    res2.status === 200 && Array.isArray(res2.data?.result?.data?.flags),
    `auditor view detailed matrix returns 200 OK with flags array`
  );

  // TEST 3: platform baseline query without orgId -> 200 OK
  const res3 = await trpcCall("mac.getFeatureFlags", "query", { detailed: true }, superAdminToken);
  assert(
    res3.status === 200 && res3.data?.result?.data?.mode === "platform_defaults",
    `platform baseline query returns 200 OK with tier catalog`
  );

  // TEST 4: support_staff setFeatureFlag -> 403 FORBIDDEN
  console.log("\n[2] Testing Mutation Restrictions (tenantsManage Guard)...");
  const res4 = await trpcCall(
    "mac.setFeatureFlag",
    "mutation",
    { orgId, flag: "ai_features", enabled: true },
    supportStaffToken
  );
  assert(
    res4.status === 403 || res4.data?.error?.data?.code === "FORBIDDEN",
    `support_staff setFeatureFlag blocked with 403 / FORBIDDEN`
  );

  // TEST 5: auditor setFeatureFlag -> 403 FORBIDDEN
  const res5 = await trpcCall(
    "mac.setFeatureFlag",
    "mutation",
    { orgId, flag: "ai_features", enabled: true },
    auditorToken
  );
  assert(
    res5.status === 403 || res5.data?.error?.data?.code === "FORBIDDEN",
    `auditor setFeatureFlag blocked with 403 / FORBIDDEN`
  );

  // TEST 6: auditor resetFeatureFlag -> 403 FORBIDDEN
  const res6 = await trpcCall(
    "mac.resetFeatureFlag",
    "mutation",
    { orgId, flag: "ai_features" },
    auditorToken
  );
  assert(
    res6.status === 403 || res6.data?.error?.data?.code === "FORBIDDEN",
    `auditor resetFeatureFlag blocked with 403 / FORBIDDEN`
  );

  // TEST 7: auditor resetFeatureFlags -> 403 FORBIDDEN
  const res7 = await trpcCall(
    "mac.resetFeatureFlags",
    "mutation",
    { orgId },
    auditorToken
  );
  assert(
    res7.status === 403 || res7.data?.error?.data?.code === "FORBIDDEN",
    `auditor resetFeatureFlags blocked with 403 / FORBIDDEN`
  );

  // TEST 8: operations_staff setFeatureFlag -> 200 OK (tenantsManage allowed)
  console.log("\n[3] Testing Authorized Mutations (operations_staff & super_admin)...");
  const res8 = await trpcCall(
    "mac.setFeatureFlag",
    "mutation",
    { orgId, flag: "ai_features", enabled: true, reason: "Operations pilot rollout" },
    operationsStaffToken
  );
  assert(res8.status === 200 && res8.data?.result?.data?.ok === true, `operations_staff setFeatureFlag allowed with 200 OK`);

  // TEST 9: super_admin setFeatureFlag -> 200 OK
  const res9 = await trpcCall(
    "mac.setFeatureFlag",
    "mutation",
    { orgId, flag: "custom_branding", enabled: true, reason: "Super admin custom branding override" },
    superAdminToken
  );
  assert(res9.status === 200 && res9.data?.result?.data?.ok === true, `super_admin setFeatureFlag allowed with 200 OK`);

  // TEST 10: Verify Audit Log in Postgres
  console.log("\n[4] Verifying Audit Trail in Database...");
  const [latestAudit] = await db
    .select()
    .from(superAdminAuditLogs)
    .where(eq(superAdminAuditLogs.orgId, orgId))
    .orderBy(desc(superAdminAuditLogs.createdAt))
    .limit(1);

  assert(
    latestAudit?.action === "mac.setFeatureFlag" &&
    (latestAudit?.afterJson as any)?.flag === "custom_branding" &&
    (latestAudit?.afterJson as any)?.reason === "Super admin custom branding override",
    `PostgreSQL audit log records action mac.setFeatureFlag with flag and reason`
  );

  // TEST 11: super_admin reset single feature flag -> 200 OK
  console.log("\n[5] Testing Reset Operations...");
  const res11 = await trpcCall(
    "mac.resetFeatureFlag",
    "mutation",
    { orgId, flag: "custom_branding", reason: "Reverting branding override" },
    superAdminToken
  );
  assert(res11.status === 200 && res11.data?.result?.data?.ok === true, `super_admin reset single flag allowed with 200 OK`);

  const [resetAudit] = await db
    .select()
    .from(superAdminAuditLogs)
    .where(eq(superAdminAuditLogs.orgId, orgId))
    .orderBy(desc(superAdminAuditLogs.createdAt))
    .limit(1);

  assert(
    resetAudit?.action === "mac.resetFeatureFlag" &&
    (resetAudit?.afterJson as any)?.flag === "custom_branding" &&
    (resetAudit?.afterJson as any)?.reason === "Reverting branding override",
    `PostgreSQL audit log records action mac.resetFeatureFlag with flag and reason`
  );

  // TEST 12: Restore test organization to pristine initial state
  console.log("\n[6] Restoring test organization to pristine state...");
  await db
    .update(organizations)
    .set({
      settings: { ...originalSettings, featureFlags: originalFlags },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  const [restoredOrg] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const restoredSettings = (restoredOrg?.settings ?? {}) as Record<string, unknown>;
  const restoredFlags = (restoredSettings.featureFlags ?? {}) as Record<string, boolean>;

  assert(
    JSON.stringify(restoredFlags) === JSON.stringify(originalFlags),
    `Verified test tenant featureFlags restored to pristine original state`
  );

  console.log(`\n=== RESULTS: ${passed}/${total} TESTS PASSED ===\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test Suite Fatal Error:", err);
  process.exit(1);
});
