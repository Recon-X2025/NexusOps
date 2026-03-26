"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Zap, CheckCircle2 } from "lucide-react";
import { ResetPasswordSchema } from "@nexusops/types";
import type { z } from "zod";
import { trpc } from "@/lib/trpc";

type ResetForm = z.infer<typeof ResetPasswordSchema>;

export default function ResetPasswordPage() {
  const params = useParams();
  const router = useRouter();
  const token = String(params.token ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetForm>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { token },
  });

  const resetPassword = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    },
    onError: (err) => {
      toast.error(err.message ?? "Reset failed. The link may have expired.");
    },
  });

  const onSubmit = (data: ResetForm) => resetPassword.mutate(data);

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
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="h-12 w-12 text-green-400" />
              <h2 className="text-xl font-semibold text-white">Password updated!</h2>
              <p className="text-sm text-slate-400">Redirecting to sign in…</p>
            </div>
          ) : (
            <>
              <h2 className="mb-1 text-xl font-semibold text-white">Choose a new password</h2>
              <p className="mb-6 text-sm text-slate-400">
                Must be at least 8 characters with an uppercase letter and number.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <input type="hidden" {...register("token")} />

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      {...register("password")}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={resetPassword.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resetPassword.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Reset password
                </button>
              </form>

              <Link
                href="/login"
                className="mt-6 flex items-center justify-center text-sm text-indigo-400 hover:text-indigo-300"
              >
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
