import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TRPCProvider } from "@/components/providers/trpc-provider";
import { StaleSessionCleanup } from "@/components/providers/stale-session-cleanup";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CoheronConnect by Coheron",
    template: "%s | CoheronConnect",
  },
  description:
    "Enterprise workflow orchestration, ITSM, asset management, HR service delivery, and procurement — without the ServiceNow price tag.",
  keywords: ["ITSM", "ServiceNow alternative", "workflow automation", "ERP", "IT service management"],
  authors: [{ name: "Coheron" }],
  openGraph: {
    type: "website",
    title: "CoheronConnect by Coheron",
    description: "Enterprise-grade workflow orchestration at startup-friendly pricing.",
    siteName: "CoheronConnect",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-dvh font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <TRPCProvider>
            <StaleSessionCleanup />
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
