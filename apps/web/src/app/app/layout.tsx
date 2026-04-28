import { Suspense } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { RBACProvider } from "@/lib/rbac-context";
import { AuthGuard } from "@/components/layout/auth-guard";

import { CommandPaletteProvider } from "@/components/layout/command-palette-provider";
import { ErrorBoundary } from "@nexusops/ui/error-boundary";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RBACProvider>
      <AuthGuard>
        <CommandPaletteProvider>
          <div className="flex h-dvh max-h-dvh flex-col overflow-hidden">
            <AppHeader />

            <div className="flex min-h-0 flex-1 overflow-hidden">
              {/* z-10 + shrink-0: keep nav above main so wide page content can't steal clicks (flex min-width:auto) */}
              <div className="relative z-10 flex h-full min-h-0 shrink-0">
                <Suspense fallback={null}>
                  <AppSidebar />
                </Suspense>
              </div>

              <main className="min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-thin bg-background">
                <div className="flex min-h-full min-w-0 flex-col p-4"><ErrorBoundary>{children}</ErrorBoundary></div>
              </main>
            </div>
            </div>

        </CommandPaletteProvider>
      </AuthGuard>
    </RBACProvider>
  );
}
