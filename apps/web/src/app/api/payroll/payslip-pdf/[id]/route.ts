import { type NextRequest, NextResponse } from "next/server";

const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? "http://localhost:3001";

/**
 * Same-origin proxy for payslip PDF (browser opens /api/payroll/payslip-pdf/:id).
 * Forwards Authorization + cookies to the API worker.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const target = `${API_INTERNAL_URL}/payroll/payslip-pdf/${encodeURIComponent(id)}`;

  const forwardHeaders: Record<string, string> = {};
  const auth = req.headers.get("authorization");
  if (auth) forwardHeaders.authorization = auth;
  const cookie = req.headers.get("cookie");
  if (cookie) forwardHeaders.cookie = cookie;

  let upstream: Response;
  try {
    upstream = await fetch(target, { method: "GET", headers: forwardHeaders });
  } catch (err) {
    console.error("[payslip-pdf-proxy] upstream fetch failed:", err);
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
