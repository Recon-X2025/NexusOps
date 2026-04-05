"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Building2,
  Users,
  ScrollText,
  Activity,
  Settings,
  LogOut,
  Shield,
  ChevronRight,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/organizations", label: "Organizations", icon: Building2 },
  { href: "/users", label: "Users", icon: Users },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
  { href: "/health", label: "System Health", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1];
    if (!base64) return null;
    return JSON.parse(atob(base64.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default function MacLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [operatorEmail, setOperatorEmail] = useState<string>("");

  useEffect(() => {
    const token = localStorage.getItem("mac_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    const payload = decodeJwtPayload(token);
    if (payload?.email && typeof payload.email === "string") {
      setOperatorEmail(payload.email);
    }
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("mac_token");
    router.replace("/login");
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 text-white">
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none">Coheron MAC</p>
            <p className="mt-0.5 text-[0.65rem] text-slate-400">Master Admin Console</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin">
          <ul className="space-y-0.5 px-3">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                    {active && <ChevronRight className="ml-auto h-3 w-3 opacity-60" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Operator info */}
        <div className="border-t border-slate-800 px-4 py-3">
          <p className="truncate text-xs text-slate-400">{operatorEmail || "—"}</p>
          <p className="text-[0.65rem] text-slate-500">Coheron Operator</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
          <span className="text-sm font-semibold text-slate-700">
            Coheron Master Admin Console
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </header>

        {/* Page content */}
        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin bg-slate-50 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
