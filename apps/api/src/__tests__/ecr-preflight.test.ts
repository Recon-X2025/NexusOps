/**
 * ECR PRE-FLIGHT — catch the EPFO rejections before the file leaves the building.
 * ─────────────────────────────────────────────────────────────────────────────
 * Two conditions EPFO rejects on, neither previously detectable:
 *   1. No UAN. `generateECR` substituted the literal string "UNKNOWN", so a member with no UAN
 *      produced a valid-looking line carrying a fabricated identifier — the invent-an-identifier
 *      defect class from CLAUDE.md, except this one goes to a regulator.
 *   2. UAN KYC not done. This is the reason `employees.pf_kyc_status` exists; storing it and
 *      never reading it would be the "stored but never evaluated" anti-pattern.
 *
 * Behaviour is deliberately asymmetric: the PREVIEW lists every blocker so an operator can fix
 * them in one pass; the portal SUBMIT refuses, because a rejected upload costs a filing window.
 */
import { describe, it, expect } from "vitest";
import { ecrPreflight } from "../lib/india/ecr-format";

const base = { id: "emp-1", employeeId: "EMP-0001" };

describe("ecrPreflight", () => {
  it("passes a fully-KYC'd member with a UAN", () => {
    expect(
      ecrPreflight([{ ...base, uan: "101340784698", pfKycStatus: "done" }]),
    ).toEqual([]);
  });

  it("blocks a member with no UAN — never let a fabricated identifier reach EPFO", () => {
    const b = ecrPreflight([{ ...base, uan: null, pfKycStatus: "done" }]);
    expect(b).toHaveLength(1);
    expect(b[0]!.employeeCode).toBe("EMP-0001");
    expect(b[0]!.reason).toMatch(/no uan/i);
  });

  it("treats a blank/whitespace UAN as missing", () => {
    expect(ecrPreflight([{ ...base, uan: "   ", pfKycStatus: "done" }])).toHaveLength(1);
  });

  it("blocks pending KYC", () => {
    const b = ecrPreflight([{ ...base, uan: "101340784698", pfKycStatus: "pending" }]);
    expect(b).toHaveLength(1);
    expect(b[0]!.reason).toMatch(/kyc is pending/i);
  });

  it("blocks REJECTED KYC too — rejected is not a pass", () => {
    // The obvious mistake would be `!== "pending"`. Rejected is just as unfileable.
    const b = ecrPreflight([{ ...base, uan: "101340784698", pfKycStatus: "rejected" }]);
    expect(b).toHaveLength(1);
    expect(b[0]!.reason).toMatch(/kyc is rejected/i);
  });

  it("blocks a null KYC status (legacy row) rather than assuming it is fine", () => {
    const b = ecrPreflight([{ ...base, uan: "101340784698", pfKycStatus: null }]);
    expect(b).toHaveLength(1);
    expect(b[0]!.reason).toMatch(/not recorded/i);
  });

  it("reports BOTH reasons for one member — an operator should see everything in one pass", () => {
    const b = ecrPreflight([{ ...base, uan: null, pfKycStatus: "pending" }]);
    expect(b).toHaveLength(2);
    expect(b.every((x) => x.employeeCode === "EMP-0001")).toBe(true);
  });

  it("names every blocked member across a run, and leaves clean members out", () => {
    const b = ecrPreflight([
      { id: "a", employeeId: "EMP-A", uan: "1", pfKycStatus: "done" },
      { id: "b", employeeId: "EMP-B", uan: null, pfKycStatus: "done" },
      { id: "c", employeeId: "EMP-C", uan: "3", pfKycStatus: "pending" },
    ]);
    expect(b.map((x) => x.employeeCode).sort()).toEqual(["EMP-B", "EMP-C"]);
  });

  it("falls back to an id fragment when the employee has no code", () => {
    const b = ecrPreflight([
      { id: "0123456789abcdef", employeeId: null, uan: null, pfKycStatus: "done" },
    ]);
    expect(b[0]!.employeeCode).toBe("01234567");
  });

  it("returns nothing for an empty run", () => {
    expect(ecrPreflight([])).toEqual([]);
  });
});
