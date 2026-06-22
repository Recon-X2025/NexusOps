import http from "k6/http";
import { sleep } from "k6";
import exec from "k6/execution";

export const options = {
  vus: 200,
  duration: "2m",
};

const BASE = "http://localhost:3001/trpc";

const USERS = Array.from({ length: 200 }, (_, i) => ({
  email: `loadtest${i}@test.com`,
  password: "Test1234!",
}));

export function setup() {
  const tokens = USERS.map((u) => {
    const res = http.post(
      `${BASE}/auth.login`,
      JSON.stringify(u),
      { headers: { "Content-Type": "application/json" } }
    );

    const token = res.json()?.result?.data?.sessionId;

    if (!token) {
      throw new Error(`Login failed for ${u.email}`);
    }

    return token;
  });

  return { tokens };
}

export default function (data) {
  const vuIndex = exec.vu.idInTest - 1;
  const token = data.tokens[vuIndex];

  http.get(`${BASE}/tickets.list?input={}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  sleep(1);
}
