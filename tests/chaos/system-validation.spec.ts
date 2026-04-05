/**
 * NexusOps — Chaos System Validation (“day in the life”).
 *
 * Phases:
 *  1. Optional DB seed (org + chaos admin) or skip-seed login
 *  2. Login (tRPC + Zod-validated credentials/output)
 *  3. Install 10% POST failure (excludes auth.login)
 *  4. Dashboard landing
 *  5. Ticket stress (5× create, 5 retries; Sonner on sampled 500)
 *  6. Tickets queue search (`Search…` placeholder)
 *  7. HAM — concurrent Run Discovery + Export
 *  8. Dashboard Approve/Reject parallelism
 *  9. Second tab: Approvals + Admin (Approve + Delete)
 * 10. Remove chaos route; dashboard screenshot baseline
 * 11. Optional DB verifyTicketCount
 *
 * Run from repo root:
 *   pnpm exec playwright test -c tests/chaos/playwright.config.ts
 */
import { test, expect } from "@playwright/test";
import { CreateTicketSchema } from "@nexusops/types";
import {
  getChaosConfig,
  assertDatabaseUrlMatchesBase,
  applyDatabaseUrlForDrizzle,
} from "./chaos-config";
import { seedChaosOrganization, verifyTicketCount } from "./chaos-seed";
import { trpcLoginWithBackoff, installTenPercentApiFailureRoute } from "./chaos-auth";

const RUN_TICKET_COUNT = 5;

