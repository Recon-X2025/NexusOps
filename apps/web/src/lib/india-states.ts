/**
 * Canonical Indian states + union territories for the employee-form state select.
 *
 * The names here MUST match `professional_tax_slabs.state_name` (seeded by
 * migration 0075), because that table is what the PT lookup actually reads:
 * `computePT` resolves `overrides[normalizePtStateKey(state)]`, and
 * `statutory-ceilings.ts` builds those overrides keyed on
 * `stateName.toUpperCase().replace(/\s+/g, "_")`. A value absent from that table
 * cannot resolve a slab.
 *
 * Three values were realigned here (Round 6): "Jammu & Kashmir",
 * "Andaman & Nicobar" and "Dadra & Nagar Haveli and Daman & Diu" used "&" where
 * the slab table spells "and", so those three — picked from this very dropdown —
 * produced `unknownState` and ₹0 PT. All three are non-levying, so no employee was
 * mis-deducted, but the run recorded "unknown state" rather than a correct nil.
 *
 * NOTE — this list intentionally NO LONGER matches `GSTIN_STATE_CODES` in
 * `@coheronconnect/payroll-math`, which still uses the "&" spellings. That is safe
 * because nothing feeds an employee's state into the GST path: GST place-of-supply
 * is resolved from the org's GSTIN registration and from vendor/customer state,
 * never from `employees.state`. The two lists serve different lookups and the GST
 * one is the IRP's own vocabulary — do not "fix" it to match this file.
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
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];
