/**
 * ResourceView — Standardized UI Boundary Component
 *
 * Wraps a tRPC query's lifecycle (loading, error, empty, success) into a
 * consistent, declarative shell. This eliminates the boilerplate guard
 * clauses that were scattered across every page and ensures 100% consistency
 * in how we handle loading spinners, error states, and empty screens.
 *
 * Usage:
 *   const q = trpc.crm.accounts.get.useQuery({ id });
 *   return (
 *     <ResourceView query={q} resourceName="Account" backHref="/app/crm">
 *       {(account) => <AccountBody account={account} />}
 *     </ResourceView>
 *   );
 */

import { type ReactNode } from "react";
import { SearchX, ShieldAlert, ServerCrash, ArrowLeft, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface TRPCLike<T = any> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: { data?: { code?: string } | null; message?: string } | null;
  refetch: () => void;
}

interface ResourceViewProps<T> {
  /** The tRPC query result object */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: TRPCLike<T>;
  /** Human-readable name for the resource, e.g. "Account" */
  resourceName?: string;
  /** Where the Back button navigates. Defaults to browser history back. */
  backHref?: string;
  /** Custom empty state check. Defaults to `data === null || data === undefined`. */
  isEmpty?: (data: T) => boolean;
  /** Render when data is successfully loaded */
  children: (data: T) => ReactNode;
  /** Custom loading UI override */
  loadingSlot?: ReactNode;
  /** Minimum height of the boundary region */
  minHeight?: string;
}


// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingSpinner({ minHeight }: { minHeight: string }) {
  return (
    <div className={cn("flex items-center justify-center w-full", minHeight)}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-xs text-muted-foreground animate-pulse">Loading…</p>
      </div>
    </div>
  );
}

type ErrorVariant = "not_found" | "forbidden" | "generic";

function getErrorVariant(code?: string): ErrorVariant {
  if (code === "NOT_FOUND") return "not_found";
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return "forbidden";
  return "generic";
}

const ERROR_CONFIG: Record<ErrorVariant, {
  icon: typeof SearchX;
  iconBg: string;
  iconColor: string;
  title: (name: string) => string;
  description: string;
}> = {
  not_found: {
    icon: SearchX,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    title: (name) => `${name} Not Found`,
    description: "The item you are looking for does not exist or has been deleted.",
  },
  forbidden: {
    icon: ShieldAlert,
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    title: () => "Access Denied",
    description: "You do not have the required permissions to view this resource. Contact your administrator.",
  },
  generic: {
    icon: ServerCrash,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    title: () => "Something Went Wrong",
    description: "An unexpected error occurred. Please try again or contact support if the issue persists.",
  },
};

function ErrorState({
  code,
  resourceName,
  backHref,
  onRefetch,
  minHeight,
}: {
  code?: string;
  resourceName: string;
  backHref?: string;
  onRefetch: () => void;
  minHeight: string;
}) {
  const router = useRouter();
  const variant = getErrorVariant(code);
  const cfg = ERROR_CONFIG[variant];
  const Icon = cfg.icon;

  return (
    <div className={cn(
      "flex flex-col items-center justify-center p-8 text-center w-full animate-in fade-in zoom-in duration-300",
      minHeight,
    )}>
      <div className={cn(
        "w-16 h-16 rounded-full flex items-center justify-center mb-4",
        cfg.iconBg,
      )}>
        <Icon className={cn("w-8 h-8", cfg.iconColor)} />
      </div>
      <h2 className="text-xl font-bold text-foreground">{cfg.title(resourceName)}</h2>
      <p className="text-muted-foreground mt-2 max-w-sm mx-auto text-sm leading-relaxed">
        {cfg.description}
      </p>
      <div className="flex items-center gap-3 mt-8">
        <button
          onClick={() => backHref ? router.push(backHref) : router.back()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Go Back
        </button>
        {variant === "generic" && (
          <button
            onClick={onRefetch}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            <RefreshCcw className="w-4 h-4" /> Retry
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ResourceView<T>({
  query,
  resourceName = "Resource",
  backHref,
  isEmpty,
  children,
  loadingSlot,
  minHeight = "min-h-[400px]",
}: ResourceViewProps<T>) {
  if (query.isLoading) {
    return <>{loadingSlot ?? <LoadingSpinner minHeight={minHeight} />}</>;
  }

  if (query.isError) {
    return (
      <ErrorState
        code={query.error?.data?.code}
        resourceName={resourceName}
        backHref={backHref}
        onRefetch={query.refetch}
        minHeight={minHeight}
      />
    );
  }

  if (query.data === undefined || query.data === null || (isEmpty && isEmpty(query.data))) {
    return (
      <ErrorState
        code="NOT_FOUND"
        resourceName={resourceName}
        backHref={backHref}
        onRefetch={query.refetch}
        minHeight={minHeight}
      />
    );
  }

  return <>{children(query.data)}</>;
}
