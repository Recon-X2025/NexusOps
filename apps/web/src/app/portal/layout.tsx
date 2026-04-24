import Link from "next/link";
import { RBACProvider } from "@/lib/rbac-context";
import { AuthGuard } from "@/components/layout/auth-guard";
import { PortalNav } from "./portal-nav";

export const metadata = {
  title: "Employee Portal | NexusOps",
  description: "Submit IT requests, track tickets, search knowledge, and manage your assets.",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RBACProvider>
      <AuthGuard>
        <div className="min-h-dvh bg-gray-50">
          <PortalNav />
          <div className="mx-auto max-w-5xl px-4 pt-3">
            <div className="rounded-lg border border-blue-100 bg-blue-50/90 px-3 py-2 text-[11px] text-blue-900">
              <strong className="font-semibold">Requester view</strong>
              {" — "}
              You only see catalog items and tickets raised under your account. IT staff use the{" "}
              <Link href="/app/dashboard" className="font-medium text-primary underline-offset-2 hover:underline">
                operations console
              </Link>
              .
            </div>
          </div>
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </div>
      </AuthGuard>
    </RBACProvider>
  );
}
