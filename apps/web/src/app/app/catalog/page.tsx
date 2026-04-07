import { Suspense } from "react";
import CatalogPageClient from "./catalog-client";

function CatalogSegmentFallback() {
  return (
    <div className="flex min-w-0 max-w-[1600px] flex-col gap-4" aria-busy="true">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="space-y-2">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-72 max-w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="h-10 w-full max-w-md animate-pulse rounded-lg bg-muted sm:w-80" />
      </div>
      <div className="h-10 max-w-lg animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<CatalogSegmentFallback />}>
      <CatalogPageClient />
    </Suspense>
  );
}
