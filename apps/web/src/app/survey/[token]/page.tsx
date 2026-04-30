/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

export default function PublicSurveyPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [score, setScore] = useState<number>(0);
  const [comments, setComments] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);

  const title = useMemo(() => meta?.survey?.title ?? "Quick feedback", [meta]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setLoading(true);
        const resp = await fetch(`${apiBase()}/public/surveys/${token}`, { cache: "no-store" });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          setErr(data?.error ?? "Unable to load survey");
          return;
        }
        if (!cancelled) setMeta(data);
      } catch (e: any) {
        setErr(e?.message ?? "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit() {
    if (score < 1 || score > 5) return;
    setErr(null);
    try {
      const resp = await fetch(`${apiBase()}/public/surveys/${token}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ score, comments: comments.trim() || undefined }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErr(data?.error ?? "Submit failed");
        return;
      }
      setSubmitted(true);
    } catch (e: any) {
      setErr(e?.message ?? "Network error");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black">
            N
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="text-xs text-slate-500">CoheronConnect</div>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : err ? (
          <div className="text-sm text-rose-700">
            This survey link can’t be used. ({err})
          </div>
        ) : submitted ? (
          <div>
            <div className="text-lg font-semibold text-slate-900 mb-1">Thanks — recorded.</div>
            <div className="text-sm text-slate-600">You can close this tab.</div>
          </div>
        ) : (
          <div>
            {meta?.ticket?.number && (
              <div className="text-xs text-slate-500 mb-3">
                Ticket <span className="font-mono text-slate-700">{meta.ticket.number}</span>
                {meta.ticket.title ? ` · ${meta.ticket.title}` : ""}
              </div>
            )}

            <div className="text-sm font-medium text-slate-900 mb-2">
              How satisfied are you with the resolution?
            </div>
            <div className="flex gap-1.5 mb-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScore(n)}
                  className={`w-10 h-10 rounded-xl border text-sm font-semibold transition ${
                    score >= n ? "bg-yellow-400 border-yellow-300 text-slate-900" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                  aria-label={`${n} stars`}
                >
                  ★
                </button>
              ))}
            </div>

            <label className="text-xs font-medium text-slate-700">Optional comment</label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              placeholder="What went well? What could be improved?"
            />

            {err && <div className="text-xs text-rose-700 mt-2">{err}</div>}

            <button
              type="button"
              onClick={submit}
              disabled={score < 1 || score > 5}
              className="mt-4 w-full rounded-xl bg-indigo-600 text-white py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              Submit
            </button>
            <div className="text-[11px] text-slate-500 mt-3">
              This link expires automatically.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

