import { type NextRequest, NextResponse } from "next/server";

/**
 * Same-origin tRPC proxy.
 *
 * The browser calls /api/trpc/* (same origin → passes CSP, no CORS needed).
 * This handler forwards the request to the API container on the Docker
 * internal network and streams the response back.
 *
 * Benefits:
 *  - No hardcoded server IP in the frontend bundle or CSP headers
 *  - Works in dev (localhost) and on any production host unchanged
 *  - Eliminates the CORS / CSP gap between port 80 and port 3001
 */

const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? "http://localhost:3001";

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const pathStr = path.join("/");
  const search = req.nextUrl.searchParams.toString();
  const target = `${API_INTERNAL_URL}/trpc/${pathStr}${search ? `?${search}` : ""}`;

  const forwardHeaders: Record<string, string> = {};
  const auth = req.headers.get("authorization");
  if (auth) forwardHeaders["authorization"] = auth;
  const ct = req.headers.get("content-type");
  if (ct) forwardHeaders["content-type"] = ct;
  // Forward cookies so session auth reaches the API
  const cookie = req.headers.get("cookie");
  if (cookie) forwardHeaders["cookie"] = cookie;

  const body =
    req.method !== "GET" && req.method !== "HEAD"
      ? await req.arrayBuffer()
      : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: forwardHeaders,
      body: body ? Buffer.from(body) : undefined,
    });
  } catch (err) {
    console.error("[trpc-proxy] upstream fetch failed:", err);
    return NextResponse.json(
      { error: "API unreachable" },
      { status: 502 },
    );
  }

  const data = await upstream.arrayBuffer();
  const responseHeaders = new Headers();
  const responseCt = upstream.headers.get("content-type");
  if (responseCt) responseHeaders.set("content-type", responseCt);

  return new NextResponse(data, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export { proxy as GET, proxy as POST };
