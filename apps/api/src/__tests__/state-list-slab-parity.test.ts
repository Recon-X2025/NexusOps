/**
 * EVERY state offered by the employee dropdown MUST resolve to a professional-tax
 * slab row. This test exists to stop the two lists drifting apart again.
 *
 * They had drifted. The dropdown (apps/web/src/lib/india-states.ts) spelled three
 * union territories with "&" where professional_tax_slabs.state_name spells "and":
 *
 *     Jammu & Kashmir                       vs  Jammu and Kashmir
 *     Andaman & Nicobar                     vs  Andaman and Nicobar Islands
 *     Dadra & Nagar Haveli and Daman & Diu  vs  Dadra and Nagar Haveli and Daman and Diu
 *
 * Because the lookup key was built by uppercasing and underscoring whitespace only,
 * those three produced a key no slab row carried — so a state PICKED FROM THE
 * DROPDOWN yielded `unknownState` and ₹0 PT. All three are non-levying, so nobody
 * was mis-deducted, but the payroll run recorded "unknown state" instead of a
 * correct nil, which is a different thing entirely to an auditor.
 *
 * Round 6 fixed BOTH sides: the list was realigned, AND normalizePtStateKey now
 * treats "&" and "and" as equivalent so the engine survives the next divergence.
 * This test guards the invariant that actually matters — not that the two strings
 * are byte-identical, but that every offered value RESOLVES.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizePtStateKey } from "@coheronconnect/payroll-math";
import { testDb } from "./helpers";
import { professionalTaxSlabs, isNull } from "@coheronconnect/db";

/**
 * Read the dropdown list from source rather than importing it: it lives in the web
 * app, which the API test project does not compile. Reading the file keeps this
 * test honest — it fails if someone edits the real list, which is the whole point.
 */
function readDropdownStates(): string[] {
  const path = resolve(__dirname, "../../../../apps/web/src/lib/india-states.ts");
  const src = readFileSync(path, "utf8");
  const body = src.slice(src.indexOf("INDIAN_STATES"));
  return [...body.matchAll(/^\s*"([^"]+)",/gm)].map((m) => m[1]!);
}

describe("state dropdown ↔ professional-tax slab parity", () => {
  let dropdown: string[];
  let slabKeys: Set<string>;
  let slabNames: string[];

  beforeAll(async () => {
    dropdown = readDropdownStates();
    // Platform defaults (org_id IS NULL) — the vocabulary every tenant inherits.
    const rows = await testDb()
      .select({ stateName: professionalTaxSlabs.stateName })
      .from(professionalTaxSlabs)
      .where(isNull(professionalTaxSlabs.orgId));
    slabNames = rows.map((r) => r.stateName);
    slabKeys = new Set(slabNames.map(normalizePtStateKey));
  });

  it("reads a plausible dropdown list (guards against the regex silently matching nothing)", () => {
    expect(dropdown.length).toBeGreaterThanOrEqual(36);
    expect(dropdown).toContain("Karnataka");
    expect(new Set(dropdown).size).toBe(dropdown.length);
  });

  it("has platform-default slab rows to match against", () => {
    expect(slabNames.length).toBeGreaterThanOrEqual(36);
  });

  it("EVERY dropdown value resolves to a slab row through the engine's own normalisation", () => {
    const unresolved = dropdown.filter((s) => !slabKeys.has(normalizePtStateKey(s)));
    expect(
      unresolved,
      "These dropdown states resolve NO professional-tax slab, so picking one yields " +
        "unknownState and ₹0 PT. Either the dropdown or professional_tax_slabs.state_name " +
        "has drifted — realign them, do not delete the assertion:\n" +
        unresolved.map((s) => `  - ${s} → ${normalizePtStateKey(s)}`).join("\n"),
    ).toEqual([]);
  });

  it("the three previously-drifted union territories resolve", () => {
    for (const s of [
      "Jammu and Kashmir",
      "Andaman and Nicobar Islands",
      "Dadra and Nagar Haveli and Daman and Diu",
    ]) {
      expect(dropdown, `${s} should be the spelling the dropdown offers`).toContain(s);
      expect(slabKeys.has(normalizePtStateKey(s)), `${s} should resolve a slab`).toBe(true);
    }
  });

  it("normalizePtStateKey treats & and 'and' as equivalent, so this class of drift cannot recur", () => {
    expect(normalizePtStateKey("Jammu & Kashmir")).toBe(normalizePtStateKey("Jammu and Kashmir"));
    expect(normalizePtStateKey("Andaman & Nicobar")).toBe(normalizePtStateKey("Andaman and Nicobar"));
    expect(normalizePtStateKey("Tamil Nadu")).toBe("TAMIL_NADU");
    expect(normalizePtStateKey("  Tamil   Nadu ")).toBe("TAMIL_NADU");
    // Even the old "&" spellings now resolve against the current slab table.
    expect(slabKeys.has(normalizePtStateKey("Jammu & Kashmir"))).toBe(true);
    expect(slabKeys.has(normalizePtStateKey("Dadra & Nagar Haveli and Daman & Diu"))).toBe(true);
  });
});
