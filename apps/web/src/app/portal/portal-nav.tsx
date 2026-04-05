"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { Home, Ticket, BookOpen, Package, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/portal", label: "Home", icon: Home, exact: true },
  { href: "/portal/requests", label: "My Requests", icon: Ticket, exact: false },
  { href: "/portal/knowledge", label: "Knowledge Base", icon: BookOpen, exact: false },
  { href: "/portal/assets", label: "My Assets", icon: Package, exact: false },
];

export function PortalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser } = useRBAC();
  const utils = trpc.useUtils();

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      localStorage.removeItem("nexusops_session");
      document.cookie = "nexusops_session=; path=/; max-age=0; SameSite=Lax";
      utils.invalidate();
      router.push("/login");
    },
    onError: () => {
      localStorage.removeItem("nexusops_session");
      document.cookie = "nexusops_session=; path=/; max-age=0; SameSite=Lax";
      router.push("/login");
    },
  });

  const initials = currentUser.name
    .split(" ")
    .filter((n) => n.length > 0)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">
            N
          </div>
          <div>
            <p className="text-sm font-bold leading-none text-gray-900">NexusOps</p>
            <p className="text-[10px] leading-none text-gray-500">Employee Portal</p>
          </div>
        </div>

        {/* Desktop nav tabs */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
            {initials}
          </div>
          <span className="hidden text-xs font-medium text-gray-700 md:block">
            {currentUser.name}
          </span>
          <button
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Sign out</span>
          </button>
        </div>
      </div>

      {/* Mobile nav tabs */}
      <nav className="flex border-t border-gray-100 md:hidden">
        {NAV_LINKS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-gray-400 hover:text-gray-700",
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-primary")} />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
