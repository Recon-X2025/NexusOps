/**
 * Shared helpers for workbench payload assembly.
 *
 * Mirrors the Command Center's pattern: each panel of a workbench is
 * assembled by an independent async source. Sources run in parallel via
 * Promise.allSettled and are bounded by per-source timeouts so that a
 * single slow query (or schema mismatch) cannot bring down the whole
 * workbench page. A failing source returns `{ state: "no_data" }` and
 * the UI renders an honest empty state.
 *
 * The shape is small on purpose — workbench payloads are JSON snapshots
 * the UI renders without further compute.
 */

export const PANEL_TIMEOUT_MS = 3_000;

/** Health state for a panel — drives loading/empty/error UI. */
export type PanelState = "ok" | "no_data" | "error";

/** Wrapper around a panel result. */
export interface Panel<T> {
  state: PanelState;
  data: T | null;
  /** Source error when state === "error" (sanitized to a message string). */
  error?: string;
  /** When the data was last produced. */
  generatedAt: string;
}

export function ok<T>(data: T): Panel<T> {
  return { state: "ok", data, generatedAt: new Date().toISOString() };
}

export function noData<T>(): Panel<T> {
  return { state: "no_data", data: null, generatedAt: new Date().toISOString() };
}

export function panelError<T>(error: unknown): Panel<T> {
  return {
    state: "error",
    data: null,
    error: error instanceof Error ? error.message : String(error),
    generatedAt: new Date().toISOString(),
  };
}

/** Run an async source with a hard timeout; never throws — always returns a Panel. */
export async function runPanel<T>(
  name: string,
  fn: () => Promise<T | null>,
  timeoutMs: number = PANEL_TIMEOUT_MS,
): Promise<Panel<T>> {
  try {
    const value = await Promise.race<T | null>([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`workbench_panel_timeout:${name}`)), timeoutMs),
      ),
    ]);
    if (value == null) return noData<T>();
    if (Array.isArray(value) && value.length === 0) return noData<T>();
    return ok<T>(value);
  } catch (e) {
    console.warn(`[workbench] panel '${name}' failed:`, e);
    return panelError<T>(e);
  }
}

/** Persona / next-best-action item shown in a workbench's right rail. */
export interface ActionQueueItem {
  id: string;
  /** Short row label, e.g. "INC-1234 — VIP escalation". */
  label: string;
  /** Sub-label, e.g. "SLA breach in 14m". */
  hint?: string;
  /** UI severity bucket; drives accent color. */
  severity: "info" | "watch" | "warn" | "breach";
  /** Click target. */
  href?: string;
  /** Optional human-readable owner. */
  owner?: string;
  /** Optional ISO due date for sorting / "in N days" rendering. */
  dueAt?: string;
}

/** Standard envelope every workbench payload carries. */
export interface WorkbenchEnvelope {
  /** Workbench key (e.g. "service-desk"). */
  key: string;
  /** Time the payload was assembled. */
  generatedAt: string;
  /** Right-rail action queue — same shape across every workbench. */
  actions: ActionQueueItem[];
}

export function envelope(key: string, actions: ActionQueueItem[]): WorkbenchEnvelope {
  return { key, generatedAt: new Date().toISOString(), actions };
}
