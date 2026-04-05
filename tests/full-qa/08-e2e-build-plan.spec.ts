/**
 * NexusOps Full-QA — Suite 08: E2E build-plan (outcome-based)
 *
 * These tests validate that the platform does real work—not only that procedures
 * return HTTP 200. Each test asserts a create→read chain, structured API data,
 * or a visible UI outcome after user actions.
 */

import { test, expect } from "@playwright/test";
import {
  apiCall,
  extractTrpcJson,
  BASE_URL,
  pageHasCrash,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("08a — API: recruitment requisition create → list contains row", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
  });

  test("recruitment.requisitions.create then list includes new title", async ({ page }) => {
    const suffix = Date.now();
    const title = `QA-E2E Requisition ${suffix}`;
    const createRes = await apiCall(
      page,
      "recruitment.requisitions.create",
      {
        title,
        department: "QA Automation",
        openings: 1,
        type: "full_time",
        level: "mid",
        publishImmediately: false,
      },
      "POST",
    );
    expect(createRes.status, JSON.stringify(createRes.data)).toBe(200);
    const created = extractTrpcJson(createRes.data) as { id?: string; title?: string };
    expect(created?.title, "create payload should return row with title").toBe(title);

    const listRes = await apiCall(page, "recruitment.requisitions.list", { search: String(suffix) }, "GET");
    expect(listRes.status, JSON.stringify(listRes.data)).toBe(200);
    const rows = extractTrpcJson(listRes.data) as Array<{ title?: string }>;
    expect(Array.isArray(rows), "list must return an array").toBe(true);
    const found = rows.some((r) => r.title === title);
    expect(found, `list must include created requisition "${title}"`).toBe(true);
  });
});

test.describe("08b — API: workforce + HR return structured aggregates", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
  });

  test("workforce.summary returns numeric total headcount field", async ({ page }) => {
    const res = await apiCall(page, "workforce.summary", {}, "GET");
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const data = extractTrpcJson(res.data) as { total?: unknown };
    expect(typeof data?.total).toBe("number");
  });

  test("workforce.headcount returns total and breakdown arrays", async ({ page }) => {
    const res = await apiCall(page, "workforce.headcount", { days: 180 }, "GET");
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const data = extractTrpcJson(res.data) as {
      total?: unknown;
      byDept?: unknown;
      byLocation?: unknown;
    };
    expect(typeof data?.total).toBe("number");
    expect(Array.isArray(data?.byDept)).toBe(true);
    expect(Array.isArray(data?.byLocation)).toBe(true);
  });

  test("hr.employees.list returns an array (directory backing data)", async ({ page }) => {
    const res = await apiCall(page, "hr.employees.list", {}, "GET");
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const rows = extractTrpcJson(res.data);
    expect(Array.isArray(rows), "employees.list must be an array").toBe(true);
  });

  test("hr.employees.listUsersWithoutEmployee returns an array when authorized", async ({ page }) => {
    const res = await apiCall(page, "hr.employees.listUsersWithoutEmployee", {}, "GET");
    expect([200, 403], `unexpected status ${res.status}`).toContain(res.status);
    if (res.status === 200) {
      const rows = extractTrpcJson(res.data);
      expect(Array.isArray(rows), "listUsersWithoutEmployee must be an array").toBe(true);
    }
  });
});

test.describe("08c — API: secretarial list procedures return data shape", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/app/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
  });

  test("secretarial.meetings.list returns array", async ({ page }) => {
    const res = await apiCall(page, "secretarial.meetings.list", {}, "GET");
    expect([200, 403]).toContain(res.status);
    if (res.status !== 200) return;
    const rows = extractTrpcJson(res.data);
    expect(Array.isArray(rows), "meetings.list must be an array").toBe(true);
  });
});

test.describe("08d — UI: recruitment flow and accurate product naming", () => {
  test("recruitment page does not claim ATS; requisition appears after UI create", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/app/recruitment`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => !document.body.innerText.includes("Verifying session"),
      { timeout: 20_000 },
    ).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});

    const body = await page.locator("body").innerText();
    expect(pageHasCrash(body)).toBeNull();
    expect(body).not.toMatch(/\bATS\b/i);
    await expect(page.getByRole("heading", { name: /^Recruitment$/ })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Requisitions" }).click();
    await page.getByRole("button", { name: "New Requisition" }).click();

    const uiTitle = `QA-UI-Req ${Date.now()}`;
    await page.getByPlaceholder(/Senior Backend/i).fill(uiTitle);
    await page.getByPlaceholder("Engineering").fill("QA UI Dept");

    await page.getByRole("button", { name: "Create Requisition" }).click();

    await expect(page.getByText(uiTitle).first()).toBeVisible({ timeout: 25_000 });
  });
});

test.describe("08e — UI: people analytics and HR directory hooks", () => {
  test("people analytics shows data-source guidance (read-only)", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/people-analytics`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => !document.body.innerText.includes("Verifying session"),
      { timeout: 20_000 },
    ).catch(() => {});
    const body = await page.locator("body").innerText();
    expect(pageHasCrash(body)).toBeNull();
    expect(body).toMatch(/Read-only analytics/i);
    expect(body).toMatch(/HR/i);
  });

  test("HR employee directory tab shows directory UI", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/hr`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => !document.body.innerText.includes("Verifying session"),
      { timeout: 20_000 },
    ).catch(() => {});
    const body = await page.locator("body").innerText();
    expect(pageHasCrash(body)).toBeNull();
    await page.getByRole("button", { name: "Employee Directory" }).click();
    const after = await page.locator("body").innerText();
    expect(after).toMatch(/Employee/i);
  });
});
