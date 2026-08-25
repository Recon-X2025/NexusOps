/**
 * HRA exemption — Income-tax Act section 10(13A) read with Rule 2A.
 *
 * The exemption is the LEAST of three amounts:
 *   1. Actual HRA received.
 *   2. Rent paid in excess of 10% of salary.
 *   3. 50% of salary (metro: Delhi, Mumbai, Kolkata, Chennai) or 40% (non-metro).
 *
 * "Salary" for this rule means Basic + DA (the dearness allowance that forms
 * part of pay for retirement benefits) + commission as a fixed % of turnover;
 * this platform's structure has no turnover commission, so salary = Basic + DA.
 *
 * The exemption exists ONLY under the OLD regime — the NEW regime withdraws it.
 * The result is never negative.
 *
 * This is a pure function: the rent-paid and metro inputs come from an
 * employee rent declaration; the aggregator degrades to 0 when none exists, so
 * Form 16 never OVER-states the exemption.
 */
export interface HraExemptionInput {
  /** Actual HRA received over the period (Rs.). */
  hraReceived: number;
  /** Basic + DA over the same period (Rs.). */
  salaryBasicDa: number;
  /** Rent actually paid over the same period (Rs.). */
  rentPaid: number;
  /** Metro (Delhi/Mumbai/Kolkata/Chennai) → 50% cap, else 40%. */
  isMetro: boolean;
  /** HRA exemption applies only under the OLD regime. Defaults to "old". */
  regime?: "old" | "new";
}

export function computeHraExemption(input: HraExemptionInput): number {
  if ((input.regime ?? "old") === "new") return 0;

  const hraReceived = Math.max(0, input.hraReceived);
  const salary = Math.max(0, input.salaryBasicDa);
  const rentPaid = Math.max(0, input.rentPaid);

  const rentOverTenPercent = Math.max(0, rentPaid - 0.1 * salary);
  const metroCap = (input.isMetro ? 0.5 : 0.4) * salary;

  return Math.max(0, Math.min(hraReceived, rentOverTenPercent, metroCap));
}
