/**
 * India GST Engine.
 * Canonical implementation now lives in `@coheronconnect/payroll-math`.
 * This module re-exports it to preserve existing `apps/api` import paths.
 */
export * from "@coheronconnect/payroll-math";

import { normaliseStateToCode } from "@coheronconnect/payroll-math";
import { logWarn } from "../logger";

/**
 * Normalise a raw state (a 2-digit code or a free-text name) to its canonical
 * GST state code before an intra-vs-inter-state compare. The org side arrives
 * as a code ("27") from gstinRegistry; vendors/customers store a NAME
 * ("Maharashtra"). A raw code-vs-name compare reads a local sale as inter-state
 * IGST, so both sides must be reduced to a code first.
 *
 * A present-but-unrecognised state (e.g. a typo "Maharastra") returns null and
 * is LOGGED — a silent default would hide a wrong tax split with no signal. An
 * absent state (null/empty) is a legitimate "unknown" and is not logged.
 */
export function normaliseGstStateOrWarn(
  raw: string | null | undefined,
  side: string,
): string | null {
  const code = normaliseStateToCode(raw);
  if (code === null && raw && raw.trim() !== "") {
    logWarn("GST_STATE_UNRESOLVED", { side, rawState: raw });
  }
  return code;
}
