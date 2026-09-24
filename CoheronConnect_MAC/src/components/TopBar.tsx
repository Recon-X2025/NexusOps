import { Search, Bell, Moon, Sun, LogOut, Menu, ChevronRight, AlertTriangle } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../lib/router';
import { useState, useEffect } from 'react';
import { getToken, decodeJwtToken } from '../lib/api';

const ROUTE_LABELS: Record<string, string> = {
  '/setup-wizard-monitor': 'Setup Wizard Monitor',
  '/tenants': 'Tenants / Organizations',
  '/users-roles': 'Users & Roles',
  '/modules/itsm': 'ITSM',
  '/modules/assets': 'Assets',
  '/modules/hr': 'HR',
  '/modules/procurement': 'Procurement',
  '/modules/finance': 'Finance',
  '/workflows': 'Workflows',
  '/compliance-grc': 'Compliance & GRC',
  '/system-health': 'System Health',
  '/audit-log': 'Audit Log',
  '/settings': 'Settings',
};

export function TopBar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { theme, toggle } = useTheme();
  const { email, logout } = useAuth();
  const { path, navigate } = useRouter();
  const [showNotif, setShowNotif] = useState(false);
  const [expiringSoon, setExpiringSoon] = useState(false);

  useEffect(() => {
    const checkTokenExp = () => {
      const token = getToken();
      if (!token) {
        setExpiringSoon(false);
        return;
      }
      const jwt = decodeJwtToken(token);
      if (jwt?.exp) {
        const secondsLeft = jwt.exp - Math.floor(Date.now() / 1000);
        if (secondsLeft > 0 && secondsLeft <= 180) {
          setExpiringSoon(true);
        } else {
          setExpiringSoon(false);
        }
      }
    };
    checkTokenExp();
    const interval = setInterval(checkTokenExp, 10000);
    return () => clearInterval(interval);
  }, []);

  const label = ROUTE_LABELS[path] ?? 'Dashboard';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/70 px-4 backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/70">
      <button
        onClick={onOpenMobile}
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden items-center gap-1.5 text-sm sm:flex">
        <span className="text-slate-400 dark:text-slate-500">Console</span>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
        <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
      </div>

      {expiringSoon && (
        <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Session expiring soon — save changes</span>
        </div>
      )}

      <div className="relative ml-auto hidden md:block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search tenants, GSTIN, city…"
          className="w-64 rounded-lg border border-slate-200 bg-white/80 py-1.5 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-blue dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200"
        />
      </div>

      <div className="relative ml-auto md:ml-0">
        <button
          onClick={() => setShowNotif((s) => !s)}
          className="relative rounded-lg p-2 text-slate-500 transition-all duration-200 hover:scale-[1.02] hover:bg-slate-100 active:scale-[0.98] dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-danger ring-2 ring-white dark:ring-slate-900" />
        </button>
        {showNotif && (
          <div className="absolute right-0 top-12 z-50 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Notifications</p>
            <div className="space-y-1">
              <div className="rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
                <p className="font-medium text-slate-700 dark:text-slate-200">3 tenants stalled</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Onboarding needs attention</p>
              </div>
              <div className="rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
                <p className="font-medium text-slate-700 dark:text-slate-200">2 new tenant signups</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Pending initial setup</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={toggle}
        className="rounded-lg p-2 text-slate-500 transition-all duration-200 hover:scale-[1.02] hover:bg-slate-100 active:scale-[0.98] dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label="Toggle dark mode"
      >
        {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </button>

      <div className="flex items-center gap-2 border-l border-slate-200 pl-3 dark:border-slate-700">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-white">
          {email ? email[0].toUpperCase() : 'A'}
        </div>
        <div className="hidden sm:block">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{email ?? 'admin@coheron.in'}</p>
          <p className="text-[10px] text-slate-400">Super-Admin</p>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-lg p-2 text-slate-500 transition-all duration-200 hover:scale-[1.02] hover:bg-slate-100 active:scale-[0.98] dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Logout"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
