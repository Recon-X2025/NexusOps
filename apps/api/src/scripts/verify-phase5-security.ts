import { config } from "dotenv";
config({ path: "../../.env" });
import jwt from "jsonwebtoken";

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
const auditorToken = mintToken("auditor");
const superAdminToken = mintToken("super_admin");

async function trpcCall(procedure: string, type: "query" | "mutation", input?: unknown, token?: string) {
  const url = type === "query" && input !== undefined
    ? `${TRPC_BASE}/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`
    : `${TRPC_BASE}/${procedure}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

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
  console.log("=================================================");
  console.log("🔒 PHASE 5 SECURITY & RBAC VERIFICATION SUITE");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`, detail ?? "");
      failed++;
    }
  }

  // 1. Unauthenticated checks
  console.log("--- 1. UNAUTHENTICATED CALLS ---");
  const unauthRes = await trpcCall("mac.searchUsers", "query", { limit: 10 });
  assert(unauthRes.status === 401, "Unauthenticated mac.searchUsers returns 401", unauthRes);

  const badTokenRes = await trpcCall("mac.searchUsers", "query", { limit: 10 }, "invalid.jwt.token");
  assert(badTokenRes.status === 401, "Invalid token mac.searchUsers returns 401", badTokenRes);

  // 2. Support Staff Guard (usersView denied)
  console.log("\n--- 2. SUPPORT STAFF (usersView GUARD) ---");
  const ssSearch = await trpcCall("mac.searchUsers", "query", { limit: 10 }, supportStaffToken);
  assert(
    ssSearch.status === 403 && ssSearch.data?.error?.message?.includes("usersView"),
    "Support Staff blocked from mac.searchUsers (403 FORBIDDEN)",
    ssSearch
  );

  const ssLogout = await trpcCall(
    "mac.forceLogoutUser",
    "mutation",
    { userId: "00000000-0000-0000-0000-000000000000", reason: "Valid reason for test that has 10 chars" },
    supportStaffToken
  );
  assert(
    ssLogout.status === 403,
    "Support Staff blocked from mac.forceLogoutUser (403 FORBIDDEN)",
    ssLogout
  );

  // 3. Auditor Guard (usersManage denied)
  console.log("\n--- 3. AUDITOR GUARD (usersManage GUARD) ---");
  const auditorSearch = await trpcCall("mac.searchUsers", "query", { limit: 10 }, auditorToken);
  assert(
    auditorSearch.status === 200,
    "Auditor allowed to read directory via mac.searchUsers (200 OK)",
    auditorSearch
  );

  const auditorLogout = await trpcCall(
    "mac.forceLogoutUser",
    "mutation",
    { userId: "00000000-0000-0000-0000-000000000000", reason: "Valid reason for test that has 10 chars" },
    auditorToken
  );
  assert(
    auditorLogout.status === 403 && auditorLogout.data?.error?.message?.includes("usersManage"),
    "Auditor blocked from mac.forceLogoutUser (403 FORBIDDEN)",
    auditorLogout
  );

  const auditorStatus = await trpcCall(
    "mac.updateUserStatus",
    "mutation",
    {
      userId: "00000000-0000-0000-0000-000000000000",
      status: "disabled",
      reason: "Valid reason for test that has 10 chars",
    },
    auditorToken
  );
  assert(
    auditorStatus.status === 403 && auditorStatus.data?.error?.message?.includes("usersManage"),
    "Auditor blocked from mac.updateUserStatus (403 FORBIDDEN)",
    auditorStatus
  );

  // 4. Super Admin Operations & Data Minimization
  console.log("\n--- 4. SUPER ADMIN & STRICT DATA MINIMIZATION ---");
  const saSearch = await trpcCall("mac.searchUsers", "query", { limit: 5 }, superAdminToken);
  assert(saSearch.status === 200, "Super Admin searchUsers succeeds (200 OK)", saSearch);

  const usersList: any[] = saSearch.data?.result?.data?.users ?? [];
  console.log(`Found ${usersList.length} users in search.`);

  if (usersList.length > 0) {
    const firstUser = usersList[0];
    const hasPasswordHash = "passwordHash" in firstUser;
    const hasResetToken = "resetToken" in firstUser;
    const hasSecrets = "secret" in firstUser || "apiKey" in firstUser;
    assert(
      !hasPasswordHash && !hasResetToken && !hasSecrets,
      "Strict data minimization: passwordHash, reset tokens, and secrets are EXCLUDED",
      { firstUser }
    );
    assert(
      "id" in firstUser && "email" in firstUser && "orgId" in firstUser && "orgName" in firstUser,
      "Required safe fields (id, email, orgId, orgName) are PRESENT",
      { firstUser }
    );

    const targetUserId = firstUser.id;
    const actualOrgId = firstUser.orgId;
    const fakeOrgId = "00000000-0000-0000-0000-000000000000";

    // 5. Spoofed OrgId Protection
    console.log("\n--- 5. SPOOFED ORGID PROTECTION ---");
    const spoofedLogout = await trpcCall(
      "mac.forceLogoutUser",
      "mutation",
      {
        userId: targetUserId,
        orgId: fakeOrgId,
        reason: "Valid test reason with at least 10 chars",
      },
      superAdminToken
    );
    assert(
      spoofedLogout.status === 400 && spoofedLogout.data?.error?.message?.includes("Target organization mismatch"),
      "Spoofed orgId rejected with 400 BAD_REQUEST ('Target organization mismatch')",
      spoofedLogout
    );

    const spoofedStatus = await trpcCall(
      "mac.updateUserStatus",
      "mutation",
      {
        userId: targetUserId,
        orgId: fakeOrgId,
        status: "disabled",
        reason: "Valid test reason with at least 10 chars",
      },
      superAdminToken
    );
    assert(
      spoofedStatus.status === 400 && spoofedStatus.data?.error?.message?.includes("Target organization mismatch"),
      "Spoofed orgId on status rejected with 400 BAD_REQUEST ('Target organization mismatch')",
      spoofedStatus
    );

    // 6. Mandatory Reason Validation (>= 10 chars)
    console.log("\n--- 6. MANDATORY REASON VALIDATION (>= 10 CHARS) ---");
    const shortReasonLogout = await trpcCall(
      "mac.forceLogoutUser",
      "mutation",
      {
        userId: targetUserId,
        orgId: actualOrgId,
        reason: "short",
      },
      superAdminToken
    );
    assert(
      shortReasonLogout.status === 400,
      "Reason < 10 chars rejected with 400 BAD_REQUEST",
      shortReasonLogout
    );

    // 7. Legitimate Force Logout
    console.log("\n--- 7. LEGITIMATE FORCE LOGOUT ---");
    const validLogout = await trpcCall(
      "mac.forceLogoutUser",
      "mutation",
      {
        userId: targetUserId,
        orgId: actualOrgId,
        reason: "Audit-verified administrative session revocation test.",
      },
      superAdminToken
    );
    assert(
      validLogout.status === 200 && validLogout.data?.result?.data?.ok === true,
      `Force logout succeeded (revoked ${validLogout.data?.result?.data?.revokedCount} sessions)`,
      validLogout
    );

    // 8. Legitimate Status Change & Session Revocation
    console.log("\n--- 8. STATUS CHANGE WITH SESSION REVOCATION ---");
    const statusChange = await trpcCall(
      "mac.updateUserStatus",
      "mutation",
      {
        userId: targetUserId,
        orgId: actualOrgId,
        status: "disabled",
        reason: "Compliance temporary suspension and lock verification test.",
      },
      superAdminToken
    );
    assert(
      statusChange.status === 200 && statusChange.data?.result?.data?.newStatus === "disabled",
      "Account status updated to disabled successfully",
      statusChange
    );

    // Restore back to active
    const statusRestore = await trpcCall(
      "mac.updateUserStatus",
      "mutation",
      {
        userId: targetUserId,
        orgId: actualOrgId,
        status: "active",
        reason: "Reactivating account following verification test completion.",
      },
      superAdminToken
    );
    assert(
      statusRestore.status === 200 && statusRestore.data?.result?.data?.newStatus === "active",
      "Account status restored to active successfully",
      statusRestore
    );
  }

  console.log("\n=================================================");
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Test runner encountered an error:", err);
  process.exit(1);
});
