import { type NextRequest, NextResponse } from "next/server";

const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";

/**
 * Same-origin proxy for the EPFO ECR download (browser opens
 * /api/statutory/ecr?month=4&year=2026). Forwards Authorization + cookies
 * to the API worker.
 *
 * Non-200 responses are passed through with their body intact: the API
 * returns a 400 naming the missing EPF code, or a 409 listing the employees
 * EPFO would reject, and both are meant to be read by the user.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.toString();
  const target = `${API_INTERNAL_URL}/statutory/ecr${search ? `?${search}` : ""}`;

  const forwardHeaders: Record<string, string> = {};
  const auth = req.headers.get("authorization");
  if (auth) forwardHeaders.authorization = auth;
  const cookie = req.headers.get("cookie");
  if (cookie) forwardHeaders.cookie = cookie;

  let upstream: Response;
  try {
    upstream = await fetch(target, { method: "GET", headers: forwardHeaders });
  } catch (err) {
    console.error("[statutory-ecr-proxy] upstream fetch failed:", err);
    return NextResponse.json({ error: "API unreachable" }, { status: 502 });
  }

  const buf = await upstream.arrayBuffer();
  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const cd = upstream.headers.get("content-disposition");
  if (cd) headers.set("content-disposition", cd);
  headers.set("cache-control", "private, no-store");

  return new NextResponse(buf, { status: upstream.status, headers });
}
