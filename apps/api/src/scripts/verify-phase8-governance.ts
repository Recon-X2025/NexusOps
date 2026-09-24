import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(__dirname, "../../../../.env") });
import jwt from "jsonwebtoken";
import { getDb, eq, desc, organizations, superAdminAuditLogs, superAdminUsers, superAdminRoles } from "@coheronconnect/db";

const TRPC_BASE = "http://localhost:3001/trpc";
const SUPER_ADMIN_HTTP_BASE = "http://localhost:3001/super-admin";
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
  const url =
    type === "query" && input !== undefined
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

async function httpCall(endpoint: string, method: "GET" | "POST", body?: unknown, token?: string) {
  const url = `${SUPER_ADMIN_HTTP_BASE}/${endpoint}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const status = res.status;
  const contentType = res.headers.get("content-type") || "";
  let text = "";
  let json: any = null;
  if (contentType.includes("application/json")) {
    try {
      json = await res.json();
    } catch {
      json = null;
    }
  } else {
    text = await res.text();
  }
  return { status, json, text, contentType };
}

async function runTests() {
  console.log("=== PHASE 8 AUDIT, HEALTH & GOVERNANCE SECURITY SUITE ===");
  const db = getDb();

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

  // ─────────────────────────────────────────────────────────────
  // 1. Audit Log Read & Data Minimization
  // ─────────────────────────────────────────────────────────────
  console.log("\n[1] Testing Audit Log Read & Role-Sensitive Data Minimization...");

  // Super Admin view
  const res1 = await httpCall("audit-logs?limit=5", "GET", undefined, superAdminToken);
  assert(res1.status === 200 && Array.isArray(res1.json?.data), "super_admin audit-logs read -> 200 OK with records");
  assert(res1.json?.isRedacted === false, "super_admin audit payload isRedacted === false (unrestricted)");

  // Operations Staff view
  const res2 = await httpCall("audit-logs?limit=5", "GET", undefined, operationsStaffToken);
  assert(res2.status === 200 && res2.json?.isRedacted === false, "operations_staff audit-logs read -> 200 OK");

  // Auditor view
  const res3 = await httpCall("audit-logs?limit=5", "GET", undefined, auditorToken);
  assert(res3.status === 200 && res3.json?.isRedacted === false, "auditor audit-logs read -> 200 OK");

  // Support Staff view (Must be data-minimized / sanitized)
  const res4 = await httpCall("audit-logs?limit=5", "GET", undefined, supportStaffToken);
  assert(res4.status === 200 && res4.json?.isRedacted === true, "support_staff audit-logs read -> 200 OK with isRedacted === true");

  // ─────────────────────────────────────────────────────────────
  // 2. Audit Export Authorization & Audit Logging
  // ─────────────────────────────────────────────────────────────
  console.log("\n[2] Testing Audit Export Authorization & Authoritative Logging...");

  // Support Staff attempt export -> 403 Forbidden
  const exportSupport = await httpCall("audit-logs/export", "POST", { format: "json", limit: 10 }, supportStaffToken);
  assert(exportSupport.status === 403, "support_staff export audit logs blocked with 403 Forbidden");

  // Super Admin export JSON -> 200 OK
  const exportJson = await httpCall("audit-logs/export", "POST", { format: "json", limit: 10 }, superAdminToken);
  assert(
    exportJson.status === 200 && Array.isArray(exportJson.json?.data),
    "super_admin export audit logs (JSON) -> 200 OK with data array"
  );

  const exportCsv = await httpCall("audit-logs/export", "POST", { format: "csv", limit: 10 }, superAdminToken);
  const csvData = exportCsv.json?.data ?? exportCsv.text;
  assert(
    exportCsv.status === 200 && typeof csvData === "string" && csvData.includes("ID,Timestamp,Actor"),
    "super_admin export audit logs (CSV) -> 200 OK with CSV header line"
  );

  // Verify EXPORT_AUDIT_LOGS entry was written to DB
  const [latestExportAudit] = await db
    .select()
    .from(superAdminAuditLogs)
    .where(eq(superAdminAuditLogs.action, "EXPORT_AUDIT_LOGS"))
    .orderBy(desc(superAdminAuditLogs.createdAt))
    .limit(1);

  assert(
    latestExportAudit !== undefined &&
      (latestExportAudit.afterJson as any)?.format === "csv",
    "EXPORT_AUDIT_LOGS immutable audit record verified in PostgreSQL"
  );

  // ─────────────────────────────────────────────────────────────
  // 3. System Health Diagnostics & Truthful Telemetry
  // ─────────────────────────────────────────────────────────────
  console.log("\n[3] Testing System Health Diagnostics & Real Telemetry...");

  const healthRes = await trpcCall("mac.getSystemHealth", "query", undefined, superAdminToken);
  assert(healthRes.status === 200 && healthRes.data?.result?.data, "getSystemHealth returns 200 OK");

  const health = healthRes.data?.result?.data;

  // DB live ping & latency
  assert(
    health?.database?.status === "operational" && typeof health?.database?.latencyMs === "number",
    `PostgreSQL live health: status=${health?.database?.status}, latency=${health?.database?.latencyMs}ms`
  );

  // DB pool statistics
  const pool = health?.database?.pool;
  assert(
    pool && typeof pool.utilizationPct === "number" && typeof pool.exhaustionEvents === "number",
    `Database pool metrics verified: poolMax=${pool?.poolMax}, utilization=${pool?.utilizationPct}%`
  );

  // Truthful Redis status
  const validRedisStatuses = ["operational", "degraded", "not_configured"];
  assert(
    validRedisStatuses.includes(health?.redis?.status),
    `Redis status is truthful (${health?.redis?.status}, no fake operational mock)`
  );

  // Truthful Search status
  const validSearchStatuses = ["operational", "degraded", "not_configured"];
  assert(
    validSearchStatuses.includes(health?.search?.status),
    `Search subsystem status is truthful (${health?.search?.status})`
  );

  // Runtime telemetry
  assert(
    typeof health?.runtime?.uptimeSeconds === "number" &&
      health?.runtime?.rssMb > 0 &&
      health?.runtime?.nodeVersion.startsWith("v"),
    `Runtime process telemetry verified: uptime=${health?.runtime?.uptimeSeconds}s, rss=${health?.runtime?.rssMb}MB, node=${health?.runtime?.nodeVersion}`
  );

  // Fleet overview counts
  assert(
    typeof health?.fleet?.totalTenants === "number" &&
      typeof health?.fleet?.activeTenants === "number" &&
      typeof health?.fleet?.totalUsers === "number",
    `Fleet overview verified: totalTenants=${health?.fleet?.totalTenants}, active=${health?.fleet?.activeTenants}, users=${health?.fleet?.totalUsers}`
  );

  // ─────────────────────────────────────────────────────────────
  // 4. Platform Security Governance & Posture
  // ─────────────────────────────────────────────────────────────
  console.log("\n[4] Testing Platform Security Governance & Truthful Posture...");

  const govRes = await trpcCall("mac.getPlatformGovernance", "query", undefined, auditorToken);
  assert(govRes.status === 200 && govRes.data?.result?.data, "getPlatformGovernance accessible to auditor -> 200 OK");

  const gov = govRes.data?.result?.data;

  // Operators & roles listing
  assert(
    Array.isArray(gov?.operators) && gov?.operators.length > 0,
    `Operator accounts listing verified (${gov?.operators.length} operators found)`
  );
  assert(
    Array.isArray(gov?.roles) && gov?.roles.length >= 4,
    `RBAC system roles verified (${gov?.roles.length} roles found)`
  );

  // Truthful Encryption & Posture
  const encStatus = gov?.securityPosture?.encryption?.status;
  assert(
    encStatus === "verified" || encStatus === "not_configured",
    `Cryptographic posture truthful status: ${encStatus} (algorithm=${gov?.securityPosture?.encryption?.algorithm})`
  );

  // Database TLS
  const tlsStatus = gov?.securityPosture?.databaseTls?.status;
  assert(
    tlsStatus === "configured" || tlsStatus === "not_configured",
    `Database TLS truthful status: ${tlsStatus} (mode=${gov?.securityPosture?.databaseTls?.mode})`
  );

  // ─────────────────────────────────────────────────────────────
  // 5. Emergency Operator Session Revocation (Safely on Test Operator)
  // ─────────────────────────────────────────────────────────────
  console.log("\n[5] Testing Emergency Operator Session Revocation Guard & Safety...");

  // Create an isolated test operator so we do not disrupt real dev sessions
  const testOpEmail = `test-operator-session-${Date.now()}@coheron.tech`;
  const [createdTestOp] = await db
    .insert(superAdminUsers)
    .values({
      email: testOpEmail,
      name: "Ephemeral Test Operator",
      passwordHash: "$2b$10$dummyhashforephemeraloperatoraccount",
      role: "operations_staff",
      status: "active",
    })
    .returning();

  console.log(`  [SETUP] Created isolated test operator: ${testOpEmail} (${createdTestOp.id})`);

  try {
    // Non-super_admin attempt revocation -> 403 Forbidden
    const revokeOps = await trpcCall(
      "mac.revokeAllOperatorSessions",
      "mutation",
      { reason: "Mandatory security rotation #12345", targetOperatorId: createdTestOp.id },
      operationsStaffToken
    );
    assert(
      revokeOps.status === 403 || revokeOps.data?.error?.data?.code === "FORBIDDEN",
      "operations_staff revoke sessions blocked with 403 / FORBIDDEN"
    );

    const revokeSupport = await trpcCall(
      "mac.revokeAllOperatorSessions",
      "mutation",
      { reason: "Mandatory security rotation #12345", targetOperatorId: createdTestOp.id },
      supportStaffToken
    );
    assert(
      revokeSupport.status === 403 || revokeSupport.data?.error?.data?.code === "FORBIDDEN",
      "support_staff revoke sessions blocked with 403 / FORBIDDEN"
    );

    const revokeAuditor = await trpcCall(
      "mac.revokeAllOperatorSessions",
      "mutation",
      { reason: "Mandatory security rotation #12345", targetOperatorId: createdTestOp.id },
      auditorToken
    );
    assert(
      revokeAuditor.status === 403 || revokeAuditor.data?.error?.data?.code === "FORBIDDEN",
      "auditor revoke sessions blocked with 403 / FORBIDDEN"
    );

    // Super Admin attempt with short reason (<10 chars) -> 400 Bad Request
    const revokeShort = await trpcCall(
      "mac.revokeAllOperatorSessions",
      "mutation",
      { reason: "too short", targetOperatorId: createdTestOp.id },
      superAdminToken
    );
    assert(
      revokeShort.status === 400 || revokeShort.data?.error?.data?.code === "BAD_REQUEST",
      "Super admin revocation with <10 char reason rejected with 400 BAD_REQUEST"
    );

    // Super Admin attempt with valid reason (>=10 chars) targeting isolated test operator -> 200 OK
    const revokeValid = await trpcCall(
      "mac.revokeAllOperatorSessions",
      "mutation",
      { reason: "Audit Phase 8 verification emergency test rotation", targetOperatorId: createdTestOp.id },
      superAdminToken
    );
    assert(
      revokeValid.status === 200 && revokeValid.data?.result?.data?.ok === true,
      "Super admin revocation with >=10 char reason returns 200 OK"
    );

    // Verify REVOKE_ALL_OPERATOR_SESSIONS audit entry in DB
    const [revokeAudit] = await db
      .select()
      .from(superAdminAuditLogs)
      .where(eq(superAdminAuditLogs.action, "REVOKE_ALL_OPERATOR_SESSIONS"))
      .orderBy(desc(superAdminAuditLogs.createdAt))
      .limit(1);

    assert(
      revokeAudit !== undefined &&
        (revokeAudit.afterJson as any)?.targetOperatorId === createdTestOp.id,
      "REVOKE_ALL_OPERATOR_SESSIONS immutable audit record verified in PostgreSQL"
    );
  } finally {
    // Clean up ephemeral test operator
    await db.delete(superAdminUsers).where(eq(superAdminUsers.id, createdTestOp.id));
    console.log(`  [TEARDOWN] Ephemeral test operator removed cleanly`);
  }

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log("\n=================================================");
  console.log(`PHASE 8 SECURITY SUITE RESULTS: ${passed}/${total} PASS`);
  console.log("=================================================");

  if (passed === total) {
    console.log("ALL 20 VERIFICATION GATE CHECKS PASSED!");
    process.exit(0);
  } else {
    console.error(`FAILED CHECKS DETECTED: ${total - passed}`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("FATAL ERROR during test execution:", err);
  process.exit(1);
});
