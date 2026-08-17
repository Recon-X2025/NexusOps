import { type NextRequest, NextResponse } from "next/server";

const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";

/**
 * Same-origin proxy for the quotation PDF (browser opens /api/crm/quote-pdf/:id).
 * Forwards Authorization + cookies to the API worker.
 *
 * Mirrors the payslip proxy. The one difference is that this upstream can answer
 * 409 with a JSON body explaining why the quote is not sendable (unverified tax
 * basis), so the body is passed through unchanged rather than swallowed — the
 * caller reads that message and shows it.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const target = `${API_INTERNAL_URL}/crm/quote-pdf/${encodeURIComponent(id)}`;

  const forwardHeaders: Record<string, string> = {};
  const auth = req.headers.get("authorization");
  if (auth) forwardHeaders.authorization = auth;
  const cookie = req.headers.get("cookie");
  if (cookie) forwardHeaders.cookie = cookie;

  let upstream: Response;
  try {
    upstream = await fetch(target, { method: "GET", headers: forwardHeaders });
  } catch (err) {
    console.error("[quote-pdf-proxy] upstream fetch failed:", err);
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
