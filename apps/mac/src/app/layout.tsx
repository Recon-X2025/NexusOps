import type { Metadata } from "next";
import { Toaster } from "sonner";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Coheron MAC",
    template: "%s | Coheron MAC",
  },
  description: "Master Admin Console for the CoheronConnect platform — Coheron operators only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
