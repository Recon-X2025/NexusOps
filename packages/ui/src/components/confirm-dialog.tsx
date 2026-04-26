import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "../utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "warning" | "default";
  loading?: boolean;
  /** Disable the confirm button (e.g. unmet input requirements). */
  disableConfirm?: boolean;
  /**
   * Optional slot rendered between the description and the action row —
   * used for capturing extra input like a rejection reason or a confirm
   * checkbox before destructive actions.
   */
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  loading = false,
  disableConfirm = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmColors: Record<string, string> = {
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    warning:     "bg-amber-600 text-white hover:bg-amber-500",
    default:     "bg-primary text-primary-foreground hover:bg-primary/90",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            {variant !== "default" && (
              <div className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0",
                variant === "destructive" ? "bg-destructive/10" : "bg-amber-100",
              )}>
                <AlertTriangle className={cn(
                  "h-4 w-4",
                  variant === "destructive" ? "text-destructive" : "text-amber-600",
                )} />
              </div>
            )}
            <DialogTitle className="text-base">{title}</DialogTitle>
          </div>
          {description && (
            <DialogDescription className="text-sm text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {children && <div className="pt-2">{children}</div>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => { onCancel?.(); onOpenChange(false); }}
            disabled={loading}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || disableConfirm}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50",
              confirmColors[variant],
            )}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
