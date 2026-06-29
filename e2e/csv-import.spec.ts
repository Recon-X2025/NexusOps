/**
 * CSV ingestion verification — Vendors + CRM Leads bulk import.
 *
 * Drives the reusable CSV import modal end-to-end against the running dev
 * stack: opens the importer, uploads an in-memory CSV via the hidden file
 * input, advances the wizard, runs the import, and asserts the success state.
 * Exercises real tRPC ingest.* mutations (writes test rows tagged with a unique
 * run id so repeated runs don't collide on assertions).
 *
 * Run: pnpm exec playwright test e2e/csv-import.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

// Unique per-run token. Full timestamp + random suffix avoids the ~6-digit
// collision window that caused intermittent "name must be unique" CI failures.
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('[data-testid="login-email"]', "admin@coheron.com");
  await page.fill('[data-testid="login-password"]', "demo1234!");
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL(/app\/command/, { timeout: 15000 });
}

/**
 * Upload an in-memory CSV by setting files directly on the modal's hidden file
 * input. We first wait for the dropzone to be visible (ensures the modal has
 * mounted and committed), then scope to the file input nearest that dropzone so
 * we always target the currently-open modal even when other hidden inputs exist
 * elsewhere on the page. Setting files directly (rather than racing the native
 * filechooser event) avoids a flake where the chooser opens before React has
 * committed the freshly-mounted modal.
 */
async function uploadCsv(page: Page, name: string, contents: string) {
  const dropzone = page.getByText(/Drag .* drop a CSV file here/i);
  await dropzone.waitFor({ state: "visible" });

  // The hidden <input type=file> is a sibling inside the same dropzone wrapper.
  const input = dropzone.locator("xpath=ancestor::div[1]//input[@type='file']");
  await input.setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(contents, "utf8"),
  });
}

test.describe("CSV ingestion", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("vendors bulk import", async ({ page }) => {
    await page.goto("/app/vendors");
    // domcontentloaded is deterministic; networkidle can hang on noisy pages.
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /Import CSV/i }).click();
    await expect(page.getByText("Import Vendors")).toBeVisible();

    const csv = [
      "name,vendorType,contactEmail,state,paymentTerms",
      `Acme Supplies ${RUN},goods_supplier,acme${RUN}@example.com,KA,Net 30`,
      `Globex Services ${RUN},service_provider,globex${RUN}@example.com,MH,Net 45`,
    ].join("\n");
    await uploadCsv(page, "vendors.csv", csv);

    // Step 2 preview: wait for the wizard to advance, then assert valid count.
    await expect(page.getByRole("button", { name: /Continue with 2 valid rows/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /Continue with 2 valid rows/i }).click();
    // Step 3 confirm
    await page.getByRole("button", { name: /Import 2 Records/i }).click();
    // Step 5 done
    await expect(page.getByText("Import complete")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/2 records created/i)).toBeVisible();
  });

  test("crm leads bulk import", async ({ page }) => {
    await page.goto("/app/crm");
    // domcontentloaded is deterministic; networkidle can hang on noisy pages.
    await page.waitForLoadState("domcontentloaded");

    // Switch to the Leads tab, then open its importer.
    await page.getByRole("button", { name: /^Leads$/i }).first().click();
    await page.getByRole("button", { name: /^Import$/i }).first().click();
    await expect(page.getByText("Import Leads")).toBeVisible();

    const csv = [
      "firstName,lastName,email,company,source,status",
      `Ada ${RUN},Lovelace,ada${RUN}@example.com,Analytical,referral,new`,
      `Alan ${RUN},Turing,alan${RUN}@example.com,Bletchley,event,contacted`,
    ].join("\n");
    await uploadCsv(page, "leads.csv", csv);

    await expect(page.getByRole("button", { name: /Continue with 2 valid rows/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /Continue with 2 valid rows/i }).click();
    await page.getByRole("button", { name: /Import 2 Records/i }).click();
    await expect(page.getByText("Import complete")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/2 records created/i)).toBeVisible();
  });
});
