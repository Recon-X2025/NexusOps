"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Search, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { searchUsers, startImpersonation } from "@/lib/mac-api";
import type { UserSearchResult } from "@/lib/mac-api";

export default function ImpersonationPage() {
  const [emailQuery, setEmailQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState(30);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<{ redirectUrl: string; expiresAt: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!session) return;
    const expires = new Date(session.expiresAt).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!emailQuery.trim()) return;
    setSearching(true);
    try {
      const data = await searchUsers(emailQuery);
      setResults(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setLoading(true);
    try {
      const result = await startImpersonation({ targetUserId: selectedUser.id, reason, durationMinutes: duration });
      setSession(result);
      toast.success("Impersonation session started");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start impersonation");
    } finally {
      setLoading(false);
    }
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Operator Impersonation</h1>
        <p className="text-sm text-slate-500">Time-boxed impersonation for support and debugging</p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-800 font-medium">Impersonation sessions are logged and audited. All actions taken will be attributed to the target user and recorded.</p>
      </div>

      {!session ? (
        <>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={emailQuery} onChange={(e) => setEmailQuery(e.target.value)} placeholder="Search user by email…" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <button type="submit" disabled={searching} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </button>
          </form>

          {results.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <ul className="divide-y divide-slate-50">
                {results.map((user) => (
                  <li key={user.id}>
                    <button
                      onClick={() => { setSelectedUser(user); setResults([]); }}
                      className={`w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between ${selectedUser?.id === user.id ? "bg-indigo-50" : ""}`}
                    >
                      <div>
                        <p className="font-medium text-slate-800">{user.name ?? user.email}</p>
                        <p className="text-xs text-slate-500">{user.email} · {user.role}</p>
                      </div>
                      <span className="text-xs text-slate-400">{user.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedUser && (
            <form onSubmit={handleStart} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-indigo-50 p-3">
                <div>
                  <p className="font-medium text-slate-800 text-sm">{selectedUser.name ?? selectedUser.email}</p>
                  <p className="text-xs text-slate-500">{selectedUser.email}</p>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Reason (min 10 characters) *</label>
                <textarea required minLength={10} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason for impersonation…" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Duration</label>
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400">
                  {[5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSelectedUser(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={loading || reason.length < 10} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60">
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Start Impersonation Session
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 space-y-4">
          <h2 className="font-semibold text-emerald-800">Session Active</h2>
          <p className="text-2xl font-mono font-bold text-emerald-700">{mins}:{String(secs).padStart(2, "0")} remaining</p>
          <a href={session.redirectUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">
            <ExternalLink className="h-4 w-4" />Launch Session
          </a>
          <p className="text-xs text-emerald-700">Expires at {new Date(session.expiresAt).toLocaleTimeString()}</p>
          <button onClick={() => setSession(null)} className="text-xs text-emerald-600 underline">Start new session</button>
        </div>
      )}
    </div>
  );
}
