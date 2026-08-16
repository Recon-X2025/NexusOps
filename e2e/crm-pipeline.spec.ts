/**
 * ACCEPTANCE — the CRM Pipeline, end to end by clicking (Round 12).
 *
 * What this proves that router tests cannot: the New Deal FORM sends the stage the
 * rep picked. `crm_deals.stage` was a required field on that form whose value the
 * mutate payload never included, so every deal created through the UI landed on
 * the `prospect` column default whatever was selected. A router test calling
 * `deals.create({stage})` directly passes either way — only clicking catches it.
 *
 * It also proves the move survives a reload, i.e. it was persisted rather than
 * only reflected in local state.
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

async function gotoPipeline(page: Page) {
  const filter = page.getByPlaceholder("Filter navigator...");
  await filter.click();
  await filter.fill("CRM");
  await page.getByRole("link", { name: /CRM & Sales/i }).first().click();
  await page.waitForURL(/\/app\/crm/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Pipeline", exact: true }).first().click();
  await page.waitForLoadState("networkidle");
}

/** The card for a deal, located by its title. */
const cardFor = (page: Page, title: string) =>
  page.getByTestId("pipeline-deal-card").filter({ hasText: title }).first();

/**
 * Assert a `data-value` NUMERICALLY.
 *
 * `crm_deals.value` is a Postgres `decimal(14,2)`, so it arrives as "750000.00"
 * — a string-exact match against "750000" fails on the scale, not on the amount.
 * The point of data-value is to assert the number independently of formatting,
 * so the comparison has to be numeric too.
 */
async function expectValue(locator: ReturnType<Page["getByTestId"]>, expected: number) {
  await expect
    .poll(async () => Number(await locator.getAttribute("data-value")), { timeout: 20_000 })
    .toBe(expected);
}

/**
 * Fill the New Deal dialog. `probability` is deliberately NOT set — the point is
 * that it arrives pre-filled from the stage.
 */
