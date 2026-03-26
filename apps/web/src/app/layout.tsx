import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TRPCProvider } from "@/components/providers/trpc-provider";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "NexusOps by Coheron",
    template: "%s | NexusOps",
  },
  description:
    "Enterprise workflow orchestration, ITSM, asset management, HR service delivery, and procurement — without the ServiceNow price tag.",
  keywords: ["ITSM", "ServiceNow alternative", "workflow automation", "ERP", "IT service management"],
  authors: [{ name: "Coheron" }],
  openGraph: {
    type: "website",
    title: "NexusOps by Coheron",
    description: "Enterprise-grade workflow orchestration at startup-friendly pricing.",
    siteName: "NexusOps",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <TRPCProvider>
            {children}
            <Toaster
              position="bottom-right"
              richColors
              closeButton
              toastOptions={{
                classNames: {
                  toast: "font-sans",
                },
              }}
            />
          </TRPCProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
