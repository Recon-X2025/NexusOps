"use client";

/**
 * Shared workbench data fetching hook.
 *
 * Each workbench's content component calls a `trpc.workbench.<name>.useQuery`
 * directly (so RBAC merging via `mergeTrpcQueryOpts` is preserved). This
 * helper packages the common loading + error UX surface so individual
 * workbenches don't reinvent it.
 *
 * NOTE: We avoid wrapping the tRPC hook in another hook so the generated
 * trpc-rbac map can statically detect each workbench's query.
 */

import { useEffect, useState } from "react";

/** Returns true once `LOADING_TIMEOUT_MS` has elapsed without data — used to
 * convert a stuck skeleton into an error state per §8.2 of the spec. */
export const LOADING_TIMEOUT_MS = 5_000;

export function useLoadingTimeout(isLoading: boolean): boolean {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }
    const id = setTimeout(() => setTimedOut(true), LOADING_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [isLoading]);
  return timedOut;
}

/** Map a tRPC query result + panel envelope into a UI panel state. */
export type PanelUiState = "loading" | "ok" | "no_data" | "error";

export interface PanelLike {
  state?: "ok" | "no_data" | "error";
}

export function panelUiState(opts: {
  isLoading: boolean;
  isError: boolean;
  panel?: PanelLike | null;
  loadingTimedOut?: boolean;
}): PanelUiState {
  if (opts.isError) return "error";
  if (opts.isLoading) return opts.loadingTimedOut ? "error" : "loading";
  if (!opts.panel) return "no_data";
  if (opts.panel.state === "ok") return "ok";
  if (opts.panel.state === "error") return "error";
  return "no_data";
}
