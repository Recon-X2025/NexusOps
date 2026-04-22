"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Zap } from "lucide-react";
import { LoginSchema } from "@nexusops/types";
import type { z } from "zod";
import { trpc } from "@/lib/trpc";

type LoginForm = z.infer<typeof LoginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const apiBase = process.env.NEXT_PUBLIC_API_URL ??
    (typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : "http://localhost:3001");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
  });

  const utils = trpc.useUtils();

  const login = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      // Store in both localStorage (for tRPC header) and cookie (for middleware).
      // When "Remember Me" is unchecked the cookie has no max-age (session-scoped);
      // when checked we persist for 30 days.
      localStorage.setItem("nexusops_session", data.sessionId);
      const maxAge = rememberMe ? `; max-age=${60 * 60 * 24 * 30}` : "";
      document.cookie = `nexusops_session=${data.sessionId}; path=/${maxAge}; SameSite=Lax`;
      // Eagerly fetch auth.me with the new session token so the cache holds the
      // correct user before navigation. This prevents stale data from a previous
      // session (e.g. a demo account) from flashing on the dashboard while the
      // background refetch catches up.
      await utils.auth.me.fetch().catch(() => {});
      toast.success("Welcome back!");
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect") ?? "/app/dashboard";
      router.push(redirect);
    },
    onError: (err) => {
      const code = err.data?.code;
      if (code === "UNAUTHORIZED") {
        toast.error(
          "That email and password do not match any account on this server. If you have not registered yet, use Sign up free below.",
        );
        return;
      }
      if (code === "FORBIDDEN") {
        toast.error("This account is disabled. Contact your workspace administrator.");
        return;
      }
      toast.error(err.message ?? "Login failed");
    },
  });

  const onSubmit = (data: LoginForm) => login.mutate({ ...data, rememberMe });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/30">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">NexusOps</h1>
          <p className="text-sm text-slate-400">by Coheron</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-sm">
          <h2 className="mb-1 text-xl font-semibold text-white">Welcome back</h2>
          <p className="mb-6 text-sm text-slate-400">Sign in to your workspace</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" data-testid="login-form">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                data-testid="login-email"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none ring-0 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  data-testid="login-password"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none ring-0 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 accent-indigo-600"
                />
                Remember me (stay signed in for 30 days)
              </label>
              <Link href="/forgot-password" className="text-sm text-indigo-400 hover:text-indigo-300">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || login.isPending}
              data-testid="login-submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {(isSubmitting || login.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700" />
              </div>
              <div className="relative flex justify-center text-xs text-slate-500">
                <span className="bg-slate-900 px-2">or continue with</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => { window.location.href = `${apiBase}/auth/oidc/authorize`; }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-700"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-indigo-400 hover:text-indigo-300">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  );
}
