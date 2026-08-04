import { describe, it, expect } from "vitest";
import { isValidPartNumber, PartNumberSchema } from "../inventory";

describe("isValidPartNumber", () => {
  it("accepts valid two sets of numbers separated by a hyphen", () => {
    expect(isValidPartNumber("123-456")).toBe(true);
    expect(isValidPartNumber("001-999")).toBe(true);
    expect(isValidPartNumber("12-3456")).toBe(true);
  });

  it("accepts valid alphanumeric codes containing numbers", () => {
    expect(isValidPartNumber("PN-101")).toBe(true);
    expect(isValidPartNumber("SRV-FAN-120")).toBe(true);
    expect(isValidPartNumber("ABC123")).toBe(true);
    expect(isValidPartNumber("P1")).toBe(true);
    expect(isValidPartNumber("12345")).toBe(true);
    expect(isValidPartNumber("A-123")).toBe(true);
  });

  it("rejects plain text without numbers", () => {
    expect(isValidPartNumber("dgfdsy")).toBe(false);
    expect(isValidPartNumber("fsydgfhsd")).toBe(false);
    expect(isValidPartNumber("part")).toBe(false);
    expect(isValidPartNumber("A-B")).toBe(false);
    expect(isValidPartNumber("INVALIDTEXT")).toBe(false);
  });

  it("rejects empty strings and special characters", () => {
    expect(isValidPartNumber("")).toBe(false);
    expect(isValidPartNumber("   ")).toBe(false);
    expect(isValidPartNumber("PN 101")).toBe(false);
    expect(isValidPartNumber("PN@101")).toBe(false);
  });

  it("Zod schema validates correctly", () => {
    expect(PartNumberSchema.safeParse("PN-101").success).toBe(true);
    expect(PartNumberSchema.safeParse("123-456").success).toBe(true);

    const invalidResult = PartNumberSchema.safeParse("dgfdsy");
    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.error.errors[0].message).toContain("Part number must be an alphanumeric code");
    }
  });
});
