import { useState, type FormEvent } from 'react';
import { Server, Mail, Lock, ArrowRight, ShieldCheck, Loader2, Wand2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../lib/router';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../lib/api';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, error, loading } = useAuth();
  const { navigate } = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/setup-wizard-monitor');
    } catch {
      // error is surfaced via AuthContext.error
    }
  };

  const handleAutofill = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue text-white shadow-md">
            <Server className="h-7 w-7" />
          </div>
          <h1 className="font-heading text-3xl font-bold text-slate-900 dark:text-white">CoheronConnect</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Super-Admin Console</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-md dark:border-slate-700 dark:bg-slate-800 sm:p-8">
          <div className="mb-6">
            <h2 className="font-heading text-xl font-semibold text-slate-900 dark:text-white">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Enter your super-admin credentials to access the console.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@coheron.tech"
                  autoComplete="email"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Autofill test credentials */}
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleAutofill}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Autofill test credentials
              </button>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 dark:border-rose-500/30 dark:bg-rose-500/10">
                <p className="text-sm text-brand-danger dark:text-rose-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-blue py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:scale-[1.02] hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/50">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="text-xs text-slate-500 dark:text-slate-400">
                <p className="font-medium text-slate-600 dark:text-slate-300">Session expires in 15 minutes</p>
                <p className="mt-0.5">No persistent login — you will need to re-enter credentials after expiry.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
