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
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </div>
      </AuthGuard>
    </RBACProvider>
  );
}