test.describe("NexusOps chaos — system validation", () => {
  test.describe.configure({ mode: "serial" });

  test("full vertical: seed → resilient UI stress → screenshot → DB", async ({ page, context }, testInfo) => {
    const projectKey = testInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 48);
    const config = getChaosConfig(projectKey);
    const runId = `${Date.now()}-${testInfo.workerIndex}`;
    const runTitlePrefix = `CHAOS-RUN-${runId}`;

    // ── Phase 1: seed or skip ──
    if (config.skipSeed) {
      test.skip(!config.loginEmail || !config.loginPassword, "CHAOS_SKIP_SEED requires CHAOS_LOGIN_EMAIL + CHAOS_LOGIN_PASSWORD");
    } else {
      test.skip(!config.databaseUrl, "Seeding requires DATABASE_URL or CHAOS_DATABASE_URL");
      assertDatabaseUrlMatchesBase(config);
      applyDatabaseUrlForDrizzle(config.databaseUrl!);
      await seedChaosOrganization(config);
    }

    // ── Phase 2: login ──
    await trpcLoginWithBackoff(page, config.baseUrl, config.loginEmail, config.loginPassword);

    // ── Phase 3: chaos sampling (never auth.login) ──
    const stopChaosRoute = await installTenPercentApiFailureRoute(page);

    try {
      // ── Phase 4: dashboard ──
      await page.goto(`${config.baseUrl}/app/dashboard`, { waitUntil: "domcontentloaded", timeout: 60_000 });

      // ── Phase 5: ticket stress ──
      for (let i = 0; i < RUN_TICKET_COUNT; i++) {
        const title = `${runTitlePrefix}-${String(i).padStart(2, "0")} stress`;
        const description = `Chaos run ${i} — resilience under sampled 500s.`;
        CreateTicketSchema.parse({
          title,
          description,
          type: "request",
          impact: "medium",
          urgency: "medium",
        });

        let created = false;
        for (let attempt = 0; attempt < 5 && !created; attempt++) {
          await page.goto(`${config.baseUrl}/app/tickets/new`, { waitUntil: "networkidle" }).catch(() =>
            page.goto(`${config.baseUrl}/app/tickets/new`, { waitUntil: "domcontentloaded" }),
          );
          await page.getByTestId("ticket-form").waitFor({ state: "visible", timeout: 45_000 });
          await page.getByTestId("ticket-title").fill(title);
          await page.getByTestId("ticket-description").fill(description);
          await page.getByTestId("ticket-form").locator("select").first().selectOption("Network");
          await page.getByTestId("ticket-submit").click();
          await page.waitForURL(/\/app\/tickets\/[0-9a-f-]{36}/i, { timeout: 45_000 }).catch(() => {});
          if (page.url().match(/\/app\/tickets\/[0-9a-f-]{36}/i)) {
            created = true;
            break;
          }
          // Sampled 500: expect Sonner error feedback (soft — UI may use default toast type).
          const errorToast = page.locator('[data-sonner-toast][data-type="error"]');
          const anySonner = page.locator("[data-sonner-toast]");
          await Promise.race([
            errorToast.first().waitFor({ state: "visible", timeout: 8000 }),
            anySonner.first().waitFor({ state: "visible", timeout: 8000 }),
          ]).catch(() => {});
          await page.waitForTimeout(800);
        }
        expect(created, `ticket ${i} should be created after retries (check API/500 sampling)`).toBe(true);
      }

      // ── Phase 6: tickets search (exact queue placeholder) ──
      await page.goto(`${config.baseUrl}/app/tickets`, { waitUntil: "domcontentloaded" });
      for (let k = 0; k < 3; k++) {
        await page.getByPlaceholder("Search…").fill(runTitlePrefix.slice(0, 12));
        await page.locator("button").filter({ has: page.locator("svg.lucide-refresh-cw") }).first().click().catch(() => {});
        await page.waitForTimeout(200);
      }

      // ── Phase 7: HAM — spec: concurrent Run Discovery + Export ──
      await page.goto(`${config.baseUrl}/app/ham`, { waitUntil: "domcontentloaded" });
      for (let k = 0; k < 8; k++) {
        const assign = page.getByRole("button", { name: /^Assign$/ }).first();
        if (!(await assign.isVisible().catch(() => false))) break;
        await assign.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(100);
      }
      await Promise.all([
        page.getByRole("button", { name: /Run Discovery/i }).click().catch(() => {}),
        page.getByRole("button", { name: /^Export$/ }).click().catch(() => {}),
      ]);
      await page.getByPlaceholder("Search assets...").fill(runId.slice(-6)).catch(() => {});

      // ── Phase 8: dashboard Approve / Reject ──
      await page.goto(`${config.baseUrl}/app/dashboard`, { waitUntil: "domcontentloaded" });
      const approveBtns = page.getByRole("button", { name: "Approve" });
      const rejectBtns = page.getByRole("button", { name: "Reject" });
      const ac = await approveBtns.count();
      const rc = await rejectBtns.count();
      if (ac >= 2 && rc >= 2) {
        await Promise.all([approveBtns.nth(0).click(), rejectBtns.nth(1).click()]);
      } else if (ac >= 1 && rc >= 1) {
        await Promise.all([approveBtns.nth(0).click(), rejectBtns.nth(0).click()]);
      }

      // ── Phase 9: second tab — Approvals + Admin ──
      const p2 = await context.newPage();
      await Promise.all([
        page.goto(`${config.baseUrl}/app/approvals`, { waitUntil: "domcontentloaded" }),
        p2.goto(`${config.baseUrl}/app/admin`, { waitUntil: "domcontentloaded" }),
      ]);
      const appr = page.getByRole("button", { name: /^Approve$/ }).first();
      const del = p2.getByRole("button", { name: /^Delete$/ }).first();
      await Promise.all([
        appr.click({ timeout: 12_000 }).catch(() => {}),
        del.click({ timeout: 12_000 }).catch(() => {}),
      ]);
      await p2.close();

      await page.locator("[data-sonner-toast]").first().isVisible().catch(() => false);
    } finally {
      // ── Teardown chaos route before screenshot ──
      await stopChaosRoute();
    }

    // ── Phase 10: visual baseline ──
    await page.goto(`${config.baseUrl}/app/dashboard`, { waitUntil: "networkidle" }).catch(() =>
      page.goto(`${config.baseUrl}/app/dashboard`, { waitUntil: "domcontentloaded" }),
    );
    // Desktop: live dashboard shifts after chaos (new tickets, approvals); allow modest drift vs frozen baseline.
    const screenshotOpts =
      testInfo.project.name === "chaos-mobile"
        ? { fullPage: true as const, maxDiffPixelRatio: 0.05, animations: "disabled" as const }
        : { fullPage: true as const, maxDiffPixelRatio: 0.02, animations: "disabled" as const };
    await expect(page).toHaveScreenshot("system-validation-dashboard.png", screenshotOpts);

    // ── Phase 11: DB ticket count ──
    if (!config.skipDbAssert) {
      test.skip(!config.databaseUrl, "DB assert needs DATABASE_URL or CHAOS_DATABASE_URL");
      const assertOrgSlug =
        config.skipSeed && !process.env["CHAOS_ORG_SLUG"]?.trim()
          ? "coheron-demo"
          : config.orgSlug;
      await verifyTicketCount({ ...config, orgSlug: assertOrgSlug }, runTitlePrefix, RUN_TICKET_COUNT);
    }
  });
});
