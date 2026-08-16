/**
 * ACCEPTANCE — an HR case is a real service-desk record.
 *
 * Before this, `hr_cases` had no `number` and no `subject` column, and the list
 * invented both:
 *   Case #   = id.slice(-8).toUpperCase()  — not a fallback, the ONLY path
 *   Subject  = the NOTES BODY with [RESOLVED:…]/[ARCHIVED:…] stripped by regex
 *   Assignee = the raw assigneeId UUID
 *   SLA      = a hardcoded em-dash (deleted — nothing backs it)
 *
 * A router test cannot catch these: the procedure was returning correct rows the
 * whole time and the screen was inventing the columns. Only clicking does.
 *
 * page.goto is used once, for /login, and nowhere else.
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "demo1234!") {
  await page.goto("/login"); // the only permitted goto in this spec
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 20_000 });
}

test.describe("HR cases", () => {
  /**
   * BLOCKED ON AN E2E FIXTURE GAP — NOT on the product, and NOT on this spec.
   *
   * The e2e login `admin@coheron.com` belongs to org `coheron-demo`, and on a
   * freshly seeded database that org has:
   *     employees          0
   *     salary_structures  0
   * (the ~25 employees in the test DB belong to ephemeral `qa-test-*` orgs that
   * API tests create and tear down — there is no stable login inside one.)
   *
   * The New HR Case form requires an employee, and the Add Employee form requires
   * a salary structure, so exercising HR Cases by clicking needs a three-level
   * fixture chain — salary structure → employee → case — that does not exist.
   * Building it here would mean inventing fixtures across the payroll and
   * directory surfaces, both explicitly out of this round's scope.
   *
   * `fixme` rather than `skip`: this is a known blocker with a known fix, not a
   * test that does not apply. THE ASSERTIONS BELOW HAVE NEVER RUN — do not read
   * a green suite as evidence that HR Cases works end to end.
   *
   * TO UNBLOCK: seed one salary structure and one employee into `coheron-demo`
   * in the e2e path, then delete this line. That is a shared-fixture change
   * affecting every spec, so it is a product-owner decision, not a silent one.
   */
  test.fixme(true, "e2e org coheron-demo has no employees or salary structures — see comment above");

  test("a case is created with a subject, and lists with a real number, that subject and a named assignee", async ({ page }) => {
    const stamp = Date.now();
    const subject = `Relocation allowance query ${stamp}`;

    await loginAs(page, "admin@coheron.com");

    // ── Click through nav to HR → Cases ─────────────────────────────────────
    const filter = page.getByPlaceholder("Filter navigator...");
    await filter.click();
    await filter.fill("HR Service");
    // "HR" alone also matches the HR-Ops workbench link (/app/workbench/hr-ops).
    // "HR Service Delivery" is the sidebar label for /app/hr itself.
    await page.getByRole("link", { name: /HR Service Delivery/i }).first().click();
    await page.waitForURL(/\/app\/hr/, { timeout: 20_000 });
    await page.getByRole("button", { name: "HR Cases", exact: true }).first().click();
    await page.waitForLoadState("networkidle");

    // ── Create a case ───────────────────────────────────────────────────────
    await page.getByRole("button", { name: /New HR Case/i }).first().click();

    const subjectInput = page.getByTestId("hr-case-subject-input");
    await expect(subjectInput).toBeVisible({ timeout: 15_000 });
    await subjectInput.fill(subject);

    // Employee is required; pick the first real option.
    await page.getByTestId("hr-case-employee-select").selectOption({ index: 1 });

    await page.getByRole("button", { name: /^Create Case$/i }).last().click();
    await page.waitForLoadState("networkidle");

    // ── It appears, with a REAL case number ─────────────────────────────────
    const row = page.locator("tr", { hasText: subject }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // HRC-0001 style, allocated from org_counters — NOT an 8-char UUID tail.
    const numberCell = row.getByTestId("hr-case-number");
    await expect(numberCell).toHaveText(/^HRC-\d{4,}$/, { timeout: 15_000 });

    // ── The subject is the one that was typed, not a slice of the notes ─────
    await expect(row.getByTestId("hr-case-subject")).toHaveText(subject);

    // ── The assignee renders a NAME, never a UUID ───────────────────────────
    // Auto-assignment may leave it unset; what must never appear is a raw UUID.
    const assignee = await row.getByTestId("hr-case-assignee").textContent();
    expect(assignee).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // ── The SLA column is gone — nothing backed it ──────────────────────────
    await expect(page.getByRole("columnheader", { name: "SLA", exact: true })).toHaveCount(0);

    // ── and it all survives a reload (persisted, not local state) ───────────
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "HR Cases", exact: true }).first().click();
    await page.waitForLoadState("networkidle");

    const afterReload = page.locator("tr", { hasText: subject }).first();
    await expect(afterReload.getByTestId("hr-case-number")).toHaveText(/^HRC-\d{4,}$/, { timeout: 20_000 });
    await expect(afterReload.getByTestId("hr-case-subject")).toHaveText(subject);
  });
});
