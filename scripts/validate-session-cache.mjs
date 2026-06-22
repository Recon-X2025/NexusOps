const BASE = "http://localhost:3001/trpc";

// tRPC v11: queries use GET with ?input=..., mutations use POST with body
async function query(path, token, input = {}) {
  const qs = Object.keys(input).length
    ? `?input=${encodeURIComponent(JSON.stringify(input))}` : "";
  const res = await fetch(`${BASE}/${path}${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function mutate(path, token, input = {}) {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function pass(msg) { console.log(`  ✅ PASS — ${msg}`); }
function fail(msg) { console.log(`  ❌ FAIL — ${msg}`); process.exitCode = 1; }

(async () => {
  let token;

  // ── STEP 1: Login ─────────────────────────────────────────────────────────
  console.log("\n=== STEP 1: LOGIN ===");
  const login = await mutate("auth.login", null, {
    email: "admin@coheron.com",
    password: "demo1234!",
  });
  console.log("  login status:", login.status);
  token = login.data?.result?.data?.sessionId;
  if (login.status === 200 && token) {
    pass(`login OK, token: ${token.slice(0, 16)}…`);
  } else {
    fail(`login failed: ${JSON.stringify(login.data)}`);
    process.exit(1);
  }

  // ── STEP 2: Single auth.me ────────────────────────────────────────────────
  console.log("\n=== STEP 2: VERIFY SESSION WORKS ===");
  const me1 = await query("auth.me", token);
  console.log("  auth.me status:", me1.status);
  if (me1.status === 200) {
    const user = me1.data?.result?.data?.user;
    pass(`auth.me OK, user: ${user?.email ?? "(unknown)"}`);
  } else {
    fail(`auth.me returned ${me1.status}: ${JSON.stringify(me1.data)}`);
    process.exit(1);
  }

  // ── STEP 3: 100 concurrent hits (cache-hit test) ──────────────────────────
  console.log("\n=== STEP 3: CONCURRENT ACCESS (100× auth.me) ===");
  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: 100 }, () => query("auth.me", token))
  );
  const elapsed = Date.now() - t0;
  const statuses = results.map((r) => r.status);
  const ok   = statuses.filter((s) => s === 200).length;
  const fail4xx = statuses.filter((s) => s >= 400).length;
  console.log(`  ${ok}/100 OK, ${fail4xx} errors, elapsed: ${elapsed}ms`);
  if (ok === 100) {
    pass(`all 100 concurrent calls succeeded in ${elapsed}ms (avg ${Math.round(elapsed/100)}ms)`);
  } else {
    const codes = [...new Set(statuses)].join(", ");
    fail(`${fail4xx} calls returned non-200 (status codes: ${codes})`);
  }

  // ── STEP 4: Logout ────────────────────────────────────────────────────────
  console.log("\n=== STEP 4: LOGOUT ===");
  const logout = await mutate("auth.logout", token);
  console.log("  logout status:", logout.status);
  if (logout.status === 200) {
    pass("logout OK");
  } else {
    fail(`logout returned ${logout.status}`);
  }

  // ── STEP 5: Verify 401 after logout ──────────────────────────────────────
  console.log("\n=== STEP 5: VERIFY SESSION INVALIDATED (first check) ===");
  await new Promise((r) => setTimeout(r, 50));
  const me2 = await query("auth.me", token);
  console.log("  auth.me status (post-logout):", me2.status);
  if (me2.status === 401) {
    pass("session correctly rejected with 401 after logout");
  } else {
    fail(`expected 401 but got ${me2.status} — cache NOT invalidated`);
  }

  // ── STEP 6: Retry confirms cache stays invalidated ────────────────────────
  console.log("\n=== STEP 6: RETRY — CACHE MUST STAY INVALIDATED ===");
  const me3 = await query("auth.me", token);
  console.log("  auth.me retry status:", me3.status);
  if (me3.status === 401) {
    pass("in-process cache still returns 401 (not re-hydrated from stale entry)");
  } else {
    fail(`expected 401 but got ${me3.status} — stale cache entry re-used`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(55));
  if (process.exitCode === 1) {
    console.log("RESULT: ❌ VALIDATION FAILED");
  } else {
    console.log("RESULT: ✅ ALL STEPS PASSED — session cache is working correctly");
  }
  console.log("─".repeat(55) + "\n");
})();
