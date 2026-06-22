/**
 * PageHeader — Standard page header primitive
 *
 * Provides a consistent header layout for all detail/list pages:
 * - Back navigation button
 * - Icon + title + subtitle
 * - Status badge (optional)
 * - Actions slot (right side)
 */

import type { ReactNode, ElementType } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Back navigation destination. If omitted uses router.back() */
  backHref?: string;
  /** Lucide icon component to display next to title */
  icon?: ElementType;
  /** Primary page title */
  title: string;
  /** Subtitle / breadcrumb line below the title */
  subtitle?: string;
  /** Optional badge element rendered next to the title */
  badge?: ReactNode;
  /** Right-side action buttons */
  actions?: ReactNode;
  /** Additional className for the outer container */
  className?: string;
  /** Whether to show the back button. Defaults to true. */
  showBack?: boolean;
}

export function PageHeader({
  backHref,
  icon: Icon,
  title,
  subtitle,
  badge,
  actions,
  className,
  showBack = true,
}: PageHeaderProps) {
  const router = useRouter();

  return (
    <div className={cn("flex items-center justify-between", className)}>
      <div className="flex items-center gap-4">
        {showBack && (
          <button
            onClick={() => backHref ? router.push(backHref) : router.back()}
            className="p-2 hover:bg-muted rounded-full transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div>
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-5 h-5 text-muted-foreground" />}
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {badge}
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
