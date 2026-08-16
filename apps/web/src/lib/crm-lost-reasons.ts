/**
 * Lost reasons offered when a deal is moved to Closed Lost.
 *
 * A PICKLIST rather than free text, because the point of capturing a lost reason
 * is win/loss analysis, and free text across seven tenants yields two hundred
 * distinct strings and no analysis. `crm_deals.lostReason` is a `text` column,
 * not an enum, so these store verbatim with no migration.
 *
 * "Other" swaps to a free-text box and stores what the rep types INSTEAD of the
 * literal "Other" — so the common cases stay reportable and the tail stays
 * honest, both inside the one column the schema has.
 *
 * Shared module, not a copy per screen: the Pipeline board's Move popover and the
 * deal record's stage selector both capture this, and two lists that drift apart
 * is the exact defect this codebase keeps rediscovering.
 */
export const LOST_REASONS = [
  "Price — too expensive",
  "Lost to a competitor",
  "No budget / budget frozen",
  "No decision — went quiet",
  "Timing — revisit later",
  "Missing capability",
  "Chose to build in-house",
] as const;

export const LOST_REASON_OTHER = "Other";
