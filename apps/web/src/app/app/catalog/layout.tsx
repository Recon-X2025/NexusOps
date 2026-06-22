import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Service Catalog",
  description: "Browse services, submit requests, and manage catalog items.",
};

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
