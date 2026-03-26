"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Zap, ArrowLeft, CheckCircle2 } from "lucide-react";
import { ForgotPasswordSchema } from "@nexusops/types";
import type { z } from "zod";
import { trpc } from "@/lib/trpc";

type ForgotForm = z.infer<typeof ForgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({ resolver: zodResolver(ForgotPasswordSchema) });

  const requestReset = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => {
      setSent(true);
    },
    onError: () => {
      // Still show success to avoid email enumeration
      setSent(true);
    },
  });

  const onSubmit = (data: ForgotForm) => requestReset.mutate(data);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/30">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">NexusOps</h1>
          <p className="text-sm text-slate-400">by Coheron</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-sm">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="h-12 w-12 text-green-400" />
              <h2 className="text-xl font-semibold text-white">Check your email</h2>
              <p className="text-center text-sm text-slate-400">
                If an account exists for that email, you&apos;ll receive reset instructions shortly.
              </p>
              <Link
                href="/login"
                className="mt-4 flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="mb-1 text-xl font-semibold text-white">Reset password</h2>
              <p className="mb-6 text-sm text-slate-400">
                Enter your work email and we&apos;ll send you a link to choose a new password.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
                  <input
                    {...register("email")}
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none ring-0 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={requestReset.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  {requestReset.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send reset link
                </button>
              </form>

              <Link
                href="/login"
                className="mt-6 flex items-center justify-center gap-2 text-sm text-indigo-400 hover:text-indigo-300"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