async function fillNewDeal(
  page: Page,
  opts: { title: string; value?: string; expectedClose?: string; stage: string },
) {
  await page.getByRole("button", { name: /Add Deal/i }).first().click();
  const dialog = page.getByTestId("new-deal-dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  await dialog.locator("input").first().fill(opts.title);

  const selects = dialog.locator("select");
  await selects.nth(0).selectOption({ index: 1 });                                   // account
  await expect(selects.nth(1).locator("option")).not.toHaveCount(1, { timeout: 10_000 });
  await selects.nth(1).selectOption({ index: 1 });                                   // contact

  if (opts.value !== undefined) await dialog.locator('input[type="number"]').nth(0).fill(opts.value);
  await page.getByTestId("deal-stage").selectOption(opts.stage);
  if (opts.expectedClose) await dialog.locator('input[type="date"]').first().fill(opts.expectedClose);
  return dialog;
}

test.describe("CRM pipeline", () => {
  test("a deal is created at the chosen stage, shows its value there, and a move survives a reload", async ({ page }) => {
    const stamp = Date.now();
    const title = `Pipeline Deal ${stamp}`;

    await loginAs(page, "admin@coheron.com");
    await gotoPipeline(page);

    // ── Create at "negotiation", NOT the prospect default ───────────────────
    await page.getByRole("button", { name: /Add Deal/i }).first().click();
    const dialog = page.getByTestId("new-deal-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await dialog.locator("input").first().fill(title);

    // Account and contact are required and are the first two selects; pick the
    // first real option of each. Contact options are filtered by the account, so
    // the account must be chosen first.
    const selects = dialog.locator("select");
    const accountSelect = selects.nth(0);
    await accountSelect.selectOption({ index: 1 });
    await expect(selects.nth(1).locator("option")).not.toHaveCount(1, { timeout: 10_000 });
    await selects.nth(1).selectOption({ index: 1 });

    await dialog.locator('input[type="number"]').nth(0).fill("750000"); // value
    await dialog.locator('input[type="number"]').nth(1).fill("60");     // probability
    await selects.nth(2).selectOption("negotiation");                    // stage
    await dialog.locator('input[type="date"]').first().fill("2026-12-31");

    await page.getByTestId("new-deal-save").click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    // ── It lands in the NEGOTIATION column, not prospect ────────────────────
    const card = cardFor(page, title);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toHaveAttribute("data-stage", "negotiation");

    // …and the column it sits in agrees. This is the assertion the old defect
    // would have failed: the card would have been under `prospect`.
    const column = page.getByTestId("pipeline-stage-column").filter({ hasText: title }).first();
    await expect(column).toHaveAttribute("data-stage", "negotiation");

    // ── with the value it was given ─────────────────────────────────────────
    // data-value carries the raw amount, so this does not depend on the ₹750K
    // abbreviation (there is no shared money formatter yet).
    await expectValue(card.getByTestId("pipeline-deal-value"), 750000);

    // ── Move it to "proposal" ───────────────────────────────────────────────
    await card.getByTestId("pipeline-deal-move").click();
    await page.getByRole("button", { name: /^Proposal$/i }).first().click();
    await expect(cardFor(page, title)).toHaveAttribute("data-stage", "proposal", { timeout: 20_000 });

    // ── and it PERSISTED, not just re-rendered ──────────────────────────────
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Pipeline", exact: true }).first().click();
    await page.waitForLoadState("networkidle");

    const afterReload = cardFor(page, title);
    await expect(afterReload).toBeVisible({ timeout: 20_000 });
    await expect(afterReload).toHaveAttribute("data-stage", "proposal");
    await expectValue(afterReload.getByTestId("pipeline-deal-value"), 750000);
  });

  test("probability pre-fills from the stage, and closed-won is refused until the deal is complete", async ({ page }) => {
    const stamp = Date.now();
    const title = `Stage Rules ${stamp}`;

    await loginAs(page, "admin@coheron.com");
    await gotoPipeline(page);

    // ── The probability arrives pre-filled from the stage ───────────────────
    // Opened at prospect (the default) → 10.
    await page.getByRole("button", { name: /Add Deal/i }).first().click();
    const dialog = page.getByTestId("new-deal-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("deal-probability")).toHaveValue("10");

    // Changing the stage moves the default with it, because nothing was typed.
    await page.getByTestId("deal-stage").selectOption("proposal");
    await expect(page.getByTestId("deal-probability")).toHaveValue("50");
    await page.getByTestId("deal-stage").selectOption("negotiation");
    await expect(page.getByTestId("deal-probability")).toHaveValue("70");

    // A typed value is the rep's, and a later stage change must NOT overwrite it.
    await page.getByTestId("deal-probability").fill("42");
    await page.getByTestId("deal-stage").selectOption("qualification");
    await expect(page.getByTestId("deal-probability")).toHaveValue("42");
    await page.getByTestId("deal-stage").selectOption("negotiation");
    await expect(page.getByTestId("deal-probability")).toHaveValue("42");

    // ── Create it deliberately INCOMPLETE: no value ─────────────────────────
    await dialog.locator("input").first().fill(title);
    const selects = dialog.locator("select");
    await selects.nth(0).selectOption({ index: 1 });
    await expect(selects.nth(1).locator("option")).not.toHaveCount(1, { timeout: 10_000 });
    await selects.nth(1).selectOption({ index: 1 });
    await dialog.locator('input[type="date"]').first().fill("2026-12-31");
    await dialog.locator('input[type="number"]').nth(0).fill("0"); // value = 0

    await page.getByTestId("new-deal-save").click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    const card = cardFor(page, title);
    await expect(card).toBeVisible({ timeout: 20_000 });

    // ── Closed Won is refused, and the refusal NAMES the missing field ──────
    await card.getByTestId("pipeline-deal-move").click();
    await expect(page.getByTestId("move-won-blocked")).toContainText(/value/i);
    await expect(page.getByTestId("move-to-closed_won")).toBeDisabled();
    await page.getByTestId("move-close").click();

    // ── Give it a value, then close it won ──────────────────────────────────
    await card.click(); // through to the deal record
    await page.waitForURL(/\/app\/crm\/deals\//, { timeout: 20_000 });
    await page.getByRole("button", { name: /^Edit$/i }).first().click();
    const editValue = page.locator('input[type="number"]').first();
    await editValue.fill("300000");
    await page.getByRole("button", { name: /Save Changes/i }).first().click();
    await page.waitForLoadState("networkidle");

    await page.getByTestId("deal-stage-closed_won").click();
    await expect(page.getByTestId("deal-stage-closed_won")).toBeDisabled({ timeout: 20_000 });
  });

  test("closed-lost captures a reason and displays it", async ({ page }) => {
    const stamp = Date.now();
    const title = `Lost Deal ${stamp}`;
    const reason = "Lost to a competitor";

    await loginAs(page, "admin@coheron.com");
    await gotoPipeline(page);

    const dialog = await fillNewDeal(page, {
      title, value: "120000", expectedClose: "2026-11-30", stage: "proposal",
    });
    await page.getByTestId("new-deal-save").click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    const card = cardFor(page, title);
    await expect(card).toBeVisible({ timeout: 20_000 });

    // ── Moving to Closed Lost asks for a reason before it will move ─────────
    await card.getByTestId("pipeline-deal-move").click();
    await page.getByTestId("move-to-closed_lost").click();

    const lostDialog = page.getByTestId("lost-reason-dialog");
    await expect(lostDialog).toBeVisible({ timeout: 15_000 });
    // Required: nothing chosen, nothing submittable.
    await expect(page.getByTestId("lost-reason-confirm")).toBeDisabled();

    await page.getByTestId("lost-reason-select").selectOption(reason);
    await expect(page.getByTestId("lost-reason-confirm")).toBeEnabled();
    await page.getByTestId("lost-reason-confirm").click();
    await expect(lostDialog).toBeHidden({ timeout: 20_000 });

    // ── It moved, and the reason is DISPLAYED on the card ───────────────────
    const lost = cardFor(page, title);
    await expect(lost).toHaveAttribute("data-stage", "closed_lost", { timeout: 20_000 });
    await expect(lost.getByTestId("pipeline-deal-lost-reason")).toHaveText(reason);

    // ── and it persisted, and shows on the deal record too ──────────────────
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Pipeline", exact: true }).first().click();
    await page.waitForLoadState("networkidle");
    await expect(cardFor(page, title).getByTestId("pipeline-deal-lost-reason")).toHaveText(reason, { timeout: 20_000 });

    await cardFor(page, title).click();
    await page.waitForURL(/\/app\/crm\/deals\//, { timeout: 20_000 });
    await expect(page.getByTestId("deal-lost-reason")).toHaveText(reason, { timeout: 20_000 });
  });
});
