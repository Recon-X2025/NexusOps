import http from "k6/http";
import { check } from "k6";

const BASE = "http://localhost:3001/trpc";

export default function () {
  for (let i = 0; i < 200; i++) {
    const res = http.post(
      `${BASE}/auth.signup`,
      JSON.stringify({
        email: `loadtest${i}@test.com`,
        password: "Test1234!",
        name: `Load User ${i}`,
        orgName: `LoadTestOrg${i}`,
      }),
      { headers: { "Content-Type": "application/json" } }
    );

    const body = res.json();
    const ok = body?.result?.data?.sessionId != null || body?.error?.message === "Email already registered";

    check(res, { [`user ${i} seeded`]: () => ok });
  }
}
