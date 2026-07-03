/**
 * CVSS → remediation-SLA policy (Sprint 0.5).
 *
 * Previously the remediation SLA (remediationSlaDays / remediationDueAt) on a
 * vulnerability was entirely caller-supplied — a scanner import or manual create
 * could omit it, leaving critical findings with no deadline. This module derives
 * a default remediation SLA from the CVSS v3 base score (preferred) or, when no
 * score is available, the qualitative severity band.
 *
 * Default SLA windows (calendar days) follow the widely used CVSS severity
 * bands. They are intentionally conservative defaults; a caller may still
 * override with an explicit SLA.
 *
 *   Critical (CVSS 9.0–10.0) → 7 days
 *   High     (CVSS 7.0–8.9)  → 30 days
 *   Medium   (CVSS 4.0–6.9)  → 90 days
 *   Low      (CVSS 0.1–3.9)  → 180 days
 *   None     (CVSS 0.0)      → no SLA (null)
 */

export type VulnSeverity = "critical" | "high" | "medium" | "low" | "none";

export const SLA_DAYS_BY_SEVERITY: Record<VulnSeverity, number | null> = {
  critical: 7,
  high: 30,
  medium: 90,
  low: 180,
  none: null,
};

/** Map a CVSS v3 base score (0.0–10.0) to its qualitative severity band. */
export function severityFromCvss(score: number): VulnSeverity {
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "medium";
  if (score > 0.0) return "low";
  return "none";
}

/**
 * Resolve the remediation SLA (in days) for a vulnerability.
 *
 * Precedence:
 *   1. An explicit override (caller-supplied) is respected as-is.
 *   2. Otherwise the CVSS score's band is used when a valid score is present.
 *   3. Otherwise the qualitative severity is used.
 *
 * Returns `null` when the derived band carries no SLA (e.g. informational/none).
 */
export function resolveRemediationSlaDays(opts: {
  cvssScore?: string | number | null;
  severity?: VulnSeverity | null;
  override?: number | null;
}): number | null {
  if (opts.override != null) return opts.override;

  const parsed =
    opts.cvssScore != null && opts.cvssScore !== ""
      ? Number(opts.cvssScore)
      : NaN;
  if (Number.isFinite(parsed) && parsed >= 0) {
    return SLA_DAYS_BY_SEVERITY[severityFromCvss(parsed)];
  }

  if (opts.severity) return SLA_DAYS_BY_SEVERITY[opts.severity];
  return null;
}

/**
 * Compute both the SLA days and the absolute due date for a vulnerability given
 * a discovery timestamp (defaults to now). Returns `remediationDueAt: null` when
 * no SLA applies.
 */
export function computeRemediationSla(opts: {
  cvssScore?: string | number | null;
  severity?: VulnSeverity | null;
  override?: number | null;
  discoveredAt?: Date | null;
}): { remediationSlaDays: number | null; remediationDueAt: Date | null } {
  const days = resolveRemediationSlaDays(opts);
  if (days == null) return { remediationSlaDays: null, remediationDueAt: null };
  const base = opts.discoveredAt ?? new Date();
  return {
    remediationSlaDays: days,
    remediationDueAt: new Date(base.getTime() + days * 86400000),
  };
}
