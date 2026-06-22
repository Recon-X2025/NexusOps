import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "md",
}: EmptyStateProps) {
  const sizes = {
    sm: { wrapper: "py-8 px-4", icon: "h-8 w-8", title: "text-sm", desc: "text-xs", btn: "text-xs px-3 py-1.5" },
    md: { wrapper: "py-14 px-6", icon: "h-10 w-10", title: "text-base", desc: "text-sm", btn: "text-sm px-4 py-2" },
    lg: { wrapper: "py-20 px-8", icon: "h-12 w-12", title: "text-lg", desc: "text-sm", btn: "text-sm px-5 py-2.5" },
  };
  const s = sizes[size];

  const ActionButton = ({
    label,
    onClick,
    href,
    variant,
  }: {
    label: string;
    onClick?: () => void;
    href?: string;
    variant: "primary" | "secondary";
  }) => {
    const cls = cn(
      "inline-flex items-center justify-center rounded font-medium transition-colors",
      s.btn,
      variant === "primary"
        ? "bg-primary text-primary-foreground hover:bg-primary/90"
        : "border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
    );
    if (href) {
      return (
        <a href={href} className={cls}>
          {label}
        </a>
      );
    }
    return (
      <button type="button" onClick={onClick} className={cls}>
        {label}
      </button>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        s.wrapper,
        className,
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 mb-4">
        <Icon className={cn(s.icon, "text-muted-foreground/60")} />
      </div>
      <p className={cn("font-semibold text-foreground mb-1", s.title)}>{title}</p>
      {description && (
        <p className={cn("text-muted-foreground max-w-sm mb-5", s.desc)}>{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-1">
          {action && <ActionButton {...action} variant="primary" />}
          {secondaryAction && <ActionButton {...secondaryAction} variant="secondary" />}
        </div>
      )}
    </div>
  );
}
