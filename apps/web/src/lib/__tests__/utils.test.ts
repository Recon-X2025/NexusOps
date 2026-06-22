import { describe, it, expect, vi, beforeEach } from "vitest";
import { cn, formatDate, formatRelativeTime, formatCurrency, truncate, getPriorityColor, getStatusBadgeVariant } from "../utils";

// ── cn (classname merger) ──────────────────────────────────────────────────

describe("cn", () => {
  it("merges class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("deduplicates conflicting Tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });

  it("handles undefined and null values gracefully", () => {
    expect(cn(undefined, null as unknown as string, "visible")).toBe("visible");
  });
});

// ── formatDate ─────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("returns '—' for null input", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns '—' for undefined input", () => {
    expect(formatDate(undefined)).toBe("—");
  });

  it("returns '—' for empty string", () => {
    expect(formatDate("")).toBe("—");
  });

  it("formats a valid Date object", () => {
    const result = formatDate(new Date("2024-01-15"));
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2024/);
  });

  it("formats a valid ISO date string", () => {
    const result = formatDate("2024-06-20T00:00:00.000Z");
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2024/);
  });
});

// ── formatRelativeTime ─────────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  it("returns '—' for null input", () => {
    expect(formatRelativeTime(null)).toBe("—");
  });

  it("returns '—' for undefined input", () => {
    expect(formatRelativeTime(undefined)).toBe("—");
  });

  it("returns '—' for invalid date string", () => {
    expect(formatRelativeTime("not-a-date")).toBe("—");
  });

  it("returns 'just now' for a timestamp less than 1 minute ago", () => {
    const recent = new Date(Date.now() - 30_000); // 30 seconds ago
    expect(formatRelativeTime(recent)).toBe("just now");
  });

  it("returns minutes ago for < 60 minutes", () => {
    const minutesAgo = new Date(Date.now() - 5 * 60_000); // 5 minutes ago
    expect(formatRelativeTime(minutesAgo)).toBe("5m ago");
  });

  it("returns hours ago for < 24 hours", () => {
    const hoursAgo = new Date(Date.now() - 3 * 3_600_000); // 3 hours ago
    expect(formatRelativeTime(hoursAgo)).toBe("3h ago");
  });

  it("returns days ago for < 7 days", () => {
    const daysAgo = new Date(Date.now() - 2 * 86_400_000); // 2 days ago
    expect(formatRelativeTime(daysAgo)).toBe("2d ago");
  });

  it("falls back to formatDate for dates older than 7 days", () => {
    const old = new Date("2020-01-01T00:00:00.000Z");
    const result = formatRelativeTime(old);
    expect(result).toMatch(/2020/);
  });
});

// ── formatCurrency ─────────────────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formats a positive INR amount", () => {
    const result = formatCurrency(1000, "INR");
    expect(result).toContain("1,000");
  });

  it("formats a positive USD amount", () => {
    const result = formatCurrency(500.5, "USD");
    expect(result).toContain("500");
  });

  it("accepts a numeric string", () => {
    const result = formatCurrency("250", "INR");
    expect(result).toContain("250");
  });

  it("handles zero", () => {
    const result = formatCurrency(0, "INR");
    expect(result).toContain("0");
  });

  it("handles negative amounts", () => {
    const result = formatCurrency(-100, "INR");
    expect(result).toMatch(/-/);
  });
});

// ── truncate ───────────────────────────────────────────────────────────────

describe("truncate", () => {
  it("returns the original string when it is shorter than maxLength", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the original string when it equals maxLength", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when string exceeds maxLength", () => {
    expect(truncate("hello world", 5)).toBe("hello…");
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });

  it("handles maxLength of 0", () => {
    expect(truncate("hello", 0)).toBe("…");
  });
});

// ── getPriorityColor ───────────────────────────────────────────────────────

describe("getPriorityColor", () => {
  it("returns red class for critical priority", () => {
    expect(getPriorityColor("critical")).toBe("text-red-600");
  });

  it("returns orange class for high priority", () => {
    expect(getPriorityColor("high")).toBe("text-orange-600");
  });

  it("returns amber class for medium priority", () => {
    expect(getPriorityColor("medium")).toBe("text-amber-600");
  });

  it("returns gray class for low priority", () => {
    expect(getPriorityColor("low")).toBe("text-gray-500");
  });

  it("is case-insensitive", () => {
    expect(getPriorityColor("CRITICAL")).toBe("text-red-600");
    expect(getPriorityColor("High")).toBe("text-orange-600");
  });

  it("falls back to gray for unknown priority", () => {
    expect(getPriorityColor("unknown")).toBe("text-gray-500");
  });
});

// ── getStatusBadgeVariant ──────────────────────────────────────────────────

describe("getStatusBadgeVariant", () => {
  it("returns 'default' for open status", () => {
    expect(getStatusBadgeVariant("open")).toBe("default");
  });

  it("returns 'secondary' for in_progress status", () => {
    expect(getStatusBadgeVariant("in_progress")).toBe("secondary");
  });

  it("returns 'outline' for resolved status", () => {
    expect(getStatusBadgeVariant("resolved")).toBe("outline");
  });

  it("returns 'outline' for closed status", () => {
    expect(getStatusBadgeVariant("closed")).toBe("outline");
  });

  it("falls back to 'default' for unknown status", () => {
    expect(getStatusBadgeVariant("unknown_status")).toBe("default");
  });
});

// ── downloadCSV ────────────────────────────────────────────────────────────
// downloadCSV uses browser globals (URL, document) and toast — test via mocks.

describe("downloadCSV", () => {
  let toastErrorSpy: ReturnType<typeof vi.fn>;
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Mock sonner toast before importing downloadCSV
    vi.resetModules();
    toastErrorSpy = vi.fn();
    vi.doMock("sonner", () => ({ toast: { error: toastErrorSpy } }));

    // Mock browser globals
    createObjectURLSpy = vi.fn().mockReturnValue("blob:mock-url");
    revokeObjectURLSpy = vi.fn();
    clickSpy = vi.fn();

    globalThis.URL = {
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    } as unknown as typeof URL;

    globalThis.document = {
      createElement: () => ({
        href: "",
        download: "",
        click: clickSpy,
      }),
    } as unknown as Document;

    globalThis.Blob = class {
      constructor(public content: unknown[], public options?: unknown) {}
    } as unknown as typeof Blob;
  });

  it("calls toast.error when rows array is empty", async () => {
    const { downloadCSV } = await import("../utils");
    downloadCSV([], "test_export");
    expect(toastErrorSpy).toHaveBeenCalledWith("No data to export.");
  });

  it("triggers a download click for non-empty rows", async () => {
    const { downloadCSV } = await import("../utils");
    downloadCSV([{ Name: "Alice", Score: 100 }], "test_export");
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("escapes values containing commas", async () => {
    const { downloadCSV } = await import("../utils");
    // Should not throw when value contains a comma
    expect(() =>
      downloadCSV([{ Name: "Smith, John", Score: 99 }], "test")
    ).not.toThrow();
  });

  it("escapes values containing double quotes", async () => {
    const { downloadCSV } = await import("../utils");
    expect(() =>
      downloadCSV([{ Description: 'He said "hello"' }], "test")
    ).not.toThrow();
  });

  it("handles null and undefined cell values without throwing", async () => {
    const { downloadCSV } = await import("../utils");
    expect(() =>
      downloadCSV([{ Name: null, Value: undefined } as unknown as Record<string, unknown>], "test")
    ).not.toThrow();
  });
});
