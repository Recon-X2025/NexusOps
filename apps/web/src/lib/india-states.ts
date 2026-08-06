/**
 * Canonical Indian states + union territories for the employee-form state select.
 *
 * The names here MUST match the GST state list (`GSTIN_STATE_CODES` /
 * `normaliseStateToCode` in `@coheronconnect/payroll-math`) so that a picked value
 * normalises correctly for both GST and the professional-tax engine
 * (`computePT` upper-cases and underscores the string: "Tamil Nadu" → TAMIL_NADU).
 * (Consolidating this list into the shared package is a later refinement; kept
 * web-local here to keep the state-dropdown change small and severable.)
 *
 * SAFETY, NOT CORRECTNESS: a dropdown stops typos like "Karnatak" → nil PT, but it
 * does not make PT correct for every state. The PT engine holds slabs for only
 * seven states, so picking Kerala or Odisha still resolves to nil PT (with the
 * `unknownState` warning) until C2-STRUCT populates the remaining slabs.
 */
export const INDIAN_STATES: readonly string[] = [
  // 28 states
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  // 8 union territories
  "Andaman & Nicobar",
  "Chandigarh",
  "Dadra & Nagar Haveli and Daman & Diu",
  "Delhi",
  "Jammu & Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];
