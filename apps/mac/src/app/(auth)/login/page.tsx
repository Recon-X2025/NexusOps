"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";

export default function MacLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const apiUrl =
    typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_MAC_API_URL ??
          `${window.location.protocol}//${window.location.hostname}:3001`)
      : "http://localhost:3001";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/trpc/mac.login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { email, password } }),
      });
      const json = await res.json() as { result?: { data?: { json?: { token?: string } } }; error?: { message?: string } };
      const token = json?.result?.data?.json?.token;
      if (!token) {
        const msg = json?.error?.message ?? "Invalid credentials";
        toast.error(msg);
        return;
      }
      localStorage.setItem("mac_token", token);
      toast.success("Welcome, Coheron operator.");
      router.push("/dashboard");
    } catch {
      toast.error("Login failed — check API connectivity.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 shadow-xl shadow-indigo-500/30">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight">Coheron MAC</h1>
            <p className="text-sm text-slate-400 mt-0.5">Master Admin Console</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Operator Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="operator@coheron.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-60 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Authenticating…
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          For Coheron operators only. Unauthorised access is prohibited.
        </p>
      </div>
    </div>
  );
}
