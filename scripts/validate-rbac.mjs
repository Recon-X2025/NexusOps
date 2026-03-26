const BASE = "http://localhost:3001/trpc";

// tRPC v11: queries → GET ?input=..., mutations → POST body (no wrapper)
async function query(path, token, input = {}) {
  const qs = Object.keys(input).length
    ? `?input=${encodeURIComponent(JSON.stringify(input))}` : "";
  const res = await fetch(`${BASE}/${path}${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function mutate(path, token, input = {}) {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function login(email, password = "demo1234!") {
  const r = await mutate("auth.login", null, { email, password });
  const token = r.data?.result?.data?.sessionId;
  if (!token) throw new Error(`Login failed for ${email}: ${JSON.stringify(r.data)}`);
  return token;
}

function pass(label, detail = "") { console.log(`  ✅ PASS  ${label}${detail ? " — " + detail : ""}`); }
function fail(label, detail = "") { console.error(`  ❌ FAIL  ${label}${detail ? " — " + detail : ""}`); process.exitCode = 1; }
function expect(label, got, wanted) {
  got === wanted
    ? pass(label, `status ${got}`)
    : fail(label, `expected ${wanted}, got ${got}`);
}

(async () => {
  // ── Login all three personas ──────────────────────────────────────────────
  console.log("\n=== LOGIN USERS ===");
  const requesterToken = await login("employee@coheron.com"); // member / requester
  const itilToken      = await login("agent1@coheron.com");   // member / itil (matrixRole)
  const adminToken     = await login("admin@coheron.com");    // owner  / admin
  console.log("  requester token:", requesterToken.slice(0, 16) + "…");
  console.log("  itil      token:", itilToken.slice(0, 16) + "…");
  console.log("  admin     token:", adminToken.slice(0, 16) + "…");

  // ── STEP 1: Requester access ──────────────────────────────────────────────
  console.log("\n=== STEP 1: REQUESTER ACCESS ===");
  console.log("  Role: requester (incidents.write ✓  grc.write ✗)");

  const r_ticket = await mutate("tickets.create", requesterToken, {
    title: "[RBAC-TEST] Requester Ticket",
    type: "incident",
  });
  expect("requester → tickets.create (incidents.write)", r_ticket.status, 200);

  const r_grc = await mutate("grc.createRisk", requesterToken, {
    title: "[RBAC-TEST] Unauthorized Risk",
  });
  expect("requester → grc.createRisk (grc.write)  [must be 403]", r_grc.status, 403);

  // ── STEP 2: ITIL access ───────────────────────────────────────────────────
  console.log("\n=== STEP 2: ITIL ACCESS ===");
  console.log("  Role: itil (incidents.write ✓  budget.read ✗  financial.read ✗)");

  const i_ticket = await mutate("tickets.create", itilToken, {
    title: "[RBAC-TEST] ITIL Ticket",
    type: "incident",
  });
  expect("itil → tickets.create (incidents.write)", i_ticket.status, 200);

  // financial.listBudget requires budget.read — itil has no budget access
  const i_budget = await query("financial.listBudget", itilToken);
  expect("itil → financial.listBudget (budget.read)  [must be 403]", i_budget.status, 403);

  // ── STEP 3: Admin access ──────────────────────────────────────────────────
  console.log("\n=== STEP 3: ADMIN ACCESS ===");
  console.log("  Role: admin (users.read ✓  all modules ✓)");

  const a_users = await query("admin.users.list", adminToken);
  expect("admin → admin.users.list (admin gate)", a_users.status, 200);
  if (a_users.status === 200) {
    const count = a_users.data?.result?.data?.length ?? "?";
    console.log(`    └─ ${count} users returned`);
  }

  // ── STEP 4: 300 concurrent auth.me calls (3 personas × 100) ──────────────
  console.log("\n=== STEP 4: CONCURRENT MIXED LOAD (300× auth.me) ===");
  const t0 = Date.now();
  const allResults = await Promise.all([
    ...Array.from({ length: 100 }, () => query("auth.me", requesterToken)),
    ...Array.from({ length: 100 }, () => query("auth.me", itilToken)),
    ...Array.from({ length: 100 }, () => query("auth.me", adminToken)),
  ]);
  const elapsed = Date.now() - t0;
  const failures = allResults.filter(r => r.status !== 200);
  console.log(`  ${allResults.length - failures.length}/300 OK — ${failures.length} failures — ${elapsed}ms total`);
  if (failures.length === 0) {
    pass("all 300 concurrent auth.me calls succeeded", `${elapsed}ms (avg ${Math.round(elapsed / 300)}ms)`);
  } else {
    const codes = [...new Set(failures.map(r => r.status))].join(", ");
    fail(`${failures.length} failures with status codes: ${codes}`);
  }

  // ── STEP 5: Role isolation — requester cannot reach admin routes ──────────
  console.log("\n=== STEP 5: ROLE ISOLATION CHECK ===");
  console.log("  Cross-boundary: requester → admin.users.list (must be 403)");

  const cross_admin = await query("admin.users.list", requesterToken);
  expect("requester → admin.users.list  [must be 403]", cross_admin.status, 403);

  // Extra isolation: itil → grc.createRisk (must be 403, itil has no grc.write)
  const cross_itil_grc = await mutate("grc.createRisk", itilToken, { title: "[RBAC-TEST] ITIL GRC Attempt" });
  expect("itil → grc.createRisk (grc.write)  [must be 403]", cross_itil_grc.status, 403);

  // Extra isolation: requester → admin.users.list with NO token (must be 401)
  const no_auth = await query("admin.users.list", null);
  expect("no token → admin.users.list  [must be 401]", no_auth.status, 401);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(60));
  if (process.exitCode === 1) {
    console.log("RESULT: ❌  RBAC VALIDATION FAILED");
  } else {
    console.log("RESULT: ✅  ALL RBAC CHECKS PASSED");
  }
  console.log("─".repeat(60) + "\n");
})();
