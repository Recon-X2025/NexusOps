"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Zap, CheckCircle2 } from "lucide-react";
import { SignupSchema } from "@coheronconnect/types";
import type { z } from "zod";
import { trpc } from "@/lib/trpc";

type SignupForm = z.infer<typeof SignupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const utils = trpc.useUtils();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({
    resolver: zodResolver(SignupSchema),
  });

  const password = watch("password", "");

  const signup = trpc.auth.signup.useMutation({
    onSuccess: async (data) => {
      localStorage.setItem("coheronconnect_session", data.sessionId);
      document.cookie = `coheronconnect_session=${data.sessionId}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      await utils.auth.me.fetch().catch(() => {});
      toast.success("Account created! Welcome to CoheronConnect.");
      window.location.href = "/app/dashboard";
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error("Email already registered. Try signing in.");
      } else {
        toast.error(err.message ?? "Signup failed");
      }
    },
  });

  const onSubmit = (data: SignupForm) => signup.mutate(data);

  const passwordChecks = [
    { label: "At least 8 characters", valid: password.length >= 8 },
    { label: "Contains uppercase letter", valid: /[A-Z]/.test(password) },
    { label: "Contains number", valid: /[0-9]/.test(password) },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/30">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">CoheronConnect</h1>
          <p className="text-sm text-slate-400">by Coheron</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-sm">
          <h2 className="mb-1 text-xl font-semibold text-white">Create your workspace</h2>
          <p className="mb-6 text-sm text-slate-400">Free forever. No credit card required.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Your name</label>
                <input
                  {...register("name")}
                  type="text"
                  placeholder="Jane Smith"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                />
                {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Organization</label>
                <input
                  {...register("orgName")}
                  type="text"
                  placeholder="Acme Corp"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                />
                {errors.orgName && <p className="mt-1 text-xs text-red-400">{errors.orgName.message}</p>}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Work email</label>
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                placeholder="jane@acme.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
              />
              {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="Choose a strong password"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password && (
                <div className="mt-2 space-y-1">
                  {passwordChecks.map(({ label, valid }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <CheckCircle2
                        className={`h-3 w-3 ${valid ? "text-emerald-400" : "text-slate-600"}`}
                      />
                      <span className={`text-xs ${valid ? "text-emerald-400" : "text-slate-500"}`}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {errors.password && (
                <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || signup.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {(isSubmitting || signup.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              Create workspace
            </button>

            <p className="text-center text-xs text-slate-500">
              By signing up, you agree to our{" "}
              <Link href="/terms" className="text-indigo-400 hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-indigo-400 hover:underline">
                Privacy Policy
              </Link>
            </p>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
