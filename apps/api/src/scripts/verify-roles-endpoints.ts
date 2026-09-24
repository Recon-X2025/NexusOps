import { config } from "dotenv";
config({ path: "../../.env" });
import jwt from "jsonwebtoken";

const API_BASE = "http://localhost:3001/super-admin";
const macSecret = process.env["MAC_JWT_SECRET"] || "mac-local-dev-secret-key";
const testToken = jwt.sign(
  { email: "admin@coheron.tech", role: "mac_operator" },
  macSecret,
  { expiresIn: "1h" }
);

async function test() {
  console.log("Testing Users & Roles endpoints...");

  // 1. GET operator-roles
  const getRes = await fetch(`${API_BASE}/operator-roles`, {
    headers: { Authorization: `Bearer ${testToken}` },
  });
  const getData = await getRes.json() as any;
  console.log("GET /operator-roles status:", getRes.status, "Roles count:", getData?.data?.length);
  if (!Array.isArray(getData?.data) || getData.data.length < 4) {
    throw new Error("Failed to get initial roles");
  }

  // 2. POST create custom role
  const testRoleName = "DPDP Compliance Officer";
  const postRoleRes = await fetch(`${API_BASE}/operator-roles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testToken}`,
    },
    body: JSON.stringify({
      name: testRoleName,
      description: "Oversees DPDP Act compliance, data principal rights, and privacy audits",
      color: "amber",
      permissions: {
        tenantsView: true,
        auditView: true,
        complianceView: true,
        complianceManage: true,
      },
    }),
  });
  const postRoleData = await postRoleRes.json() as any;
  console.log("POST /operator-roles status:", postRoleRes.status, "Created role:", postRoleData?.data?.id);
  if (postRoleRes.status !== 200 || !postRoleData?.ok) {
    throw new Error(`Failed to create role: ${JSON.stringify(postRoleData)}`);
  }
  const roleId = postRoleData.data.id;

  // 3. POST create operator with this custom role
  const testEmail = `test.officer.${Date.now()}@coheron.tech`;
  const postOpRes = await fetch(`${API_BASE}/operators`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testToken}`,
    },
    body: JSON.stringify({
      name: "Ananya Deshmukh",
      email: testEmail,
      password: "securepassword123",
      role: roleId,
      phone: "+91 9988776655",
    }),
  });
  const postOpData = await postOpRes.json() as any;
  console.log("POST /operators with custom role status:", postOpRes.status, "Created operator:", postOpData?.data?.id);
  if (postOpRes.status !== 200 || !postOpData?.ok) {
    throw new Error(`Failed to create operator with custom role: ${JSON.stringify(postOpData)}`);
  }
  const opId = postOpData.data.id;

  // 4. Try to DELETE custom role while operator is assigned (should fail with 400)
  const delBlockedRes = await fetch(`${API_BASE}/operator-roles/${roleId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${testToken}` },
  });
  console.log("DELETE /operator-roles/:id while assigned status (expected 400):", delBlockedRes.status);
  if (delBlockedRes.status !== 400) {
    throw new Error(`Expected 400 when deleting assigned role, got ${delBlockedRes.status}`);
  }

  // 5. Delete the operator
  const delOpRes = await fetch(`${API_BASE}/operators/${opId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${testToken}` },
  });
  console.log("DELETE /operators/:id status:", delOpRes.status);

  // 6. Now DELETE custom role should succeed
  const delRoleRes = await fetch(`${API_BASE}/operator-roles/${roleId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${testToken}` },
  });
  console.log("DELETE /operator-roles/:id after unassignment status:", delRoleRes.status);
  if (delRoleRes.status !== 200) {
    throw new Error(`Expected 200 when deleting unassigned role, got ${delRoleRes.status}`);
  }

  console.log("ALL TESTS PASSED PERFECTLY!");
}

test().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
